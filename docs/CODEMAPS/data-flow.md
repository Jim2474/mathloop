# Data Flow Codemap

**Last Updated:** 2026-06-09

## 1. Application Startup Flow

```
main.tsx
  -> ReactDOM.createRoot -> App.tsx

App.tsx (useEffect: mount)
  -> useBookStore.loadBooks()
     Desktop: invoke("list_books") -> SQLite book-registry
     Web:     fetch("/books.json") -> JSON manifest
     -> set({ books, isLoaded })
     -> Auto-select: if no activeBookId, pick book001 or first book

App.tsx (useEffect: activeBookId change)
  -> initializeDesktopRuntime(activeBookId)
     -> invoke("bootstrap_mathloop_data", { bookId })
        -> run_migration(ctx)
        -> register_bundled_books(ctx)
        -> create dirs, copy assets
        -> ensure_database, create_startup_backup
        -> return BootstrapInfo

  -> questionStore.loadQuestions()
     -> loadOpenClawQuestions() [questionLoader.ts]
        Desktop: invoke("load_questions_json", { bookId })
        Web:     fetch("/books/{bookId}/data/questions.json")
        -> set({ questions })

App.tsx (useEffect: hasHydrated && isReady && questions)
  -> reviewStore.syncQuestionLibrary(questions)
     -> Skips if all questions already have cards (idempotent)
     -> Falls back to localStorage if in-memory mistakeRecords empty
     -> Creates FSRS cards for new questions only
  -> reviewStore.cleanupOrphanReviewData(questions)
     -> Remove cards/logs/fingerprints for deleted questions
```

## 2. Book Switch Flow

```
User clicks book in Navbar dropdown
  -> useBookStore.switchBook(bookId)

Step 1: State update
  -> set({ isSwitching: true })
  -> resetDesktopRuntime()        # Clear bootstrap cache
  -> setActiveDesktopBook(bookId) # invoke("set_active_book")
  -> initializeDesktopRuntime(bookId) # invoke("bootstrap_mathloop_data")
  -> set({ activeBookId: bookId, isSwitching: false })
     -> Persisted to localStorage "mathloop-active-book"

Step 2: Question reload
  -> App.tsx useEffect reacts to activeBookId change
  -> questionStore.loadQuestions()
  -> New book's questions loaded

Step 3: Review rehydration
  -> useReviewStore.subscribe() detects bookId change
  -> clearDesktopAssetCache()
  -> loadReviewForCurrentBook()
     -> reviewStorage.getItem("openclaw-review-state")
        Desktop: invoke("review_store_get", { key, bookId })
                 -> SQLite: SELECT WHERE key='review::book002'
        Web:     localStorage.getItem("openclaw-review-state::book002")
     -> If no scoped data: tryMigrateLegacyReviewState()
        -> Try unscoped key (legacy migration)
     -> applyStoredReviewState(json) -> useReviewStore.setState(...)
```

## 3. Review Rating Flow

```
User rates question (Again/Hard/Good/Easy) on ReviewPage
  -> useReviewStore.rateQuestion(questionId, rating)
  -> fsrsService.rateReviewCard(questionId, card, rating, time, settings)
     -> ts-fsrs computes next due date, stability, difficulty
     -> Returns { nextCard, log }
  -> set({ cards: { ...cards, [questionId]: nextCard },
          reviewLogs: [...reviewLogs, log] })
     -> Zustand persist middleware auto-saves
     -> Desktop: invoke("review_store_set", { key, value, bookId })
     -> Web:     localStorage.setItem(scopedKey, value)
```

## 4. Asset Image Loading Flow

```
QuestionImage component renders
  -> useAssetUrl("questions/book001_ch01_p006_q001.png")
  -> getActiveBookId() -> "book001"

Browser mode:
  -> Returns { status: "loaded", url: "/books/book001/questions/book001_ch01_p006_q001.png" }
  -> <img src="/books/book001/questions/..."> served by Vite from public/books/book001/

Desktop mode:
  -> invoke("load_asset_data_url", { relativePath, bookId })
  -> Rust load_asset_data_url():
     1. Try books/book001/questions/book001_ch01_p006_q001.png (external)
     2. Try questions/book001_ch01_p006_q001.png (top-level external, legacy)
     3. Try resources/books/book001/questions/... (bundled resource)
     4. Try resources/questions/... (flat resource)
     5. Try public/books/book001/questions/... (dev fallback)
     -> Read bytes, detect MIME type
     -> Return "data:image/png;base64,iVBOR..."
  -> Cache in desktopAssetCache Map
  -> Returns { status: "loaded", url: "data:image/png;base64,..." }
```

## 5. Tips Saving Flow

```
User edits tips on QuestionDetailPage, clicks save
  -> useQuestionStore.saveQuestionTips(questionId, tips)
  -> getActiveBookId() -> "book001"
  -> updateDesktopQuestionTips(questionId, tips, bookId)
  -> invoke("update_question_tips", { questionId, tips, bookId })
  -> Rust:
     1. Read books/book001/data/questions.json
     2. Create backup: backups/questions-before-tip-YYYY-MM-DD-HH-mm-ss.json
     3. Find question by id in JSON array
     4. Set or remove "tips" field
     5. Write to .tmp file, rename atomically
  -> Reload questions to reflect changes
  -> set({ questions: updated })
```

## 6. Backup/Restore Flow

```
Export:
  -> createReviewBackup(cards, logs, settings, mistakes, ..., activeBookId)
  -> Returns { version, bookId, exportedAt, cards, reviewLogs, ... }
  -> downloadReviewBackup(backup) -> JSON file download

Import:
  -> User selects .json file
  -> readBackupFile(file) -> validateReviewBackup()
  -> If backup.bookId != activeBookId:
     -> Show warning dialog (potential cross-book import)
  -> importReviewState(backup)
  -> set({ cards, reviewLogs, settings, mistakeRecords, ... })
  -> Persisted to book-scoped storage
```

## 7. Mistake Entry Flow

```
User enters page number + question number on MistakeEntryPage
  -> mistakeLookup.findQuestion(questions, page, number)
  -> Shows matched question
  -> User picks review time
  -> useReviewStore.markMistakeQuestion({ question, reviewAt, ... })
     -> Creates ReviewMistakeRecord
     -> Creates/updates FSRS card with due date
     -> Persisted to book-scoped review state
```

## 8. Daily Review Queue Generation

```
User opens /review
  -> useReviewStore.getOrCreateDailyReviewSession(questions, now)
  -> reviewQueue.buildTodayReviewQueue({ questions, cards, logs, mistakes, settings, now })
     -> Filter: due today or overdue, within maxDailyReviews
     -> Sort: due date ascending
     -> Add new questions up to maxNewPerDay
     -> Return DailyReviewSession { dateKey, roundId, queue }
  -> User reviews each question, rates it
  -> Queue advances; session state persisted
```

## Cross-Cutting: Book ID Resolution

All modules that need the active book ID use:
```ts
import { getActiveBookId } from "../utils/bookId";
const bookId = getActiveBookId(); // reads useBookStore.getState().activeBookId
```

Used by: `questionLoader.ts`, `reviewPersistStorage.ts`, `useAssetUrl.ts`, `useQuestionStore.ts`
