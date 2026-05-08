import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/common/EmptyState";
import QuestionImage from "../components/question/QuestionImage";
import { buildTodayReviewQueue } from "../services/reviewQueue";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";
import type { ReviewLog, ReviewQueueItem, ReviewRating } from "../types/review";
import { formatDateTime, parseDate } from "../utils/date";
import {
  getAnswerImagePaths,
  getQuestionImagePaths,
  getQuestionPageImagePath,
} from "../utils/questionImages";
import { ratingLabels } from "../utils/reviewLabels";

const ratings: ReviewRating[] = ["Again", "Hard", "Good", "Easy"];

export default function ReviewPage() {
  const { questions, isLoading, error } = useQuestionStore();
  const {
    cards,
    reviewLogs,
    mistakeRecords,
    settings,
    rateQuestion,
    updateSettings,
  } = useReviewStore();
  const [queue, setQueue] = useState<ReviewQueueItem[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionLogs, setSessionLogs] = useState<ReviewLog[]>([]);
  const [isBrowsingCompletedQueue, setIsBrowsingCompletedQueue] = useState(false);
  const upcomingMistakes = Object.values(mistakeRecords ?? {})
    .filter((record) => record.active)
    .map((record) => {
      const question = questions.find((item) => item.id === record.questionId);
      const dueValue = cards[record.questionId]?.card.due ?? record.reviewAt;
      const due = parseDate(dueValue);
      return { record, question, due };
    })
    .filter((item) => item.question && item.due && item.due > new Date())
    .sort((left, right) => (left.due?.getTime() ?? 0) - (right.due?.getTime() ?? 0));

  useEffect(() => {
    if (!isLoading && !error && questions.length > 0 && queue === null) {
      setQueue(buildTodayReviewQueue({ questions, cards, reviewLogs, mistakeRecords, settings }));
    }
  }, [cards, error, isLoading, mistakeRecords, questions, queue, reviewLogs, settings]);

  const activeQueue = queue ?? [];
  const currentItem = activeQueue[currentIndex];
  const sessionLogByQuestionId = new Map(sessionLogs.map((log) => [log.questionId, log]));
  const completedCount = activeQueue.filter((item) =>
    sessionLogByQuestionId.has(item.questionId),
  ).length;
  const isRoundComplete = activeQueue.length > 0 && completedCount === activeQueue.length;
  const currentLog = currentItem ? sessionLogByQuestionId.get(currentItem.questionId) : undefined;
  const currentQuestion = currentItem
    ? questions.find((question) => question.id === currentItem.questionId)
    : null;
  const questionImagePaths = currentQuestion ? getQuestionImagePaths(currentQuestion) : [];
  const answerImagePaths = currentQuestion ? getAnswerImagePaths(currentQuestion) : [];
  const fullPageImagePath = currentQuestion ? getQuestionPageImagePath(currentQuestion) : "";
  const dailyReviewOptions = getDailyReviewOptions(settings.maxDailyReviews);
  const isComplete =
    queue !== null &&
    (activeQueue.length === 0 || (isRoundComplete && !isBrowsingCompletedQueue));

  function handleRating(rating: ReviewRating) {
    if (!currentQuestion) {
      return;
    }
    if (sessionLogByQuestionId.has(currentQuestion.id)) {
      goToNextQuestion();
      return;
    }
    const log = rateQuestion(currentQuestion.id, rating);
    setSessionLogs((logs) => [...logs, log]);
    setShowAnswer(false);
    const nextIndex = findNextUnratedIndex(activeQueue, sessionLogByQuestionId, currentIndex);
    setCurrentIndex(nextIndex ?? activeQueue.length);
  }

  function goToQuestion(index: number) {
    const nextIndex = Math.max(0, Math.min(index, activeQueue.length - 1));
    const nextItem = activeQueue[nextIndex];
    setCurrentIndex(nextIndex);
    setShowAnswer(Boolean(nextItem && sessionLogByQuestionId.has(nextItem.questionId)));
  }

  function goToNextQuestion() {
    if (activeQueue.length === 0) {
      return;
    }
    goToQuestion(currentIndex + 1);
  }

  function handleBrowseCompletedQueue() {
    if (activeQueue.length === 0) {
      return;
    }
    setIsBrowsingCompletedQueue(true);
    setCurrentIndex(0);
    setShowAnswer(true);
  }

  function handleFinishBrowsingCompletedQueue() {
    setIsBrowsingCompletedQueue(false);
    setCurrentIndex(activeQueue.length);
    setShowAnswer(false);
  }

  function handleContinueNextRound() {
    const mergedReviewLogs = mergeReviewLogs(reviewLogs, sessionLogs);
    const nextQueue = buildTodayReviewQueue({
      questions,
      cards,
      reviewLogs: mergedReviewLogs,
      mistakeRecords,
      settings,
    });
    setQueue(nextQueue);
    setCurrentIndex(0);
    setShowAnswer(false);
    setSessionLogs([]);
    setIsBrowsingCompletedQueue(false);
  }

  function handleDailyLimitChange(value: number) {
    const nextLimit = Number.isFinite(value) ? value : settings.maxDailyReviews;
    updateSettings({
      maxDailyReviews: nextLimit,
      maxNewPerDay: nextLimit,
    });
    setQueue(buildTodayReviewQueue({
      questions,
      cards,
      reviewLogs,
      mistakeRecords,
      settings: {
        ...settings,
        maxDailyReviews: nextLimit,
        maxNewPerDay: nextLimit,
      },
    }));
    setCurrentIndex(0);
    setShowAnswer(false);
    setSessionLogs([]);
    setIsBrowsingCompletedQueue(false);
  }

  if (isLoading) {
    return <EmptyState title="正在读取题库" description="正在加载 /data/questions.json。" />;
  }

  if (error) {
    return <EmptyState title="题库读取失败" description={error} />;
  }

  if (questions.length === 0) {
    return <EmptyState title="暂无题目" description="请先放入 OpenClaw 导出的 questions.json。" />;
  }

  if (queue === null) {
    return <EmptyState title="正在生成今日队列" description="正在根据本地错题记录整理复习任务。" />;
  }

  if (isComplete) {
    const hasUpcomingMistakes = activeQueue.length === 0 && upcomingMistakes.length > 0;
    const nextMistake = upcomingMistakes[0];

    return (
      <section className="apple-glass rounded-[30px] p-8 md:p-12">
        <p className="apple-kicker">
          {hasUpcomingMistakes ? "已录入，等待复习时间" : activeQueue.length === 0 ? "暂无到期错题" : "今日复习完成"}
        </p>
        <h2 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-0.28px] md:text-5xl">
          {hasUpcomingMistakes
            ? "错题已经在计划里，还没到复习时间"
            : activeQueue.length === 0
              ? "现在没有需要复习的错题"
              : "收工，今天这组题已经处理完了"}
        </h2>
        {hasUpcomingMistakes && nextMistake.question ? (
          <div className="apple-soft-card mt-6 rounded-[22px] p-5">
            <p className="text-sm font-semibold text-ink">下一题</p>
            <p className="mt-2 font-mono text-sm font-semibold text-slateblue">
              {nextMistake.question.id}
            </p>
            <p className="mt-1 text-sm text-ink/65">
              {nextMistake.question.chapter} / {nextMistake.question.section} / {nextMistake.question.questionNo}
            </p>
            <p className="mt-3 text-sm font-semibold text-cinnabar">
              计划时间：{formatDateTime(nextMistake.due?.toISOString())}
            </p>
          </div>
        ) : null}
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {ratings.map((rating) => (
            <div key={rating} className="apple-soft-card rounded-[20px] p-4">
              <p className="text-xs font-semibold text-ink/50">{rating}</p>
              <p className="mt-1 text-sm text-ink/70">{ratingLabels[rating]}</p>
              <p className="mt-3 text-2xl font-semibold">
                {sessionLogs.filter((log) => log.rating === rating).length}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-ink/65">
          {hasUpcomingMistakes
            ? "到了计划时间后，这道题会自动出现在复习页。也可以回到错题录入页把时间改成“现在复习”。"
            : activeQueue.length === 0
            ? "可以在错题录入里按页码和题号添加新的复习任务。"
            : `本次完成 ${sessionLogs.length} 题。`}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {activeQueue.length > 0 ? (
            <>
              <button
                type="button"
                onClick={handleBrowseCompletedQueue}
                className="apple-pill px-5 py-2.5 text-sm font-semibold"
              >
                重新复习本轮
              </button>
              <button
                type="button"
                onClick={handleContinueNextRound}
                className="apple-ghost-pill px-5 py-2.5 text-sm font-semibold"
              >
                继续下一轮
              </button>
            </>
          ) : null}
          <Link
            to={activeQueue.length === 0 ? "/mistakes" : "/"}
            className="apple-ghost-pill inline-flex px-5 py-2.5 text-sm font-semibold"
          >
            {activeQueue.length === 0 ? "回到错题录入" : "返回 Dashboard"}
          </Link>
        </div>
      </section>
    );
  }

  if (!currentQuestion) {
    return <EmptyState title="队列题目不存在" description="请刷新页面重新生成今日复习队列。" />;
  }

  return (
    <div className="space-y-6">
      <section className="apple-glass rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="apple-kicker">
              {isBrowsingCompletedQueue
                ? "本轮回看"
                : currentItem.kind === "new"
                  ? "首次错题复习"
                  : "到期错题复习"}
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.28px] md:text-5xl">
              印刷页 {currentQuestion.printedPageNumber || "未标注"} · 第 {currentQuestion.questionNo} 题
            </h2>
            <p className="mt-3 text-sm text-ink/58">
              {currentQuestion.chapter} / {currentQuestion.section}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="apple-soft-card flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-ink/64">
              <span>今日题量</span>
              <select
                value={settings.maxDailyReviews}
                onChange={(event) => handleDailyLimitChange(Number(event.target.value))}
                className="bg-transparent text-sm font-semibold text-slateblue outline-none"
              >
                {dailyReviewOptions.map((value) => (
                  <option key={value} value={value}>
                    {value} 题
                  </option>
                ))}
              </select>
            </label>
            <div className="apple-soft-card w-fit rounded-full px-4 py-2 text-sm font-semibold text-ink/64">
              {Math.min(currentIndex + 1, activeQueue.length)} / {activeQueue.length} · 已评分 {completedCount}
            </div>
          </div>
        </div>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/54 shadow-[inset_0_1px_2px_rgba(29,29,31,0.06)]">
          <div
            className="h-full rounded-full bg-slateblue/78 transition-all"
            style={{ width: `${(completedCount / activeQueue.length) * 100}%` }}
          />
        </div>
      </section>

      <section className="apple-tile rounded-[26px] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">今日题目</h3>
            <p className="mt-1 text-sm text-ink/56">
              可以先逐题浏览，再回到任意一题查看答案和评分。
            </p>
          </div>
          {isBrowsingCompletedQueue ? (
            <button
              type="button"
              onClick={handleFinishBrowsingCompletedQueue}
              className="apple-ghost-pill w-fit px-4 py-2 text-sm font-semibold"
            >
              结束回看
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {activeQueue.map((item, index) => {
            const question = questions.find((entry) => entry.id === item.questionId);
            const done = sessionLogByQuestionId.has(item.questionId);
            const current = index === currentIndex;

            return (
              <button
                key={`${item.questionId}-${index}`}
                type="button"
                onClick={() => goToQuestion(index)}
                className={[
                  "rounded-[18px] border px-3 py-3 text-left text-sm transition",
                  current
                    ? "border-slateblue/35 bg-white/68 shadow-[0_10px_26px_rgba(0,102,204,0.08)]"
                    : "border-white/46 bg-white/34 hover:bg-white/52",
                ].join(" ")}
              >
                <span className="block text-xs font-semibold text-ink/45">
                  {done ? "已评分" : "待复习"}
                </span>
                <span className="mt-1 block truncate font-semibold text-ink">
                  {question?.questionNo ?? item.questionId}
                </span>
                <span className="mt-1 block truncate text-xs text-ink/52">
                  {question?.chapter ?? "该题目已不在当前题库中"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="apple-tile rounded-[26px] p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">题目截图</h3>
          <span className="rounded-full bg-white/48 px-3 py-1 text-xs font-semibold text-ink/52">
            Question
          </span>
        </div>
        {questionImagePaths.length > 0 ? (
          questionImagePaths.map((path, index) => (
            <QuestionImage
              key={path}
              path={path}
              alt={`${currentQuestion.questionNo} 题目 ${index + 1}`}
              fullPagePath={fullPageImagePath}
            />
          ))
        ) : (
          <EmptyState title="暂无题目图片" description="questionImage 和 questionImages 都为空。" />
        )}
      </section>

      <section className="apple-tile rounded-[26px] p-6">
        {!showAnswer ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-semibold">准备好再看答案</h3>
              <p className="mt-2 text-sm leading-6 text-ink/56">
                可以用上方今日题目卡片切换题目，确认后再查看答案并评分。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => goToQuestion(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="apple-ghost-pill w-fit px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                上一题
              </button>
              <button
                type="button"
                onClick={() => goToQuestion(currentIndex + 1)}
                disabled={currentIndex >= activeQueue.length - 1}
                className="apple-ghost-pill w-fit px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
              >
                下一题
              </button>
              <button
                type="button"
                onClick={() => setShowAnswer(true)}
                className="apple-pill w-fit px-5 py-2.5 text-sm font-semibold"
              >
                查看答案
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold">答案区域</h3>
                <span className="rounded-full bg-white/48 px-3 py-1 text-xs font-semibold text-ink/52">
                  Answer
                </span>
              </div>
              {answerImagePaths.length > 0 ? (
                answerImagePaths.map((path, index) => (
                  <QuestionImage
                    key={path}
                    path={path}
                    alt={`${currentQuestion.questionNo} 答案 ${index + 1}`}
                  />
                ))
              ) : (
                <EmptyState title="暂无答案图片" />
              )}
            </div>

            {currentLog ? (
              <div className="apple-soft-card rounded-[20px] p-4">
                <p className="text-sm font-semibold text-ink">
                  已评分：{currentLog.rating}
                </p>
                <p className="mt-1 text-sm text-ink/58">{currentLog.ratingLabel}</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-4">
                {ratings.map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => handleRating(rating)}
                    className="apple-soft-card rounded-[20px] px-4 py-4 text-left transition hover:bg-white/60"
                  >
                    <span className="block text-base font-semibold">{rating}</span>
                    <span className="mt-1 block text-sm text-ink/60">{ratingLabels[rating]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function findNextUnratedIndex(
  queue: ReviewQueueItem[],
  completed: Map<string, ReviewLog>,
  currentIndex: number,
): number | null {
  for (let index = currentIndex + 1; index < queue.length; index += 1) {
    if (!completed.has(queue[index].questionId)) {
      return index;
    }
  }
  for (let index = 0; index < currentIndex; index += 1) {
    if (!completed.has(queue[index].questionId)) {
      return index;
    }
  }
  return null;
}

function mergeReviewLogs(reviewLogs: ReviewLog[], sessionLogs: ReviewLog[]): ReviewLog[] {
  const byId = new Map(reviewLogs.map((log) => [log.id, log]));
  for (const log of sessionLogs) {
    byId.set(log.id, log);
  }
  return Array.from(byId.values());
}

function getDailyReviewOptions(currentValue: number): number[] {
  return Array.from(new Set([5, 10, 15, 20, 30, currentValue]))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
}
