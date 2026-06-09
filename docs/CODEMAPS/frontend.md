# Frontend Codemap

**Last Updated:** 2026-06-09
**Entry Points:** `src/main.tsx`, `src/app/App.tsx`

## Architecture

```
src/
├── app/App.tsx                  # Bootstrap: Book loading, question loading, review sync
├── main.tsx                     # ReactDOM root, Router, CSS imports
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx          # Page frame: background, navbar wrapper
│   │   └── Navbar.tsx            # Nav links + book dropdown + add-book dialog
│   ├── common/
│   │   └── EmptyState.tsx        # Generic empty/loading/error state component
│   ├── dashboard/
│   │   └── StatCard.tsx          # Dashboard stat card with icon
│   └── question/
│       ├── QuestionImage.tsx     # Full question image display with asset loading
│       └── QuestionThumbnail.tsx # Thumbnail image for question lists
├── pages/
│   ├── DashboardPage.tsx         # Hero section + study stats + question count
│   ├── MistakeEntryPage.tsx      # Mark mistakes by page/question number
│   ├── QuestionListPage.tsx      # Filterable question list with search
│   ├── QuestionDetailPage.tsx    # Single question: image, answer, tips, images panel
│   ├── ReviewPage.tsx            # FSRS review flow: show question, rate difficulty
│   └── BackupPage.tsx            # Export/import/review settings/data health
├── store/
│   ├── useBookStore.ts           # Book list, active book, switch/add/remove
│   ├── useQuestionStore.ts       # Questions, filters, tips saving
│   └── useReviewStore.ts         # FSRS cards, logs, mistakes, sessions, settings
├── services/
│   ├── backupService.ts          # Backup create/validate/download/read
│   ├── dashboardStats.ts         # Review statistics aggregation
│   ├── desktopBridge.ts          # Tauri invoke wrappers, runtime init
│   ├── fsrsService.ts            # ts-fsrs scheduling, card creation, rating
│   ├── librarySyncService.ts     # Question fingerprinting, sync preview
│   ├── mistakeLookup.ts          # Find questions by page/number
│   ├── questionLoader.ts         # Load questions from desktop or web
│   ├── reviewPersistStorage.ts   # Zustand persist storage adapter (SQLite/localStorage)
│   └── reviewQueue.ts            # Build daily review queue from cards/logs
├── hooks/
│   ├── useAssetUrl.ts            # Resolve asset URLs (book-scoped questions/answers, shared pages/)
│   └── useBeforeUnloadSave.ts    # Sync review state to localStorage on tab close (web safety net)
├── types/
│   ├── book.ts                   # BookEntry type
│   ├── question.ts               # Question, QuestionMeta, AnswerMeta, UncertainFilter
│   └── review.ts                 # ReviewCard, ReviewLog, settings, backup, mistake types
└── utils/
    ├── bookId.ts                 # getActiveBookId() from useBookStore state
    ├── date.ts                   # Date formatting, timezone-aware ISO
    ├── questionFilters.ts        # Filter questions by chapter/section/search/uncertain
    ├── questionImages.ts         # Image path fix resolution, page image path (book-scoped)
    ├── questionStats.ts          # Chapter distribution, uncertain counts, totals
    └── reviewLabels.ts           # Chinese labels for ratings, review states
```

## State Management (Zustand)

### `useBookStore`
- **Stores:** `books[]`, `activeBookId`, `isSwitching`, `isLoaded`
- **Actions:** `loadBooks`, `switchBook`, `addBook`, `removeBook`
- **Persistence:** `activeBookId` to localStorage (`mathloop-active-book`)
- **Web mode:** Loads from `/books.json` manifest
- **Desktop mode:** Calls Tauri `list_books` command

### `useQuestionStore`
- **Stores:** `questions[]`, `isLoading`, `error`, filters (chapter, section, uncertain, search)
- **Actions:** `loadQuestions`, `saveQuestionTips`, filter setters
- **Persistence:** Filter state to localStorage (`mathloop-question-ui-v2`)
- **Loads via:** `questionLoader.loadOpenClawQuestions()` (book-aware)

### `useReviewStore`
- **Stores:** `cards`, `reviewLogs`, `mistakeRecords`, `questionFingerprints`, `lastSyncResult`, `dailyReviewSession`, `settings`, `hasHydrated`, `isReady`
- **Actions:** `syncQuestionLibrary`, `rateQuestion`, `markMistakeQuestion`, `importReviewState`, `resetReviewState`, etc.
- **Persistence:** Full review state via `reviewPersistStorage.createReviewPersistStorage()` (book-scoped). Web: guarded against empty-state writes overwriting saved data.
- **Key:** `review::{bookId}` (desktop) or `openclaw-review-state::{bookId}` (web)
- **Book switch:** Subscribes to `useBookStore`; `isSwitchingBook` guard blocks writes during actual switches but not initial load. `isReady` flag gates `syncQuestionLibrary` to prevent race with hydration.

## Key Data Flows

### App Startup
1. `App.tsx` mounts -> `loadBooks()` + `useBeforeUnloadSave()` hook
2. `activeBookId` resolves (persisted or auto-selected)
3. `initializeDesktopRuntime(bookId)` boots Tauri runtime (desktop only)
4. `loadQuestions()` fetches book-scoped questions
5. Review store hydrates from localStorage/SQLite -> `hasHydrated=true`
6. `loadReviewForCurrentBook()` loads book-scoped data -> `isReady=true`
7. `syncQuestionLibrary(questions)` syncs FSRS cards (gated on `isReady`)

### Book Switch
1. Navbar dropdown -> `switchBook(bookId)`
2. `resetDesktopRuntime()` + `setActiveDesktopBook()` + `initializeDesktopRuntime(bookId)`
3. `set({ activeBookId })` triggers Zustand persist to localStorage
4. `useReviewStore.subscribe()` detects bookId change -> `loadReviewForCurrentBook()`
5. `questionStore.loadQuestions()` re-fetches from new book
6. `clearDesktopAssetCache()` clears cached data URLs

### Web Asset URL Routing
1. `useAssetUrl(path)` -> `toBrowserAssetUrl(path)`
2. `questions/xxx` -> `/books/{bookId}/questions/xxx` (book-scoped)
3. `answers/xxx` -> `/books/{bookId}/answers/xxx` (book-scoped)
4. `pages/xxx` -> `/pages/xxx` (top-level, shared) — page images now also served per-book via `books/{bookId}/pages/`
5. `getQuestionPageImagePath(question)` returns book-scoped path: `books/{bookId}/pages/page_NNN.png`
6. Desktop: calls `load_asset_data_url(path, bookId)` -> returns `data:image/png;base64,...`

## External Dependencies

| Package | Purpose |
|---------|---------|
| react, react-dom | UI framework |
| react-router-dom | Client-side routing |
| zustand | State management (3 stores + persist middleware) |
| ts-fsrs | FSRS spaced-repetition algorithm |
| @tauri-apps/api | Tauri IPC bridge (invoke, convertFileSrc) |
| tailwindcss | Utility-first CSS |
| vite | Build tool and dev server |
