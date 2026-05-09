import { Link } from "react-router-dom";
import { useState } from "react";
import EmptyState from "../components/common/EmptyState";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";
import type { UncertainFilter } from "../types/question";
import { filterQuestions } from "../utils/questionFilters";
import { getUniqueValues } from "../utils/questionStats";

type QuestionView = "all" | "today" | "reviewed";

export default function QuestionListPage() {
  const {
    questions,
    isLoading,
    error,
    selectedChapter,
    selectedSection,
    uncertainFilter,
    searchTerm,
    setSelectedChapter,
    setSelectedSection,
    setUncertainFilter,
    setSearchTerm,
    resetFilters,
  } = useQuestionStore();
  const { cards, reviewLogs, dailyReviewSession } = useReviewStore();
  const [view, setView] = useState<QuestionView>("all");

  const chapters = getUniqueValues(questions, "chapter");
  const sections = getUniqueValues(
    selectedChapter === "all"
      ? questions
      : questions.filter((question) => question.chapter === selectedChapter),
    "section",
  );
  const todayQuestionIds = new Set(dailyReviewSession?.queue.map((item) => item.questionId) ?? []);
  const reviewedQuestionIds = new Set([
    ...reviewLogs.map((log) => log.questionId),
    ...Object.values(cards)
      .filter((card) => card.card.reps > 0)
      .map((card) => card.questionId),
  ]);
  const scopedQuestions = questions.filter((question) => {
    if (view === "today") {
      return todayQuestionIds.has(question.id);
    }
    if (view === "reviewed") {
      return reviewedQuestionIds.has(question.id);
    }
    return true;
  });
  const visibleQuestions = filterQuestions({
    questions: scopedQuestions,
    selectedChapter,
    selectedSection,
    uncertainFilter,
    searchTerm,
  });

  if (isLoading) {
    return <EmptyState title="正在读取题库" description="正在加载 /data/questions.json。" />;
  }

  if (error) {
    return <EmptyState title="题库读取失败" description={error} />;
  }

  return (
    <div className="space-y-6">
      <section className="apple-glass rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="apple-kicker">Question Library</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.28px] md:text-5xl">
              Browse the source of truth.
            </h2>
            <p className="mt-4 text-sm leading-6 text-ink/58">
              共 {questions.length} 题，当前集合 {scopedQuestions.length} 题，显示 {visibleQuestions.length} 题。
              题目内容始终来自最新 questions.json。
            </p>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="apple-ghost-pill w-fit px-5 py-2.5 text-sm font-semibold text-ink/68 hover:text-slateblue"
          >
            重置筛选
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            { key: "all", label: "全部题库", count: questions.length },
            { key: "today", label: "今日复习", count: todayQuestionIds.size },
            { key: "reviewed", label: "已复习题目", count: reviewedQuestionIds.size },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key as QuestionView)}
              className={[
                "rounded-full px-4 py-2 text-sm font-semibold transition",
                view === item.key
                  ? "bg-slateblue text-white shadow-[0_8px_20px_rgba(0,102,204,0.16)]"
                  : "bg-white/38 text-ink/62 hover:bg-white/58",
              ].join(" ")}
            >
              {item.label} <span className="ml-1 opacity-70">{item.count}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-ink/70">章节</span>
            <select
              value={selectedChapter}
              onChange={(event) => setSelectedChapter(event.target.value)}
              className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
            >
              <option value="all">全部章节</option>
              {chapters.map((chapter) => (
                <option key={chapter} value={chapter}>
                  {chapter}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-ink/70">小节 / 题型</span>
            <select
              value={selectedSection}
              onChange={(event) => setSelectedSection(event.target.value)}
              className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
            >
              <option value="all">全部小节</option>
              {sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-ink/70">uncertain</span>
            <select
              value={uncertainFilter}
              onChange={(event) => setUncertainFilter(event.target.value as UncertainFilter)}
              className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
            >
              <option value="all">全部</option>
              <option value="uncertain">仅 uncertain</option>
              <option value="confirmed">仅 confirmed</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-ink/70">搜索</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="id / 题号 / 页码"
              className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
            />
          </label>
        </div>
      </section>

      {visibleQuestions.length === 0 ? (
        <EmptyState
          title={view === "today" ? "暂无今日复习题目" : "没有匹配的题目"}
          description={
            view === "today"
              ? "进入复习页后会生成并保存今天的复习题目。"
              : "可以调整筛选条件或检查 OpenClaw 导出数据。"
          }
        />
      ) : (
        <section className="apple-tile overflow-hidden rounded-[26px]">
          <div className="hidden grid-cols-[1fr_1.2fr_1fr_1fr_0.7fr_1fr_0.9fr_0.7fr] gap-3 border-b border-white/46 bg-white/34 px-5 py-3 text-xs font-semibold uppercase text-ink/48 lg:grid">
            <span>ID</span>
            <span>书名</span>
            <span>章节</span>
            <span>小节</span>
            <span>题号</span>
            <span>页码</span>
            <span>定位</span>
            <span>状态</span>
          </div>
          <div className="divide-y divide-white/42">
            {visibleQuestions.map((question) => (
              <Link
                key={question.id}
                to={`/questions/${encodeURIComponent(question.id)}`}
                className="grid gap-2 px-5 py-4 transition hover:bg-white/42 lg:grid-cols-[1fr_1.2fr_1fr_1fr_0.7fr_1fr_0.9fr_0.7fr] lg:items-center lg:gap-3"
              >
                <span className="font-mono text-sm font-semibold text-slateblue">{question.id}</span>
                <span className="text-sm text-ink/75">{question.bookName}</span>
                <span className="text-sm text-ink/75">{question.chapter}</span>
                <span className="text-sm text-ink/75">{question.section}</span>
                <span className="text-sm font-medium">{question.questionNo}</span>
                <span className="text-sm text-ink/65">{question.pageRangeText}</span>
                <span className="text-sm font-medium text-ink/70">{getQuestionLocator(question)}</span>
                <span
                  className={[
                    "w-fit rounded-full px-3 py-1 text-xs font-semibold",
                    reviewedQuestionIds.has(question.id)
                      ? "bg-slateblue/12 text-slateblue"
                      : todayQuestionIds.has(question.id)
                      ? "bg-cinnabar/12 text-cinnabar"
                      : question.meta.uncertain
                      ? "bg-cinnabar/12 text-cinnabar"
                      : "bg-moss/12 text-moss",
                  ].join(" ")}
                >
                  {reviewedQuestionIds.has(question.id)
                    ? "已复习"
                    : todayQuestionIds.has(question.id)
                    ? "今日"
                    : question.meta.uncertain
                    ? "uncertain"
                    : "confirmed"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function getQuestionLocator(question: { printedPageNumber?: string; questionNo: string }): string {
  return `印刷页 ${question.printedPageNumber || "未标注"} · 第 ${question.questionNo} 题`;
}
