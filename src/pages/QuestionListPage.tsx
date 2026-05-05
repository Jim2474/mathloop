import { Link } from "react-router-dom";
import EmptyState from "../components/common/EmptyState";
import { useQuestionStore } from "../store/useQuestionStore";
import type { UncertainFilter } from "../types/question";
import { filterQuestions } from "../utils/questionFilters";
import { getUniqueValues } from "../utils/questionStats";

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

  const chapters = getUniqueValues(questions, "chapter");
  const sections = getUniqueValues(
    selectedChapter === "all"
      ? questions
      : questions.filter((question) => question.chapter === selectedChapter),
    "section",
  );
  const visibleQuestions = filterQuestions({
    questions,
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
    <div className="space-y-5">
      <section className="rounded-lg border border-line bg-white/70 p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">题库列表</h2>
            <p className="mt-1 text-sm text-ink/60">
              共 {questions.length} 题，当前显示 {visibleQuestions.length} 题。
            </p>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="w-fit rounded-md border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-white"
          >
            重置筛选
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-ink/70">章节</span>
            <select
              value={selectedChapter}
              onChange={(event) => setSelectedChapter(event.target.value)}
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-moss"
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
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-moss"
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
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-moss"
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
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-moss"
            />
          </label>
        </div>
      </section>

      {visibleQuestions.length === 0 ? (
        <EmptyState title="没有匹配的题目" description="可以调整筛选条件或检查 OpenClaw 导出数据。" />
      ) : (
        <section className="overflow-hidden rounded-lg border border-line bg-white/75 shadow-soft">
          <div className="hidden grid-cols-[1fr_1.3fr_1fr_1fr_0.8fr_1fr_0.7fr] gap-3 border-b border-line bg-ink px-4 py-3 text-xs font-semibold uppercase tracking-wide text-paper lg:grid">
            <span>ID</span>
            <span>书名</span>
            <span>章节</span>
            <span>小节</span>
            <span>题号</span>
            <span>页码</span>
            <span>状态</span>
          </div>
          <div className="divide-y divide-line/70">
            {visibleQuestions.map((question) => (
              <Link
                key={question.id}
                to={`/questions/${encodeURIComponent(question.id)}`}
                className="grid gap-2 px-4 py-4 transition hover:bg-moss/8 lg:grid-cols-[1fr_1.3fr_1fr_1fr_0.8fr_1fr_0.7fr] lg:items-center lg:gap-3"
              >
                <span className="font-mono text-sm font-semibold text-slateblue">{question.id}</span>
                <span className="text-sm text-ink/75">{question.bookName}</span>
                <span className="text-sm text-ink/75">{question.chapter}</span>
                <span className="text-sm text-ink/75">{question.section}</span>
                <span className="text-sm font-medium">{question.questionNo}</span>
                <span className="text-sm text-ink/65">{question.pageRangeText}</span>
                <span
                  className={[
                    "w-fit rounded-full px-3 py-1 text-xs font-semibold",
                    question.meta.uncertain
                      ? "bg-cinnabar/12 text-cinnabar"
                      : "bg-moss/12 text-moss",
                  ].join(" ")}
                >
                  {question.meta.uncertain ? "uncertain" : "confirmed"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
