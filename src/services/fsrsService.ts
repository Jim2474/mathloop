import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type CardInput,
  type Grade,
} from "ts-fsrs";
import type { Question } from "../types/question";
import type {
  ReviewCardRecord,
  ReviewLog,
  ReviewRating,
  ReviewSettings,
  SerializedFsrsCard,
} from "../types/review";
import { diffCalendarDays, parseDate } from "../utils/date";
import { ratingLabels, stateLabel } from "../utils/reviewLabels";

const ratingMap: Record<ReviewRating, Grade> = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  Easy: Rating.Easy,
};

export const defaultReviewSettings: ReviewSettings = {
  maxDailyReviews: 10,
  maxNewPerDay: 10,
  desiredRetention: 0.9,
};

export function createInitialReviewCard(
  questionId: string,
  question?: Question,
  now = new Date(),
): ReviewCardRecord {
  const seededCard = question ? createSeededCardFromQuestion(question) : null;
  const card = seededCard ?? serializeCard(createEmptyCard(now));
  const timestamp = now.toISOString();

  return {
    questionId,
    card,
    createdAt: timestamp,
    updatedAt: timestamp,
    seededFromJson: Boolean(seededCard),
  };
}

export function rateReviewCard(
  questionId: string,
  currentCard: ReviewCardRecord,
  rating: ReviewRating,
  reviewedAt: Date,
  settings: ReviewSettings,
): { nextCard: ReviewCardRecord; log: ReviewLog } {
  const scheduler = fsrs({ request_retention: settings.desiredRetention });
  const cardBefore = deserializeCard(currentCard.card);
  const result = scheduler.next(cardBefore, reviewedAt, ratingMap[rating]);
  const timestamp = reviewedAt.toISOString();

  const nextCard: ReviewCardRecord = {
    ...currentCard,
    questionId,
    card: serializeCard(result.card),
    updatedAt: timestamp,
  };

  const log: ReviewLog = {
    id: createReviewLogId(),
    questionId,
    rating,
    ratingLabel: ratingLabels[rating],
    reviewedAt: timestamp,
    previousDue: currentCard.card.due,
    nextDue: result.card.due.toISOString(),
    stateBefore: stateLabel(cardBefore.state),
    stateAfter: stateLabel(result.card.state),
    elapsedDays: result.log.elapsed_days,
    scheduledDays: result.log.scheduled_days,
  };

  return { nextCard, log };
}

export function serializeCard(card: Card): SerializedFsrsCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.toISOString(),
  };
}

export function deserializeCard(card: SerializedFsrsCard): CardInput {
  return {
    ...card,
    due: card.due,
    last_review: card.last_review ?? null,
  };
}

function createSeededCardFromQuestion(question: Question): SerializedFsrsCard | null {
  const fsrsState = question.fsrs;
  const due = parseDate(fsrsState.nextReview);
  const lastReview = parseDate(fsrsState.lastReview);
  const hasValidMemory =
    typeof fsrsState.difficulty === "number" &&
    Number.isFinite(fsrsState.difficulty) &&
    fsrsState.difficulty > 0 &&
    typeof fsrsState.stability === "number" &&
    Number.isFinite(fsrsState.stability) &&
    fsrsState.stability > 0;

  if (!due || !hasValidMemory || fsrsState.reviewCount <= 0) {
    return null;
  }

  return {
    due: due.toISOString(),
    stability: fsrsState.stability as number,
    difficulty: fsrsState.difficulty as number,
    elapsed_days: lastReview ? diffCalendarDays(lastReview, due) : 0,
    scheduled_days: lastReview ? diffCalendarDays(lastReview, due) : 0,
    learning_steps: 0,
    reps: fsrsState.reviewCount,
    lapses: fsrsState.lapseCount,
    state: mapOpenClawState(fsrsState.state),
    last_review: lastReview?.toISOString(),
  };
}

function mapOpenClawState(value: string): State {
  const normalized = value.toLowerCase();
  if (normalized === "learning") {
    return State.Learning;
  }
  if (normalized === "review") {
    return State.Review;
  }
  if (normalized === "relearning") {
    return State.Relearning;
  }
  return State.New;
}

function createReviewLogId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
