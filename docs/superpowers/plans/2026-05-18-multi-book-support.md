# Multi-Book Support Implementation Plan

**Status:** Completed (2026-05-22)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to switch between multiple exercise books, each with isolated review data, without breaking existing data.

**Architecture:** Shared SQLite database with bookId-namespaced keys (`review::{bookId}`). Books stored under `%APPDATA%\MathLoop\books\{bookId}/`. Automatic migration on first launch moves existing data into `books/default/` (v1), then renames to `books/book001/` (v2). Frontend uses a new `useBookStore` to track active book and trigger manual review data re-load on switch.

**Tech Stack:** Rust (rusqlite, serde_json, tauri), TypeScript (React, Zustand, react-router-dom)

---

## File Map

| Action | File | Status |
|--------|------|--------|
| Modify | `src-tauri/src/main.rs` | Completed |
| Create | `src/types/book.ts` | Completed |
| Create | `src/store/useBookStore.ts` | Completed |
| Create | `src/utils/bookId.ts` | Completed (not in plan) |
| Modify | `src/services/desktopBridge.ts` | Completed |
| Modify | `src/services/reviewPersistStorage.ts` | Completed |
| Modify | `src/hooks/useAssetUrl.ts` | Completed (not in plan) |
| Modify | `src/components/layout/Navbar.tsx` | Completed |
| Modify | `src/app/App.tsx` | Completed |
| Modify | `src/services/backupService.ts` | Completed |
| Modify | `src/store/useReviewStore.ts` | Completed (not in plan, added subscribe) |
| Modify | `src/store/useQuestionStore.ts` | Completed |
| Modify | `src/services/questionLoader.ts` | Completed |
| Create | `public/books.json` | Completed (not in plan) |
| Modify | `src-tauri/tauri.conf.json` | Completed (not in plan) |

---

## Task 1: Rust Backend -- Book Types and New Commands

- [x] **Step 1: Add BookEntry struct and book-registry helpers** -- Completed
- [x] **Step 2: Add `list_books` command** -- Completed
- [x] **Step 3: Add `add_book` command** -- Completed
- [x] **Step 4: Add `remove_book` command** -- Completed
- [x] **Step 5: Add `set_active_book` command** -- Completed (simplified: validates without bootstrapping; frontend handles bootstrap separately)
- [x] **Step 6: Register new commands in `main()`** -- Completed
- [x] **Step 7: Build to verify compilation** -- Completed
- [x] **Step 8: Commit** -- Completed

---

## Task 2: Rust Backend -- Modify Existing Commands for bookId

- [x] **Step 1: Modify `bootstrap_mathloop_data` to accept `book_id`** -- Completed. Also added `register_bundled_books()` call.
- [x] **Step 2: Modify `review_store_get` to accept `book_id`** -- Completed
- [x] **Step 3: Modify `review_store_set` to accept `book_id`** -- Completed
- [x] **Step 4: Modify `review_store_remove` to accept `book_id`** -- Completed
- [x] **Step 5: Modify `load_questions_json` to accept `book_id`** -- Completed
- [x] **Step 6: Modify `load_question_image_fixes_json` to accept `book_id`** -- Completed
- [x] **Step 7: Modify `update_question_tips` to accept `book_id`** -- Completed
- [x] **Step 8: Build to verify** -- Completed
- [x] **Step 9: Commit** -- Completed

---

## Task 3: Rust Backend -- Data Migration

- [x] **Step 1: Add migration function** -- Completed. Implemented as two-phase: `run_migration_v1` (default dir) and `run_migration_v2` (default -> book001 rename).
- [x] **Step 2: Call migration from `bootstrap_mathloop_data`** -- Completed
- [x] **Step 3: Build to verify** -- Completed
- [x] **Step 4: Commit** -- Completed

---

## Task 4: Frontend -- Book Types, Store, and Bridge

- [x] **Step 1: Create `src/types/book.ts`** -- Completed
- [x] **Step 2: Add book-related functions to `src/services/desktopBridge.ts`** -- Completed
- [x] **Step 3: Modify `initializeDesktopRuntime` to accept optional `bookId`** -- Completed, with deduplication via `lastBootstrappedBookId`
- [x] **Step 4: Create `src/store/useBookStore.ts`** -- Completed. Added web mode support with `/books.json` manifest loading and auto-default-book selection.
- [x] **Step 5: Modify `src/services/reviewPersistStorage.ts`** -- Completed. Uses dynamic `getActiveBookId()` from Zustand, with `{name}::{bookId}` scoping in localStorage.
- [x] **Step 6: Update `src/store/useReviewStore.ts`** -- Completed. Added `loadReviewForCurrentBook()`, `useBookStore.subscribe()`, and legacy migration `tryMigrateLegacyReviewState()`.
- [x] **Step 7: Verify TypeScript compiles** -- Completed
- [x] **Step 8: Commit** -- Completed

---

## Task 5: Frontend -- App Startup and Book Switching

- [x] **Step 1: Update `App.tsx`** -- Completed. Also calls `cleanupOrphanReviewData` on sync.
- [x] **Step 2: Update `questionLoader.ts`** -- Completed. Added web mode URL routing via `/books/{bookId}/data/questions.json`.
- [x] **Step 3: Update `useQuestionStore.ts`** -- Completed. Uses `getActiveBookId()` for tips saving.
- [x] **Step 4: Verify TypeScript** -- Completed
- [x] **Step 5: Commit** -- Completed

---

## Task 6: Frontend -- Navbar Book Dropdown

- [x] **Step 1: Replace Navbar with book dropdown** -- Completed
- [x] **Step 2: Verify TypeScript** -- Completed
- [x] **Step 3: Commit** -- Completed

---

## Task 7: Frontend -- Dashboard and Backup Page Updates

- [x] **Step 1: Update DashboardPage** -- Completed
- [x] **Step 2: Update BackupService** -- Completed. `createReviewBackup()` accepts optional `bookId`. `validateReviewBackup()` reads `bookId` from backup.
- [x] **Step 3: Update BackupPage** -- Completed
- [x] **Step 4: Verify TypeScript** -- Completed
- [x] **Step 5: Commit** -- Completed

---

## Task 8: Build Verification

- [x] **Step 1: Full TypeScript check** -- Completed
- [x] **Step 2: Rust check** -- Completed
- [x] **Step 3: Final commit** -- Completed

---

## Additional Work (Not in Original Plan)

### `src/utils/bookId.ts` (new file)
Exports `getActiveBookId()` that reads from `useBookStore.getState().activeBookId`.

### `src/hooks/useAssetUrl.ts` (modified)
Added `getActiveBookId()` for book-scoped asset resolution. Browser mode prefixes URLs with `/books/{bookId}/`. Added `clearDesktopAssetCache()` for book switch cleanup.

### `public/books.json` (new file)
Book manifest listing all bundled books with id and name, used by both `register_bundled_books()` (desktop) and `useBookStore.loadBooks()` (web).

### `src-tauri/tauri.conf.json` (modified)
Added `../public/books` and `../public/books.json` to bundle resources for all bundled books.

### `src/store/useReviewStore.ts` (modified beyond plan)
Added book-scoped review data rehydration via `useBookStore.subscribe()`, legacy migration helper, and manual state loading with `loadReviewForCurrentBook()`.
