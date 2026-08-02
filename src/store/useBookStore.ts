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
import { getCustomBooks, addCustomBook, removeCustomBook } from "../services/webBookService";

const ACTIVE_BOOK_KEY = "mathloop-active-book";
const BOOKS_MANIFEST_URL = "/books.json";
const DEFAULT_BOOK_ID = "book001";

type BookState = {
  books: BookEntry[];
  activeBookId: string | null;
  isSwitching: boolean;
  isLoaded: boolean;
  loadBooks: () => Promise<void>;
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

      loadBooks: async () => {
        if (!isTauriRuntime()) {
          try {
            const response = await fetch(BOOKS_MANIFEST_URL, { cache: "no-cache" });
            if (response.ok) {
              const data: unknown = await response.json();
              if (Array.isArray(data)) {
                const builtinBooks = data as BookEntry[];
                const customBooks = getCustomBooks();
                // Merge: built-in first, then custom (deduplicated by id)
                const seen = new Set(builtinBooks.map((b) => b.id));
                const merged = [
                  ...builtinBooks,
                  ...customBooks.filter((b) => !seen.has(b.id)),
                ];
                set({ books: merged, isLoaded: true });
                if (!get().activeBookId && merged.length > 0) {
                  const defaultBook = merged.find((b) => b.id === DEFAULT_BOOK_ID) ?? merged[0];
                  set({ activeBookId: defaultBook.id });
                }
                return;
              }
            }
          } catch {
            // Fall through to empty state
          }
          set({ books: [], isLoaded: true });
          return;
        }
        try {
          const books = await listDesktopBooks();
          set({ books, isLoaded: true });
        } catch {
          set({ books: [], isLoaded: true });
        }
      },

      switchBook: async (bookId: string) => {
        const current = get().activeBookId;
        if (current === bookId) return;

        set({ isSwitching: true });
        try {
          if (isTauriRuntime()) {
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
        if (!isTauriRuntime()) {
          // Web mode: store in IndexedDB via webBookService
          // questions must be provided for web mode
          const entry = await addCustomBook(
            bookId,
            name,
            (questions ?? []) as import("../types/question").Question[],
          );
          set((state) => ({ books: [...state.books, entry] }));
          return entry;
        }
        const entry = await addDesktopBook(bookId, name);
        set((state) => ({ books: [...state.books, entry] }));
        return entry;
      },

      removeBook: async (bookId: string) => {
        if (!isTauriRuntime()) {
          await removeCustomBook(bookId);
          set((state) => ({
            books: state.books.filter((b) => b.id !== bookId),
            activeBookId: state.activeBookId === bookId ? null : state.activeBookId,
          }));
          return;
        }
        await removeDesktopBook(bookId);
        set((state) => ({
          books: state.books.filter((b) => b.id !== bookId),
          activeBookId: state.activeBookId === bookId ? null : state.activeBookId,
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
