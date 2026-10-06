//! PDF imports are an append-only library overlay. Existing question files and
//! review rows are never rewritten by import; undo removes only its own IDs.
use crate::{mathloop_data_dir, review_key_for, to_string, validate_book_id, DB_FILE};
use base64::{engine::general_purpose, Engine as _};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InputInfo {
    pub pdf_path: String,
    pub source_fingerprint: String,
    pub profile_id: String,
    pub name: String,
    pub pages: usize,
    #[serde(default)]
    pub bound_book_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Batch {
    pub batch_id: String,
    pub book_id: String,
    pub source_name: String,
    pub source_fingerprint: String,
    pub created_at: String,
    pub imported: usize,
    pub duplicates: usize,
    #[serde(default)]
    pub legacy_duplicates: usize,
    pub issues: Vec<Value>,
    pub question_ids: Vec<String>,
    pub reviewed: bool,
    pub undone: bool,
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub job_id: String,
    pub book_id: String,
    pub status: String,
    pub stage: String,
    pub done: usize,
    pub total: usize,
    pub error: Option<String>,
    pub result: Option<Batch>,
}

#[derive(Clone)]
struct Draft {
    input: InputInfo,
    book_name: String,
    staging: PathBuf,
    manifest: Value,
}

#[derive(Default)]
pub struct ImportState {
    job: Arc<Mutex<Job>>,
    child: Arc<Mutex<Option<Child>>>,
    active: Arc<AtomicBool>,
    draft: Arc<Mutex<Option<Draft>>>,
}

fn connect(root: &Path) -> Result<Connection, String> {
    fs::create_dir_all(root).map_err(to_string)?;
    let c = Connection::open(root.join(DB_FILE)).map_err(to_string)?;
    c.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(to_string)?;
    c.execute_batch(
        "CREATE TABLE IF NOT EXISTS pdf_import_batches (
        batch_id TEXT PRIMARY KEY, book_id TEXT NOT NULL, receipt TEXT NOT NULL,
        reviewed INTEGER NOT NULL DEFAULT 0, undone INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS pdf_import_questions (
        id TEXT PRIMARY KEY, book_id TEXT NOT NULL, source_key TEXT NOT NULL,
        batch_id TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(book_id, source_key));
        CREATE TABLE IF NOT EXISTS pdf_import_sources (
        fingerprint TEXT PRIMARY KEY, book_id TEXT NOT NULL);",
    )
    .map_err(to_string)?;
    Ok(c)
}

fn has_tables(c: &Connection) -> Result<bool, String> {
    c.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='pdf_import_batches')",
        [],
        |r| r.get(0),
    )
    .map_err(to_string)
}

fn snapshot(c: &Connection, root: &Path, operation: &str) -> Result<(), String> {
    let folder = root.join("backups");
    fs::create_dir_all(&folder).map_err(to_string)?;
    let path = folder.join(format!("pre-pdf-{}-{}.sqlite", operation, Uuid::new_v4()));
    c.execute("VACUUM INTO ?1", [path.to_string_lossy().as_ref()])
        .map_err(to_string)?;
    Ok(())
}

#[tauri::command]
pub fn backup_review_data() -> Result<(), String> {
    let root = mathloop_data_dir()?;
    let c = Connection::open(root.join(DB_FILE)).map_err(to_string)?;
    c.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(to_string)?;
    snapshot(&c, &root, "review-restore")
}

fn worker_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let packaged = app
        .path()
        .resource_dir()
        .map_err(to_string)?
        .join("resources/pdf-import-worker/mathloop-pdf-worker");
    if packaged.is_file() {
        return Ok(packaged);
    }
    #[cfg(debug_assertions)]
    {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/pdf-import-worker/mathloop-pdf-worker");
        if dev.is_file() {
            return Ok(dev);
        }
    }
    Err("App 内的 PDF 识别器缺失，请使用包含识别器的 Mac 构建版本。".into())
}

fn worker_command(app: &tauri::AppHandle) -> Result<Command, String> {
    let mut command = Command::new(worker_path(app)?);
    // A frozen Python worker must not inherit a user's Python configuration.
    command.env_remove("PYTHONHOME").env_remove("PYTHONPATH");
    Ok(command)
}

#[tauri::command]
pub async fn pick_pdf_import_file(app: tauri::AppHandle) -> Result<Option<InputInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = app
            .dialog()
            .file()
            .add_filter("PDF", &["pdf"])
            .blocking_pick_file();
        let Some(file) = file else {
            return Ok(None);
        };
        let path = file.into_path().map_err(to_string)?;
        let output = worker_command(&app)?
            .arg("--input")
            .arg(&path)
            .arg("--inspect")
            .output()
            .map_err(to_string)?;
        let text = String::from_utf8(output.stdout).map_err(to_string)?;
        let last = text.lines().last().ok_or("识别器未返回文件信息")?;
        let value: Value = serde_json::from_str(last).map_err(to_string)?;
        if !output.status.success() {
            return Err(value["error"].as_str().unwrap_or("无法读取 PDF").into());
        }
        let mut info: InputInfo = serde_json::from_value(value).map_err(to_string)?;
        let root = mathloop_data_dir()?;
        if root.join(DB_FILE).is_file() {
            let c = Connection::open(root.join(DB_FILE)).map_err(to_string)?;
            if has_tables(&c)? {
                info.bound_book_id = c
                    .query_row(
                        "SELECT book_id FROM pdf_import_sources WHERE fingerprint=?1",
                        [&info.source_fingerprint],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(to_string)?;
            }
        }
        Ok(Some(info))
    })
    .await
    .map_err(to_string)?
}

fn update(app: &tauri::AppHandle, job: &Arc<Mutex<Job>>, f: impl FnOnce(&mut Job)) {
    if let Ok(mut state) = job.lock() {
        f(&mut state);
        let _ = app.emit("pdf-import-progress", state.clone());
    }
}

#[tauri::command]
pub fn get_pdf_import_job(state: tauri::State<ImportState>) -> Result<Job, String> {
    state.job.lock().map(|s| s.clone()).map_err(to_string)
}

#[tauri::command]
pub fn cancel_pdf_import(job_id: String, state: tauri::State<ImportState>) -> Result<(), String> {
    let mut job = state.job.lock().map_err(to_string)?;
    if job.job_id != job_id || (job.status != "running" && job.status != "preview") {
        return Err("该任务已结束".into());
    }
    if job.stage == "importing" {
        return Err("正在保存批次，请等待保存完成后撤销".into());
    }
    if job.status == "preview" {
        if let Some(draft) = state.draft.lock().map_err(to_string)?.take() {
            let _ = fs::remove_dir_all(draft.staging);
        }
        state.active.store(false, Ordering::SeqCst);
    }
    job.status = "cancelled".into();
    if let Some(child) = state.child.lock().map_err(to_string)?.as_mut() {
        let _ = child.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn start_pdf_import(
    app: tauri::AppHandle,
    state: tauri::State<ImportState>,
    input: InputInfo,
    book_id: String,
    book_name: String,
    existing_questions: Vec<Value>,
) -> Result<String, String> {
    validate_book_id(&book_id)?;
    if book_name.trim().is_empty() {
        return Err("请选择对应书本".into());
    }
    let path = Path::new(&input.pdf_path)
        .canonicalize()
        .map_err(to_string)?;
    if !path.is_file() {
        return Err("PDF 文件不存在".into());
    }
    let worker = worker_command(&app)?;
    let root = mathloop_data_dir()?;
    let c = connect(&root)?;
    let bound: Option<String> = c
        .query_row(
            "SELECT book_id FROM pdf_import_sources WHERE fingerprint=?1",
            [&input.source_fingerprint],
            |r| r.get(0),
        )
        .optional()
        .map_err(to_string)?;
    if bound.as_deref().is_some_and(|id| id != book_id) {
        return Err("这份资料已绑定到另一题库，请选择它对应的书本".into());
    }
    let job_id = Uuid::new_v4().to_string();
    if state
        .active
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("已有 PDF 任务正在运行或取消收尾，请稍后再试".into());
    }
    {
        let mut job = match state.job.lock() {
            Ok(job) => job,
            Err(error) => {
                state.active.store(false, Ordering::SeqCst);
                return Err(to_string(error));
            }
        };
        *job = Job {
            job_id: job_id.clone(),
            book_id: book_id.clone(),
            status: "running".into(),
            stage: "validating".into(),
            ..Job::default()
        };
    }
    let job = state.job.clone();
    let child = state.child.clone();
    let active = state.active.clone();
    let id = job_id.clone();
    let draft_slot = state.draft.clone();
    std::thread::spawn(move || {
        let staging = root.join("pdf-import-staging").join(&id);
        let result = run_job(
            worker,
            &app,
            &job,
            &child,
            &staging,
            &root,
            &id,
            &input,
            &book_id,
            &book_name,
            existing_questions,
        );
        // Also reap a child when reading stdout or a staging operation fails.
        if let Ok(mut slot) = child.lock() {
            if let Some(mut process) = slot.take() {
                let _ = process.kill();
                let _ = process.wait();
            }
        }
        let mut published = false;
        update(&app, &job, |s| match result {
            Ok(manifest) if s.status != "cancelled" => match draft_slot.lock() {
                Ok(mut slot) => {
                    *slot = Some(Draft {
                        input,
                        book_name,
                        staging: staging.clone(),
                        manifest,
                    });
                    s.status = "preview".into();
                    s.stage = "preview".into();
                    published = true;
                }
                Err(error) => {
                    s.status = "error".into();
                    s.error = Some(to_string(error));
                }
            },
            Err(error) if s.status != "cancelled" => {
                s.status = "error".into();
                s.error = Some(error);
            }
            _ => {}
        });
        // Once published, only confirm/cancel owns the draft. A fast confirm may
        // already be committing while this recognition thread finishes.
        if !published {
            let _ = fs::remove_dir_all(&staging);
            if let Ok(s) = job.lock() {
                if s.job_id == id {
                    active.store(false, Ordering::SeqCst);
                }
            }
        }
    });
    Ok(job_id)
}

#[allow(clippy::too_many_arguments)]
fn run_job(
    mut worker: Command,
    app: &tauri::AppHandle,
    job: &Arc<Mutex<Job>>,
    child: &Arc<Mutex<Option<Child>>>,
    staging: &Path,
    root: &Path,
    _id: &str,
    input: &InputInfo,
    book_id: &str,
    _book_name: &str,
    mut existing: Vec<Value>,
) -> Result<Value, String> {
    fs::create_dir_all(staging).map_err(to_string)?;
    existing.extend(load_overlay(root, book_id)?);
    let existing_path = staging.join("existing.json");
    fs::write(
        &existing_path,
        serde_json::to_vec(&existing).map_err(to_string)?,
    )
    .map_err(to_string)?;
    let stderr_path = staging.join("worker-error.log");
    let stderr = fs::File::create(&stderr_path).map_err(to_string)?;
    // Holding the job lock through spawn closes the cancel-before-spawn race.
    {
        let state = job.lock().map_err(to_string)?;
        if state.status == "cancelled" {
            return Err("任务已取消".into());
        }
        let process = worker
            .arg("--input")
            .arg(&input.pdf_path)
            .arg("--output")
            .arg(staging)
            .arg("--existing")
            .arg(existing_path)
            .stdout(Stdio::piped())
            .stderr(stderr)
            .spawn()
            .map_err(to_string)?;
        *child.lock().map_err(to_string)? = Some(process);
    }
    let stdout = child
        .lock()
        .map_err(to_string)?
        .as_mut()
        .and_then(|c| c.stdout.take())
        .ok_or("无法读取识别进度")?;
    let mut worker_error = None;
    for line in BufReader::new(stdout).lines() {
        let line = line.map_err(to_string)?;
        if let Ok(value) = serde_json::from_str::<Value>(&line) {
            if let Some(error) = value["error"].as_str() {
                worker_error = Some(error.to_string());
            }
            if let Some(stage) = value["stage"].as_str() {
                update(app, job, |s| {
                    s.stage = stage.into();
                    s.done = value["done"].as_u64().unwrap_or(0) as usize;
                    s.total = value["total"].as_u64().unwrap_or(0) as usize;
                });
            }
        }
    }
    let status = child
        .lock()
        .map_err(to_string)?
        .take()
        .ok_or("识别进程已结束")?
        .wait()
        .map_err(to_string)?;
    {
        let mut state = job.lock().map_err(to_string)?;
        if state.status == "cancelled" {
            return Err("任务已取消".into());
        }
        if !status.success() {
            return Err(worker_error.unwrap_or_else(|| "识别器处理失败，未导入任何题目".into()));
        }
        state.stage = "ready".into();
    }
    let manifest: Value =
        serde_json::from_slice(&fs::read(staging.join("manifest.json")).map_err(to_string)?)
            .map_err(to_string)?;
    if manifest["sourceFingerprint"] != input.source_fingerprint {
        return Err("PDF 内容已改变，请重新选择文件".into());
    }
    Ok(manifest)
}

#[tauri::command]
pub fn get_pdf_import_preview(
    job_id: String,
    state: tauri::State<ImportState>,
) -> Result<Value, String> {
    let job = state.job.lock().map_err(to_string)?;
    if job.job_id != job_id || job.status != "preview" {
        return Err("预览已失效，请重新识别".into());
    }
    let slot = state.draft.lock().map_err(to_string)?;
    Ok(slot.as_ref().ok_or("没有待确认的预览")?.manifest.clone())
}

#[tauri::command]
pub fn load_pdf_preview_image(
    job_id: String,
    name: String,
    state: tauri::State<ImportState>,
) -> Result<String, String> {
    safe_file(&name)?;
    if !name.ends_with(".png") {
        return Err("图片格式错误".into());
    }
    let job = state.job.lock().map_err(to_string)?;
    if job.job_id != job_id || job.status != "preview" {
        return Err("预览已结束".into());
    }
    let slot = state.draft.lock().map_err(to_string)?;
    let draft = slot.as_ref().ok_or("没有待确认的预览")?;
    let bytes = fs::read(draft.staging.join(name)).map_err(to_string)?;
    Ok(format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub async fn confirm_pdf_import(
    app: tauri::AppHandle,
    state: tauri::State<'_, ImportState>,
    job_id: String,
    source_keys: Vec<String>,
) -> Result<Batch, String> {
    let root = mathloop_data_dir()?;
    let (draft, book_id) = {
        let mut job = state.job.lock().map_err(to_string)?;
        if job.job_id != job_id || job.status != "preview" {
            return Err("预览已失效，请重新识别".into());
        }
        let mut slot = state.draft.lock().map_err(to_string)?;
        let draft = slot.as_mut().ok_or("没有待确认的预览")?;
        let questions = draft.manifest["questions"]
            .as_array()
            .ok_or("预览数据错误")?;
        if source_keys.is_empty()
            || source_keys.iter().any(|key| {
                !questions
                    .iter()
                    .any(|q| q["pdfSource"]["sourceKey"] == *key)
            })
        {
            return Err("请勾选有效的题目后确认导入".into());
        }
        draft.manifest["questions"] = json!(questions
            .iter()
            .filter(|q| source_keys
                .iter()
                .any(|key| q["pdfSource"]["sourceKey"] == *key))
            .cloned()
            .collect::<Vec<_>>());
        job.status = "running".into();
        job.stage = "importing".into();
        (slot.take().unwrap(), job.book_id.clone())
    };
    let job = state.job.clone();
    let active = state.active.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let result = commit(
            &root,
            &draft.staging,
            &job_id,
            &book_id,
            &draft.book_name,
            &draft.input,
            draft.manifest,
        );
        let _ = fs::remove_dir_all(&draft.staging);
        update(&app, &job, |s| match &result {
            Ok(batch) => {
                s.status = "done".into();
                s.stage = "done".into();
                s.result = Some(batch.clone());
            }
            Err(error) => {
                s.status = "error".into();
                s.error = Some(error.clone());
            }
        });
        active.store(false, Ordering::SeqCst);
        result
    })
    .await
    .map_err(to_string)?;
    result
}

/// Old imports did not retain whole pages. Render from their verified source on demand.
#[tauri::command]
pub async fn load_pdf_source_page(
    app: tauri::AppHandle,
    book_id: String,
    question_id: String,
    page_number: usize,
) -> Result<String, String> {
    validate_book_id(&book_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = mathloop_data_dir()?;
        let q = load_overlay(&root, &book_id)?
            .into_iter()
            .find(|q| q["id"] == question_id)
            .ok_or("题目不存在")?;
        let source = &q["pdfSource"];
        let first = q["pageStart"].as_u64().ok_or("题目页码缺失")? as usize;
        let last = q["answerMeta"]["answerPageEnd"]
            .as_u64()
            .unwrap_or(first as u64) as usize;
        if page_number < first || page_number > last {
            return Err("页码不属于这道题".into());
        }
        let fingerprint = source["sourceFingerprint"].as_str().ok_or("资料指纹缺失")?;
        if fingerprint.len() != 64 || !fingerprint.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("资料指纹错误".into());
        }
        let folder = root
            .join("books")
            .join(&book_id)
            .join("pdf-page-cache")
            .join(fingerprint);
        fs::create_dir_all(&folder).map_err(to_string)?;
        let dest = folder.join(format!("page-{}.png", page_number));
        if !dest.exists() {
            let path = source["pdfPath"].as_str().ok_or("源文件位置缺失")?;
            if !Path::new(path).is_file() {
                return Err("源 PDF 已移动，请将原资料放回原位置后查看整页".into());
            }
            let temp = folder.join(format!("{}.png", Uuid::new_v4()));
            let result = (|| {
                let output = worker_command(&app)?
                    .arg("--input")
                    .arg(path)
                    .arg("--render-page")
                    .arg(page_number.to_string())
                    .arg("--fingerprint")
                    .arg(fingerprint)
                    .arg("--output")
                    .arg(&temp)
                    .output()
                    .map_err(to_string)?;
                if !output.status.success() {
                    return Err("读取源 PDF 失败，请确认资料未改变".into());
                }
                fs::rename(&temp, &dest).map_err(to_string)
            })();
            let _ = fs::remove_file(&temp);
            result?;
        }
        Ok(format!(
            "data:image/png;base64,{}",
            general_purpose::STANDARD.encode(fs::read(dest).map_err(to_string)?)
        ))
    })
    .await
    .map_err(to_string)?
}

fn safe_file(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.contains(['/', '\\'])
        || name.contains("..")
        || !name.ends_with(".png")
    {
        return Err("导入图片路径不合法".into());
    }
    Ok(())
}

fn validate_page_images(q: &Value) -> Result<(), String> {
    if q["pageImages"].is_null() {
        return Ok(());
    }
    let images = q["pageImages"].as_array().ok_or("整页图片列表错误")?;
    let numbers = q["pdfSource"]["pageImageNumbers"]
        .as_array()
        .ok_or("整页页码缺失")?;
    if images.is_empty()
        || images.len() != numbers.len()
        || numbers.iter().any(|n| n.as_u64().unwrap_or(0) == 0)
    {
        return Err("整页图片与页码不一致".into());
    }
    let pages: HashSet<u64> = numbers.iter().filter_map(Value::as_u64).collect();
    if pages.len() != numbers.len() {
        return Err("整页页码重复".into());
    }
    for (field, images_field) in [
        ("questionPageNumbers", "questionImages"),
        ("answerPageNumbers", "answerImages"),
    ] {
        let mapping = q["pdfSource"][field].as_array().ok_or("裁切图片页码缺失")?;
        if mapping.len() != q[images_field].as_array().ok_or("图片列表错误")?.len()
            || mapping
                .iter()
                .any(|n| !pages.contains(&n.as_u64().unwrap_or(0)))
        {
            return Err("裁切图片与整页来源不一致".into());
        }
    }
    Ok(())
}

fn commit(
    root: &Path,
    staging: &Path,
    batch_id: &str,
    book_id: &str,
    book_name: &str,
    input: &InputInfo,
    manifest: Value,
) -> Result<Batch, String> {
    let mut c = connect(root)?;
    snapshot(&c, root, "import")?;
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(to_string)?;
    let bound: Option<String> = tx
        .query_row(
            "SELECT book_id FROM pdf_import_sources WHERE fingerprint=?1",
            [&input.source_fingerprint],
            |r| r.get(0),
        )
        .optional()
        .map_err(to_string)?;
    if bound.as_deref().is_some_and(|id| id != book_id) {
        return Err("资料已绑定另一题库".into());
    }
    let mut batch = Batch {
        batch_id: batch_id.into(),
        book_id: book_id.into(),
        source_name: input.name.clone(),
        source_fingerprint: input.source_fingerprint.clone(),
        created_at: Local::now().to_rfc3339(),
        imported: 0,
        duplicates: manifest["duplicates"].as_u64().unwrap_or(0) as usize,
        legacy_duplicates: manifest["legacyDuplicates"].as_u64().unwrap_or(0) as usize,
        issues: manifest["issues"].as_array().cloned().unwrap_or_default(),
        question_ids: vec![],
        reviewed: false,
        undone: false,
    };
    let mut records = vec![];
    for mut q in manifest["questions"]
        .as_array()
        .ok_or("识别结果格式错误")?
        .clone()
    {
        validate_page_images(&q)?;
        let key = q["pdfSource"]["sourceKey"]
            .as_str()
            .ok_or("识别结果缺少题目标识")?
            .to_string();
        let exists: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM pdf_import_questions WHERE book_id=?1 AND source_key=?2)",
            params![book_id, key], |r| r.get(0)).map_err(to_string)?;
        if exists {
            batch.duplicates += 1;
            continue;
        }
        q["id"] = json!(format!("pdf-{}-{}", book_id, key));
        q["bookName"] = json!(book_name);
        q["pdfSource"]["batchId"] = json!(batch_id);
        q["pdfSource"]["importedAt"] = json!(batch.created_at);
        for field in ["questionImage", "answerImage"] {
            let name = q[field].as_str().ok_or("题目图片缺失")?.to_string();
            safe_file(&name)?;
            if !staging.join(&name).is_file() {
                return Err("识别图片不完整，未保存批次".into());
            }
            q[field] = json!(format!("pdf-import-batches/{}/{}", batch_id, name));
        }
        for field in ["questionImages", "answerImages", "pageImages"] {
            if field == "pageImages" && q[field].is_null() {
                continue;
            }
            let files = q[field].as_array().ok_or("图片列表缺失")?;
            let mut paths = vec![];
            for file in files {
                let name = file.as_str().ok_or("图片路径错误")?;
                safe_file(name)?;
                if !staging.join(name).is_file() {
                    return Err("识别图片不完整，未保存批次".into());
                }
                paths.push(format!("pdf-import-batches/{}/{}", batch_id, name));
            }
            q[field] = json!(paths);
        }
        batch.question_ids.push(q["id"].as_str().unwrap().into());
        records.push((key, q));
    }
    batch.imported = records.len();
    // Commit only selected images; all files belong to this fresh draft directory.
    let mut retained = HashSet::new();
    for (_, q) in &records {
        for field in ["questionImages", "answerImages", "pageImages"] {
            if let Some(files) = q[field].as_array() {
                for file in files {
                    if let Some(name) = file
                        .as_str()
                        .and_then(|p| Path::new(p).file_name())
                        .and_then(|n| n.to_str())
                    {
                        retained.insert(name.to_string());
                    }
                }
            }
        }
    }
    for entry in fs::read_dir(staging).map_err(to_string)? {
        let entry = entry.map_err(to_string)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.file_type().map_err(to_string)?.is_file()
            && name.ends_with(".png")
            && !retained.contains(&name)
        {
            fs::remove_file(entry.path()).map_err(to_string)?;
        }
    }
    if batch.imported + batch.duplicates > 0 {
        tx.execute(
            "INSERT OR IGNORE INTO pdf_import_sources VALUES(?1,?2)",
            params![input.source_fingerprint, book_id],
        )
        .map_err(to_string)?;
    }
    tx.execute(
        "INSERT INTO pdf_import_batches(batch_id,book_id,receipt) VALUES(?1,?2,?3)",
        params![
            batch_id,
            book_id,
            serde_json::to_string(&batch).map_err(to_string)?
        ],
    )
    .map_err(to_string)?;
    for (key, q) in records {
        tx.execute(
            "INSERT INTO pdf_import_questions VALUES(?1,?2,?3,?4,?5)",
            params![q["id"].as_str(), book_id, key, batch_id, q.to_string()],
        )
        .map_err(to_string)?;
    }
    let _ = fs::remove_file(staging.join("manifest.json"));
    let _ = fs::remove_file(staging.join("existing.json"));
    let _ = fs::remove_file(staging.join("worker-error.log"));
    let dest = root
        .join("books")
        .join(book_id)
        .join("pdf-import-batches")
        .join(batch_id);
    fs::create_dir_all(dest.parent().unwrap()).map_err(to_string)?;
    fs::rename(staging, &dest).map_err(to_string)?;
    if let Err(error) = tx.commit() {
        let _ = fs::remove_dir_all(dest);
        return Err(to_string(error));
    }
    Ok(batch)
}

pub fn load_overlay(root: &Path, book_id: &str) -> Result<Vec<Value>, String> {
    if !root.join(DB_FILE).is_file() {
        return Ok(vec![]);
    }
    let c = Connection::open(root.join(DB_FILE)).map_err(to_string)?;
    if !has_tables(&c)? {
        return Ok(vec![]);
    }
    let mut statement = c
        .prepare("SELECT data FROM pdf_import_questions WHERE book_id=?1 ORDER BY id")
        .map_err(to_string)?;
    let rows = statement
        .query_map([book_id], |r| r.get::<_, String>(0))
        .map_err(to_string)?;
    rows.map(|r| serde_json::from_str(&r.map_err(to_string)?).map_err(to_string))
        .collect()
}

#[tauri::command]
pub fn load_pdf_import_questions(book_id: String) -> Result<Vec<Value>, String> {
    validate_book_id(&book_id)?;
    load_overlay(&mathloop_data_dir()?, &book_id)
}

#[tauri::command]
pub fn list_pdf_import_batches(book_id: String) -> Result<Vec<Batch>, String> {
    validate_book_id(&book_id)?;
    let root = mathloop_data_dir()?;
    if !root.join(DB_FILE).is_file() {
        return Ok(vec![]);
    }
    let c = Connection::open(root.join(DB_FILE)).map_err(to_string)?;
    if !has_tables(&c)? {
        return Ok(vec![]);
    }
    let mut st = c.prepare("SELECT receipt,reviewed,undone FROM pdf_import_batches WHERE book_id=?1 ORDER BY rowid DESC").map_err(to_string)?;
    let rows = st
        .query_map([book_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, bool>(1)?,
                r.get::<_, bool>(2)?,
            ))
        })
        .map_err(to_string)?;
    rows.map(|r| {
        let (text, reviewed, undone) = r.map_err(to_string)?;
        let mut b: Batch = serde_json::from_str(&text).map_err(to_string)?;
        b.reviewed = reviewed;
        b.undone = undone;
        Ok(b)
    })
    .collect()
}

fn is_reviewed(state: &Value, id: &str) -> bool {
    state["reviewLogs"]
        .as_array()
        .is_some_and(|logs| logs.iter().any(|l| l["questionId"] == id))
        || state["cards"][id]["card"]["reps"].as_u64().unwrap_or(0) > 0
        || state["cards"][id]["card"]["last_review"]
            .as_str()
            .is_some_and(|s| !s.is_empty())
}

/// Called inside the same SQLite transaction as review_store_set. This flag
/// survives later review-state resets/restores, preventing unsafe undo.
pub fn protect_reviewed_batches(c: &Connection, book_id: &str, value: &str) -> Result<(), String> {
    if !has_tables(c)? {
        return Ok(());
    }
    let parsed: Value = serde_json::from_str(value).map_err(to_string)?;
    let state = parsed.get("state").unwrap_or(&parsed);
    let mut st = c
        .prepare("SELECT id,batch_id FROM pdf_import_questions WHERE book_id=?1")
        .map_err(to_string)?;
    let rows = st
        .query_map([book_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(to_string)?;
    for row in rows {
        let (id, batch) = row.map_err(to_string)?;
        if is_reviewed(state, &id) {
            c.execute(
                "UPDATE pdf_import_batches SET reviewed=1 WHERE batch_id=?1",
                [batch],
            )
            .map_err(to_string)?;
        }
    }
    Ok(())
}

fn undo(root: &Path, batch_id: &str) -> Result<Option<String>, String> {
    let mut c = connect(root)?;
    snapshot(&c, root, "undo")?;
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(to_string)?;
    let (text, reviewed, undone): (String, bool, bool) = tx
        .query_row(
            "SELECT receipt,reviewed,undone FROM pdf_import_batches WHERE batch_id=?1",
            [batch_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(to_string)?;
    let batch: Batch = serde_json::from_str(&text).map_err(to_string)?;
    if reviewed {
        return Err("本批次已有题目开始复习，不能整批撤销".into());
    }
    if undone {
        return Err("本批次已撤销".into());
    }
    let key = review_key_for(&batch.book_id, "openclaw-review-state");
    let stored: Option<String> = tx
        .query_row("SELECT value FROM review_store WHERE key=?1", [&key], |r| {
            r.get(0)
        })
        .optional()
        .map_err(to_string)?;
    let mut next = stored.clone();
    if let Some(raw) = stored {
        let mut parsed: Value = serde_json::from_str(&raw).map_err(to_string)?;
        let state = if parsed.get("state").is_some() {
            &mut parsed["state"]
        } else {
            &mut parsed
        };
        if batch.question_ids.iter().any(|id| is_reviewed(state, id)) {
            return Err("本批次已有题目开始复习，不能整批撤销".into());
        }
        for id in &batch.question_ids {
            for field in ["cards", "mistakeRecords", "questionFingerprints"] {
                if let Some(map) = state[field].as_object_mut() {
                    map.remove(id);
                }
            }
        }
        if let Some(queue) = state["dailyReviewSession"]["queue"].as_array_mut() {
            queue.retain(|q| !batch.question_ids.iter().any(|id| q["questionId"] == *id));
        }
        next = Some(parsed.to_string());
        tx.execute(
            "UPDATE review_store SET value=?1, updated_at=?2 WHERE key=?3",
            params![next, Local::now().to_rfc3339(), key],
        )
        .map_err(to_string)?;
    }
    tx.execute(
        "DELETE FROM pdf_import_questions WHERE batch_id=?1",
        [batch_id],
    )
    .map_err(to_string)?;
    tx.execute(
        "UPDATE pdf_import_batches SET undone=1 WHERE batch_id=?1",
        [batch_id],
    )
    .map_err(to_string)?;
    // An accidental first destination can be corrected after a complete undo.
    // A duplicate-only pass must not keep the source bound once no imported
    // questions from that source remain in this book.
    tx.execute(
        "DELETE FROM pdf_import_sources WHERE fingerprint=?1 AND book_id=?2
        AND NOT EXISTS(SELECT 1 FROM pdf_import_questions WHERE book_id=?2
            AND json_extract(data,'$.pdfSource.sourceFingerprint')=?1)
        AND NOT EXISTS(SELECT 1 FROM pdf_import_batches WHERE book_id=?2 AND undone=0
            AND json_extract(receipt,'$.sourceFingerprint')=?1
            AND json_extract(receipt,'$.legacyDuplicates')>0)",
        params![batch.source_fingerprint, batch.book_id],
    )
    .map_err(to_string)?;
    tx.commit().map_err(to_string)?;
    // Keep the batch image folder as recovery material; it is excluded from
    // loading and backups once undone. No broad directory deletion on undo.
    Ok(next)
}

#[tauri::command]
pub fn undo_pdf_import(batch_id: String) -> Result<Option<String>, String> {
    undo(&mathloop_data_dir()?, &batch_id)
}

fn library_backup(root: &Path, book_id: &str, path: &Path) -> Result<(), String> {
    let c = connect(root)?;
    c.execute_batch("BEGIN DEFERRED TRANSACTION")
        .map_err(to_string)?;
    let mut qs = c
        .prepare("SELECT data FROM pdf_import_questions WHERE book_id=?1 ORDER BY id")
        .map_err(to_string)?;
    let questions: Vec<Value> = qs
        .query_map([book_id], |r| r.get::<_, String>(0))
        .map_err(to_string)?
        .map(|raw| serde_json::from_str(&raw.map_err(to_string)?).map_err(to_string))
        .collect::<Result<_, String>>()?;
    let mut st = c
        .prepare("SELECT receipt, reviewed FROM pdf_import_batches WHERE book_id=?1 AND undone=0")
        .map_err(to_string)?;
    let receipts = st
        .query_map([book_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?))
        })
        .map_err(to_string)?;
    let mut batches = vec![];
    for item in receipts {
        let (raw, reviewed) = item.map_err(to_string)?;
        let mut batch: Batch = serde_json::from_str(&raw).map_err(to_string)?;
        batch.reviewed = reviewed;
        batches.push(batch);
    }
    let mut files = HashMap::new();
    for q in &questions {
        for field in ["questionImages", "answerImages", "pageImages"] {
            if field == "pageImages" && q[field].is_null() {
                continue;
            }
            for p in q[field].as_array().ok_or("图片列表错误")? {
                let name = p.as_str().ok_or("图片路径错误")?;
                crate::normalize_relative_asset_path(name)?;
                let bytes =
                    fs::read(root.join("books").join(book_id).join(name)).map_err(to_string)?;
                files.insert(name.to_string(), format!("{:x}", Sha256::digest(&bytes)));
            }
        }
    }
    let mut tips = HashMap::new();
    for q in &questions {
        let id = q["id"].as_str().ok_or("题目标识错误")?;
        let value: Option<String> = c
            .query_row(
                "SELECT value FROM review_store WHERE key=?1",
                [format!("tips::{}::{}", book_id, id)],
                |r| r.get(0),
            )
            .optional()
            .map_err(to_string)?;
        if let Some(value) = value {
            tips.insert(id.to_string(), value);
        }
    }
    let manifest = json!({"version":1, "bookId":book_id, "questions":questions, "batches":batches, "files":files, "tips":tips});
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut writer = zip::ZipWriter::new(fs::File::create(&temp).map_err(to_string)?);
        let options = zip::write::SimpleFileOptions::default();
        writer
            .start_file("manifest.json", options)
            .map_err(to_string)?;
        writer
            .write_all(&serde_json::to_vec(&manifest).map_err(to_string)?)
            .map_err(to_string)?;
        for name in files.keys() {
            writer.start_file(name, options).map_err(to_string)?;
            let mut file =
                fs::File::open(root.join("books").join(book_id).join(name)).map_err(to_string)?;
            std::io::copy(&mut file, &mut writer).map_err(to_string)?;
        }
        writer
            .finish()
            .map_err(to_string)?
            .sync_all()
            .map_err(to_string)?;
        fs::rename(&temp, path).map_err(to_string)
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

fn restore_library(root: &Path, book_id: &str, path: &Path) -> Result<usize, String> {
    let mut archive =
        zip::ZipArchive::new(fs::File::open(path).map_err(to_string)?).map_err(to_string)?;
    let mut text = String::new();
    archive
        .by_name("manifest.json")
        .map_err(to_string)?
        .take(20 * 1024 * 1024)
        .read_to_string(&mut text)
        .map_err(to_string)?;
    let manifest: Value = serde_json::from_str(&text).map_err(to_string)?;
    if manifest["version"] != 1 || manifest["bookId"] != book_id {
        return Err("备份版本不支持或不属于当前书本，未恢复数据".into());
    }
    let batches: Vec<Batch> =
        serde_json::from_value(manifest["batches"].clone()).map_err(to_string)?;
    let questions: Vec<Value> =
        serde_json::from_value(manifest["questions"].clone()).map_err(to_string)?;
    let files: HashMap<String, String> =
        serde_json::from_value(manifest["files"].clone()).map_err(to_string)?;
    let tips: HashMap<String, String> =
        serde_json::from_value(manifest.get("tips").cloned().unwrap_or(json!({})))
            .map_err(to_string)?;
    let staging = root
        .join("pdf-import-staging")
        .join(format!("restore-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging).map_err(to_string)?;
    let result = (|| {
        for (name, hash) in &files {
            crate::normalize_relative_asset_path(name)?;
            let parts: Vec<_> = name.split('/').collect();
            if parts.len() != 3
                || parts[0] != "pdf-import-batches"
                || Uuid::parse_str(parts[1]).is_err()
            {
                return Err("备份图片路径不合法".into());
            }
            safe_file(parts[2])?;
            let mut bytes = vec![];
            archive
                .by_name(name)
                .map_err(to_string)?
                .take(40 * 1024 * 1024)
                .read_to_end(&mut bytes)
                .map_err(to_string)?;
            if format!("{:x}", Sha256::digest(&bytes)) != *hash {
                return Err("备份图片校验失败，未恢复数据".into());
            }
            let file = staging.join(name);
            fs::create_dir_all(file.parent().unwrap()).map_err(to_string)?;
            fs::write(file, bytes).map_err(to_string)?;
        }
        let mut c = connect(root)?;
        snapshot(&c, root, "restore")?;
        let tx = c
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(to_string)?;
        for batch in &batches {
            if batch.book_id != book_id
                || batch.undone
                || Uuid::parse_str(&batch.batch_id).is_err()
                || batch.imported != batch.question_ids.len()
                || batch.question_ids.iter().any(|id| {
                    !questions
                        .iter()
                        .any(|q| q["id"] == *id && q["pdfSource"]["batchId"] == batch.batch_id)
                })
            {
                return Err("备份批次所属书本或题目数量不一致".into());
            }
            let bound: Option<String> = tx
                .query_row(
                    "SELECT book_id FROM pdf_import_sources WHERE fingerprint=?1",
                    [&batch.source_fingerprint],
                    |r| r.get(0),
                )
                .optional()
                .map_err(to_string)?;
            if bound.as_deref().is_some_and(|s| s != book_id) {
                return Err("备份资料绑定了其他书本".into());
            }
            let prior: Option<(String, bool)> = tx
                .query_row(
                    "SELECT book_id,undone FROM pdf_import_batches WHERE batch_id=?1",
                    [&batch.batch_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(to_string)?;
            if prior
                .as_ref()
                .is_some_and(|(bid, undone)| bid != book_id || *undone)
            {
                return Err("备份包含已撤销或属于其他书本的批次，请使用新批次导入".into());
            }
            if batch.imported + batch.duplicates > 0 {
                tx.execute(
                    "INSERT OR IGNORE INTO pdf_import_sources VALUES(?1,?2)",
                    params![batch.source_fingerprint, book_id],
                )
                .map_err(to_string)?;
            }
            tx.execute("INSERT OR IGNORE INTO pdf_import_batches(batch_id,book_id,receipt,reviewed) VALUES(?1,?2,?3,?4)",params![batch.batch_id,book_id,serde_json::to_string(batch).map_err(to_string)?,batch.reviewed]).map_err(to_string)?;
            if batch.reviewed {
                tx.execute(
                    "UPDATE pdf_import_batches SET reviewed=1 WHERE batch_id=?1",
                    [&batch.batch_id],
                )
                .map_err(to_string)?;
            }
        }
        let mut added = 0;
        for q in &questions {
            validate_page_images(q)?;
            let id = q["id"].as_str().ok_or("备份缺少题目标识")?;
            let batch_id = q["pdfSource"]["batchId"].as_str().ok_or("备份缺少批次")?;
            let key = q["pdfSource"]["sourceKey"]
                .as_str()
                .ok_or("备份缺少来源标识")?;
            if id != format!("pdf-{}-{}", book_id, key)
                || !batches.iter().any(|b| {
                    b.batch_id == batch_id
                        && b.source_fingerprint == q["pdfSource"]["sourceFingerprint"]
                        && b.question_ids.iter().any(|v| v == id)
                })
            {
                return Err("备份题目与批次不一致".into());
            }
            for field in ["questionImages", "answerImages", "pageImages"] {
                if field == "pageImages" && q[field].is_null() {
                    continue;
                }
                let images = q[field].as_array().ok_or("备份缺少图片列表")?;
                if images.is_empty() {
                    return Err("备份图片列表为空".into());
                }
                for file in images {
                    let name = file.as_str().ok_or("图片路径错误")?;
                    if !files.contains_key(name)
                        || !name.starts_with(&format!("pdf-import-batches/{}/", batch_id))
                    {
                        return Err("备份缺少题目图片或图片所属批次错误".into());
                    }
                }
            }
            for (single, multiple) in [
                ("questionImage", "questionImages"),
                ("answerImage", "answerImages"),
            ] {
                if !q[multiple].as_array().unwrap().contains(&q[single]) {
                    return Err("备份的图片引用不一致".into());
                }
            }
            let prior: Option<String> = tx
                .query_row(
                    "SELECT data FROM pdf_import_questions WHERE id=?1",
                    [id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(to_string)?;
            if let Some(prior) = prior {
                if serde_json::from_str::<Value>(&prior).map_err(to_string)? != *q {
                    return Err("已有题目与备份冲突，未覆盖现有数据".into());
                }
                continue;
            }
            tx.execute(
                "INSERT INTO pdf_import_questions VALUES(?1,?2,?3,?4,?5)",
                params![id, book_id, key, batch_id, q.to_string()],
            )
            .map_err(to_string)?;
            added += 1;
        }
        for (id, value) in &tips {
            if !questions.iter().any(|q| q["id"] == *id) {
                return Err("备份思路不属于本批题目".into());
            }
            tx.execute(
                "INSERT OR IGNORE INTO review_store(key,value,updated_at) VALUES(?1,?2,?3)",
                params![
                    format!("tips::{}::{}", book_id, id),
                    value,
                    Local::now().to_rfc3339()
                ],
            )
            .map_err(to_string)?;
        }
        for (name, hash) in &files {
            let dest = root.join("books").join(book_id).join(name);
            if dest.is_file() {
                if format!("{:x}", Sha256::digest(fs::read(&dest).map_err(to_string)?)) != *hash {
                    return Err("已有图片与备份冲突，未覆盖".into());
                }
            } else {
                fs::create_dir_all(dest.parent().unwrap()).map_err(to_string)?;
                fs::copy(staging.join(name), dest).map_err(to_string)?;
            }
        }
        let review: Option<String> = tx
            .query_row(
                "SELECT value FROM review_store WHERE key=?1",
                [review_key_for(book_id, "openclaw-review-state")],
                |r| r.get(0),
            )
            .optional()
            .map_err(to_string)?;
        if let Some(review) = review {
            protect_reviewed_batches(&tx, book_id, &review)?;
        }
        tx.commit().map_err(to_string)?;
        Ok(added)
    })();
    let _ = fs::remove_dir_all(staging);
    result
}

#[tauri::command]
pub async fn export_pdf_library_backup(
    app: tauri::AppHandle,
    book_id: String,
) -> Result<bool, String> {
    validate_book_id(&book_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = app
            .dialog()
            .file()
            .add_filter("MathLoop PDF题库备份", &["mathloop"])
            .set_file_name(format!("{}-pdf-library.mathloop", book_id))
            .blocking_save_file();
        let Some(path) = path else {
            return Ok(false);
        };
        library_backup(
            &mathloop_data_dir()?,
            &book_id,
            &path.into_path().map_err(to_string)?,
        )?;
        Ok(true)
    })
    .await
    .map_err(to_string)?
}

#[tauri::command]
pub async fn restore_pdf_library_backup(
    app: tauri::AppHandle,
    book_id: String,
) -> Result<Option<usize>, String> {
    validate_book_id(&book_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = app
            .dialog()
            .file()
            .add_filter("MathLoop PDF题库备份", &["mathloop"])
            .blocking_pick_file();
        let Some(path) = path else {
            return Ok(None);
        };
        restore_library(
            &mathloop_data_dir()?,
            &book_id,
            &path.into_path().map_err(to_string)?,
        )
        .map(Some)
    })
    .await
    .map_err(to_string)?
}
