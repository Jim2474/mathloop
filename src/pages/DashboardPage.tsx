import EmptyState from "../components/common/EmptyState";
import StatCard from "../components/dashboard/StatCard";
import { getReviewDashboardStats } from "../services/dashboardStats";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";
import { getDashboardStats } from "../utils/questionStats";

export default function DashboardPage() {
  const { questions, isLoading, error } = useQuestionStore();
  const { cards, reviewLogs } = useReviewStore();
  const stats = getDashboardStats(questions);
  const reviewStats = getReviewDashboardStats(questions, cards, reviewLogs);

  if (isLoading) {
    return <EmptyState title="正在读取题库" description="正在加载 /data/questions.json。" />;
  }

  if (error) {
    return <EmptyState title="题库读取失败" description={error} />;
  }

  return (
    <div className="space-y-7">
      <section className="rounded-lg border border-line bg-white/65 p-6 shadow-soft">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-cinnabar">本地 OpenClaw 题库</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-normal">基础看板</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-ink/60">
            静态题库来自 OpenClaw，复习状态保存在本地浏览器 localStorage。
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="总题数" value={stats.total} tone="cool" />
        <StatCard label="今日到期" value={reviewStats.dueToday} tone="accent" />
        <StatCard label="今日已完成" value={reviewStats.completedToday} tone="cool" />
        <StatCard label="逾期题" value={reviewStats.overdue} tone="accent" />
        <StatCard label="未来 7 天待复习" value={reviewStats.futureSevenDays} />
        <StatCard label="已复习题数" value={reviewStats.reviewedTotal} tone="cool" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <div className="rounded-lg border border-line bg-white/70 p-5 shadow-soft">
          <h3 className="text-lg font-semibold">题库概览</h3>
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

        <div className="rounded-lg border border-line bg-white/70 p-5 shadow-soft">
          <h3 className="text-lg font-semibold">章节复习统计</h3>
          {reviewStats.chapterReviewStats.length > 0 ? (
            <div className="mt-5 space-y-3">
              {reviewStats.chapterReviewStats.map((item) => (
                <div key={item.chapter} className="grid gap-3 rounded-md border border-line bg-paper/60 p-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <p className="truncate text-sm font-medium text-ink">{item.chapter}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-line/70">
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
            <EmptyState title="暂无章节数据" description="请确认 public/data/questions.json 中包含题目。" />
          )}
        </div>
      </section>
    </div>
  );
}
