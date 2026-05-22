# Multi-Book Support Design Spec

**Status:** Completed (2026-05-22)
**Last Updated:** 2026-05-22

## Overview

Add support for multiple exercise books in MathLoop. Each book has its own questions.json and isolated review data (cards, logs, mistakes). Shared settings across all books. Switch books via navbar dropdown.

## Implementation Summary

All planned features were implemented with the following notable deviations from the original design:

1. **Book ID naming**: Migration v2 renamed `default` to `book001` for consistency. The book registry now uses `book001` (高等数学基础篇·严选题) and `book002` (武忠祥高等数学辅导讲义·严选题).
2. **Auto-registration**: Bundled books are auto-registered from `public/books.json` on first bootstrap via `register_bundled_books()`, eliminating the need for manual directory detection.
3. **Asset resolution**: `load_asset_data_url` uses a 5-tier fallback: book-scoped external -> top-level external -> book-scoped resource -> flat resource -> dev public/books/.
4. **Web mode**: Full web-mode support via `/books/{bookId}/data/questions.json` URL routing and localStorage scoped keys (`{name}::{bookId}`).
5. **Two-phase migration**: v1 creates `books/default/`, v2 renames to `books/book001/` and copies `review::default` to `review::book001`.
6. **Review rehydration**: Manual `loadReviewForCurrentBook()` with Zustand book store subscription instead of relying on automatic Zustand persist re-hydration.
7. **Settings**: Settings remain book-scoped (part of each book's review state) rather than globally shared, though the Rust backend special-cases the `settings` key for future use.

## Goals

- Import and switch between multiple exercise books
- Each book's review data (cards, reviewLogs, mistakeRecords, fingerprints) is fully isolated
- Existing data is preserved during migration -- zero data loss
- Shared review settings (maxDailyReviews, maxNewPerDay, desiredRetention) [Implementation note: currently book-scoped]
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
│   ├── book001\                     ← 高等数学基础篇·严选题 (256 questions)
│   │   ├── data\questions.json
│   │   ├── questions\              ← question images
│   │   ├── answers\                ← answer images
│   │   ├── pages\                  ← page images
│   │   └── question-fixes\         ← image fixes
│   ├── book002\                     ← 武忠祥高等数学辅导讲义·严选题 (238 questions)
│   │   └── data\questions.json
│   └── ...
├── mathloop.db                     ← shared SQLite
├── backups\                        ← shared backup directory
│   ├── pre-migration-{ts}.json     ← auto-created before migration
│   └── mathloop-auto-{ts}.json     ← startup backups
```

### bookId Rules

- Directory name = bookId (e.g., `book001`, `book002`)
- Allowed characters: `[a-z0-9-]`
- Max length: 64 characters
- `default` was used as a temporary ID during migration v1, replaced by `book001` in v2

---

## 2. SQLite Key Naming

| Purpose | Key | Notes |
|---------|-----|-------|
| Review state (desktop) | `review::{bookId}` | e.g., `review::book001` |
| Review state (web) | `openclaw-review-state::{bookId}` | localStorage scoped key |
| Book registry | `book-registry` | JSON array of BookEntry |
| Migration version | `migration-version` | Currently "2" |

### book-registry Format (stored as JSON string in SQLite)

```json
[
  { "id": "book001", "name": "高等数学基础篇·严选题", "addedAt": "2026-05-18T08:00:00+08:00" },
  { "id": "book002", "name": "武忠祥高等数学辅导讲义·严选题", "addedAt": "2026-05-18T10:00:00+08:00" }
]
```

---

## 3. Rust Backend (Implemented)

### Tauri Commands

All commands from the design spec were implemented:

- `list_books` - Returns book registry entries from SQLite
- `add_book(book_id, name)` - Validates, creates directories, adds to registry
- `remove_book(book_id)` - Removes from registry only (not files)
- `set_active_book(book_id)` - Validates book exists and has questions.json
- `bootstrap_mathloop_data(book_id)` - Accepts optional book_id, runs migration first, auto-registers bundled books
- `review_store_get/set/remove(key, book_id)` - Book-scoped storage with `review::{bookId}` key prefix
- `load_questions_json(book_id)` - Reads from book's data directory, resource fallback
- `load_question_image_fixes_json(book_id)` - Reads from book's data directory
- `update_question_tips(book_id, question_id, tips)` - Writes tips to book-scoped questions.json
- `load_asset_data_url(relative_path, book_id)` - 5-tier asset resolution

### Additional: `register_bundled_books`

Reads `public/books.json` from bundled resources and auto-registers any books not already in the registry, creating directories and copying bundled assets.

### Additional: Migration v2

Renames `books/default/` to `books/book001/`, copies `review::default` SQLite row to `review::book001`, updates registry replacing "default" with "book001", bumps migration version to "2".

---

## 4. Data Migration (Implemented)

### Two-Phase Migration

**Migration v1** (when `migration-version` key is absent):
1. Pre-migration backup of `openclaw-review-state`
2. Create `books/default/` directories
3. Move existing data (rename): `data/`, `questions/`, `answers/`, `pages/`, `question-fixes/` into `books/default/`
4. Copy `openclaw-review-state` to `review::default`
5. Write migration version "1"

**Migration v2** (when `migration-version` is "1"):
1. Copy `review::default` to `review::book001`
2. Move `books/default/` contents to `books/book001/`, remove `books/default/`
3. Update registry: remove "default", add "book001" with proper name
4. Bump migration version to "2"

### Rollback

- SQLite: transaction auto-rolls back on failure
- Files: backup created before any file moves
- Manual restore from `backups/pre-migration-*.json`

---

## 5. Frontend State (Implemented)

### `useBookStore`

- Manages book list, active book, switch state, loading state
- Persists `activeBookId` to localStorage key `mathloop-active-book`
- Web mode: loads from `/books.json` manifest, auto-selects default book
- Desktop mode: loads from Tauri `list_books` command
- `switchBook()`: resets desktop runtime, sets active book, re-initializes

### `useQuestionStore`

- `loadQuestions()` calls `loadOpenClawQuestions()` with active bookId
- `saveQuestionTips()` passes bookId to `updateDesktopQuestionTips`
- Uses `getActiveBookId()` from `src/utils/bookId.ts`

### `useReviewStore`

- `createReviewPersistStorage()` reads active bookId dynamically from Zustand state
- Web: scoped localStorage keys using `{name}::{bookId}` format
- Desktop: sends key + bookId to Rust, which applies `review::{bookId}` prefix
- `subscribe()` on book store detects book changes, calls `loadReviewForCurrentBook()`
- Legacy migration: if no book-scoped review data, reads from unscoped key

### Book Switch Flow

```
User clicks book name in dropdown
  -> bookStore.switchBook(bookId)
  -> setActiveBookId(bookId) + save to localStorage
  -> resetDesktopRuntime() + setActiveDesktopBook(bookId) + initializeDesktopRuntime(bookId)
  -> questionStore.loadQuestions()
  -> reviewStore subscription fires -> loadReviewForCurrentBook()
  -> clearDesktopAssetCache()
  -> UI updates automatically
```

---

## 6. UI Changes (Implemented)

### Navbar Dropdown

Book dropdown with checkmark for active book, "add book" button opening a dialog, identical to the planned design.

### Dashboard and Backup Pages

- Show current book name
- Backup export includes `bookId` field
- Import warns if bookId mismatch

---

## 7. Asset Handling

### Asset URL Resolution (5-tier)

1. **Book-scoped external**: `%APPDATA%\MathLoop\books\{bookId}\{path}`
2. **Top-level external**: `%APPDATA%\MathLoop\{path}` (legacy)
3. **Book-scoped resource**: bundled `books/{bookId}/{path}`
4. **Flat resource**: bundled `{path}`
5. **Dev fallback**: `project_root/public/books/{bookId}/{path}`

### Frontend Asset Resolution (`useAssetUrl`)

- Browser mode: URLs prefixed with `/books/{bookId}/` for correct MIME type serving
- Desktop mode: base64 data URLs via `load_asset_data_url` with `bookId` param
- Cache: in-memory `Map<string, string>` for desktop assets, cleared on book switch

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Book directory missing | Show error in dropdown, disable switch |
| questions.json missing | Show "题库文件缺失" in dashboard |
| Migration fails mid-way | Rollback SQLite transaction, show error with backup path |
| bookId format invalid | Reject with validation error |
| Duplicate bookId | Reject with "书本已存在" |
| Book switch during review | Complete current review card, review data reloads for new book |

---

## 9. Web Mode Support (Additional)

The implementation added web-mode support not in the original design:

- `/books.json` manifest for book discovery
- `/books/{bookId}/data/questions.json` for question loading
- `/books/{bookId}/questions/`, `/answers/`, `/pages/` for static assets
- localStorage scoping with `{key}::{bookId}` pattern
- Auto-selection of default book (`book001`) or first available

## 10. Bundled Resources

`tauri.conf.json` bundles:
- `../public/books/` -- all book directories with questions and images
- `../public/books.json` -- book manifest used for auto-registration
