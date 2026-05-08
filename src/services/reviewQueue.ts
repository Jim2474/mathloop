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

type QueueCandidate = {
  question: Question;
  card: ReviewCardRecord;
  kind: ReviewQueueItem["kind"];
  due: string;
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
  const dailyLimit = settings.maxDailyReviews;
  const dueCandidates = mistakeQuestions
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
    .map<QueueCandidate>(({ question, card }) => ({
      question,
      card,
      kind: isNewQuestion(question.id, cards, loggedQuestionIds) ? "new" : "due",
      due: card.card.due,
    }));
  const newCandidates = dueCandidates.filter((item) => item.kind === "new");
  const reviewCandidates = dueCandidates.filter((item) => item.kind === "due");
  const newQuestionLimit = Math.min(settings.maxNewPerDay, dailyLimit);
  const selected = [
    ...takeBalancedByChapter(newCandidates, questions, newQuestionLimit, now),
  ];
  const selectedIds = new Set(selected.map((item) => item.question.id));

  if (selected.length < dailyLimit) {
    selected.push(
      ...takeBalancedByChapter(
        reviewCandidates.filter((item) => !selectedIds.has(item.question.id)),
        questions,
        dailyLimit - selected.length,
        now,
      ),
    );
  }

  return selected.map<ReviewQueueItem>(({ question, kind, due }) => ({
    questionId: question.id,
    kind,
    due,
  }));
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

function takeBalancedByChapter(
  candidates: QueueCandidate[],
  allQuestions: Question[],
  limit: number,
  now: Date,
): QueueCandidate[] {
  if (limit <= 0 || candidates.length === 0) {
    return [];
  }

  const chapterOrder = new Map<string, number>();
  for (const question of allQuestions) {
    if (!chapterOrder.has(question.chapter)) {
      chapterOrder.set(question.chapter, chapterOrder.size);
    }
  }

  const groups = new Map<string, QueueCandidate[]>();
  for (const candidate of candidates) {
    const chapter = candidate.question.chapter || "未标注章节";
    groups.set(chapter, [...(groups.get(chapter) ?? []), candidate]);
  }

  const dayKey = getLocalDateKey(now);
  const orderedGroups = rotateByDay(
    Array.from(groups.entries())
    .sort(
      ([leftChapter], [rightChapter]) =>
        (chapterOrder.get(leftChapter) ?? Number.MAX_SAFE_INTEGER) -
        (chapterOrder.get(rightChapter) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(([, items]) =>
      items.sort((left, right) => {
        const leftScore = stableDailyScore(dayKey, left.question.id);
        const rightScore = stableDailyScore(dayKey, right.question.id);
        if (leftScore !== rightScore) {
          return leftScore - rightScore;
        }
        return left.due.localeCompare(right.due) || left.question.id.localeCompare(right.question.id);
      }),
    ),
    dayKey,
  );

  const result: QueueCandidate[] = [];
  while (result.length < limit && orderedGroups.some((items) => items.length > 0)) {
    for (const group of orderedGroups) {
      const next = group.shift();
      if (next) {
        result.push(next);
      }
      if (result.length >= limit) {
        break;
      }
    }
  }

  return result;
}

function rotateByDay(groups: QueueCandidate[][], dayKey: string): QueueCandidate[][] {
  if (groups.length <= 1) {
    return groups;
  }
  const offset = stableDailyScore(dayKey, "chapter-rotation") % groups.length;
  return [...groups.slice(offset), ...groups.slice(0, offset)];
}

function stableDailyScore(dayKey: string, value: string): number {
  let hash = 2166136261;
  const input = `${dayKey}:${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
