import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BookEntry } from "../types/book";
import {
  listDesktopBooks,
  addDesktopBook,
  removeDesktopBook,
  setActiveDesktopBook,
  resetDesktopRuntime,
  initializeDesktopRuntime,
  isTauriRuntime,
} from "../services/desktopBridge";
import {
  getCustomBooks,
  getCustomBooksAsync,
  addCustomBook,
  removeCustomBook,
} from "../services/webBookService";
import {
  applyBookPresentation,
  emptyBookPresentation,
  loadBookPresentation,
  persistBookPresentation,
  updateBookPresentation,
  type BookPresentation,
} from "../services/bookPresentationService";

const ACTIVE_BOOK_KEY = "mathloop-active-book";
const BOOKS_MANIFEST_URL = "/books.json";
const DEFAULT_BOOK_ID = "book001";
let booksLoadGeneration = 0;

type BookState = {
  books: BookEntry[];
  activeBookId: string | null;
  isSwitching: boolean;
  isLoaded: boolean;
  /** In-memory set of custom (screenshot-only) book IDs — do NOT rely on localStorage for this */
  customBookIds: Set<string>;
  presentation: BookPresentation;
  presentationError: string | null;
  isPresentationReady: boolean;
  isSavingPresentation: boolean;
  loadBooks: () => Promise<void>;
  saveBookPresentation: (orderIds: string[], namesById: Record<string, string>) => Promise<void>;
  switchBook: (bookId: string) => Promise<void>;
  addBook: (bookId: string, name: string, questions?: unknown[]) => Promise<BookEntry>;
  removeBook: (bookId: string) => Promise<void>;
};

export const useBookStore = create<BookState>()(
  persist(
    (set, get) => ({
      books: [],
      activeBookId: null,
      isSwitching: false,
      isLoaded: false,
      customBookIds: new Set<string>(),
      presentation: emptyBookPresentation(),
      presentationError: null,
      isPresentationReady: false,
      isSavingPresentation: false,

      loadBooks: async () => {
        if (get().isSavingPresentation) return;
        const generation = ++booksLoadGeneration;
        set({ isPresentationReady: false, presentationError: null });
        try {
          const presentation = await loadBookPresentation();
          if (generation !== booksLoadGeneration) return;
          set({ presentation });
        } catch (error) {
          if (generation !== booksLoadGeneration) return;
          set({
            presentation: emptyBookPresentation(),
            presentationError: `课本显示设置读取失败：${error instanceof Error ? error.message : String(error)}`,
          });
        }
        const publishBooks = (books: BookEntry[], customBooks: BookEntry[]) => {
          if (generation !== booksLoadGeneration) return;
          set({
            books: applyBookPresentation(books, get().presentation),
            isLoaded: true,
            isPresentationReady: get().presentationError === null,
            customBookIds: new Set(customBooks.map((book) => book.id)),
          });
        };
        if (!isTauriRuntime()) {
          // ── Web mode ──────────────────────────────────────────────────
          try {
            const response = await fetch(BOOKS_MANIFEST_URL, { cache: "no-cache" });
            if (response.ok) {
              const data: unknown = await response.json();
              if (Array.isArray(data)) {
                const builtinBooks = data as BookEntry[];
                // Web: use sync read (localStorage always works in browsers)
                const customBooks = getCustomBooks();
                const seen = new Set(builtinBooks.map((b) => b.id));
                const merged = [
                  ...builtinBooks,
                  ...customBooks.filter((b) => !seen.has(b.id)),
                ];
                publishBooks(merged, customBooks);
                if (generation === booksLoadGeneration && !get().activeBookId && merged.length > 0) {
                  const defaultBook = merged.find((b) => b.id === DEFAULT_BOOK_ID) ?? merged[0];
                  set({ activeBookId: defaultBook.id });
                }
                return;
              }
            }
          } catch {
            // Fall through to empty state
          }
          publishBooks([], []);
          return;
        }

        // ── Tauri mode ────────────────────────────────────────────────
        // Use async fallback to recover custom books from IndexedDB if localStorage
        // was cleared between sessions (can happen in WKWebView on some systems).
        try {
          const [desktopBooks, customBooks] = await Promise.all([
            listDesktopBooks(),
            getCustomBooksAsync(), // localStorage first, IndexedDB fallback
          ]);
          const seen = new Set(desktopBooks.map((b) => b.id));
          const merged = [
            ...desktopBooks,
            ...customBooks.filter((b) => !seen.has(b.id)),
          ];
          publishBooks(merged, customBooks);
        } catch {
          // Even if Rust fails, try to load at least the custom books
          try {
            const customBooks = await getCustomBooksAsync();
            publishBooks(customBooks, customBooks);
          } catch {
            publishBooks([], []);
          }
        }
      },

      saveBookPresentation: async (orderIds, namesById) => {
        const state = get();
        if (!state.isLoaded || !state.isPresentationReady || state.presentationError) {
          throw new Error("课本显示设置尚未成功读取，暂时无法保存。请重新读取后重试。");
        }
        if (state.isSavingPresentation) throw new Error("正在保存课本显示设置，请稍候。");
        const presentation = updateBookPresentation(state.presentation, state.books, orderIds, namesById);
        set({ isSavingPresentation: true });
        try {
          await persistBookPresentation(presentation);
          set((current) => ({
            presentation,
            books: applyBookPresentation(current.books, presentation),
          }));
        } finally {
          set({ isSavingPresentation: false });
        }
      },

      switchBook: async (bookId: string) => {
        const current = get().activeBookId;
        if (current === bookId) return;

        set({ isSwitching: true });
        try {
          // Check the in-memory Set — NOT localStorage — to determine if this is a
          // custom (screenshot-only) book. The Set is populated on loadBooks() and addBook().
          const isCustom = get().customBookIds.has(bookId);

          if (isTauriRuntime() && !isCustom) {
            // Only call the Rust backend for built-in disk-based books.
            // NEVER call resetDesktopRuntime() for custom books — it clears desktopDataDir
            // and breaks ALL image loading until a successful bootstrap.
            resetDesktopRuntime();
            await setActiveDesktopBook(bookId);
            await initializeDesktopRuntime(bookId);
          }
          set({ activeBookId: bookId, isSwitching: false });
        } catch (error) {
          set({ isSwitching: false });
          throw error;
        }
      },

      addBook: async (bookId: string, name: string, questions?: unknown[]) => {
        // Always use addCustomBook (localStorage + IndexedDB) for custom/empty books.
        // questions param is provided by the AddBookDialog for all custom books
        // (including in Tauri mode — fixed in Navbar to always pass questions ?? []).
        const asQuestions = (questions ?? []) as import("../types/question").Question[];

        if (!isTauriRuntime() || questions !== undefined) {
          const entry = await addCustomBook(bookId, name, asQuestions);
          set((state) => ({
            books: applyBookPresentation([...state.books, entry], state.presentation),
            customBookIds: new Set([...state.customBookIds, entry.id]),
          }));
          return entry;
        }

        // Tauri mode with no questions param: real disk-based book (advanced use case)
        const entry = await addDesktopBook(bookId, name);
        set((state) => ({ books: applyBookPresentation([...state.books, entry], state.presentation) }));
        return entry;
      },

      removeBook: async (bookId: string) => {
        const isCustom = get().customBookIds.has(bookId);
        if (!isTauriRuntime() || isCustom) {
          await removeCustomBook(bookId);
        } else {
          await removeDesktopBook(bookId);
        }
        set((state) => ({
          books: state.books.filter((b) => b.id !== bookId),
          activeBookId: state.activeBookId === bookId ? null : state.activeBookId,
          customBookIds: new Set([...state.customBookIds].filter((id) => id !== bookId)),
        }));
      },
    }),
    {
      name: ACTIVE_BOOK_KEY,
      partialize: (state) => ({
        activeBookId: state.activeBookId,
      }),
    },
  ),
);
