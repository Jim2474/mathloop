import type { StateStorage } from "zustand/middleware";
import { invokeDesktop, isTauriRuntime } from "./desktopBridge";

export function createReviewPersistStorage(): StateStorage {
  if (!isTauriRuntime()) {
    return localStorage;
  }

  return {
    getItem: (name) => invokeDesktop<string | null>("review_store_get", { key: name }),
    setItem: (name, value) =>
      invokeDesktop<void>("review_store_set", {
        key: name,
        value,
      }),
    removeItem: (name) => invokeDesktop<void>("review_store_remove", { key: name }),
  };
}

export function removePersistedReviewState(name: string): void {
  if (!isTauriRuntime()) {
    localStorage.removeItem(name);
    return;
  }
  void invokeDesktop<void>("review_store_remove", { key: name });
}
