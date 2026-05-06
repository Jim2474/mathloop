import { Link } from "react-router-dom";
import EmptyState from "../components/common/EmptyState";
import StatCard from "../components/dashboard/StatCard";
import { getReviewDashboardStats } from "../services/dashboardStats";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";
import { getDashboardStats } from "../utils/questionStats";

export default function DashboardPage() {
  const { questions, isLoading, error } = useQuestionStore();
  const { cards, reviewLogs, mistakeRecords } = useReviewStore();
  const stats = getDashboardStats(questions);
  const reviewStats = getReviewDashboardStats(questions, cards, reviewLogs, mistakeRecords);

  if (isLoading) {
    return <EmptyState title="正在读取题库" description="正在加载 /data/questions.json。" />;
  }

  if (error) {
    return <EmptyState title="题库读取失败" description={error} />;
  }

  return (
    <div className="space-y-8">
      <section className="apple-hero-glass overflow-hidden rounded-[32px] px-6 py-16 text-center md:px-10 md:py-20">
        <div className="apple-hero-content mx-auto max-w-3xl">
          <p className="text-[13px] font-medium tracking-[-0.12px] text-moss">Local FSRS review system</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-[2.75rem] font-semibold leading-[1.04] tracking-[-0.48px] text-ink md:text-[4.25rem]">
            Review smarter, not wider.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 tracking-[-0.28px] text-ink/58 md:text-lg md:leading-8">
            Capture the questions you got wrong, schedule review with FSRS,
            <br className="hidden md:block" />
            and keep your math practice focused, lightweight, and fully local.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/mistakes" className="apple-pill px-5 py-2.5 text-[15px] font-medium tracking-[-0.18px]">
              录入错题
            </Link>
            <Link
              to="/review"
              className="apple-ghost-pill px-5 py-2.5 text-[15px] font-medium tracking-[-0.18px]"
            >
              开始复习
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label="总题数" value={stats.total} tone="cool" />
        <StatCard label="错题本" value={reviewStats.mistakeTotal} tone="accent" />
        <StatCard label="今日到期" value={reviewStats.dueToday} tone="accent" />
        <StatCard label="今日已完成" value={reviewStats.completedToday} tone="cool" />
        <StatCard label="逾期题" value={reviewStats.overdue} tone="accent" />
        <StatCard label="未来 7 天待复习" value={reviewStats.futureSevenDays} />
        <StatCard label="已复习题数" value={reviewStats.reviewedTotal} tone="cool" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <div className="apple-tile rounded-[24px] p-6">
          <h3 className="text-2xl font-semibold tracking-[-0.28px]">题库概览</h3>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between border-b border-line/60 pb-3">
              <span className="text-sm text-ink/70">章节数量</span>
              <span className="text-lg font-semibold">{stats.chapterTotal}</span>
            </div>
            <div className="flex items-center justify-between border-b border-line/60 pb-3">
              <span className="text-sm text-ink/70">uncertain 题目</span>
              <span className="text-lg font-semibold">{stats.uncertainTotal}</span>
            </div>
            {Object.entries(stats.typeCounts).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between border-b border-line/60 pb-3">
                <span className="text-sm text-ink/70">{type}</span>
                <span className="text-lg font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="apple-tile rounded-[24px] p-6">
          <h3 className="text-2xl font-semibold tracking-[-0.28px]">错题章节统计</h3>
          {reviewStats.chapterReviewStats.length > 0 ? (
            <div className="mt-5 space-y-3">
              {reviewStats.chapterReviewStats.map((item) => (
                <div key={item.chapter} className="grid gap-3 rounded-[18px] border border-line/70 bg-white/72 p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <p className="truncate text-sm font-medium text-ink">{item.chapter}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line/70">
                      <div
                        className="h-full rounded-full bg-moss"
                        style={{
                          width: `${item.total === 0 ? 0 : Math.max((item.reviewed / item.total) * 100, 4)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-ink/65 md:justify-end">
                    <span>总 {item.total}</span>
                    <span>已复习 {item.reviewed}</span>
                    <span>到期 {item.due}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无错题数据" description="到错题录入页按页码和题号加入第一题。" />
          )}
        </div>
      </section>
    </div>
  );
}
