import { useEffect } from "react";
import { REVIEW_STORAGE_KEY } from "../services/backupService";
import { useReviewStore } from "../store/useReviewStore";
import { getActiveBookId } from "../utils/bookId";
import { isTauriRuntime, invokeDesktop } from "../services/desktopBridge";

function buildStorageKey(): string {
  const bookId = getActiveBookId();
  return bookId ? `${REVIEW_STORAGE_KEY}::${bookId}` : REVIEW_STORAGE_KEY;
}

function persistReviewState(): void {
  const state = useReviewStore.getState();
  const partialized = {
    cards: state.cards,
    reviewLogs: state.reviewLogs,
    mistakeRecords: state.mistakeRecords,
    questionFingerprints: state.questionFingerprints,
    lastSyncResult: state.lastSyncResult,
    dailyReviewSession: state.dailyReviewSession,
    settings: state.settings,
  };
  const data = JSON.stringify({ state: partialized, version: 0 });
  const key = buildStorageKey();

  // Always save to localStorage as a safety net
  localStorage.setItem(key, data);

  // For Tauri: also flush to SQLite immediately on close
  if (isTauriRuntime()) {
    const bookId = getActiveBookId();
    if (bookId) {
      // Use synchronous approach for beforeunload — invokeDesktop is async,
      // but the app's normal persist middleware already saved to SQLite
      // on every state change. This is an extra safety net.
      // Fire-and-forget: the browser may cancel this, but the middleware
      // already persisted the last known-good state.
      void invokeDesktop<void>("review_store_set", {
        key: REVIEW_STORAGE_KEY,
        value: data,
        bookId,
      });
    }
  }
}

export function useBeforeUnloadSave(): void {
  useEffect(() => {
    window.addEventListener("beforeunload", persistReviewState);
    window.addEventListener("pagehide", persistReviewState);

    return () => {
      window.removeEventListener("beforeunload", persistReviewState);
      window.removeEventListener("pagehide", persistReviewState);
    };
  }, []);
}
