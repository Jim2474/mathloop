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

const ACTIVE_BOOK_KEY = "mathloop-active-book";

type BookState = {
  books: BookEntry[];
  activeBookId: string | null;
  isSwitching: boolean;
  isLoaded: boolean;
  loadBooks: () => Promise<void>;
  switchBook: (bookId: string) => Promise<void>;
  addBook: (bookId: string, name: string) => Promise<BookEntry>;
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
          set({ isLoaded: true });
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
          resetDesktopRuntime();
          await setActiveDesktopBook(bookId);
          await initializeDesktopRuntime(bookId);
          set({ activeBookId: bookId, isSwitching: false });
        } catch (error) {
          set({ isSwitching: false });
          throw error;
        }
      },

      addBook: async (bookId: string, name: string) => {
        const entry = await addDesktopBook(bookId, name);
        set((state) => ({ books: [...state.books, entry] }));
        return entry;
      },

      removeBook: async (bookId: string) => {
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
