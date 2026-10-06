import { useEffect } from "react";
import { REVIEW_STORAGE_KEY } from "../services/backupService";
import { useReviewStore } from "../store/useReviewStore";
import { getActiveBookId } from "../utils/bookId";
import { getSwitchingBook } from "../services/reviewPersistStorage";

function buildStorageKey(): string {
  const bookId = getActiveBookId();
  return bookId ? `${REVIEW_STORAGE_KEY}::${bookId}` : REVIEW_STORAGE_KEY;
}

function persistReviewState(): void {
  const state = useReviewStore.getState();
  if (!state.isReady || state.readyBookId !== getActiveBookId() || getSwitchingBook()) return;
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

  // Native saves already use an ordered queue on every state change.
  // A second fire-and-forget write here can overtake that queue and restore
  // stale state, especially during an undo or book switch.
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
