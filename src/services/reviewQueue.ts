import type { Question } from "../types/question";
import type {
  ReviewCardRecord,
  ReviewLog,
  ReviewMistakeRecord,
  ReviewQueueItem,
  ReviewSettings,
} from "../types/review";
import { isSameLocalDay, parseDate } from "../utils/date";

type ReviewQueueParams = {
  questions: Question[];
  cards: Record<string, ReviewCardRecord>;
  reviewLogs: ReviewLog[];
  mistakeRecords: Record<string, ReviewMistakeRecord>;
  settings: ReviewSettings;
  now?: Date;
};

export function buildTodayReviewQueue({
  questions,
  cards,
  reviewLogs,
  mistakeRecords,
  settings,
  now = new Date(),
}: ReviewQueueParams): ReviewQueueItem[] {
  const loggedQuestionIds = new Set(reviewLogs.map((log) => log.questionId));
  const mistakeQuestionIds = new Set(
    Object.values(mistakeRecords ?? {})
      .filter((record) => record.active)
      .map((record) => record.questionId),
  );
  const mistakeQuestions = questions.filter((question) => mistakeQuestionIds.has(question.id));

  const dueItems = mistakeQuestions
    .map((question) => ({
      question,
      card: cards[question.id],
    }))
    .filter(({ question, card }) => {
      if (!card) {
        return false;
      }
      const mistake = mistakeRecords?.[question.id];
      if (wasReviewedAfterMistakeMarked(question.id, mistake, reviewLogs, now)) {
        return false;
      }
      const due = parseDate(card.card.due);
      return Boolean(due && due <= now);
    })
    .sort((left, right) => left.card.card.due.localeCompare(right.card.card.due))
    .slice(0, settings.maxDailyReviews)
    .map<ReviewQueueItem>(({ question, card }) => ({
      questionId: question.id,
      kind: isNewQuestion(question.id, cards, loggedQuestionIds) ? "new" : "due",
      due: card.card.due,
    }));
  return dueItems;
}

function wasReviewedAfterMistakeMarked(
  questionId: string,
  mistake: ReviewMistakeRecord | undefined,
  reviewLogs: ReviewLog[],
  now: Date,
): boolean {
  if (!mistake) {
    return false;
  }
  const markedAt = parseDate(mistake.markedAt);
  return reviewLogs.some((log) => {
    const reviewedAt = parseDate(log.reviewedAt);
    return (
      log.questionId === questionId &&
      isSameLocalDay(log.reviewedAt, now) &&
      Boolean(markedAt && reviewedAt && reviewedAt >= markedAt)
    );
  });
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
