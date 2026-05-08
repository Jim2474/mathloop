use base64::{engine::general_purpose, Engine as _};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::{
    env,
    fs,
    path::{Path, PathBuf},
};
use tauri::{Manager, Runtime};

const DB_FILE: &str = "mathloop.db";
const REVIEW_TABLE_SQL: &str = "
CREATE TABLE IF NOT EXISTS review_store (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapInfo {
    data_dir: String,
    db_path: String,
    created_backup: bool,
    backup_path: Option<String>,
}

#[tauri::command]
fn bootstrap_mathloop_data<R: Runtime>(app: tauri::AppHandle<R>) -> Result<BootstrapInfo, String> {
    let data_dir = mathloop_data_dir()?;
    fs::create_dir_all(&data_dir).map_err(to_string)?;
    for child in ["data", "questions", "answers", "pages", "question-fixes", "backups"] {
        fs::create_dir_all(data_dir.join(child)).map_err(to_string)?;
    }

    copy_missing_resource_dir(&app, "data", &data_dir.join("data"))?;
    copy_missing_resource_dir(&app, "questions", &data_dir.join("questions"))?;
    copy_missing_resource_dir(&app, "answers", &data_dir.join("answers"))?;
    copy_missing_resource_dir(&app, "pages", &data_dir.join("pages"))?;
    copy_missing_resource_dir(&app, "question-fixes", &data_dir.join("question-fixes"))?;

    let db_path = data_dir.join(DB_FILE);
    ensure_database(&db_path)?;
    let backup_path = create_startup_backup(&db_path, &data_dir)?;
    prune_backups(&data_dir.join("backups"), 30)?;

    Ok(BootstrapInfo {
        data_dir: path_to_string(&data_dir),
        db_path: path_to_string(&db_path),
        created_backup: backup_path.is_some(),
        backup_path: backup_path.map(|path| path_to_string(&path)),
    })
}

#[tauri::command]
fn review_store_get(key: String) -> Result<Option<String>, String> {
    let db_path = mathloop_data_dir()?.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(db_path).map_err(to_string)?;
    connection
        .query_row(
            "SELECT value FROM review_store WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_string)
}

#[tauri::command]
fn review_store_set(key: String, value: String) -> Result<(), String> {
    let db_path = mathloop_data_dir()?.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(db_path).map_err(to_string)?;
    connection
        .execute(
            "INSERT INTO review_store (key, value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, Local::now().to_rfc3339()],
        )
        .map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn review_store_remove(key: String) -> Result<(), String> {
    let db_path = mathloop_data_dir()?.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(db_path).map_err(to_string)?;
    connection
        .execute("DELETE FROM review_store WHERE key = ?1", params![key])
        .map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn load_questions_json<R: Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    read_external_or_resource_file(&app, "data/questions.json")
}

#[tauri::command]
fn load_question_image_fixes_json<R: Runtime>(app: tauri::AppHandle<R>) -> Result<Option<String>, String> {
    match read_external_or_resource_file(&app, "data/question-image-fixes.json") {
        Ok(value) => Ok(Some(value)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn load_asset_data_url<R: Runtime>(
    app: tauri::AppHandle<R>,
    relative_path: String,
) -> Result<String, String> {
    let normalized = normalize_relative_asset_path(&relative_path)?;
    let bytes = read_external_or_resource_bytes(&app, &normalized)?;
    let mime = mime_from_path(&normalized);
    Ok(format!(
        "data:{};base64,{}",
        mime,
        general_purpose::STANDARD.encode(bytes)
    ))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            bootstrap_mathloop_data,
            review_store_get,
            review_store_set,
            review_store_remove,
            load_questions_json,
            load_question_image_fixes_json,
            load_asset_data_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MathLoop");
}

fn mathloop_data_dir() -> Result<PathBuf, String> {
    if let Ok(appdata) = env::var("APPDATA") {
        return Ok(PathBuf::from(appdata).join("MathLoop"));
    }
    if let Ok(home) = env::var("HOME") {
        return Ok(PathBuf::from(home).join(".mathloop"));
    }
    Err("无法定位用户数据目录。".to_string())
}

fn ensure_database(db_path: &Path) -> Result<(), String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(to_string)?;
    }
    let connection = Connection::open(db_path).map_err(to_string)?;
    connection.execute_batch(REVIEW_TABLE_SQL).map_err(to_string)
}

fn create_startup_backup(db_path: &Path, data_dir: &Path) -> Result<Option<PathBuf>, String> {
    let connection = Connection::open(db_path).map_err(to_string)?;
    let value: Option<String> = connection
        .query_row(
            "SELECT value FROM review_store WHERE key = ?1",
            params!["openclaw-review-state"],
            |row| row.get(0),
        )
        .optional()
        .map_err(to_string)?;

    let Some(value) = value else {
        return Ok(None);
    };

    let backup_dir = data_dir.join("backups");
    fs::create_dir_all(&backup_dir).map_err(to_string)?;
    let backup_path = backup_dir.join(format!(
        "mathloop-auto-{}.json",
        Local::now().format("%Y-%m-%d-%H-%M-%S")
    ));
    fs::write(&backup_path, value).map_err(to_string)?;
    Ok(Some(backup_path))
}

fn prune_backups(backup_dir: &Path, keep: usize) -> Result<(), String> {
    if !backup_dir.exists() {
        return Ok(());
    }
    let mut files = fs::read_dir(backup_dir)
        .map_err(to_string)?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry.file_type().map(|file_type| file_type.is_file()).unwrap_or(false)
                && entry.file_name().to_string_lossy().starts_with("mathloop-auto-")
        })
        .collect::<Vec<_>>();

    files.sort_by_key(|entry| entry.metadata().and_then(|metadata| metadata.modified()).ok());
    let excess = files.len().saturating_sub(keep);
    for entry in files.into_iter().take(excess) {
        let _ = fs::remove_file(entry.path());
    }
    Ok(())
}

fn copy_missing_resource_dir<R: Runtime>(
    app: &tauri::AppHandle<R>,
    name: &str,
    target: &Path,
) -> Result<(), String> {
    let Some(source) = find_resource_dir(app, name) else {
        return Ok(());
    };
    copy_dir_missing(&source, target)
}

fn find_resource_dir<R: Runtime>(app: &tauri::AppHandle<R>, name: &str) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join(name);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest_dir.parent()?.join("public").join(name);
    candidate.exists().then_some(candidate)
}

fn read_external_or_resource_file<R: Runtime>(
    app: &tauri::AppHandle<R>,
    relative_path: &str,
) -> Result<String, String> {
    let external = mathloop_data_dir()?.join(relative_path);
    if external.exists() {
        return fs::read_to_string(external).map_err(to_string);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let resource = resource_dir.join(relative_path);
        if resource.exists() {
            return fs::read_to_string(resource).map_err(to_string);
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let public_file = manifest_dir.parent().unwrap_or(&manifest_dir).join("public").join(relative_path);
    fs::read_to_string(public_file).map_err(to_string)
}

fn read_external_or_resource_bytes<R: Runtime>(
    app: &tauri::AppHandle<R>,
    relative_path: &str,
) -> Result<Vec<u8>, String> {
    let external = mathloop_data_dir()?.join(relative_path);
    if external.exists() {
        return fs::read(external).map_err(to_string);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let resource = resource_dir.join(relative_path);
        if resource.exists() {
            return fs::read(resource).map_err(to_string);
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let public_file = manifest_dir
        .parent()
        .unwrap_or(&manifest_dir)
        .join("public")
        .join(relative_path);
    fs::read(public_file).map_err(to_string)
}

fn normalize_relative_asset_path(path: &str) -> Result<String, String> {
    let normalized = path.trim().replace('\\', "/").trim_start_matches('/').to_string();
    if normalized.is_empty()
        || normalized.contains("..")
        || normalized.contains(':')
        || normalized.starts_with("//")
    {
        return Err("资源路径不合法。".to_string());
    }
    Ok(normalized)
}

fn mime_from_path(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else {
        "image/png"
    }
}

fn copy_dir_missing(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(to_string)?;
    for entry in fs::read_dir(source).map_err(to_string)? {
        let entry = entry.map_err(to_string)?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if entry.file_type().map_err(to_string)?.is_dir() {
            copy_dir_missing(&source_path, &target_path)?;
        } else if !target_path.exists() {
            fs::copy(&source_path, &target_path).map_err(to_string)?;
        }
    }
    Ok(())
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn to_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}
