import type { State } from "ts-fsrs";

export type ReviewRating = "Again" | "Hard" | "Good" | "Easy";

export type SerializedFsrsCard = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: string;
};

export type ReviewCardRecord = {
  questionId: string;
  card: SerializedFsrsCard;
  createdAt: string;
  updatedAt: string;
  seededFromJson: boolean;
};

export type ReviewLog = {
  id: string;
  questionId: string;
  rating: ReviewRating;
  ratingLabel: string;
  reviewedAt: string;
  previousDue: string;
  nextDue: string;
  stateBefore: string;
  stateAfter: string;
  elapsedDays: number;
  scheduledDays: number;
};

export type ReviewSettings = {
  maxDailyReviews: number;
  maxNewPerDay: number;
  desiredRetention: number;
};

export type DailyReviewSession = {
  dateKey: string;
  roundId: string;
  queue: ReviewQueueItem[];
  createdAt: string;
  completedAt?: string;
};

export type ReviewMistakeRecord = {
  questionId: string;
  markedAt: string;
  reviewAt: string;
  sourcePage: string;
  sourceQuestionNo: string;
  note: string;
  active: boolean;
};

export type ReplaceMistakeQuestionInput = {
  fromQuestionId: string;
  toQuestionId: string;
  sourcePage: string;
  sourceQuestionNo: string;
};

export type ReviewQuestionFingerprint = {
  id: string;
  chapter: string;
  section: string;
  questionNo: string;
  pageRangeText: string;
  questionImage: string;
  answerImage: string;
  answerImages: string[];
  metaUncertain: boolean;
  answerMetaUncertain: boolean | null;
};

export type ReviewSyncResult = {
  syncedAt: string;
  initializedCards: number;
  changedFingerprints: number;
  orphanCards: number;
  totalCards: number;
};

export type ReviewCleanupResult = {
  removedCards: number;
  removedReviewLogs: number;
  removedMistakeRecords: number;
  removedFingerprints: number;
};

export type ReviewBackupData = {
  version: number;
  bookId?: string | null;
  exportedAt: string;
  cards: Record<string, ReviewCardRecord>;
  reviewLogs: ReviewLog[];
  settings: ReviewSettings;
  dailyReviewSession?: DailyReviewSession | null;
  mistakeRecords?: Record<string, ReviewMistakeRecord>;
  questionFingerprints?: Record<string, ReviewQuestionFingerprint>;
  lastSyncResult?: ReviewSyncResult | null;
};

export type ReviewQueueKind = "due" | "new";

export type ReviewQueueItem = {
  questionId: string;
  kind: ReviewQueueKind;
  due: string;
};
