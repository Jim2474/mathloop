import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Question } from "../types/question";
import type { ReviewCardRecord, ReviewLog, ReviewRating, ReviewSettings } from "../types/review";
import {
  createInitialReviewCard,
  defaultReviewSettings,
  rateReviewCard,
} from "../services/fsrsService";

type ReviewState = {
  cards: Record<string, ReviewCardRecord>;
  reviewLogs: ReviewLog[];
  settings: ReviewSettings;
  initializeCards: (questions: Question[]) => void;
  rateQuestion: (questionId: string, rating: ReviewRating, reviewedAt?: Date) => ReviewLog;
  getQuestionLogs: (questionId: string) => ReviewLog[];
};

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      cards: {},
      reviewLogs: [],
      settings: defaultReviewSettings,
      initializeCards: (questions) => {
        set((state) => {
          const nextCards = { ...state.cards };
          const now = new Date();
          let changed = false;

          for (const question of questions) {
            if (!nextCards[question.id]) {
              nextCards[question.id] = createInitialReviewCard(question.id, question, now);
              changed = true;
            }
          }

          return changed ? { cards: nextCards } : state;
        });
      },
      rateQuestion: (questionId, rating, reviewedAt = new Date()) => {
        const state = get();
        const currentCard =
          state.cards[questionId] ?? createInitialReviewCard(questionId, undefined, reviewedAt);
        const { nextCard, log } = rateReviewCard(
          questionId,
          currentCard,
          rating,
          reviewedAt,
          state.settings,
        );

        set((currentState) => ({
          cards: {
            ...currentState.cards,
            [questionId]: nextCard,
          },
          reviewLogs: [...currentState.reviewLogs, log],
        }));

        return log;
      },
      getQuestionLogs: (questionId) =>
        get()
          .reviewLogs.filter((log) => log.questionId === questionId)
          .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt)),
    }),
    {
      name: "openclaw-review-state",
      partialize: (state) => ({
        cards: state.cards,
        reviewLogs: state.reviewLogs,
        settings: state.settings,
      }),
    },
  ),
);
