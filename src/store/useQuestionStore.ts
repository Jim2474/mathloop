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
      error: null,
      loadQuestions: async () => {
        set({ isLoading: true, error: null });
        try {
          const questions = await loadOpenClawQuestions();

          // In Tauri mode, merge SQLite-backed tips (for custom/screenshot books)
          // into localTips so getEffectiveTips() works without an async call.
          // Tips stored in questions.json are already part of each Question object
          // and handled by the `question?.tips` fallback in getEffectiveTips.
          if (isTauriRuntime()) {
            const bookId = getActiveBookId();
            if (bookId) {
              try {
                const sqliteTips = await loadDesktopQuestionTipsMap(bookId);
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

          set({ questions, isLoading: false, error: null });
        } catch (error) {
          const message = error instanceof Error ? error.message : "读取题库失败。";
          set({ questions: [], isLoading: false, error: message });
        }
      },
      saveQuestionTips: async (questionId, tips) => {
        if (isTauriRuntime()) {
          const bookId = getActiveBookId();
          await updateDesktopQuestionTips(questionId, tips, bookId ?? undefined);

          // Update localTips immediately so the UI reflects the change without
          // waiting for a full question reload.  For standard books the tips field
          // is also embedded in questions.json, so we reload questions too.
          const trimmed = tips.trim();
          set((state) => {
            const next = { ...state.localTips };
            if (trimmed) {
              next[questionId] = trimmed;
            } else {
              delete next[questionId];
            }
            return { localTips: next };
          });

          // Reload questions to pick up tips embedded in questions.json (standard books).
          // For custom books this is a no-op since their tips come from localTips above.
          const questions = await loadOpenClawQuestions();
          set({ questions, error: null });
        } else {
          const trimmed = tips.trim();
          set((state) => {
            const next = { ...state.localTips };
            if (trimmed) {
              next[questionId] = trimmed;
            } else {
              delete next[questionId];
            }
            return { localTips: next };
          });
        }
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

