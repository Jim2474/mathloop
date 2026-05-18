# Multi-Book Support Design Spec

## Overview

Add support for multiple exercise books in MathLoop. Each book has its own questions.json and isolated review data (cards, logs, mistakes). Shared settings across all books. Switch books via navbar dropdown.

## Goals

- Import and switch between 3-5 exercise books
- Each book's review data (cards, reviewLogs, mistakeRecords, fingerprints) is fully isolated
- Existing data is preserved during migration — zero data loss
- Shared review settings (maxDailyReviews, maxNewPerDay, desiredRetention)
- Manual file placement: user copies questions.json into a book directory

## Non-Goals

- UI-based file import (user places files manually)
- PDF-to-JSON conversion (separate task, see `brief-pdf-extraction.md`)
- Cross-book analytics or combined views

---

## 1. Directory Structure

```
%APPDATA%\MathLoop\
├── books\
│   ├── default\                    ← migrated from current data
│   │   ├── data\questions.json
│   │   ├── questions\              ← question images
│   │   ├── answers\                ← answer images
│   │   ├── pages\                  ← page images
│   │   └── question-fixes\         ← image fixes
│   ├── wuzhongxiang-yanxuanti\     ← new book example
│   │   └── data\questions.json
│   └── ...
├── mathloop.db                     ← shared SQLite
├── backups\                        ← shared backup directory
│   ├── pre-migration-{ts}.json     ← auto-created before migration
│   └── mathloop-auto-{ts}.json     ← startup backups
└── (no settings.json — settings in SQLite)
```

### bookId Rules

- Directory name = bookId
- Allowed characters: `[a-z0-9-]`
- `default` is reserved for migrated existing data
- Max length: 64 characters

---

## 2. SQLite Key Naming

| Purpose | Current Key | New Key |
|---------|------------|---------|
| Review state | `openclaw-review-state` | `review::{bookId}` |
| Shared settings | (inside review state) | `settings` (standalone) |
| Book registry | (none) | `book-registry` |
| Migration version | (none) | `migration-version` |

### book-registry Format (stored as JSON string in SQLite)

```json
[
  { "id": "default", "name": "高等数学基础篇·严选题", "addedAt": "2026-05-18T08:00:00+08:00" },
  { "id": "wuzhongxiang-yanxuanti", "name": "武忠祥高等数学辅导讲义·严选题", "addedAt": "2026-05-18T10:00:00+08:00" }
]
```

### Settings Key (shared, no bookId prefix)

```json
{
  "maxDailyReviews": 20,
  "maxNewPerDay": 10,
  "desiredRetention": 0.9
}
```

---

## 3. Rust Backend Changes

### New Tauri Commands

#### `list_books`

- Read `book-registry` from SQLite
- Return `Vec<BookEntry>` (id, name, addedAt)
- If registry doesn't exist, return empty list

#### `add_book(book_id: String, name: String)`

- Validate bookId format (`[a-z0-9-]`, max 64 chars)
- Create `books/{bookId}/data/` directory
- Create `books/{bookId}/questions/`, `answers/`, `pages/`, `question-fixes/` directories
- Add entry to book-registry
- Return `BookEntry`

#### `remove_book(book_id: String)`

- Remove from book-registry only (do NOT delete files)
- Return success

#### `set_active_book(book_id: String)`

- Validate bookId exists in registry and `books/{bookId}/data/questions.json` exists
- Run `bootstrap_mathloop_data` logic for that book
- Return `BootstrapInfo`

### Modified Commands

#### `bootstrap_mathloop_data(book_id: String)`

- Accept `book_id` parameter
- Data directory: `mathloop_data_dir()/books/{book_id}/`
- Copy missing resources into book-specific subdirectories
- Backup and DB remain shared (top-level)

#### `review_store_get(key: String, book_id: String)`

- If key is `settings`, use as-is (global)
- Otherwise, use `{key}::{book_id}` as actual SQLite key

#### `review_store_set(key: String, value: String, book_id: String)`

- Same prefix logic as `review_store_get`

#### `review_store_remove(key: String, book_id: String)`

- Same prefix logic

#### `load_questions_json(book_id: String)`

- Read from `books/{bookId}/data/questions.json` (external first, then resource fallback)

#### `update_question_tips(book_id: String, question_id: String, tips: String)`

- Operate on `books/{bookId}/data/questions.json`

#### `load_question_image_fixes_json(book_id: String)`

- Read from `books/{bookId}/data/question-image-fixes.json`

### New helper: `resolve_book_dir(book_id) -> PathBuf`

```rust
fn resolve_book_dir(book_id: &str) -> Result<PathBuf, String> {
    let dir = mathloop_data_dir()?.join("books").join(book_id);
    if !dir.exists() {
        return Err(format!("书本目录不存在: {}", book_id));
    }
    Ok(dir)
}
```

---

## 4. Data Migration (First Launch)

### Trigger

On startup, check if `mathloop_data_dir()/books/default/` exists. If not, run migration.

### Steps

1. **Pre-migration backup**
   - Read current review state from SQLite key `openclaw-review-state`
   - Write to `backups/pre-migration-{timestamp}.json`
   - This is a full JSON export, human-readable

2. **Create book directories**
   - `mkdir -p books/default/data`
   - `mkdir -p books/default/questions`
   - `mkdir -p books/default/answers`
   - `mkdir -p books/default/pages`
   - `mkdir -p books/default/question-fixes`

3. **Move existing data** (rename, not copy)
   - `data/` → `books/default/data/`
   - `questions/` → `books/default/questions/`
   - `answers/` → `books/default/answers/`
   - `pages/` → `books/default/pages/`
   - `question-fixes/` → `books/default/question-fixes/`

4. **Migrate SQLite keys** (in a transaction)
   ```sql
   BEGIN;
   INSERT INTO review_store (key, value, updated_at)
     SELECT 'review::default', value, updated_at
     FROM review_store WHERE key = 'openclaw-review-state';
   DELETE FROM review_store WHERE key = 'openclaw-review-state';
   INSERT OR REPLACE INTO review_store (key, value, updated_at)
     VALUES ('migration-version', '1', datetime('now'));
   COMMIT;
   ```

5. **Write book registry**
   - Insert `book-registry` key with `[{id:"default", name:"现有题库", addedAt:...}]`

6. **Extract shared settings**
   - Parse review state JSON, extract `settings` field
   - Write to standalone `settings` key

### Rollback

If any step fails:
- SQLite: transaction auto-rolls back
- Files: rename operations are atomic on same partition
- User can manually restore from `backups/pre-migration-*.json`

### Idempotency

- If `books/default/` already exists, skip migration
- If `migration-version` key exists, skip migration
- If `openclaw-review-state` key doesn't exist, skip step 4

---

## 5. Frontend State

### New Store: `useBookStore`

```ts
type BookEntry = {
  id: string;
  name: string;
  addedAt: string;
};

type BookState = {
  books: BookEntry[];
  activeBookId: string | null;
  isSwitching: boolean;

  loadBooks: () => Promise<void>;
  switchBook: (bookId: string) => Promise<void>;
};
```

- Persist `activeBookId` to localStorage key `mathloop-active-book`
- On startup: load book list, restore activeBookId, bootstrap that book

### Modified Stores

#### `useQuestionStore`

- `loadQuestions()` calls `load_questions_json` with current `activeBookId`
- No changes to filter/UI state persistence

#### `useReviewStore`

- `createReviewPersistStorage()` passes `bookId` to all invoke calls
- Zustand `persist` automatically re-hydrates when storage key changes
- On book switch: store is re-created with new bookId-scoped key

### Book Switch Flow

```
User clicks book name in dropdown
  → bookStore.switchBook(bookId)
  → setActiveBookId(bookId) + save to localStorage
  → invoke("bootstrap_mathloop_data", { bookId })
  → questionStore.loadQuestions()  // re-fetches from new book
  → reviewStore re-hydrates       // new key prefix
  → UI updates automatically
```

---

## 6. UI Changes

### Navbar Dropdown

Position: left side of navbar, before nav links.

```
┌─────────────────────────────────────────────────┐
│ [📘 现有题库 ▾]   Dashboard  错题录入  题库  复习  备份 │
└─────────────────────────────────────────────────┘
```

Dropdown content:
- List of registered books, current book highlighted with checkmark
- Grayed-out entries for unregistered book directories (detected on disk)
- Bottom: "+ 添加新书" button (opens confirmation dialog)
- Clicking a book triggers `switchBook()`

### Add Book Flow (Manual File Placement)

1. User creates directory: `%APPDATA%\MathLoop\books\{bookId}\data\`
2. User places `questions.json` in that directory
3. User places images in `questions/`, `answers/`, `pages/` subdirectories
4. App detects new directory on next `listBooks()` call
5. Shows as "未注册" in dropdown
6. User clicks → dialog asks for display name → registers → switches

### Dashboard

- Show current book name in hero section subtitle
- All stats scoped to current book's questions

### Backup Page

- Show current book name
- Export includes `bookId` field
- Import warns if `bookId` doesn't match current book

---

## 7. Backup Format Extension

```json
{
  "version": 1,
  "bookId": "default",
  "exportedAt": "2026-05-18T...",
  "cards": {},
  "reviewLogs": [],
  "settings": {},
  "mistakeRecords": {},
  "questionFingerprints": {},
  "lastSyncResult": null,
  "dailyReviewSession": null
}
```

- `bookId` is new optional field
- Backward compatible: old backups without `bookId` are still valid
- Import: if `bookId` present and doesn't match current book, show warning dialog

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Book directory missing | Show error in dropdown, disable switch |
| questions.json missing | Show "题库文件缺失" in dashboard |
| Migration fails mid-way | Rollback SQLite transaction, show error with backup path |
| bookId format invalid | Reject with validation error |
| Duplicate bookId | Reject with "书本已存在" |
| Book switch during review | Complete current review card, then switch |

---

## 9. Testing Strategy

- **Migration**: Test with existing data directory, verify all files moved, SQLite keys renamed, backup created
- **Book isolation**: Add two books, review questions in each, verify no cross-contamination
- **Settings sharing**: Change settings in book A, verify book B uses same settings
- **Edge cases**: Empty book directory, missing questions.json, corrupted registry
- **Backup/restore**: Export from book A, import to book B (should warn)
