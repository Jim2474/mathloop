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

export type ReviewQueueKind = "due" | "new";

export type ReviewQueueItem = {
  questionId: string;
  kind: ReviewQueueKind;
  due: string;
};
