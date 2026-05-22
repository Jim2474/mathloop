# Frontend Codemap

**Last Updated:** 2026-05-22
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
│   └── useAssetUrl.ts            # Resolve asset URLs (data URL on desktop, public URL on web)
├── types/
│   ├── book.ts                   # BookEntry type
│   ├── question.ts               # Question, QuestionMeta, AnswerMeta, UncertainFilter
│   └── review.ts                 # ReviewCard, ReviewLog, settings, backup, mistake types
└── utils/
    ├── bookId.ts                 # getActiveBookId() from useBookStore state
    ├── date.ts                   # Date formatting, timezone-aware ISO
    ├── questionFilters.ts        # Filter questions by chapter/section/search/uncertain
    ├── questionImages.ts         # Image path fix resolution, fallback paths
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
- **Stores:** `cards`, `reviewLogs`, `mistakeRecords`, `questionFingerprints`, `lastSyncResult`, `dailyReviewSession`, `settings`
- **Actions:** `syncQuestionLibrary`, `rateQuestion`, `markMistakeQuestion`, `importReviewState`, `resetReviewState`, etc.
- **Persistence:** Full review state via `reviewPersistStorage.createReviewPersistStorage()` (book-scoped)
- **Key:** `review::{bookId}` (desktop) or `{key}::{bookId}` (web)
- **Book switch:** Subscribes to `useBookStore`; re-loads review data via `loadReviewForCurrentBook()` with legacy migration fallback

## Key Data Flows

### App Startup
1. `App.tsx` mounts -> `loadBooks()`
2. `activeBookId` resolves (persisted or auto-selected)
3. `initializeDesktopRuntime(bookId)` boots Tauri runtime
4. `loadQuestions()` fetches book-scoped questions
5. Review store hydrates -> `syncQuestionLibrary(questions)` syncs FSRS cards

### Book Switch
1. Navbar dropdown -> `switchBook(bookId)`
2. `resetDesktopRuntime()` + `setActiveDesktopBook()` + `initializeDesktopRuntime(bookId)`
3. `set({ activeBookId })` triggers Zustand persist to localStorage
4. `useReviewStore.subscribe()` detects bookId change -> `loadReviewForCurrentBook()`
5. `questionStore.loadQuestions()` re-fetches from new book
6. `clearDesktopAssetCache()` clears cached data URLs

### Desktop Asset Loading
1. `useAssetUrl("questions/book001_ch01_p006_q001.png")`
2. Browser: returns `/books/{bookId}/questions/book001_ch01_p006_q001.png`
3. Desktop: calls `load_asset_data_url(path, bookId)` -> returns `data:image/png;base64,...`
4. Cached in `Map<string, string>` per path

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
