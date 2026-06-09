# Backend Codemap (Rust/Tauri)

**Last Updated:** 2026-06-09
**Entry Point:** `src-tauri/src/main.rs` (single-file backend, ~1050 lines)

## Architecture

```
src-tauri/src/main.rs
├── Main & Setup
│   ├── fn main()                         # Tauri builder, handler registration
│   ├── fn mathloop_data_dir()            # Resolve platform-specific data root
│   ├── fn resolve_mathloop_data_dir()    # Pure helper covered by unit tests
│   └── fn ensure_database()              # Create/verify SQLite DB and table
├── Bootstrap & Migration
│   ├── fn bootstrap_mathloop_data()      # Startup: migrate, register books, copy assets
│   ├── fn run_migration()                # Dispatch to v1 or v2 based on version
│   ├── fn run_migration_v1()             # Create books/default/, move files, rename keys
│   ├── fn run_migration_v2()             # default -> book001, copy review data
│   └── fn register_bundled_books()       # Auto-register from public/books.json
├── Tauri Commands (exposed to frontend)
│   ├── fn review_store_get()             # SQLite SELECT by scoped key
│   ├── fn review_store_set()             # SQLite INSERT/UPDATE with conflict
│   ├── fn review_store_remove()          # SQLite DELETE by scoped key
│   ├── fn load_questions_json()          # Read questions.json with fallback
│   ├── fn load_question_image_fixes_json() # Read image fixes JSON
│   ├── fn update_question_tips()         # Atomic write tips to questions.json
│   ├── fn load_asset_data_url()          # Load image as base64 data URL
│   ├── fn list_books()                   # Read book-registry from SQLite
│   ├── fn add_book()                     # Validate, create dirs, register
│   ├── fn remove_book()                  # Remove from registry (not files)
│   └── fn set_active_book()              # Validate book exists, create backup
├── Book Registry Helpers
│   ├── fn validate_book_id()             # [a-z0-9-], 1-64 chars
│   ├── fn resolve_book_dir()             # Get PathBuf for books/{bookId}/
│   ├── fn review_key_for()               # Build scoped SQLite key (review::{bookId})
│   ├── fn read_registry_raw()            # Parse book-registry JSON from SQLite
│   └── fn write_registry()               # Write book-registry JSON to SQLite
├── Asset Helpers
│   ├── fn read_external_or_resource_file() # 4-tier text file resolution
│   ├── fn read_external_or_resource_bytes() # 5-tier binary file resolution
│   ├── fn normalize_relative_asset_path()  # Sanitize path
│   └── fn mime_from_path()               # .jpg/.webp/.png -> MIME type
├── File Utilities
│   ├── fn copy_missing_resource_dir()    # Copy bundled assets (book-scoped paths)
│   ├── fn find_resource_dir()            # Locate resource dir (bundled or dev)
│   ├── fn create_startup_backup()        # Backup review state on startup
│   ├── fn prune_backups()                # Keep latest 30 auto backups
│   └── fn copy_dir_missing()             # Always overwrite (removed exists check)
└── Constants
    ├── DB_FILE = "mathloop.db"
    ├── BOOK_REGISTRY_KEY = "book-registry"
    ├── MIGRATION_VERSION_KEY = "migration-version"
    ├── SETTINGS_KEY = "settings"
    ├── OLD_REVIEW_KEY = "openclaw-review-state"
    └── NEW_REVIEW_KEY_PREFIX = "review::"
```

## SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS review_store (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## Key Naming Convention

| Frontend Key Sent | bookId Sent | Effective SQLite Key |
|-------------------|------------|----------------------|
| `openclaw-review-state` | `book001` | `review::book001` |
| `openclaw-review-state` | `book002` | `review::book002` |
| `settings` | `any` | `settings` (global, special-cased) |
| `book-registry` | N/A | `book-registry` |
| `migration-version` | N/A | `migration-version` |

## Asset Resolution Order (5 tiers)

For `load_asset_data_url(path, book_id)`:

1. **Book-scoped external**: `<MathLoop data root>/books/{bookId}/{path}`
2. **Top-level external**: `<MathLoop data root>/{path}` (legacy)
3. **Book-scoped resource**: Bundled `resources/books/{bookId}/{path}`
4. **Flat resource**: Bundled `resources/{path}`
5. **Dev fallback**: `project_root/public/books/{bookId}/{path}`

## Desktop Data Roots

| Platform | Data root |
|----------|-----------|
| Windows | `%APPDATA%/MathLoop` |
| macOS | `~/Library/Application Support/MathLoop` |
| Linux / other Unix | `~/.mathloop` |

## Migration Version History

| Version | What it does |
|---------|-------------|
| (none) | Legacy state, `openclaw-review-state` key exists |
| v1 | Creates `books/default/`, moves files, renames SQLite key to `review::default`, extracts settings |
| v2 | Copies `review::default` to `review::book001`, renames `books/default/` to `books/book001/`, updates registry |

## Bootstrap Flow

```
bootstrap_mathloop_data(book_id?)
  -> run_migration()
  -> register_bundled_books() # Read public/books.json, add missing books
  -> resolve data_dir
  -> copy_missing_resource_dir("books/{bookId}/data", ...)  # Book-scoped paths
  -> copy_missing_resource_dir("books/{bookId}/questions", ...)
  -> copy_missing_resource_dir("books/{bookId}/answers", ...)
  -> ensure_database()
  -> create_startup_backup() -> prune_backups(30)
  -> return BootstrapInfo
```

## External Dependencies (Cargo)

| Crate | Version | Purpose |
|-------|---------|---------|
| tauri | 2.x | Desktop app framework, IPC, bundling |
| rusqlite | 0.32 | SQLite database operations |
| serde, serde_json | 1.x | JSON serialization/deserialization |
| chrono | 0.4 | Timestamps (Local::now()) |
| base64 | 0.22 | Image to base64 data URL encoding |
