import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isTauriRuntime, updateDesktopQuestionTips } from "../services/desktopBridge";
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

