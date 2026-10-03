import type { ReviewLog } from "../../types/review";

const WEEKS = 17;
const TOTAL_DAYS = WEEKS * 7;
const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getColorClass(count: number): string {
  if (count === 0) return "bg-ink/8";
  if (count <= 2) return "bg-slateblue/25";
  if (count <= 5) return "bg-slateblue/50";
  if (count <= 9) return "bg-slateblue/72";
  return "bg-slateblue/90";
}

type Cell = { date: Date; dateKey: string; count: number; col: number; row: number };

function buildDailyCountMap(reviewLogs: ReviewLog[]): Map<string, number> {
  // Count unique questions per day (same question reviewed multiple times in
  // one day still counts as one).
  const dayMap = new Map<string, Set<string>>();
  for (const log of reviewLogs) {
    if (!log.reviewedAt) continue;
    const date = new Date(log.reviewedAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = getLocalDateKey(date);
    if (!dayMap.has(key)) dayMap.set(key, new Set());
    dayMap.get(key)!.add(log.questionId);
  }
  return new Map(Array.from(dayMap.entries()).map(([k, v]) => [k, v.size]));
}

function buildCells(now: Date, dailyCounts: Map<string, number>): Cell[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = new Date(today);
  startDay.setDate(today.getDate() - (TOTAL_DAYS - 1));
  const cells: Cell[] = [];
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    const row = (d.getDay() + 6) % 7; // Mon=0, Sun=6
    const col = Math.floor(i / 7);
    const dateKey = getLocalDateKey(d);
    cells.push({ date: d, dateKey, count: dailyCounts.get(dateKey) ?? 0, col, row });
  }
  return cells;
}

function buildMonthLabels(cells: Cell[]): Array<{ col: number; label: string }> {
  const seen = new Set<string>();
  const labels: Array<{ col: number; label: string }> = [];
  for (const cell of cells) {
    if (cell.row !== 0) continue;
    const monthKey = `${cell.date.getFullYear()}-${cell.date.getMonth()}`;
    if (!seen.has(monthKey)) {
      seen.add(monthKey);
      labels.push({ col: cell.col, label: `${cell.date.getMonth() + 1}月` });
    }
  }
  return labels;
}

export default function ActivityHeatmap({ reviewLogs }: { reviewLogs: ReviewLog[] }) {
  const now = new Date();
  const dailyCounts = buildDailyCountMap(reviewLogs);
  const cells = buildCells(now, dailyCounts);
  const monthLabels = buildMonthLabels(cells);
  const todayKey = getLocalDateKey(now);
  const totalReviewedToday = dailyCounts.get(todayKey) ?? 0;
  const totalDaysActive = Array.from(dailyCounts.values()).filter((v) => v > 0).length;

  // Build a col → cells lookup for the render loop
  const colMap = new Map<number, Cell[]>();
  for (const cell of cells) {
    if (!colMap.has(cell.col)) colMap.set(cell.col, []);
    colMap.get(cell.col)!.push(cell);
  }

  const gridCols = `20px repeat(${WEEKS}, minmax(0, 1fr))`;

  return (
    <div className="apple-tile rounded-[24px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-[-0.28px]">学习日历</h3>
          <p className="mt-1 text-sm text-ink/55">
            过去 {WEEKS} 周 · 今日 {totalReviewedToday} 题 · 累计活跃 {totalDaysActive} 天
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1.5 text-xs text-ink/50">
          <span>少</span>
          {[0, 1, 3, 6, 10].map((v) => (
            <span key={v} className={`h-3 w-3 rounded-[3px] ${getColorClass(v)}`} />
          ))}
          <span>多</span>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-fit">
          {/* Month labels */}
          <div
            className="mb-1 grid text-[10px] text-ink/45"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div />
            {Array.from({ length: WEEKS }, (_, col) => {
              const monthLabel = monthLabels.find((m) => m.col === col);
              return (
                <div key={col} className="leading-none">
                  {monthLabel ? monthLabel.label : ""}
                </div>
              );
            })}
          </div>

          {/* Rows: one per weekday */}
          {WEEKDAY_LABELS.map((dayLabel, row) => (
            <div
              key={row}
              className="mb-[3px] grid items-center"
              style={{ gridTemplateColumns: gridCols, columnGap: "3px" }}
            >
              {/* Weekday label – show only even rows to avoid clutter */}
              <span className="pr-1 text-right text-[10px] leading-none text-ink/40">
                {row % 2 === 0 ? dayLabel : ""}
              </span>

              {/* Cells: one per week column */}
              {Array.from({ length: WEEKS }, (_, col) => {
                const cell = colMap.get(col)?.find((c) => c.row === row);
                if (!cell) {
                  return (
                    <div
                      key={col}
                      className="aspect-square rounded-[3px] bg-transparent"
                    />
                  );
                }
                const isToday = cell.dateKey === todayKey;
                const dateLabel = `${cell.date.getMonth() + 1}月${cell.date.getDate()}日`;
                const countLabel =
                  cell.count === 0 ? "无复习记录" : `复习 ${cell.count} 题`;
                return (
                  <div
                    key={col}
                    title={`${dateLabel}：${countLabel}`}
                    className={[
                      "aspect-square rounded-[3px] transition-opacity hover:opacity-75",
                      getColorClass(cell.count),
                      isToday ? "ring-1 ring-slateblue/60 ring-offset-[1px]" : "",
                    ].join(" ")}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
