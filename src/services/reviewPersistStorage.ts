import type { StateStorage } from "zustand/middleware";
import { invokeDesktop, isTauriRuntime } from "./desktopBridge";
import { getActiveBookId } from "../utils/bookId";

function bookScopedKey(name: string): string {
  const bookId = getActiveBookId();
  return bookId ? `${name}::${bookId}` : name;
}

let isSwitchingBook = false;
const pendingWrites = new Map<string, Promise<void>>();
const writeErrors = new Map<string, unknown>();

export async function flushReviewWrites(bookId: string): Promise<void> {
  let latest: Promise<void> | undefined;
  do {
    latest = pendingWrites.get(bookId);
    await latest;
  } while (latest !== pendingWrites.get(bookId));
  if (writeErrors.has(bookId)) throw new Error("复习数据尚未成功保存，请稍后重试撤销。");
}

export function setSwitchingBook(v: boolean): void {
  isSwitchingBook = v;
}

export function getSwitchingBook(): boolean {
  return isSwitchingBook;
}

function isEmptyState(value: string): boolean {
  try {
    const incoming = JSON.parse(value);
    const state = incoming.state ?? incoming;
    return Object.keys(state.cards || {}).length === 0
      && Object.keys(state.mistakeRecords || {}).length === 0
      && (state.reviewLogs || []).length === 0;
  } catch {
    return false;
  }
}

function hasExistingData(key: string): boolean {
  try {
    const existing = localStorage.getItem(key);
    if (!existing) return false;
    const parsed = JSON.parse(existing);
    const state = parsed.state ?? parsed;
    return Object.keys(state.cards || {}).length > 0
      || Object.keys(state.mistakeRecords || {}).length > 0
      || (state.reviewLogs || []).length > 0;
  } catch {
    return false;
  }
}

export function createReviewPersistStorage(): StateStorage {
  if (!isTauriRuntime()) {
    return {
      getItem: (name) => localStorage.getItem(bookScopedKey(name)),
      setItem: (name, value) => {
        if (isSwitchingBook) return;
        const key = bookScopedKey(name);
        // Never overwrite existing data with an empty initial state.
        // Zustand fires setItem for the initial store state before hydration,
        // which would wipe saved review progress.
        if (isEmptyState(value) && hasExistingData(key)) return;
        localStorage.setItem(key, value);
      },
      removeItem: (name) => localStorage.removeItem(bookScopedKey(name)),
    };
  }

  return {
    getItem: async (name) => {
      const bookId = getActiveBookId();
      if (!bookId) return null;
      await flushReviewWrites(bookId);
      return invokeDesktop<string | null>("review_store_get", { key: name, bookId });
    },
    setItem: async (name, value) => {
      if (isSwitchingBook) return;
      const bookId = getActiveBookId();
      if (!bookId) return;
      const next = (pendingWrites.get(bookId) ?? Promise.resolve()).then(async () => {
        try {
          await invokeDesktop<void>("review_store_set", { key: name, value, bookId });
          writeErrors.delete(bookId);
        } catch (error) {
          writeErrors.set(bookId, error);
          console.error("Failed to persist review state:", error);
        }
      });
      pendingWrites.set(bookId, next);
      await next;
    },
    removeItem: async (name) => {
      const bookId = getActiveBookId();
      if (!bookId) return;
      try {
        await invokeDesktop<void>("review_store_remove", { key: name, bookId });
      } catch (error) {
        console.error("Failed to remove persisted review state:", error);
      }
    },
  };
}

export function removePersistedReviewState(name: string): void {
  if (!isTauriRuntime()) {
    localStorage.removeItem(bookScopedKey(name));
    return;
  }
  const bookId = getActiveBookId();
  if (!bookId) return;
  void invokeDesktop<void>("review_store_remove", { key: name, bookId });
}
