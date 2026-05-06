import type { Question } from "../types/question";
import type { ReviewCardRecord, ReviewLog, ReviewMistakeRecord } from "../types/review";
import { addDays, isSameLocalDay, parseDate, startOfLocalDay } from "../utils/date";
import { isNewQuestion } from "./reviewQueue";

export function getReviewDashboardStats(
  questions: Question[],
  cards: Record<string, ReviewCardRecord>,
  reviewLogs: ReviewLog[],
  mistakeRecords: Record<string, ReviewMistakeRecord>,
  now = new Date(),
) {
  const loggedQuestionIds = new Set(reviewLogs.map((log) => log.questionId));
  const todayStart = startOfLocalDay(now);
  const futureLimit = addDays(now, 7);

  let dueToday = 0;
  let overdue = 0;
  let futureSevenDays = 0;
  const activeMistakeIds = new Set(
    Object.values(mistakeRecords ?? {})
      .filter((record) => record.active)
      .map((record) => record.questionId),
  );

  const chapterStats = new Map<
    string,
    { chapter: string; total: number; reviewed: number; due: number }
  >();

  for (const question of questions) {
    if (!activeMistakeIds.has(question.id)) {
      continue;
    }
    const mistake = mistakeRecords?.[question.id];

    const chapter = question.chapter || "未标注章节";
    const currentChapter = chapterStats.get(chapter) ?? {
      chapter,
      total: 0,
      reviewed: 0,
      due: 0,
    };
    currentChapter.total += 1;

    const card = cards[question.id];
    const isReviewed = Boolean(card && card.card.reps > 0) || loggedQuestionIds.has(question.id);
    if (isReviewed) {
      currentChapter.reviewed += 1;
    }

    const due = card ? parseDate(card.card.due) : null;
    const isNew = isNewQuestion(question.id, cards, loggedQuestionIds);
    const completedToday = wasReviewedAfterMistakeMarked(question.id, mistake, reviewLogs, now);

    if (due && !completedToday && !isNew && due <= now) {
      dueToday += 1;
      currentChapter.due += 1;
      if (due < todayStart) {
        overdue += 1;
      }
    }

    if (due && !isNew && due > now && due <= futureLimit) {
      futureSevenDays += 1;
    }

    chapterStats.set(chapter, currentChapter);
  }

  return {
    mistakeTotal: activeMistakeIds.size,
    dueToday,
    completedToday: Object.values(mistakeRecords ?? {}).filter(
      (record) =>
        record.active && wasReviewedAfterMistakeMarked(record.questionId, record, reviewLogs, now),
    ).length,
    overdue,
    futureSevenDays,
    reviewedTotal: Array.from(
      new Set([
        ...reviewLogs.map((log) => log.questionId),
        ...Object.values(cards)
          .filter((card) => card.card.reps > 0)
          .map((card) => card.questionId),
      ]),
    ).filter((questionId) => activeMistakeIds.has(questionId)).length,
    chapterReviewStats: Array.from(chapterStats.values()),
  };
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
