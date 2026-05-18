import type { StateStorage } from "zustand/middleware";
import { invokeDesktop, isTauriRuntime } from "./desktopBridge";

function getActiveBookId(): string | null {
  try {
    const raw = localStorage.getItem("mathloop-active-book");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.activeBookId ?? null;
  } catch {
    return null;
  }
}

export function createReviewPersistStorage(): StateStorage {
  if (!isTauriRuntime()) {
    return localStorage;
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
    localStorage.removeItem(name);
    return;
  }
  const bookId = getActiveBookId();
  void invokeDesktop<void>("review_store_remove", { key: name, bookId });
}
