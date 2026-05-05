import type { Question } from "../types/question";
import type {
  ReviewCardRecord,
  ReviewLog,
  ReviewQueueItem,
  ReviewSettings,
} from "../types/review";
import { isSameLocalDay, parseDate } from "../utils/date";

type ReviewQueueParams = {
  questions: Question[];
  cards: Record<string, ReviewCardRecord>;
  reviewLogs: ReviewLog[];
  settings: ReviewSettings;
  now?: Date;
};

export function buildTodayReviewQueue({
  questions,
  cards,
  reviewLogs,
  settings,
  now = new Date(),
}: ReviewQueueParams): ReviewQueueItem[] {
  const reviewedToday = new Set(
    reviewLogs
      .filter((log) => isSameLocalDay(log.reviewedAt, now))
      .map((log) => log.questionId),
  );
  const loggedQuestionIds = new Set(reviewLogs.map((log) => log.questionId));

  if (reviewLogs.length === 0) {
    return questions
      .filter((question) => isNewQuestion(question.id, cards, loggedQuestionIds))
      .slice(0, settings.maxDailyReviews)
      .map((question) => ({
        questionId: question.id,
        kind: "new",
        due: cards[question.id]?.card.due ?? now.toISOString(),
      }));
  }

  const dueItems = questions
    .map((question) => ({ question, card: cards[question.id] }))
    .filter(({ question, card }) => {
      if (!card || reviewedToday.has(question.id) || isNewQuestion(question.id, cards, loggedQuestionIds)) {
        return false;
      }
      const due = parseDate(card.card.due);
      return Boolean(due && due <= now);
    })
    .sort((left, right) => left.card.card.due.localeCompare(right.card.card.due))
    .slice(0, settings.maxDailyReviews)
    .map<ReviewQueueItem>(({ question, card }) => ({
      questionId: question.id,
      kind: "due",
      due: card.card.due,
    }));

  const remainingSlots = Math.max(0, settings.maxDailyReviews - dueItems.length);
  const newLimit = Math.min(settings.maxNewPerDay, remainingSlots);
  const dueIds = new Set(dueItems.map((item) => item.questionId));
  const newItems = questions
    .filter((question) => !dueIds.has(question.id))
    .filter((question) => isNewQuestion(question.id, cards, loggedQuestionIds))
    .slice(0, newLimit)
    .map<ReviewQueueItem>((question) => ({
      questionId: question.id,
      kind: "new",
      due: cards[question.id]?.card.due ?? now.toISOString(),
    }));

  return [...dueItems, ...newItems];
}

export function isQuestionCompletedToday(
  questionId: string,
  reviewLogs: ReviewLog[],
  now = new Date(),
): boolean {
  return reviewLogs.some(
    (log) => log.questionId === questionId && isSameLocalDay(log.reviewedAt, now),
  );
}

export function isNewQuestion(
  questionId: string,
  cards: Record<string, ReviewCardRecord>,
  loggedQuestionIds: Set<string>,
): boolean {
  const card = cards[questionId];
  return !loggedQuestionIds.has(questionId) && (!card || card.card.reps === 0);
}
