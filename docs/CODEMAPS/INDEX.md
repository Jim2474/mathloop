# MathLoop Codebase Codemaps

**Last Updated:** 2026-05-24
**Primary Entry Points:** `src/main.tsx`, `src-tauri/src/main.rs`

## Architecture Overview

MathLoop is a Tauri v2 desktop application with a React frontend for FSRS-based math review. A single Rust backend manages SQLite storage, file I/O, and multi-book asset resolution. The frontend runs identically in browser (dev) and Tauri (desktop) modes.

```
+---------------------------------------------------+
|                    React Frontend                  |
|  src/                                              |
|  +-- app/App.tsx          Bootstrap & routing      |
|  +-- components/          UI components             |
|  +-- pages/               Route pages               |
|  +-- store/               Zustand state (3 stores) |
|  +-- services/            Business logic            |
|  +-- hooks/               Custom React hooks        |
|  +-- types/               TypeScript types          |
|  +-- utils/               Utility functions         |
+---------------------------------------------------+
         |  invoke() / fetch()
         v
+---------------------------------------------------+
|               Tauri v2 Bridge                      |
|  src/services/desktopBridge.ts                     |
+---------------------------------------------------+
         |  IPC (JSON over stdin/stdout)
         v
+---------------------------------------------------+
|                  Rust Backend                       |
|  src-tauri/src/main.rs (single file, ~960 lines)   |
|  +-- bootstrap_mathloop_data  Startup/bootstrap    |
|  +-- review_store_*           SQLite CRUD           |
|  +-- load_questions_json      Book data loading     |
|  +-- load_asset_data_url      Asset resolution      |
|  +-- list/add/remove/set_active_book  Book mgmt   |
|  +-- update_question_tips     Tips persistence      |
|  +-- run_migration            Data migration        |
+---------------------------------------------------+
         |
         v
+---------------------------------------------------+
|  Storage                                           |
|  SQLite: %APPDATA%/MathLoop/mathloop.db            |
|  Files:  %APPDATA%/MathLoop/books/{bookId}/        |
|  Bundled: public/books/ (Tauri resources)          |
+---------------------------------------------------+
```

## Key Codemaps

| Codemap | Covers |
|---------|--------|
| [frontend.md](frontend.md) | React components, pages, stores, services, hooks, utils |
| [backend.md](backend.md) | Rust commands, migration, asset resolution, file I/O |
| [database.md](database.md) | SQLite schema, key naming, migration versions |
| [data-flow.md](data-flow.md) | Book switching, review rehydration, asset loading flows |

## Key Modules at a Glance

| Module | Purpose | Key File(s) |
|--------|---------|------------|
| Zustand Stores | App state management | `store/useBookStore.ts`, `useQuestionStore.ts`, `useReviewStore.ts` |
| Desktop Bridge | Tauri IPC abstraction | `services/desktopBridge.ts` |
| Review Engine | FSRS scheduling | `services/fsrsService.ts` |
| Asset Loading | Image URL resolution | `hooks/useAssetUrl.ts` |
| Rust Backend | SQLite, files, Tauri commands | `src-tauri/src/main.rs` |
| Book Management | Multi-book registry and switching | `store/useBookStore.ts`, `utils/bookId.ts` |
