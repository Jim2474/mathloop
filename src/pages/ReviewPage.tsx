import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/common/EmptyState";
import QuestionImage from "../components/question/QuestionImage";
import { isTauriRuntime } from "../services/desktopBridge";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";
import type { DailyReviewSession, ReviewLog, ReviewQueueItem, ReviewRating } from "../types/review";
import { formatDateTime, parseDate } from "../utils/date";
import {
  getAnswerImagePaths,
  getQuestionImagePaths,
  getQuestionPageImagePath,
} from "../utils/questionImages";
import { ratingLabels } from "../utils/reviewLabels";

const ratings: ReviewRating[] = ["Again", "Hard", "Good", "Easy"];

export default function ReviewPage() {
  const { questions, isLoading, error, saveQuestionTips } = useQuestionStore();
  const {
    cards,
    reviewLogs,
    mistakeRecords,
    settings,
    dailyReviewSession,
    getOrCreateDailyReviewSession,
    startNextReviewRound,
    markDailyReviewSessionCompleted,
    rateQuestion,
    updateSettings,
  } = useReviewStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isBrowsingCompletedQueue, setIsBrowsingCompletedQueue] = useState(false);
  const [tipsDraft, setTipsDraft] = useState("");
  const [tipsMessage, setTipsMessage] = useState("");
  const [isSavingTips, setIsSavingTips] = useState(false);

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
    if (!isLoading && !error && questions.length > 0) {
      getOrCreateDailyReviewSession(questions);
    }
  }, [error, getOrCreateDailyReviewSession, isLoading, questions]);

  const activeQueue = dailyReviewSession?.queue ?? [];
  const completedLogByQuestionId = useMemo(
    () => getSessionLogMap(dailyReviewSession, reviewLogs),
    [dailyReviewSession, reviewLogs],
  );
  const completedCount = activeQueue.filter((item) =>
    completedLogByQuestionId.has(item.questionId),
  ).length;
  const isRoundComplete = activeQueue.length > 0 && completedCount === activeQueue.length;
  const currentItem = activeQueue[currentIndex];
  const currentLog = currentItem ? completedLogByQuestionId.get(currentItem.questionId) : undefined;
  const currentQuestion = currentItem
    ? questions.find((question) => question.id === currentItem.questionId)
    : null;
  const questionImagePaths = currentQuestion ? getQuestionImagePaths(currentQuestion) : [];
  const answerImagePaths = currentQuestion ? getAnswerImagePaths(currentQuestion) : [];
  const fullPageImagePath = currentQuestion ? getQuestionPageImagePath(currentQuestion) : "";
  const dailyReviewOptions = getDailyReviewOptions(settings.maxDailyReviews);
  const isComplete =
    dailyReviewSession !== null &&
    (activeQueue.length === 0 || (isRoundComplete && !isBrowsingCompletedQueue));

  useEffect(() => {
    if (isRoundComplete) {
      markDailyReviewSessionCompleted();
    }
  }, [isRoundComplete, markDailyReviewSessionCompleted]);

  useEffect(() => {
    setTipsDraft(currentQuestion?.tips ?? "");
    setTipsMessage("");
    setIsSavingTips(false);
  }, [currentQuestion?.id, currentQuestion?.tips]);

  function handleRating(rating: ReviewRating) {
    if (!currentQuestion || !dailyReviewSession) {
      return;
    }
    if (completedLogByQuestionId.has(currentQuestion.id)) {
      goToNextUnratedQuestion(completedLogByQuestionId);
      return;
    }

    const log = rateQuestion(currentQuestion.id, rating);
    setShowAnswer(false);
    const optimisticLogs = new Map(completedLogByQuestionId);
    optimisticLogs.set(log.questionId, log);
    goToNextUnratedQuestion(optimisticLogs);
  }

  function goToQuestion(index: number) {
    const nextIndex = Math.max(0, Math.min(index, activeQueue.length - 1));
    const nextItem = activeQueue[nextIndex];
    setCurrentIndex(nextIndex);
    setShowAnswer(Boolean(nextItem && completedLogByQuestionId.has(nextItem.questionId)));
  }

  function goToNextUnratedQuestion(completed: Map<string, ReviewLog>) {
    const nextIndex = findNextUnratedIndex(activeQueue, completed, currentIndex);
    setCurrentIndex(nextIndex ?? activeQueue.length);
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
    startNextReviewRound(questions);
    setCurrentIndex(0);
    setShowAnswer(false);
    setIsBrowsingCompletedQueue(false);
  }

  function handleDailyLimitChange(value: number) {
    const nextLimit = Number.isFinite(value) ? value : settings.maxDailyReviews;
    updateSettings({
      maxDailyReviews: nextLimit,
      maxNewPerDay: nextLimit,
    });
    startNextReviewRound(questions);
    setCurrentIndex(0);
    setShowAnswer(false);
    setIsBrowsingCompletedQueue(false);
  }

  async function handleSaveTips() {
    if (!currentQuestion) {
      return;
    }
    if (!isTauriRuntime()) {
      setTipsMessage("浏览器开发模式不能直接写入题库；请在 MathLoop 桌面版中保存 tips。");
      return;
    }
    setIsSavingTips(true);
    setTipsMessage("");
    try {
      await saveQuestionTips(currentQuestion.id, tipsDraft);
      setTipsMessage(tipsDraft.trim() ? "Tips 已保存。" : "Tips 已清空。");
    } catch (error) {
      setTipsMessage(error instanceof Error ? error.message : "保存 tips 失败。");
    } finally {
      setIsSavingTips(false);
    }
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

  if (dailyReviewSession === null) {
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
                {Array.from(completedLogByQuestionId.values()).filter((log) => log.rating === rating).length}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-ink/65">
          {hasUpcomingMistakes
            ? "到了计划时间后，这道题会自动出现在复习页。也可以回到错题录入页把时间改成“现在复习”。"
            : activeQueue.length === 0
            ? "可以在错题录入里按页码和题号添加新的复习任务。"
            : `本次完成 ${completedCount} 题。`}
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
              {currentQuestion.chapter || "未标注章节"}
            </h2>
            <p className="mt-3 text-sm text-ink/58">
              {currentQuestion.section || "未标注题型"}
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
            <p className="mt-1 text-sm text-ink/56">可以先逐题浏览，再回到任意一题查看答案和评分。</p>
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
            const done = completedLogByQuestionId.has(item.questionId);
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
                  {question ? getQuestionLocator(question) : "该题目已不在当前题库中"}
                </span>
                <span className="mt-1 block truncate text-xs text-ink/52">
                  {question?.chapter ?? ""}
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
            <TipsEditor
              value={tipsDraft}
              message={tipsMessage}
              isSaving={isSavingTips}
              onChange={setTipsDraft}
              onSave={handleSaveTips}
            />
            <button
              type="button"
              onClick={() => setShowAnswer(true)}
              className="apple-pill w-fit px-5 py-2.5 text-sm font-semibold"
            >
              查看答案
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <TipsEditor
              value={tipsDraft}
              message={tipsMessage}
              isSaving={isSavingTips}
              onChange={setTipsDraft}
              onSave={handleSaveTips}
            />
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

function TipsEditor({
  value,
  message,
  isSaving,
  onChange,
  onSave,
}: {
  value: string;
  message: string;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="apple-soft-card flex-1 rounded-[20px] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">Tips</p>
          <p className="mt-1 text-xs text-ink/48">复习时随手写思路，下次查看答案前会先看到。</p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="apple-ghost-pill w-fit px-4 py-2 text-xs font-semibold disabled:opacity-45"
        >
          {isSaving ? "保存中" : "保存 Tips"}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="例如：先看定义域；换元后注意上下限；这题关键是构造辅助函数。"
        className="apple-control mt-3 min-h-24 w-full resize-y rounded-[18px] px-4 py-3 text-sm leading-6"
      />
      <p className="mt-2 text-xs text-ink/46">
        {message || "桌面版保存前会自动备份外部 questions.json。"}
      </p>
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

function getSessionLogMap(
  session: DailyReviewSession | null,
  reviewLogs: ReviewLog[],
): Map<string, ReviewLog> {
  if (!session) {
    return new Map();
  }
  const sessionStart = parseDate(session.createdAt);
  const sessionQuestionIds = new Set(session.queue.map((item) => item.questionId));
  return new Map(
    reviewLogs
      .filter((log) => {
        const reviewedAt = parseDate(log.reviewedAt);
        return (
          sessionQuestionIds.has(log.questionId) &&
          Boolean(sessionStart && reviewedAt && reviewedAt >= sessionStart)
        );
      })
      .map((log) => [log.questionId, log]),
  );
}

function getDailyReviewOptions(currentValue: number): number[] {
  return Array.from(new Set([5, 10, 15, 20, 30, currentValue]))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
}

function getQuestionLocator(question: { printedPageNumber?: string; questionNo: string }): string {
  return `印刷页 ${question.printedPageNumber || "未标注"} · 第 ${question.questionNo} 题`;
}
