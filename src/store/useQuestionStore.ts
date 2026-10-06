import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  isTauriRuntime,
  updateDesktopQuestionTips,
  loadDesktopQuestionTipsMap,
} from "../services/desktopBridge";
import { loadOpenClawQuestions } from "../services/questionLoader";
import type { Question, UncertainFilter } from "../types/question";
import { getActiveBookId } from "../utils/bookId";

type PersistedQuestionState = {
  selectedChapter: string;
  selectedSection: string;
  uncertainFilter: UncertainFilter;
  searchTerm: string;
  localTips: Record<string, string>;
};

type QuestionState = PersistedQuestionState & {
  questions: Question[];
  isLoading: boolean;
  loadedBookId: string | null;
  error: string | null;
  loadQuestions: () => Promise<void>;
  saveQuestionTips: (questionId: string, tips: string) => Promise<void>;
  getEffectiveTips: (questionId: string) => string;
  setSelectedChapter: (chapter: string) => void;
  setSelectedSection: (section: string) => void;
  setUncertainFilter: (filter: UncertainFilter) => void;
  setSearchTerm: (searchTerm: string) => void;
  resetFilters: () => void;
};

let loadGeneration = 0;

const initialFilters: PersistedQuestionState = {
  selectedChapter: "all",
  selectedSection: "all",
  uncertainFilter: "all",
  searchTerm: "",
  localTips: {},
};

export const useQuestionStore = create<QuestionState>()(
  persist(
    (set, get) => ({
      ...initialFilters,
      questions: [],
      isLoading: false,
      loadedBookId: null,
      error: null,
      loadQuestions: async () => {
        const generation = ++loadGeneration;
        const bookId = getActiveBookId();
        set({ isLoading: true, error: null, loadedBookId: null });
        try {
          const questions = await loadOpenClawQuestions(bookId);
          if (generation !== loadGeneration || bookId !== getActiveBookId()) return;

          // In Tauri mode, merge SQLite-backed tips (for custom/screenshot books)
          // into localTips so getEffectiveTips() works without an async call.
          // Tips stored in questions.json are already part of each Question object
          // and handled by the `question?.tips` fallback in getEffectiveTips.
          if (isTauriRuntime()) {
            if (bookId) {
              try {
                const sqliteTips = await loadDesktopQuestionTipsMap(bookId);
                if (generation !== loadGeneration || bookId !== getActiveBookId()) return;
                if (Object.keys(sqliteTips).length > 0) {
                  set((state) => ({
                    // SQLite is the source of truth: merge on top of any cached localTips,
                    // preserving keys that SQLite doesn't know about (e.g. from other books).
                    localTips: { ...state.localTips, ...sqliteTips },
                  }));
                }
              } catch {
                // Non-fatal: tips may just not be loaded this session
              }
            }
          }

          if (generation === loadGeneration && bookId === getActiveBookId()) {
            set({ questions, isLoading: false, error: null, loadedBookId: bookId });
          }
        } catch (error) {
          if (generation !== loadGeneration || bookId !== getActiveBookId()) return;
          const message = error instanceof Error ? error.message : "读取题库失败。";
          set({ questions: [], isLoading: false, error: message, loadedBookId: null });
        }
      },
      saveQuestionTips: async (questionId, tips) => {
        const bookId = getActiveBookId();
        const trimmed = tips.trim();
        if (isTauriRuntime()) {
          await updateDesktopQuestionTips(questionId, trimmed, bookId ?? undefined);
        }
        if (bookId !== getActiveBookId()) return;
        // Keep the review route mounted and preserve its current question/answer state.
        set((state) => ({
          localTips: { ...state.localTips, [questionId]: trimmed },
          questions: state.questions.map((q) => q.id === questionId ? { ...q, tips: trimmed } : q),
        }));
      },
      getEffectiveTips: (questionId) => {
        const state = get();
        const local = state.localTips[questionId];
        if (local !== undefined) {
          return local;
        }
        const question = state.questions.find((q) => q.id === questionId);
        return question?.tips ?? "";
      },
      setSelectedChapter: (selectedChapter) =>
        set({ selectedChapter, selectedSection: "all" }),
      setSelectedSection: (selectedSection) => set({ selectedSection }),
      setUncertainFilter: (uncertainFilter) => set({ uncertainFilter }),
      setSearchTerm: (searchTerm) => set({ searchTerm }),
      resetFilters: () => set(initialFilters),
    }),
    {
      name: "mathloop-question-ui-v2",
      partialize: (state) => ({
        selectedChapter: state.selectedChapter,
        selectedSection: state.selectedSection,
        uncertainFilter: state.uncertainFilter,
        searchTerm: state.searchTerm,
        localTips: state.localTips,
      }),
    },
  ),
);
