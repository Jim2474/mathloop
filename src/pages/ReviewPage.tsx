import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/common/EmptyState";
import QuestionImage from "../components/question/QuestionImage";
import { buildTodayReviewQueue } from "../services/reviewQueue";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";
import type { ReviewLog, ReviewQueueItem, ReviewRating } from "../types/review";
import { getAnswerImagePaths, getQuestionImagePaths } from "../utils/questionImages";
import { ratingLabels } from "../utils/reviewLabels";

const ratings: ReviewRating[] = ["Again", "Hard", "Good", "Easy"];

export default function ReviewPage() {
  const { questions, isLoading, error } = useQuestionStore();
  const { cards, reviewLogs, settings, rateQuestion } = useReviewStore();
  const [queue, setQueue] = useState<ReviewQueueItem[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionLogs, setSessionLogs] = useState<ReviewLog[]>([]);

  useEffect(() => {
    if (!isLoading && !error && questions.length > 0 && queue === null) {
      setQueue(buildTodayReviewQueue({ questions, cards, reviewLogs, settings }));
    }
  }, [cards, error, isLoading, questions, queue, reviewLogs, settings]);

  const activeQueue = queue ?? [];
  const currentItem = activeQueue[currentIndex];
  const currentQuestion = currentItem
    ? questions.find((question) => question.id === currentItem.questionId)
    : null;
  const questionImagePaths = currentQuestion ? getQuestionImagePaths(currentQuestion) : [];
  const answerImagePaths = currentQuestion ? getAnswerImagePaths(currentQuestion) : [];
  const isComplete = queue !== null && (activeQueue.length === 0 || currentIndex >= activeQueue.length);

  function handleRating(rating: ReviewRating) {
    if (!currentQuestion) {
      return;
    }
    const log = rateQuestion(currentQuestion.id, rating);
    setSessionLogs((logs) => [...logs, log]);
    setShowAnswer(false);
    setCurrentIndex((index) => index + 1);
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
    return <EmptyState title="正在生成今日队列" description="正在根据本地 FSRS 状态整理复习任务。" />;
  }

  if (isComplete) {
    return (
      <section className="rounded-lg border border-line bg-white/70 p-8 shadow-soft">
        <p className="text-sm font-medium text-moss">今日复习完成</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-normal">收工，今天这组题已经处理完了</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {ratings.map((rating) => (
            <div key={rating} className="rounded-md border border-line bg-paper/70 p-4">
              <p className="text-xs font-semibold text-ink/50">{rating}</p>
              <p className="mt-1 text-sm text-ink/70">{ratingLabels[rating]}</p>
              <p className="mt-3 text-2xl font-semibold">
                {sessionLogs.filter((log) => log.rating === rating).length}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-ink/65">本次完成 {sessionLogs.length} 题。</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper transition hover:bg-ink/90"
        >
          返回 Dashboard
        </Link>
      </section>
    );
  }

  if (!currentQuestion) {
    return <EmptyState title="队列题目不存在" description="请刷新页面重新生成今日复习队列。" />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-white/70 p-5 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-cinnabar">
              {currentItem.kind === "new" ? "新题" : "到期复习"}
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-normal">{currentQuestion.questionNo}</h2>
            <p className="mt-2 text-sm text-ink/60">
              {currentQuestion.chapter} / {currentQuestion.section}
            </p>
          </div>
          <div className="text-sm font-semibold text-ink/70">
            {Math.min(currentIndex + 1, activeQueue.length)} / {activeQueue.length}
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-line/70">
          <div
            className="h-full rounded-full bg-moss transition-all"
            style={{ width: `${((currentIndex + 1) / activeQueue.length) * 100}%` }}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold">题目截图</h3>
        {questionImagePaths.length > 0 ? (
          questionImagePaths.map((path, index) => (
            <QuestionImage key={path} path={path} alt={`${currentQuestion.questionNo} 题目 ${index + 1}`} />
          ))
        ) : (
          <EmptyState title="暂无题目图片" description="questionImage 和 questionImages 都为空。" />
        )}
      </section>

      <section className="rounded-lg border border-line bg-white/70 p-5 shadow-soft">
        {!showAnswer ? (
          <button
            type="button"
            onClick={() => setShowAnswer(true)}
            className="rounded-md bg-ink px-5 py-2 text-sm font-semibold text-paper transition hover:bg-ink/90"
          >
            查看答案
          </button>
        ) : (
          <div className="space-y-5">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">答案区域</h3>
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

            <div className="grid gap-3 md:grid-cols-4">
              {ratings.map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => handleRating(rating)}
                  className="rounded-md border border-line bg-paper px-4 py-4 text-left transition hover:border-moss hover:bg-moss/10"
                >
                  <span className="block text-base font-semibold">{rating}</span>
                  <span className="mt-1 block text-sm text-ink/60">{ratingLabels[rating]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
