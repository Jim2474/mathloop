import { useEffect, useRef, useState } from "react";
import {
  loadImportPreview,
  loadItemImage,
  confirmImport,
  type ImportPreviewItem,
  type ImportVerdict,
} from "../services/pdfImportService";
import { useBookStore } from "../store/useBookStore";
import { useQuestionStore } from "../store/useQuestionStore";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "no-stage" }
  | { kind: "preview"; items: ImportPreviewItem[] }
  | { kind: "importing"; progress: number; total: number }
  | { kind: "done"; imported: number; skipped: number; errors: string[] };

export default function ImportPdfPage() {
  const activeBookId = useBookStore((s) => s.activeBookId);
  const loadQuestions = useQuestionStore((s) => s.loadQuestions);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const loadingImages = useRef(new Set<string>());

  // Load preview on mount or book change
  useEffect(() => {
    if (!activeBookId) return;
    void doLoad(activeBookId);
  }, [activeBookId]);

  async function doLoad(bookId: string) {
    setPhase({ kind: "loading" });
    try {
      const items = await loadImportPreview(bookId);
      if (items.length === 0) {
        setPhase({ kind: "no-stage" });
      } else {
        setPhase({ kind: "preview", items });
        // Begin lazy-loading crop images one at a time in background
        void lazyLoadCropImages(bookId, items);
      }
    } catch (e) {
      setPhase({ kind: "no-stage" });
      console.error("Import preview load failed:", e);
    }
  }

  async function lazyLoadCropImages(bookId: string, items: ImportPreviewItem[]) {
    for (const item of items) {
      if (loadingImages.current.has(item.question.id)) continue;
      loadingImages.current.add(item.question.id);

      const dataUrl = await loadItemImage(bookId, item, "crop");
      if (dataUrl) {
        item.imageDataUrl = dataUrl;
        setPhase((prev) =>
          prev.kind === "preview" ? { kind: "preview", items: [...prev.items] } : prev,
        );
      }
    }
  }

  async function toggleViewMode(qid: string) {
    if (phase.kind !== "preview" || !activeBookId) return;

    const targetItem = phase.items.find((i) => i.question.id === qid);
    if (!targetItem) return;

    const nextMode = targetItem.viewMode === "crop" ? "full" : "crop";

    // If switching to full page and not yet loaded, fetch it
    if (nextMode === "full" && !targetItem.fullPageDataUrl) {
      const fullUrl = await loadItemImage(activeBookId, targetItem, "full");
      if (fullUrl) {
        targetItem.fullPageDataUrl = fullUrl;
      }
    }

    targetItem.viewMode = nextMode;
    setPhase({ kind: "preview", items: [...phase.items] });
  }

  function setVerdict(qid: string, verdict: ImportVerdict) {
    setPhase((prev) => {
      if (prev.kind !== "preview") return prev;
      return {
        kind: "preview",
        items: prev.items.map((item) =>
          item.question.id === qid ? { ...item, verdict } : item,
        ),
      };
    });
  }

  function setAllVerdict(verdict: ImportVerdict) {
    setPhase((prev) => {
      if (prev.kind !== "preview") return prev;
      return {
        kind: "preview",
        items: prev.items.map((item) =>
          item.isDuplicate && verdict === "ok" ? item : { ...item, verdict },
        ),
      };
    });
  }

  async function doImport() {
    if (phase.kind !== "preview" || !activeBookId) return;
    const items = phase.items;
    const toImport = items.filter((i) => i.verdict === "ok");
    if (toImport.length === 0) return;

    setPhase({ kind: "importing", progress: 0, total: toImport.length });

    // Ensure crop images are loaded before import
    for (const item of toImport) {
      if (!item.imageDataUrl) {
        item.imageDataUrl = await loadItemImage(activeBookId, item, "crop");
      }
    }

    const result = await confirmImport(activeBookId, items, (done, total) => {
      setPhase({ kind: "importing", progress: done, total });
    });

    // Reload questions so the new ones appear in the library
    await loadQuestions();
    setPhase({ kind: "done", ...result });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!activeBookId) {
    return (
      <EmptyState emoji="📘" title="未选择书本" subtitle="请先在顶部导航选择一本题库" />
    );
  }

  if (phase.kind === "idle" || phase.kind === "loading") {
    return (
      <div className="flex h-64 items-center justify-center text-ink/40 text-sm">
        正在读取暂存数据…
      </div>
    );
  }

  if (phase.kind === "no-stage") {
    return (
      <EmptyState
        emoji="📂"
        title="暂无待导入数据"
        subtitle={
          <>
            请先在终端运行 Python 脚本：
            <br />
            <code className="mt-2 block rounded-lg bg-black/6 px-4 py-2 text-sm font-mono text-ink">
              cd mathloop/scripts/pdf_import && bash run_test.sh
            </code>
          </>
        }
      />
    );
  }

  if (phase.kind === "importing") {
    const pct = Math.round((phase.progress / phase.total) * 100);
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <div className="text-2xl">⏳</div>
        <div className="text-sm font-medium text-ink">
          导入中… {phase.progress} / {phase.total}
        </div>
        <div className="h-2 w-64 overflow-hidden rounded-full bg-black/8">
          <div
            className="h-full rounded-full bg-slateblue transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (phase.kind === "done") {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-xl font-semibold text-ink">导入完成</h2>
        <p className="mt-2 text-sm text-ink/60">
          成功导入 <strong>{phase.imported}</strong> 道错题，跳过{" "}
          <strong>{phase.skipped}</strong> 道。
        </p>
        {phase.errors.length > 0 && (
          <div className="mt-4 rounded-xl bg-cinnabar/8 p-4 text-left text-xs text-cinnabar">
            {phase.errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        <button
          onClick={() => void doLoad(activeBookId)}
          className="apple-pill mt-6 px-6 py-2.5 text-sm font-semibold"
        >
          重新加载预览
        </button>
      </div>
    );
  }

  // ── Preview phase ───────────────────────────────────────────────────────────
  const items = phase.items;
  const okCount = items.filter((i) => i.verdict === "ok").length;
  const skipCount = items.filter((i) => i.verdict === "skip").length;
  const wrongCount = items.filter((i) => i.verdict === "wrong").length;
  const pendingCount = items.filter((i) => i.verdict === "pending").length;
  const dupCount = items.filter((i) => i.isDuplicate).length;

  return (
    <div className="flex flex-col gap-0 min-h-0">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-surface/85 backdrop-blur-xl border-b border-white/30 px-6 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-base font-semibold text-ink">PDF 错题导入核对</h1>
          <span className="text-xs text-ink/40">
            共 {items.length} 道错题 · {dupCount > 0 ? `${dupCount} 道可能已在题库` : "无重复"} · 书本: {activeBookId}
          </span>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <StatChip label="✅ 正确" count={okCount} />
            <StatChip label="⏭️ 跳过" count={skipCount} />
            <StatChip label="❌ 误报" count={wrongCount} />
            {pendingCount > 0 && <StatChip label="⏸️ 待核对" count={pendingCount} />}
          </div>
        </div>

        {/* Quick-action row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button
            type="button"
            onClick={() => setAllVerdict("ok")}
            className="apple-ghost-pill px-3 py-1 text-xs font-medium text-moss"
          >
            全部标记为正确
          </button>
          <button
            type="button"
            onClick={() => setAllVerdict("skip")}
            className="apple-ghost-pill px-3 py-1 text-xs font-medium text-ink/50"
          >
            全部跳过
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void doImport()}
            disabled={okCount === 0}
            className="apple-pill px-5 py-2 text-sm font-semibold disabled:opacity-40"
          >
            确认导入 {okCount > 0 ? `${okCount} 道错题` : ""}
          </button>
        </div>
      </div>

      {/* ── Card list ── */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {items.map((item) => (
          <PreviewCard
            key={item.question.id}
            item={item}
            onToggleView={() => void toggleViewMode(item.question.id)}
            onVerdict={(v) => setVerdict(item.question.id, v)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ label, count }: { label: string; count: number }) {
  return (
    <span className="rounded-full bg-black/6 px-2.5 py-0.5 text-xs text-ink/60">
      {label} <strong className="text-ink">{count}</strong>
    </span>
  );
}

function PreviewCard({
  item,
  onToggleView,
  onVerdict,
}: {
  item: ImportPreviewItem;
  onToggleView: () => void;
  onVerdict: (v: ImportVerdict) => void;
}) {
  const q = item.question;
  const src = q.pdfSource;
  const pageNum = src?.pdfPageNumber ?? (src?.pdfPageIndex ?? 0) + 1;
  const targetIdx = src?.targetIndex ?? 1;
  const totalTargets = src?.totalTargetsOnPage ?? 1;
  const targetLabel = src?.targetLabel ?? `第${pageNum}页`;
  const strokeCount = src?.strokeCount ?? 1;
  const bbox = src?.annotBoundingBox;

  // Percentage coordinates on full page (517.2 x 767.64 pt)
  const pageW = 517.2;
  const pageH = 767.64;
  const hlTop = bbox ? Math.round((bbox.y0 / pageH) * 100) : 0;
  const hlLeft = bbox ? Math.round((bbox.x0 / pageW) * 100) : 0;
  const hlWidth = bbox ? Math.max(Math.round(((bbox.x1 - bbox.x0) / pageW) * 100), 8) : 20;
  const hlHeight = bbox ? Math.max(Math.round(((bbox.y1 - bbox.y0) / pageH) * 100), 4) : 10;

  const yTop = bbox ? Math.round((bbox.y0 / pageH) * 100) : 0;
  const yBot = bbox ? Math.round((bbox.y1 / pageH) * 100) : 100;

  const borderColor = {
    pending: "border-white/40",
    ok: "border-moss shadow-[0_4px_16px_rgba(22,163,74,0.12)]",
    skip: "border-ink/20 opacity-60",
    wrong: "border-cinnabar opacity-60",
  }[item.verdict];

  const isCrop = item.viewMode === "crop";

  return (
    <div
      className={[
        "rounded-2xl border-2 bg-white/75 backdrop-blur-md overflow-hidden transition-all shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
        borderColor,
      ].join(" ")}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white/50 border-b border-white/50 flex-wrap">
        <span className="rounded-lg bg-cinnabar px-2.5 py-0.5 text-xs font-bold text-white">
          PDF 第 {pageNum} 页
        </span>

        {totalTargets > 1 && (
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
            同页第 {targetIdx}/{totalTargets} 题
          </span>
        )}

        <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-cinnabar border border-red-100">
          🔴 {strokeCount} 处红笔标注
        </span>

        <span className="text-xs text-ink/45">
          页面位置 {yTop}%–{yBot}%
        </span>

        {item.isDuplicate && (
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
            可能重复
          </span>
        )}

        {/* View mode toggle */}
        <div className="flex rounded-lg bg-black/6 p-0.5 ml-2">
          <button
            type="button"
            onClick={onToggleView}
            className={[
              "rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition",
              isCrop ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink",
            ].join(" ")}
          >
            🎯 题目切片
          </button>
          <button
            type="button"
            onClick={onToggleView}
            className={[
              "rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition",
              !isCrop ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink",
            ].join(" ")}
          >
            📄 查看整页
          </button>
        </div>

        <code className="ml-auto text-[10px] text-ink/30 font-mono">{q.id}</code>
      </div>

      {/* Card body */}
      <div className="grid grid-cols-[3fr_2fr] gap-0">
        {/* Image column */}
        <div className="p-3 border-r border-white/40 bg-black/[0.02]">
          {isCrop ? (
            item.imageDataUrl ? (
              <img
                src={item.imageDataUrl}
                alt={`${targetLabel} 切片`}
                className="w-full rounded-lg border border-black/5 shadow-sm"
              />
            ) : (
              <div className="flex h-36 items-center justify-center rounded-lg bg-black/4 text-xs text-ink/40">
                加载题目切片中…
              </div>
            )
          ) : (
            <div className="relative w-full">
              {item.fullPageDataUrl ? (
                <>
                  <img
                    src={item.fullPageDataUrl}
                    alt={`PDF第${pageNum}页整页`}
                    className="w-full rounded-lg border border-black/5 shadow-sm"
                  />
                  {/* Highlight overlay rectangle */}
                  <div
                    className="absolute border-2 border-cinnabar bg-cinnabar/20 rounded pointer-events-none shadow-[0_0_12px_rgba(220,38,38,0.5)] animate-pulse"
                    style={{
                      top: `${hlTop}%`,
                      left: `${hlLeft}%`,
                      width: `${hlWidth}%`,
                      height: `${hlHeight}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 bg-cinnabar text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                      🔴 错题在此
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex h-48 items-center justify-center rounded-lg bg-black/4 text-xs text-ink/40">
                  加载整页大图中…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Metadata + verdict column */}
        <div className="flex flex-col gap-3 p-4 bg-white/40">
          <table className="text-xs w-full border-collapse">
            <tbody>
              <MetaRow label="PDF页码" value={`第 ${pageNum} 页`} />
              <MetaRow label="题目标识" value={targetLabel} bold />
              <MetaRow label="红叉标记" value="清晰可见（原笔迹已还原）" highlight />
              <MetaRow label="教材解析" value="完整截取于题目下方" />
              <MetaRow label="来源批次" value="pdf-import v1" />
            </tbody>
          </table>

          {/* Verdict buttons */}
          <div className="flex gap-2 flex-wrap mt-auto pt-2 border-t border-black/5">
            <VerdictBtn
              label="✅ 确认正确"
              active={item.verdict === "ok"}
              activeClass="bg-moss/15 text-moss ring-1 ring-moss"
              onClick={() => onVerdict("ok")}
            />
            <VerdictBtn
              label="⏭️ 跳过"
              active={item.verdict === "skip"}
              activeClass="bg-ink/8 text-ink/60 ring-1 ring-ink/20"
              onClick={() => onVerdict("skip")}
            />
            <VerdictBtn
              label="❌ 误报"
              active={item.verdict === "wrong"}
              activeClass="bg-cinnabar/10 text-cinnabar ring-1 ring-cinnabar"
              onClick={() => onVerdict("wrong")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className="border-b border-black/5">
      <td className="py-1.5 pr-2 text-ink/45 whitespace-nowrap">{label}</td>
      <td
        className={[
          "py-1.5",
          bold ? "font-semibold text-ink" : "text-ink/75",
          highlight ? "font-semibold text-emerald-700" : "",
        ].join(" ")}
      >
        {value}
      </td>
    </tr>
  );
}

function VerdictBtn({
  label,
  active,
  activeClass,
  onClick,
}: {
  label: string;
  active: boolean;
  activeClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
        active ? activeClass : "bg-black/5 text-ink/55 hover:bg-black/8",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function EmptyState({
  emoji,
  title,
  subtitle,
}: {
  emoji: string;
  title: string;
  subtitle: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <span className="text-4xl">{emoji}</span>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="max-w-md text-sm text-ink/50">{subtitle}</p>
    </div>
  );
}
