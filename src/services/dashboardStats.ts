import type { Question } from "../types/question";
import type { ReviewCardRecord, ReviewLog } from "../types/review";
import { addDays, isSameLocalDay, parseDate, startOfLocalDay } from "../utils/date";
import { isNewQuestion } from "./reviewQueue";

export function getReviewDashboardStats(
  questions: Question[],
  cards: Record<string, ReviewCardRecord>,
  reviewLogs: ReviewLog[],
  now = new Date(),
) {
  const loggedQuestionIds = new Set(reviewLogs.map((log) => log.questionId));
  const completedTodayIds = new Set(
    reviewLogs
      .filter((log) => isSameLocalDay(log.reviewedAt, now))
      .map((log) => log.questionId),
  );
  const todayStart = startOfLocalDay(now);
  const futureLimit = addDays(now, 7);

  let dueToday = 0;
  let overdue = 0;
  let futureSevenDays = 0;

  const chapterStats = new Map<
    string,
    { chapter: string; total: number; reviewed: number; due: number }
  >();

  for (const question of questions) {
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
    const completedToday = completedTodayIds.has(question.id);

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
    dueToday,
    completedToday: completedTodayIds.size,
    overdue,
    futureSevenDays,
    reviewedTotal: Array.from(
      new Set([
        ...reviewLogs.map((log) => log.questionId),
        ...Object.values(cards)
          .filter((card) => card.card.reps > 0)
          .map((card) => card.questionId),
      ]),
    ).length,
    chapterReviewStats: Array.from(chapterStats.values()),
  };
}
