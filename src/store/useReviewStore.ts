import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildFingerprintMap, getLibrarySyncPreview } from "../services/librarySyncService";
import { REVIEW_STORAGE_KEY, normalizeSettings } from "../services/backupService";
import type { Question } from "../types/question";
import type {
  ReviewCardRecord,
  ReviewCleanupResult,
  ReviewLog,
  ReviewMistakeRecord,
  ReviewQuestionFingerprint,
  ReviewRating,
  ReviewSettings,
  ReviewSyncResult,
} from "../types/review";
import {
  createInitialReviewCard,
  defaultReviewSettings,
  rateReviewCard,
} from "../services/fsrsService";

type ReviewState = {
  cards: Record<string, ReviewCardRecord>;
  reviewLogs: ReviewLog[];
  mistakeRecords: Record<string, ReviewMistakeRecord>;
  questionFingerprints: Record<string, ReviewQuestionFingerprint>;
  lastSyncResult: ReviewSyncResult | null;
  settings: ReviewSettings;
  initializeCards: (questions: Question[]) => void;
  syncQuestionLibrary: (questions: Question[]) => ReviewSyncResult;
  cleanupOrphanReviewData: (questions: Question[]) => ReviewCleanupResult;
  rateQuestion: (questionId: string, rating: ReviewRating, reviewedAt?: Date) => ReviewLog;
  getQuestionLogs: (questionId: string) => ReviewLog[];
  markMistakeQuestion: (input: {
    question: Question;
    reviewAt: Date;
    sourcePage: string;
    sourceQuestionNo: string;
    note?: string;
  }) => ReviewMistakeRecord;
  removeMistakeQuestion: (questionId: string) => void;
  updateSettings: (settings: Partial<ReviewSettings>) => void;
  importReviewState: (state: {
    cards: Record<string, ReviewCardRecord>;
    reviewLogs: ReviewLog[];
    settings: ReviewSettings;
    mistakeRecords?: Record<string, ReviewMistakeRecord>;
    questionFingerprints?: Record<string, ReviewQuestionFingerprint>;
    lastSyncResult?: ReviewSyncResult | null;
  }) => void;
  resetReviewState: (questions: Question[]) => void;
};

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      cards: {},
      reviewLogs: [],
      mistakeRecords: {},
      questionFingerprints: {},
      lastSyncResult: null,
      settings: defaultReviewSettings,
      initializeCards: (questions) => {
        get().syncQuestionLibrary(questions);
      },
      syncQuestionLibrary: (questions) => {
        const timestamp = new Date().toISOString();
        const state = get();
        const preview = getLibrarySyncPreview({
          questions,
          cards: state.cards,
          reviewLogs: state.reviewLogs,
          questionFingerprints: state.questionFingerprints ?? {},
        });
        const result: ReviewSyncResult = {
          syncedAt: timestamp,
          initializedCards: preview.newQuestionCount,
          changedFingerprints: preview.changedQuestionCount,
          orphanCards: preview.orphanCardCount,
          totalCards: Object.keys(state.cards).length + preview.newQuestionCount,
        };

        set((state) => {
          const nextCards = { ...state.cards };
          const now = new Date(timestamp);

          for (const question of questions) {
            if (!nextCards[question.id]) {
              nextCards[question.id] = createInitialReviewCard(question.id, question, now);
            }
          }

          return {
            cards: nextCards,
            questionFingerprints: {
              ...(state.questionFingerprints ?? {}),
              ...buildFingerprintMap(questions),
            },
            lastSyncResult: result,
          };
        });

        return result;
      },
      cleanupOrphanReviewData: (questions) => {
        const validQuestionIds = new Set(questions.map((question) => question.id));
        const state = get();
        const nextCards = Object.fromEntries(
          Object.entries(state.cards).filter(([questionId]) => validQuestionIds.has(questionId)),
        );
        const nextReviewLogs = state.reviewLogs.filter((log) =>
          validQuestionIds.has(log.questionId),
        );
        const nextMistakeRecords = Object.fromEntries(
          Object.entries(state.mistakeRecords).filter(([questionId]) =>
            validQuestionIds.has(questionId),
          ),
        );
        const nextFingerprints = Object.fromEntries(
          Object.entries(state.questionFingerprints ?? {}).filter(([questionId]) =>
            validQuestionIds.has(questionId),
          ),
        );
        const result: ReviewCleanupResult = {
          removedCards: Object.keys(state.cards).length - Object.keys(nextCards).length,
          removedReviewLogs: state.reviewLogs.length - nextReviewLogs.length,
          removedMistakeRecords:
            Object.keys(state.mistakeRecords).length - Object.keys(nextMistakeRecords).length,
          removedFingerprints:
            Object.keys(state.questionFingerprints ?? {}).length - Object.keys(nextFingerprints).length,
        };

        set({
          cards: nextCards,
          reviewLogs: nextReviewLogs,
          mistakeRecords: nextMistakeRecords,
          questionFingerprints: nextFingerprints,
        });

        return result;
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

        set((currentState) => {
          const currentMistake = currentState.mistakeRecords[questionId];
          const mistakeRecords = currentMistake
            ? {
                ...currentState.mistakeRecords,
                [questionId]: {
                  ...currentMistake,
                  reviewAt: nextCard.card.due,
                },
              }
            : currentState.mistakeRecords;

          return {
            cards: {
              ...currentState.cards,
              [questionId]: nextCard,
            },
            reviewLogs: [...currentState.reviewLogs, log],
            mistakeRecords,
          };
        });

        return log;
      },
      getQuestionLogs: (questionId) =>
        get()
          .reviewLogs.filter((log) => log.questionId === questionId)
          .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt)),
      markMistakeQuestion: ({ question, reviewAt, sourcePage, sourceQuestionNo, note }) => {
        const timestamp = new Date().toISOString();
        const reviewAtIso = reviewAt.toISOString();
        const record: ReviewMistakeRecord = {
          questionId: question.id,
          markedAt: timestamp,
          reviewAt: reviewAtIso,
          sourcePage,
          sourceQuestionNo,
          note: note?.trim() ?? "",
          active: true,
        };

        set((state) => {
          const currentCard =
            state.cards[question.id] ?? createInitialReviewCard(question.id, question, reviewAt);
          return {
            cards: {
              ...state.cards,
              [question.id]: {
                ...currentCard,
                card: {
                  ...currentCard.card,
                  due: reviewAtIso,
                },
                updatedAt: timestamp,
              },
            },
            mistakeRecords: {
              ...state.mistakeRecords,
              [question.id]: record,
            },
          };
        });

        return record;
      },
      removeMistakeQuestion: (questionId) =>
        set((state) => {
          const current = state.mistakeRecords[questionId];
          if (!current) {
            return state;
          }
          return {
            mistakeRecords: {
              ...state.mistakeRecords,
              [questionId]: {
                ...current,
                active: false,
              },
            },
          };
        }),
      updateSettings: (settings) =>
        set((state) => ({
          settings: normalizeSettings({
            ...state.settings,
            ...settings,
          }),
        })),
      importReviewState: (reviewState) =>
        set({
          cards: reviewState.cards,
          reviewLogs: reviewState.reviewLogs,
          settings: normalizeSettings(reviewState.settings),
          mistakeRecords: reviewState.mistakeRecords ?? {},
          questionFingerprints: reviewState.questionFingerprints ?? {},
          lastSyncResult: reviewState.lastSyncResult ?? null,
        }),
      resetReviewState: (questions) => {
        localStorage.removeItem(REVIEW_STORAGE_KEY);
        const now = new Date();
        const cards = Object.fromEntries(
          questions.map((question) => [
            question.id,
            createInitialReviewCard(question.id, question, now),
          ]),
        );
        set({
          cards,
          reviewLogs: [],
          mistakeRecords: {},
          questionFingerprints: buildFingerprintMap(questions),
          lastSyncResult: {
            syncedAt: now.toISOString(),
            initializedCards: questions.length,
            changedFingerprints: 0,
            orphanCards: 0,
            totalCards: questions.length,
          },
          settings: defaultReviewSettings,
        });
      },
    }),
    {
      name: REVIEW_STORAGE_KEY,
      partialize: (state) => ({
        cards: state.cards,
        reviewLogs: state.reviewLogs,
        mistakeRecords: state.mistakeRecords,
        questionFingerprints: state.questionFingerprints,
        lastSyncResult: state.lastSyncResult,
        settings: state.settings,
      }),
    },
  ),
);
