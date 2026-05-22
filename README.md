# MathLoop

Smart review for math mistakes. MathLoop is a fully local Tauri v2 + React app for managing math question banks, marking selected questions as mistakes, and reviewing them with FSRS scheduling. Supports multiple exercise books with independent review data.

## Current Status

- App name: MathLoop
- Version: 0.1.4
- Runtime: Vite + React + TypeScript + Tauri v2 desktop shell
- Review engine: `ts-fsrs`
- Books: 2 supported (book001: 高等数学基础篇·严选题, book002: 武忠祥高等数学辅导讲义·严选题)
- Web review state: browser `localStorage`, key `openclaw-review-state::{bookId}`
- Desktop review state: SQLite at `%APPDATA%\MathLoop\mathloop.db`, key `review::{bookId}`
- Backend: Rust/Tauri (single-file, ~960 lines)
- Login/cloud sync: none

## Feature Overview

- Multi-book support: switch between exercise books, each with independent review data.
- Book registry: SQLite stores book list; auto-registration of bundled books.
- Data migration: Legacy review data auto-migrates to book-scoped storage on first launch.
- Dashboard with Apple-style glass UI and study metrics.
- Question library loaded per-book from `books/{bookId}/data/questions.json`.
- Question detail pages with image display via book-scoped asset resolution.
- Mistake intake by page number and question number.
- FSRS review flow for manually marked mistakes.
- Persistent daily review sessions that survive page navigation.
- Per-question `tips` (解题思路) saved back to book-scoped `questions.json`.
- Backup/export/import for local review state (includes `bookId` field).
- Data health checks for orphan cards, missing images, uncertain fields.

## Supported Books

| Book ID | Name | Questions | Chapters |
|---------|------|-----------|----------|
| book001 | 高等数学基础篇·严选题 | 256 | 9 |
| book002 | 武忠祥高等数学辅导讲义·严选题 | 238 | 6 |

## Project Structure

```text
public/
  logo.svg                   # MathLoop brand mark
  apple-touch-icon.png
  books.json                 # Book manifest (id -> name mapping)
  books/
    book001/                 # Book 1 bundled assets
      data/questions.json
      questions/             # Question images
      answers/               # Answer images
      pages/                 # Full-page scans
      question-fixes/        # Corrected images
    book002/                 # Book 2 bundled assets
src/
  app/App.tsx                # App bootstrap: book loading, question loading, review sync
  components/
    layout/                  # AppShell, Navbar (book dropdown)
    common/                  # EmptyState
    dashboard/               # StatCard
    question/                # QuestionImage, QuestionThumbnail
  pages/                     # Dashboard, MistakeEntry, QuestionList, QuestionDetail, Review, Backup
  services/
    backupService.ts         # Backup create/validate/download
    dashboardStats.ts        # Review statistics
    desktopBridge.ts         # Tauri IPC abstraction
    fsrsService.ts           # FSRS scheduling (ts-fsrs)
    librarySyncService.ts    # Question fingerprinting
    mistakeLookup.ts         # Find by page/number
    questionLoader.ts        # Load questions (book-aware)
    reviewPersistStorage.ts  # Book-scoped storage adapter
    reviewQueue.ts           # Daily review queue builder
  store/
    useBookStore.ts          # Book list, active book, switch logic
    useQuestionStore.ts      # Questions, filters, tips
    useReviewStore.ts        # FSRS cards, logs, mistakes, sessions
  hooks/useAssetUrl.ts       # Book-scoped asset URL resolution
  types/                     # BookEntry, Question, Review types
  utils/                     # bookId, date, filters, images, stats, labels
src-tauri/
  icons/                     # Windows app icons
  src/main.rs                # Rust backend: commands, migration, asset loading
docs/
  CODEMAPS/                  # Code architecture maps (INDEX, frontend, backend, database, data-flow)
  superpowers/               # Design specs and implementation plans
```

## Data Directory (Desktop)

```
%APPDATA%\MathLoop\
├── mathloop.db                     # SQLite database
├── books\
│   ├── book001\                    # 高等数学基础篇·严选题
│   │   ├── data\questions.json
│   │   ├── questions\              # Question images
│   │   ├── answers\                # Answer images
│   │   ├── pages\                  # Page scans
│   │   └── question-fixes\         # Corrected images
│   └── book002\                    # 武忠祥高等数学辅导讲义·严选题
│       └── data\questions.json
└── backups\
    ├── pre-migration-*.json        # Migration safety backups
    ├── mathloop-auto-*.json        # Startup auto-backups (kept 30)
    └── questions-before-tip-*.json # Tips update safety copies
```

## Data Model

`questions.json` is the source of truth for question content and image paths. The app does not write FSRS data or backup state into `questions.json` (except for the `tips` field via the desktop app's save feature).

Question image paths use public-relative or book-scoped paths:

```json
{
  "questionImage": "questions/book001_ch01_p006_q001.png",
  "answerImage": "answers/book001_ch01_p006_q001_answer.png"
}
```

At render time, these are resolved via `useAssetUrl`:
- **Browser**: `/books/{bookId}/questions/...`
- **Desktop**: `data:image/png;base64,...` via Tauri `load_asset_data_url`

## Review Workflow

1. Open 错题录入.
2. Enter page number and question number.
3. Pick the matched question.
4. Choose a review time.
5. Open 复习 when the mistake is due.
6. Reveal the answer and rate it with Again, Hard, Good, or Easy.

Only manually marked mistakes enter the review queue. The review page preserves session state across navigation. A new round is generated only on explicit continuation or new-day start.

## Multi-Book Support

- Select active book via navbar dropdown.
- Each book has isolated review data (cards, logs, mistakes, fingerprints).
- Book switch triggers: question reload, review data rehydration, asset cache clear.
- Web mode auto-selects default book from `/books.json` manifest.
- Desktop mode auto-registers bundled books on first launch.
- Legacy data auto-migrated through two-phase migration (v1: default dir, v2: book001 rename).

## Development

```bash
npm install
npm run dev          # Web dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run tauri:dev    # Tauri desktop app (development)
npm run tauri:build  # Build Windows desktop app
```

Tauri builds require Rust, Cargo, and Microsoft C++ Build Tools with Windows SDK.

## Desktop Data Safety

The desktop app stores personal data in `%APPDATA%\MathLoop\`, not inside the app bundle. On startup, MathLoop creates this directory, initializes SQLite, copies missing bundled question assets, and writes automatic backups. Up to 30 auto-backups are retained.

To migrate current web data: export a JSON backup from `/backup` in the web app, then import it in the desktop app.

## GitHub

Primary repository: <https://github.com/Jim2474/mathloop>

Data remote: <https://github.com/Jim2474/math_review_data>
