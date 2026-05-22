import type { StateStorage } from "zustand/middleware";
import { invokeDesktop, isTauriRuntime } from "./desktopBridge";
import { getActiveBookId } from "../utils/bookId";

function bookScopedKey(name: string): string {
  const bookId = getActiveBookId();
  return bookId ? `${name}::${bookId}` : name;
}

export function createReviewPersistStorage(): StateStorage {
  if (!isTauriRuntime()) {
    return {
      getItem: (name) => localStorage.getItem(bookScopedKey(name)),
      setItem: (name, value) => localStorage.setItem(bookScopedKey(name), value),
      removeItem: (name) => localStorage.removeItem(bookScopedKey(name)),
    };
  }

  return {
    getItem: (name) => {
      const bookId = getActiveBookId();
      return invokeDesktop<string | null>("review_store_get", { key: name, bookId });
    },
    setItem: (name, value) => {
      const bookId = getActiveBookId();
      return invokeDesktop<void>("review_store_set", { key: name, value, bookId });
    },
    removeItem: (name) => {
      const bookId = getActiveBookId();
      return invokeDesktop<void>("review_store_remove", { key: name, bookId });
    },
  };
}

export function removePersistedReviewState(name: string): void {
  if (!isTauriRuntime()) {
    localStorage.removeItem(bookScopedKey(name));
    return;
  }
  const bookId = getActiveBookId();
  void invokeDesktop<void>("review_store_remove", { key: name, bookId });
}
