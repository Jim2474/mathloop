# Multi-Book Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to switch between multiple exercise books, each with isolated review data, without breaking existing data.

**Architecture:** Shared SQLite database with bookId-namespaced keys (`review::{bookId}`). Books stored under `%APPDATA%\MathLoop\books\{bookId}/`. Automatic migration on first launch moves existing data into `books/default/`. Frontend uses a new `useBookStore` to track active book and trigger re-hydration on switch.

**Tech Stack:** Rust (rusqlite, serde_json, tauri), TypeScript (React, Zustand, react-router-dom)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src-tauri/src/main.rs` | Book types, new commands, modified commands, migration |
| Create | `src/types/book.ts` | BookEntry type |
| Create | `src/store/useBookStore.ts` | Book state management |
| Modify | `src/services/desktopBridge.ts` | Book-related invoke wrappers |
| Modify | `src/services/reviewPersistStorage.ts` | Pass bookId to invoke calls |
| Modify | `src/components/layout/Navbar.tsx` | Book dropdown |
| Modify | `src/app/App.tsx` | Book initialization on startup |
| Modify | `src/services/backupService.ts` | bookId in backup format |
| Modify | `src/pages/DashboardPage.tsx` | Show current book name |
| Modify | `src/pages/BackupPage.tsx` | Show current book name, bookId in export |

---

## Task 1: Rust Backend — Book Types and New Commands

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add BookEntry struct and book-registry helpers**

Add after the `BootstrapInfo` struct (line ~29):

```rust
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct BookEntry {
    id: String,
    name: String,
    added_at: String,
}
```

Add helper functions at the bottom of the file (before `fn to_string`):

```rust
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
```

- [ ] **Step 2: Add `list_books` command**

```rust
#[tauri::command]
fn list_books() -> Result<Vec<BookEntry>, String> {
    let db_path = mathloop_data_dir()?.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(db_path).map_err(to_string)?;
    read_registry_raw(&connection)
}
```

- [ ] **Step 3: Add `add_book` command**

```rust
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
```

- [ ] **Step 4: Add `remove_book` command**

```rust
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
```

- [ ] **Step 5: Add `set_active_book` command**

```rust
#[tauri::command]
fn set_active_book<R: Runtime>(app: tauri::AppHandle<R>, book_id: String) -> Result<BootstrapInfo, String> {
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
```

- [ ] **Step 6: Register new commands in `main()`**

Update the `invoke_handler` in `fn main()`:

```rust
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
```

- [ ] **Step 7: Build to verify compilation**

Run: `cd src-tauri && cargo check`

Expected: Compiles with possible warnings about unused imports (ok).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: add book registry types and list/add/remove/set-active commands"
```

---

## Task 2: Rust Backend — Modify Existing Commands for bookId

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Modify `bootstrap_mathloop_data` to accept `book_id`**

Replace the existing `bootstrap_mathloop_data` function. The key change: `data_dir` now points to `books/{book_id}/` instead of the top-level directory. The DB and backup paths remain shared at the top level.

```rust
#[tauri::command]
fn bootstrap_mathloop_data<R: Runtime>(
    app: tauri::AppHandle<R>,
    book_id: Option<String>,
) -> Result<BootstrapInfo, String> {
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
```

- [ ] **Step 2: Modify `review_store_get` to accept `book_id`**

```rust
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
```

- [ ] **Step 3: Modify `review_store_set` to accept `book_id`**

```rust
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
```

- [ ] **Step 4: Modify `review_store_remove` to accept `book_id`**

```rust
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
```

- [ ] **Step 5: Modify `load_questions_json` to accept `book_id`**

```rust
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
```

- [ ] **Step 6: Modify `load_question_image_fixes_json` to accept `book_id`**

```rust
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
```

- [ ] **Step 7: Modify `update_question_tips` to accept `book_id`**

```rust
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
```

- [ ] **Step 8: Build to verify compilation**

Run: `cd src-tauri && cargo check`

Expected: Compiles successfully.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: modify existing Tauri commands to accept optional bookId"
```

---

## Task 3: Rust Backend — Data Migration

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add migration function**

Add this function after the `write_registry` helper:

```rust
fn run_migration<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let top_dir = mathloop_data_dir()?;
    let default_book_dir = top_dir.join("books").join("default");

    // Idempotency: skip if already migrated
    if default_book_dir.exists() {
        return Ok(());
    }

    let db_path = top_dir.join(DB_FILE);
    ensure_database(&db_path)?;
    let connection = Connection::open(&db_path).map_err(to_string)?;

    // Check migration version
    let migrated: Option<String> = connection
        .query_row(
            "SELECT value FROM review_store WHERE key = ?1",
            params![MIGRATION_VERSION_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(to_string)?;
    if migrated.is_some() {
        return Ok(());
    }

    // Step 1: Pre-migration backup
    let review_state: Option<String> = connection
        .query_row(
            "SELECT value FROM review_store WHERE key = ?1",
            params![OLD_REVIEW_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(to_string)?;

    if let Some(ref state) = review_state {
        let backup_dir = top_dir.join("backups");
        fs::create_dir_all(&backup_dir).map_err(to_string)?;
        let backup_path = backup_dir.join(format!(
            "pre-migration-{}.json",
            Local::now().format("%Y-%m-%d-%H-%M-%S")
        ));
        fs::write(&backup_path, state).map_err(to_string)?;
    }

    // Step 2: Create book directories
    for sub in ["data", "questions", "answers", "pages", "question-fixes"] {
        fs::create_dir_all(default_book_dir.join(sub)).map_err(to_string)?;
    }

    // Step 3: Move existing data (rename)
    for child in ["data", "questions", "answers", "pages", "question-fixes"] {
        let source = top_dir.join(child);
        let target = default_book_dir.join(child);
        if source.exists() && !target.exists() {
            fs::rename(&source, &target).map_err(to_string)?;
        }
    }

    // Step 4: Migrate SQLite keys in a transaction
    if review_state.is_some() {
        connection
            .execute_batch("BEGIN;")
            .map_err(to_string)?;

        let migrate_result = (|| -> Result<(), String> {
            connection.execute(
                "INSERT INTO review_store (key, value, updated_at)
                 SELECT ?1, value, updated_at
                 FROM review_store WHERE key = ?2",
                params![
                    format!("{}{}", NEW_REVIEW_KEY_PREFIX, "default"),
                    OLD_REVIEW_KEY
                ],
            ).map_err(to_string)?;

            connection.execute(
                "DELETE FROM review_store WHERE key = ?1",
                params![OLD_REVIEW_KEY],
            ).map_err(to_string)?;

            // Extract and save shared settings
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(review_state.as_ref().unwrap()) {
                if let Some(settings) = parsed.get("settings") {
                    if let Ok(settings_json) = serde_json::to_string(settings) {
                        connection.execute(
                            "INSERT OR REPLACE INTO review_store (key, value, updated_at)
                             VALUES (?1, ?2, ?3)",
                            params![SETTINGS_KEY, settings_json, Local::now().to_rfc3339()],
                        ).map_err(to_string)?;
                    }
                }
            }

            connection.execute(
                "INSERT OR REPLACE INTO review_store (key, value, updated_at)
                 VALUES (?1, ?2, ?3)",
                params![MIGRATION_VERSION_KEY, "1", Local::now().to_rfc3339()],
            ).map_err(to_string)?;

            Ok(())
        })();

        if migrate_result.is_err() {
            let _ = connection.execute_batch("ROLLBACK;");
            return migrate_result;
        }
        connection.execute_batch("COMMIT;").map_err(to_string)?;
    }

    // Step 5: Write book registry
    let registry = vec![BookEntry {
        id: "default".to_string(),
        name: "现有题库".to_string(),
        added_at: Local::now().to_rfc3339(),
    }];
    write_registry(&connection, &registry)?;

    Ok(())
}
```

- [ ] **Step 2: Call migration from `bootstrap_mathloop_data`**

Add `run_migration` call at the very beginning of `bootstrap_mathloop_data`, before the legacy path check:

```rust
#[tauri::command]
fn bootstrap_mathloop_data<R: Runtime>(
    app: tauri::AppHandle<R>,
    book_id: Option<String>,
) -> Result<BootstrapInfo, String> {
    // Run migration first
    run_migration(&app)?;

    let top_dir = mathloop_data_dir()?;
    // ... rest of existing code
```

- [ ] **Step 3: Build to verify**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: add automatic data migration for multi-book support"
```

---

## Task 4: Frontend — Book Types, Store, and Bridge

**Files:**
- Create: `src/types/book.ts`
- Create: `src/store/useBookStore.ts`
- Modify: `src/services/desktopBridge.ts`
- Modify: `src/services/reviewPersistStorage.ts`

- [ ] **Step 1: Create `src/types/book.ts`**

```ts
export type BookEntry = {
  id: string;
  name: string;
  addedAt: string;
};
```

- [ ] **Step 2: Add book-related functions to `src/services/desktopBridge.ts`**

Add these functions after the existing `updateDesktopQuestionTips` function:

```ts
export async function listDesktopBooks(): Promise<BookEntry[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  await initializeDesktopRuntime();
  return invokeDesktop<BookEntry[]>("list_books");
}

export async function addDesktopBook(bookId: string, name: string): Promise<BookEntry> {
  if (!isTauriRuntime()) {
    throw new Error("只有桌面版可以添加书本。");
  }
  await initializeDesktopRuntime();
  return invokeDesktop<BookEntry>("add_book", { bookId, name });
}

export async function removeDesktopBook(bookId: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("只有桌面版可以移除书本。");
  }
  await initializeDesktopRuntime();
  await invokeDesktop<void>("remove_book", { bookId });
}

export async function setActiveDesktopBook(bookId: string): Promise<BootstrapInfo> {
  if (!isTauriRuntime()) {
    throw new Error("只有桌面版可以切换书本。");
  }
  await initializeDesktopRuntime();
  return invokeDesktop<BootstrapInfo>("set_active_book", { bookId });
}
```

Add the import at the top of the file:

```ts
import type { BookEntry } from "../types/book";
```

Also export the `BootstrapInfo` type if not already exported (it's defined locally in the existing `desktopBridge.ts`). Add:

```ts
export type BootstrapInfo = {
  dataDir: string;
  dbPath: string;
  createdBackup: boolean;
  backupPath: string | null;
};
```

**Note:** The existing `BootstrapInfo` type in `desktopBridge.ts` (line ~5) is already `type BootstrapInfo = { ... }` — change it to `export type` so the book store can import it.

- [ ] **Step 3: Modify `initializeDesktopRuntime` to accept optional `bookId`**

Change the function signature and the invoke call:

```ts
export async function initializeDesktopRuntime(bookId?: string): Promise<BootstrapInfo | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  bootstrapPromise ??= invoke<BootstrapInfo>("bootstrap_mathloop_data", { bookId: bookId ?? null }).then((info) => {
    desktopDataDir = info.dataDir;
    return info;
  });
  return bootstrapPromise;
}
```

Add a function to reset the bootstrap (for book switching):

```ts
export function resetDesktopRuntime(): void {
  bootstrapPromise = null;
  desktopDataDir = "";
}
```

- [ ] **Step 4: Create `src/store/useBookStore.ts`**

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BookEntry } from "../types/book";
import {
  listDesktopBooks,
  addDesktopBook,
  removeDesktopBook,
  setActiveDesktopBook,
  resetDesktopRuntime,
  initializeDesktopRuntime,
  isTauriRuntime,
} from "../services/desktopBridge";

const ACTIVE_BOOK_KEY = "mathloop-active-book";

type BookState = {
  books: BookEntry[];
  activeBookId: string | null;
  isSwitching: boolean;
  isLoaded: boolean;
  loadBooks: () => Promise<void>;
  switchBook: (bookId: string) => Promise<void>;
  addBook: (bookId: string, name: string) => Promise<BookEntry>;
  removeBook: (bookId: string) => Promise<void>;
};

export const useBookStore = create<BookState>()(
  persist(
    (set, get) => ({
      books: [],
      activeBookId: null,
      isSwitching: false,
      isLoaded: false,

      loadBooks: async () => {
        if (!isTauriRuntime()) {
          set({ isLoaded: true });
          return;
        }
        try {
          const books = await listDesktopBooks();
          set({ books, isLoaded: true });
        } catch {
          set({ books: [], isLoaded: true });
        }
      },

      switchBook: async (bookId: string) => {
        const current = get().activeBookId;
        if (current === bookId) return;

        set({ isSwitching: true });
        try {
          resetDesktopRuntime();
          await setActiveDesktopBook(bookId);
          await initializeDesktopRuntime(bookId);
          set({ activeBookId: bookId, isSwitching: false });
        } catch (error) {
          set({ isSwitching: false });
          throw error;
        }
      },

      addBook: async (bookId: string, name: string) => {
        const entry = await addDesktopBook(bookId, name);
        set((state) => ({ books: [...state.books, entry] }));
        return entry;
      },

      removeBook: async (bookId: string) => {
        await removeDesktopBook(bookId);
        set((state) => ({
          books: state.books.filter((b) => b.id !== bookId),
          activeBookId: state.activeBookId === bookId ? null : state.activeBookId,
        }));
      },
    }),
    {
      name: ACTIVE_BOOK_KEY,
      partialize: (state) => ({
        activeBookId: state.activeBookId,
      }),
    },
  ),
);
```

- [ ] **Step 5: Modify `src/services/reviewPersistStorage.ts` to pass bookId**

```ts
import type { StateStorage } from "zustand/middleware";
import { invokeDesktop, isTauriRuntime } from "./desktopBridge";

export function createReviewPersistStorage(bookId?: string): StateStorage {
  if (!isTauriRuntime()) {
    return localStorage;
  }

  return {
    getItem: (name) =>
      invokeDesktop<string | null>("review_store_get", { key: name, bookId: bookId ?? null }),
    setItem: (name, value) =>
      invokeDesktop<void>("review_store_set", { key: name, value, bookId: bookId ?? null }),
    removeItem: (name) =>
      invokeDesktop<void>("review_store_remove", { key: name, bookId: bookId ?? null }),
  };
}

export function removePersistedReviewState(name: string, bookId?: string): void {
  if (!isTauriRuntime()) {
    localStorage.removeItem(name);
    return;
  }
  void invokeDesktop<void>("review_store_remove", { key: name, bookId: bookId ?? null });
}
```

- [ ] **Step 6: Update `src/store/useReviewStore.ts` to use bookId from bookStore**

In `useReviewStore.ts`, the `createReviewPersistStorage()` call needs to get the current bookId. Since Zustand stores can't easily read other stores during initialization, we need a different approach.

The cleanest approach: `reviewPersistStorage` reads `activeBookId` from localStorage directly (since `useBookStore` persists it there).

Update `createReviewPersistStorage` in `reviewPersistStorage.ts`:

```ts
import type { StateStorage } from "zustand/middleware";
import { invokeDesktop, isTauriRuntime } from "./desktopBridge";

function getActiveBookId(): string | null {
  try {
    const raw = localStorage.getItem("mathloop-active-book");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.activeBookId ?? null;
  } catch {
    return null;
  }
}

export function createReviewPersistStorage(): StateStorage {
  if (!isTauriRuntime()) {
    return localStorage;
  }

  return {
    getItem: (name) => {
      const bookId = getActiveBookId();
      return invokeDesktop<string | null>("review_store_get", { key: name, bookId });
    },
    setItem: (name, value) => {
      const bookId = getActiveBookId();
      return invokeDesktop<void>("review_store_set", { key: name, value, bookId });
    },
    removeItem: (name) => {
      const bookId = getActiveBookId();
      return invokeDesktop<void>("review_store_remove", { key: name, bookId });
    },
  };
}

export function removePersistedReviewState(name: string): void {
  if (!isTauriRuntime()) {
    localStorage.removeItem(name);
    return;
  }
  const bookId = getActiveBookId();
  void invokeDesktop<void>("review_store_remove", { key: name, bookId });
}
```

This way `useReviewStore` doesn't need to change at all — it reads the active bookId from localStorage on every operation.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd G:\AI_Projects\Mathloop_04 && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/types/book.ts src/store/useBookStore.ts src/services/desktopBridge.ts src/services/reviewPersistStorage.ts
git commit -m "feat: add book store, bridge functions, and bookId-scoped review persistence"
```

---

## Task 5: Frontend — App Startup and Book Switching

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Update `App.tsx` for book-aware startup**

Replace the entire `App.tsx`:

```tsx
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import BackupPage from "../pages/BackupPage";
import DashboardPage from "../pages/DashboardPage";
import MistakeEntryPage from "../pages/MistakeEntryPage";
import QuestionDetailPage from "../pages/QuestionDetailPage";
import QuestionListPage from "../pages/QuestionListPage";
import ReviewPage from "../pages/ReviewPage";
import { initializeDesktopRuntime } from "../services/desktopBridge";
import { useBookStore } from "../store/useBookStore";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";

export default function App() {
  const loadQuestions = useQuestionStore((state) => state.loadQuestions);
  const questions = useQuestionStore((state) => state.questions);
  const hasHydrated = useReviewStore((state) => state.hasHydrated);
  const syncQuestionLibrary = useReviewStore((state) => state.syncQuestionLibrary);

  const loadBooks = useBookStore((state) => state.loadBooks);
  const activeBookId = useBookStore((state) => state.activeBookId);
  const books = useBookStore((state) => state.books);

  // Load book list on mount
  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  // Bootstrap and load questions when book is known
  useEffect(() => {
    async function boot() {
      await initializeDesktopRuntime(activeBookId ?? undefined);
      await loadQuestions();
    }
    void boot();
  }, [activeBookId, loadQuestions]);

  // Sync review library when hydrated
  useEffect(() => {
    if (hasHydrated && questions.length > 0) {
      syncQuestionLibrary(questions);
    }
  }, [hasHydrated, questions, syncQuestionLibrary]);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/mistakes" element={<MistakeEntryPage />} />
        <Route path="/questions" element={<QuestionListPage />} />
        <Route path="/questions/:id" element={<QuestionDetailPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
```

- [ ] **Step 2: Update `questionLoader.ts` to pass bookId**

In `src/services/questionLoader.ts`, update `loadOpenClawQuestions` to get the active bookId and pass it:

```ts
import type { Question } from "../types/question";
import { setQuestionImageFixes } from "../utils/questionImages";
import { initializeDesktopRuntime, invokeDesktop, isTauriRuntime } from "./desktopBridge";

const QUESTIONS_URL = "/data/questions.json";
const QUESTION_IMAGE_FIXES_URL = "/data/question-image-fixes.json";

function getActiveBookId(): string | null {
  try {
    const raw = localStorage.getItem("mathloop-active-book");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.activeBookId ?? null;
  } catch {
    return null;
  }
}

export async function loadOpenClawQuestions(): Promise<Question[]> {
  const bookId = getActiveBookId();

  if (isTauriRuntime()) {
    await initializeDesktopRuntime(bookId ?? undefined);
    const text = await invokeDesktop<string>("load_questions_json", { bookId });
    const data: unknown = JSON.parse(text);

    if (!Array.isArray(data)) {
      throw new Error("questions.json 顶层必须是题目数组。");
    }

    setQuestionImageFixes(await loadDesktopQuestionImageFixes(bookId));
    return data as Question[];
  }

  const response = await fetch(QUESTIONS_URL, { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`读取 ${QUESTIONS_URL} 失败：${response.status} ${response.statusText}`);
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("questions.json 顶层必须是题目数组。");
  }

  setQuestionImageFixes(await loadQuestionImageFixes());
  return data as Question[];
}

async function loadDesktopQuestionImageFixes(bookId: string | null): Promise<Record<string, string>> {
  try {
    const text = await invokeDesktop<string | null>("load_question_image_fixes_json", { bookId });
    if (!text) {
      return {};
    }
    const data: unknown = JSON.parse(text);
    if (!isRecord(data)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(data)
        .map(([questionId, value]) => [questionId, getFixImagePath(value)])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  } catch {
    return {};
  }
}

async function loadQuestionImageFixes(): Promise<Record<string, string>> {
  try {
    const response = await fetch(QUESTION_IMAGE_FIXES_URL, { cache: "no-cache" });
    if (!response.ok) {
      return {};
    }
    const data: unknown = await response.json();
    if (!isRecord(data)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(data)
        .map(([questionId, value]) => [questionId, getFixImagePath(value)])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  } catch {
    return {};
  }
}

function getFixImagePath(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (isRecord(value) && typeof value.fixedImage === "string") {
    return value.fixedImage.trim();
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
```

- [ ] **Step 3: Update `useQuestionStore.ts` to pass bookId for tips**

In `src/store/useQuestionStore.ts`, update `saveQuestionTips`:

```ts
saveQuestionTips: async (questionId, tips) => {
  const bookId = getActiveBookIdFromStorage();
  await updateDesktopQuestionTips(questionId, tips, bookId ?? undefined);
  const questions = await loadOpenClawQuestions();
  set({ questions, error: null });
},
```

Add the helper and update the import for `updateDesktopQuestionTips`:

```ts
function getActiveBookIdFromStorage(): string | null {
  try {
    const raw = localStorage.getItem("mathloop-active-book");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.activeBookId ?? null;
  } catch {
    return null;
  }
}
```

And update `updateDesktopQuestionTips` in `desktopBridge.ts` to accept bookId:

```ts
export async function updateDesktopQuestionTips(
  questionId: string,
  tips: string,
  bookId?: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("只有桌面版可以把 tips 保存到外部题库。");
  }
  await initializeDesktopRuntime(bookId);
  await invokeDesktop<void>("update_question_tips", { questionId, tips, bookId: bookId ?? null });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd G:\AI_Projects\Mathloop_04 && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/app/App.tsx src/services/questionLoader.ts src/store/useQuestionStore.ts src/services/desktopBridge.ts
git commit -m "feat: wire book-aware startup and question loading"
```

---

## Task 6: Frontend — Navbar Book Dropdown

**Files:**
- Modify: `src/components/layout/Navbar.tsx`

- [ ] **Step 1: Replace Navbar with book dropdown**

```tsx
import { useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useBookStore } from "../../store/useBookStore";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/mistakes", label: "错题录入" },
  { to: "/questions", label: "题库" },
  { to: "/review", label: "复习" },
  { to: "/backup", label: "备份" },
];

export default function Navbar() {
  const { books, activeBookId, isSwitching, switchBook, addBook } = useBookStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentBook = books.find((b) => b.id === activeBookId);

  function handleSelect(bookId: string) {
    setDropdownOpen(false);
    if (bookId !== activeBookId) {
      void switchBook(bookId);
    }
  }

  function handleAddConfirm(bookId: string, name: string) {
    setShowAddDialog(false);
    void addBook(bookId, name).then((entry) => {
      void switchBook(entry.id);
    });
  }

  return (
    <nav className="flex flex-wrap items-center gap-1 rounded-full border border-white/45 bg-white/25 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] backdrop-blur-xl">
      {/* Book Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          disabled={isSwitching}
          className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium tracking-[-0.224px] text-ink/58 transition hover:bg-white/45 hover:text-ink disabled:opacity-50"
        >
          <span className="text-base">📘</span>
          <span className="max-w-[8rem] truncate">
            {isSwitching ? "切换中..." : currentBook?.name ?? "选择书本"}
          </span>
          <span className="text-xs text-ink/40">▾</span>
        </button>

        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setDropdownOpen(false)}
            />
            <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/50 bg-white/90 shadow-xl backdrop-blur-xl">
              <div className="max-h-64 overflow-auto p-1.5">
                {books.map((book) => (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => handleSelect(book.id)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/70"
                  >
                    {book.id === activeBookId && (
                      <span className="text-moss">✓</span>
                    )}
                    <span className={book.id === activeBookId ? "font-semibold text-ink" : "text-ink/70"}>
                      {book.name}
                    </span>
                  </button>
                ))}
              </div>
              <div className="border-t border-white/50 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    setShowAddDialog(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slateblue transition hover:bg-white/70"
                >
                  <span>+</span>
                  <span>添加新书</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Nav Links */}
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            [
              "rounded-full px-3.5 py-2 text-sm font-medium tracking-[-0.224px] transition",
              isActive
                ? "bg-white/70 text-ink shadow-[0_8px_18px_rgba(29,29,31,0.08),inset_0_1px_0_rgba(255,255,255,0.72)]"
                : "text-ink/58 hover:bg-white/45 hover:text-ink",
            ].join(" ")
          }
        >
          {item.label}
        </NavLink>
      ))}

      {/* Add Book Dialog */}
      {showAddDialog && (
        <AddBookDialog
          onConfirm={handleAddConfirm}
          onCancel={() => setShowAddDialog(false)}
        />
      )}
    </nav>
  );
}

function AddBookDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (bookId: string, name: string) => void;
  onCancel: () => void;
}) {
  const [bookId, setBookId] = useState("");
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedId = bookId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const trimmedName = name.trim();
    if (trimmedId && trimmedName) {
      onConfirm(trimmedId, trimmedName);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/50 bg-white/95 p-6 shadow-2xl backdrop-blur-xl">
        <h3 className="text-xl font-semibold text-ink">添加新书</h3>
        <p className="mt-2 text-sm text-ink/60">
          请先将 questions.json 放到 %APPDATA%\MathLoop\books\{'{'}书本ID{'}'}\data\ 目录下。
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-ink/70">书本 ID（目录名）</span>
            <input
              type="text"
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
              placeholder="例如: wuzhongxiang-yanxuanti"
              className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-ink/70">显示名称</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 武忠祥严选题"
              className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="apple-ghost-pill px-4 py-2 text-sm font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!bookId.trim() || !name.trim()}
              className="apple-pill px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              添加并切换
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd G:\AI_Projects\Mathloop_04 && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Navbar.tsx
git commit -m "feat: add book dropdown to navbar with add-book dialog"
```

---

## Task 7: Frontend — Dashboard and Backup Page Updates

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/BackupPage.tsx`
- Modify: `src/services/backupService.ts`

- [ ] **Step 1: Update DashboardPage to show current book name**

In `src/pages/DashboardPage.tsx`, add book name display:

```tsx
import { Link } from "react-router-dom";
import EmptyState from "../components/common/EmptyState";
import StatCard from "../components/dashboard/StatCard";
import { getReviewDashboardStats } from "../services/dashboardStats";
import { useBookStore } from "../store/useBookStore";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";
import { getDashboardStats } from "../utils/questionStats";

export default function DashboardPage() {
  const { questions, isLoading, error } = useQuestionStore();
  const { cards, reviewLogs, mistakeRecords } = useReviewStore();
  const { books, activeBookId } = useBookStore();
  const stats = getDashboardStats(questions);
  const reviewStats = getReviewDashboardStats(questions, cards, reviewLogs, mistakeRecords);
  const currentBook = books.find((b) => b.id === activeBookId);

  if (isLoading) {
    return <EmptyState title="正在读取题库" description="正在加载题目数据。" />;
  }

  if (error) {
    return <EmptyState title="题库读取失败" description={error} />;
  }

  return (
    <div className="space-y-8">
      <section className="apple-hero-glass overflow-hidden rounded-[32px] px-6 py-16 text-center md:px-10 md:py-20">
        <div className="apple-hero-content mx-auto max-w-3xl">
          <p className="text-[13px] font-medium tracking-[-0.12px] text-moss">
            {currentBook ? currentBook.name : "Local FSRS review system"}
          </p>
          {/* ... rest of hero unchanged ... */}
```

Only the `<p>` tag content changes — show book name instead of the static text.

- [ ] **Step 2: Update BackupService to include bookId**

In `src/services/backupService.ts`, update `createReviewBackup`:

```ts
export function createReviewBackup(
  cards: Record<string, ReviewCardRecord>,
  reviewLogs: ReviewLog[],
  settings: ReviewSettings,
  mistakeRecords: Record<string, ReviewMistakeRecord> = {},
  questionFingerprints: Record<string, ReviewQuestionFingerprint> = {},
  lastSyncResult: ReviewSyncResult | null = null,
  dailyReviewSession: DailyReviewSession | null = null,
  bookId: string | null = null,
): ReviewBackupData {
  return {
    version: REVIEW_BACKUP_VERSION,
    bookId,
    exportedAt: new Date().toISOString(),
    cards,
    reviewLogs,
    settings: normalizeSettings(settings),
    mistakeRecords,
    questionFingerprints,
    lastSyncResult,
    dailyReviewSession,
  };
}
```

Update `ReviewBackupData` type in `src/types/review.ts`:

```ts
export type ReviewBackupData = {
  version: number;
  bookId?: string | null;
  exportedAt: string;
  cards: Record<string, ReviewCardRecord>;
  reviewLogs: ReviewLog[];
  settings: ReviewSettings;
  dailyReviewSession?: DailyReviewSession | null;
  mistakeRecords?: Record<string, ReviewMistakeRecord>;
  questionFingerprints?: Record<string, ReviewQuestionFingerprint>;
  lastSyncResult?: ReviewSyncResult | null;
};
```

- [ ] **Step 3: Update BackupPage to show book name and pass bookId to export**

In `src/pages/BackupPage.tsx`, add book store usage:

```tsx
import { useBookStore } from "../store/useBookStore";
```

Add in the component:

```tsx
const { books, activeBookId } = useBookStore();
const currentBook = books.find((b) => b.id === activeBookId);
```

Update the hero section to show book name, and update `handleExport`:

```tsx
function handleExport() {
  const backup = createReviewBackup(
    cards,
    reviewLogs,
    settings,
    mistakeRecords,
    questionFingerprints,
    lastSyncResult,
    dailyReviewSession,
    activeBookId,
  );
  downloadReviewBackup(backup);
  setMessage("已生成本地复习数据备份。");
  setImportError(null);
}
```

Update the import handler to check bookId:

```tsx
async function handleImport(event: ChangeEvent<HTMLInputElement>) {
  // ... existing code ...
  try {
    const backup = await readBackupFile(file);

    if (backup.bookId && backup.bookId !== activeBookId) {
      const confirmed = window.confirm(
        `此备份来自《${backup.bookId}》，当前活跃书是《${currentBook?.name ?? activeBookId}》。确认导入吗？`
      );
      if (!confirmed) return;
    }

    importReviewState({ /* ... existing ... */ });
    // ... rest unchanged
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd G:\AI_Projects\Mathloop_04 && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx src/pages/BackupPage.tsx src/services/backupService.ts src/types/review.ts
git commit -m "feat: show book name in dashboard and backup, add bookId to backup format"
```

---

## Task 8: Build Verification

- [ ] **Step 1: Full TypeScript check**

Run: `cd G:\AI_Projects\Mathloop_04 && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 2: Rust check**

Run: `cd G:\AI_Projects\Mathloop_04\src-tauri && cargo check`

Expected: Compiles successfully.

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve build issues for multi-book support"
```
