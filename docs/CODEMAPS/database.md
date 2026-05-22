# Database Codemap

**Last Updated:** 2026-05-22
**Database:** SQLite at `%APPDATA%/MathLoop/mathloop.db`

## Schema

Single table design:

```sql
CREATE TABLE IF NOT EXISTS review_store (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

All data is stored as JSON strings in the `value` column. The `key` is namespaced for different purposes.

## Key Inventory

| Key | Purpose | Format | Example Value |
|-----|---------|--------|---------------|
| `book-registry` | Registered books list | JSON array of BookEntry | `[{"id":"book001","name":"...","addedAt":"..."}]` |
| `migration-version` | Migration state tracking | String | `"2"` |
| `settings` | Shared review settings (reserved, not currently used by frontend) | JSON object | `{"maxDailyReviews":20,...}` |
| `review::{bookId}` | Book-scoped review state | JSON (Zustand persist format) | `{"state":{"cards":{...},"reviewLogs":[...]}}` |

## Review State Key Format

Desktop: `review::{bookId}` (Rust `review_key_for` function prefixes `review::` to bookId)

Web (localStorage): `openclaw-review-state::{bookId}` (JavaScript `bookScopedKey` function suffixes `::{bookId}`)

Both modes scope the same logical data per book.

## Review State Value Structure

```json
{
  "state": {
    "cards": {
      "question_id": {
        "card": { "due": "...", "stability": 1.0, "difficulty": 0.5, ... },
        "questionId": "...",
        "questionFingerprint": "...",
        "createdAt": "...",
        "updatedAt": "..."
      }
    },
    "reviewLogs": [
      { "questionId": "...", "card": {...}, "rating": "good", "reviewedAt": "...", ... }
    ],
    "mistakeRecords": {
      "question_id": {
        "questionId": "...",
        "markedAt": "...",
        "reviewAt": "...",
        "sourcePage": "...",
        "sourceQuestionNo": "...",
        "note": "...",
        "active": true
      }
    },
    "questionFingerprints": {
      "question_id": "fingerprint_hash"
    },
    "lastSyncResult": { "syncedAt": "...", "initializedCards": 10, ... },
    "dailyReviewSession": { "dateKey": "2026-05-22", "roundId": "...", "queue": [...], ... },
    "settings": { "maxDailyReviews": 20, "maxNewPerDay": 10, "desiredRetention": 0.9 }
  },
  "version": 0
}
```

## Book Registry Value Structure

```json
[
  {
    "id": "book001",
    "name": "高等数学基础篇·严选题",
    "addedAt": "2026-05-18T08:00:00+08:00"
  },
  {
    "id": "book002",
    "name": "武忠祥高等数学辅导讲义·严选题",
    "addedAt": "2026-05-18T10:00:00+08:00"
  }
]
```

## Migration State Machine

```
No migration-version key
  -> run_migration_v1()
  -> Creates books/default/, renames files, creates review::default key
  -> Writes migration-version = "1"

migration-version = "1"
  -> run_migration_v2()
  -> Copies review::default to review::book001
  -> Moves books/default/ to books/book001/
  -> Updates registry: replaces "default" with "book001"
  -> Writes migration-version = "2"

migration-version = "2"
  -> Skipped (current version)
```

## File System Layer

```
%APPDATA%/MathLoop/
├── mathloop.db                    # SQLite database
├── books/
│   ├── book001/
│   │   ├── data/questions.json
│   │   ├── data/question-image-fixes.json
│   │   ├── questions/             # *.png question images
│   │   ├── answers/               # *.png answer images
│   │   ├── pages/                 # *.png full-page scans
│   │   └── question-fixes/        # *.png corrected question images
│   └── book002/
│       └── data/questions.json
└── backups/
    ├── pre-migration-*.json       # Migration safety backups
    ├── mathloop-auto-*.json       # Startup auto-backups (kept 30)
    └── questions-before-tip-*.json # Tips update safety copies
```

## Access Patterns

### Read review state for active book
```sql
SELECT value FROM review_store WHERE key = 'review::book001';
```
Frontend deserializes and applies to Zustand store.

### Write review state
```sql
INSERT INTO review_store (key, value, updated_at)
VALUES ('review::book001', ?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
```

### Read book registry
```sql
SELECT value FROM review_store WHERE key = 'book-registry';
```

### Check migration version
```sql
SELECT value FROM review_store WHERE key = 'migration-version';
```
