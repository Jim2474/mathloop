use base64::{engine::general_purpose, Engine as _};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
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

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct BookEntry {
    id: String,
    name: String,
    added_at: String,
}

#[tauri::command]
fn bootstrap_mathloop_data<R: Runtime>(
    app: tauri::AppHandle<R>,
    book_id: Option<String>,
) -> Result<BootstrapInfo, String> {
    // Run migration first (will be added in Task 3)
    // run_migration(&app)?;

    let top_dir = mathloop_data_dir()?;
    fs::create_dir_all(&top_dir).map_err(to_string)?;

    let book_id = book_id.unwrap_or_else(|| "default".to_string());

    // If book_id is "default" and books/default doesn't exist yet, run legacy path
    let data_dir = if book_id == "default" && !top_dir.join("books").join("default").exists() {
        // Legacy: use top-level dirs (pre-migration)
        for child in ["data", "questions", "answers", "pages", "question-fixes"] {
            fs::create_dir_all(top_dir.join(child)).map_err(to_string)?;
        }
        copy_missing_resource_dir(&app, "data", &top_dir.join("data"))?;
        copy_missing_resource_dir(&app, "questions", &top_dir.join("questions"))?;
        copy_missing_resource_dir(&app, "answers", &top_dir.join("answers"))?;
        copy_missing_resource_dir(&app, "pages", &top_dir.join("pages"))?;
        copy_missing_resource_dir(&app, "question-fixes", &top_dir.join("question-fixes"))?;
        top_dir.clone()
    } else {
        let book_dir = top_dir.join("books").join(&book_id);
        for sub in ["data", "questions", "answers", "pages", "question-fixes"] {
            fs::create_dir_all(book_dir.join(sub)).map_err(to_string)?;
        }
        copy_missing_resource_dir(&app, "data", &book_dir.join("data"))?;
        copy_missing_resource_dir(&app, "questions", &book_dir.join("questions"))?;
        copy_missing_resource_dir(&app, "answers", &book_dir.join("answers"))?;
        copy_missing_resource_dir(&app, "pages", &book_dir.join("pages"))?;
        copy_missing_resource_dir(&app, "question-fixes", &book_dir.join("question-fixes"))?;
        book_dir
    };

    let db_path = top_dir.join(DB_FILE);
    ensure_database(&db_path)?;
    let backup_path = create_startup_backup(&db_path, &top_dir)?;
    prune_backups(&top_dir.join("backups"), 30)?;

    Ok(BootstrapInfo {
        data_dir: path_to_string(&data_dir),
        db_path: path_to_string(&db_path),
        created_backup: backup_path.is_some(),
        backup_path: backup_path.map(|path| path_to_string(&path)),
    })
}

#[tauri::command]
fn review_store_get(key: String, book_id: Option<String>) -> Result<Option<String>, String> {
    let db_path = mathloop_data_dir()?.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(db_path).map_err(to_string)?;

    let effective_key = match book_id {
        Some(ref bid) => review_key_for(bid, &key),
        None => key.clone(),
    };

    connection
        .query_row(
            "SELECT value FROM review_store WHERE key = ?1",
            params![effective_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_string)
}

#[tauri::command]
fn review_store_set(key: String, value: String, book_id: Option<String>) -> Result<(), String> {
    let db_path = mathloop_data_dir()?.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(db_path).map_err(to_string)?;

    let effective_key = match book_id {
        Some(ref bid) => review_key_for(bid, &key),
        None => key.clone(),
    };

    connection
        .execute(
            "INSERT INTO review_store (key, value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![effective_key, value, Local::now().to_rfc3339()],
        )
        .map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn review_store_remove(key: String, book_id: Option<String>) -> Result<(), String> {
    let db_path = mathloop_data_dir()?.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(db_path).map_err(to_string)?;

    let effective_key = match book_id {
        Some(ref bid) => review_key_for(bid, &key),
        None => key.clone(),
    };

    connection
        .execute("DELETE FROM review_store WHERE key = ?1", params![effective_key])
        .map_err(to_string)?;
    Ok(())
}

#[tauri::command]
fn load_questions_json<R: Runtime>(
    app: tauri::AppHandle<R>,
    book_id: Option<String>,
) -> Result<String, String> {
    match book_id {
        Some(ref bid) => {
            let book_dir = resolve_book_dir(bid)?;
            let path = book_dir.join("data").join("questions.json");
            if path.exists() {
                return fs::read_to_string(path).map_err(to_string);
            }
            // Fallback to resource
            read_external_or_resource_file(&app, "data/questions.json")
        }
        None => read_external_or_resource_file(&app, "data/questions.json"),
    }
}

#[tauri::command]
fn load_question_image_fixes_json<R: Runtime>(
    app: tauri::AppHandle<R>,
    book_id: Option<String>,
) -> Result<Option<String>, String> {
    let result = match book_id {
        Some(ref bid) => {
            let book_dir = resolve_book_dir(bid)?;
            let path = book_dir.join("data").join("question-image-fixes.json");
            if path.exists() {
                fs::read_to_string(path).map_err(to_string)
            } else {
                read_external_or_resource_file(&app, "data/question-image-fixes.json")
            }
        }
        None => read_external_or_resource_file(&app, "data/question-image-fixes.json"),
    };

    match result {
        Ok(value) => Ok(Some(value)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn update_question_tips(
    book_id: Option<String>,
    question_id: String,
    tips: String,
) -> Result<(), String> {
    let question_id = question_id.trim();
    if question_id.is_empty() {
        return Err("题目 ID 不能为空。".to_string());
    }

    let data_dir = match &book_id {
        Some(bid) => resolve_book_dir(bid)?.join("data"),
        None => mathloop_data_dir()?.join("data"),
    };
    let questions_path = data_dir.join("questions.json");

    if !questions_path.exists() {
        return Err("题库 questions.json 不存在，无法保存 tips。".to_string());
    }

    let original = fs::read_to_string(&questions_path).map_err(to_string)?;
    let mut questions: Value = serde_json::from_str(&original).map_err(to_string)?;
    let Some(items) = questions.as_array_mut() else {
        return Err("questions.json 顶层必须是题目数组。".to_string());
    };

    let Some(question) = items.iter_mut().find(|item| {
        item.get("id")
            .and_then(Value::as_str)
            .is_some_and(|id| id == question_id)
    }) else {
        return Err("没有找到要保存 tips 的题目。".to_string());
    };

    let Some(object) = question.as_object_mut() else {
        return Err("题目数据格式不正确。".to_string());
    };

    let backup_dir = mathloop_data_dir()?.join("backups");
    fs::create_dir_all(&backup_dir).map_err(to_string)?;
    let backup_path = backup_dir.join(format!(
        "questions-before-tip-{}.json",
        Local::now().format("%Y-%m-%d-%H-%M-%S")
    ));
    fs::write(&backup_path, original).map_err(to_string)?;

    let trimmed = tips.trim();
    if trimmed.is_empty() {
        object.remove("tips");
    } else {
        object.insert("tips".to_string(), Value::String(trimmed.to_string()));
    }

    let next = serde_json::to_string_pretty(&questions).map_err(to_string)?;
    let tmp_path = questions_path.with_extension("json.tmp");
    fs::write(&tmp_path, next).map_err(to_string)?;
    fs::rename(&tmp_path, &questions_path).map_err(to_string)?;
    Ok(())
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

#[tauri::command]
fn list_books() -> Result<Vec<BookEntry>, String> {
    let db_path = mathloop_data_dir()?.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(db_path).map_err(to_string)?;
    read_registry_raw(&connection)
}

#[tauri::command]
fn add_book(book_id: String, name: String) -> Result<BookEntry, String> {
    validate_book_id(&book_id)?;

    let db_path = mathloop_data_dir()?.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(&db_path).map_err(to_string)?;

    let existing = read_registry_raw(&connection)?;
    if existing.iter().any(|e| e.id == book_id) {
        return Err("书本已存在。".to_string());
    }

    let book_dir = mathloop_data_dir()?.join("books").join(&book_id);
    for sub in ["data", "questions", "answers", "pages", "question-fixes"] {
        fs::create_dir_all(book_dir.join(sub)).map_err(to_string)?;
    }

    let entry = BookEntry {
        id: book_id,
        name: name.trim().to_string(),
        added_at: Local::now().to_rfc3339(),
    };

    let mut entries = existing;
    entries.push(entry.clone());
    write_registry(&connection, &entries)?;

    Ok(entry)
}

#[tauri::command]
fn remove_book(book_id: String) -> Result<(), String> {
    validate_book_id(&book_id)?;

    let db_path = mathloop_data_dir()?.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(&db_path).map_err(to_string)?;

    let mut entries = read_registry_raw(&connection)?;
    let before_len = entries.len();
    entries.retain(|e| e.id != book_id);

    if entries.len() == before_len {
        return Err("书本不在注册列表中。".to_string());
    }

    write_registry(&connection, &entries)?;
    Ok(())
}

#[tauri::command]
fn set_active_book<R: Runtime>(
    _app: tauri::AppHandle<R>,
    book_id: String,
) -> Result<BootstrapInfo, String> {
    validate_book_id(&book_id)?;

    let top_dir = mathloop_data_dir()?;
    let db_path = top_dir.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(&db_path).map_err(to_string)?;

    let entries = read_registry_raw(&connection)?;
    if !entries.iter().any(|e| e.id == book_id) {
        return Err("书本未注册。".to_string());
    }

    let book_dir = resolve_book_dir(&book_id)?;
    let questions_path = book_dir.join("data").join("questions.json");
    if !questions_path.exists() {
        return Err("书本缺少 questions.json。".to_string());
    }

    create_startup_backup(&db_path, &top_dir)?;

    Ok(BootstrapInfo {
        data_dir: path_to_string(&book_dir),
        db_path: path_to_string(&db_path),
        created_backup: false,
        backup_path: None,
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            bootstrap_mathloop_data,
            list_books,
            add_book,
            remove_book,
            set_active_book,
            review_store_get,
            review_store_set,
            review_store_remove,
            load_questions_json,
            load_question_image_fixes_json,
            update_question_tips,
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

const BOOK_REGISTRY_KEY: &str = "book-registry";
const MIGRATION_VERSION_KEY: &str = "migration-version";
const SETTINGS_KEY: &str = "settings";
const OLD_REVIEW_KEY: &str = "openclaw-review-state";
const NEW_REVIEW_KEY_PREFIX: &str = "review::";

fn validate_book_id(book_id: &str) -> Result<(), String> {
    if book_id.is_empty() || book_id.len() > 64 {
        return Err("书本 ID 长度必须在 1-64 之间。".to_string());
    }
    if !book_id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("书本 ID 只能包含小写字母、数字和连字符。".to_string());
    }
    Ok(())
}

fn resolve_book_dir(book_id: &str) -> Result<PathBuf, String> {
    let dir = mathloop_data_dir()?.join("books").join(book_id);
    if !dir.exists() {
        return Err(format!("书本目录不存在: {}", book_id));
    }
    Ok(dir)
}

fn review_key_for(book_id: &str, key: &str) -> String {
    if key == SETTINGS_KEY {
        key.to_string()
    } else {
        format!("{}{}", NEW_REVIEW_KEY_PREFIX, book_id)
    }
}

fn read_registry_raw(connection: &Connection) -> Result<Vec<BookEntry>, String> {
    let raw: Option<String> = connection
        .query_row(
            "SELECT value FROM review_store WHERE key = ?1",
            params![BOOK_REGISTRY_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(to_string)?;

    let Some(json) = raw else {
        return Ok(vec![]);
    };
    serde_json::from_str(&json).map_err(to_string)
}

fn write_registry(connection: &Connection, entries: &[BookEntry]) -> Result<(), String> {
    let json = serde_json::to_string(entries).map_err(to_string)?;
    connection
        .execute(
            "INSERT INTO review_store (key, value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![BOOK_REGISTRY_KEY, json, Local::now().to_rfc3339()],
        )
        .map_err(to_string)?;
    Ok(())
}

fn to_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}
