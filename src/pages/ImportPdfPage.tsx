import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PdfImportPreview from "../components/question/PdfImportPreview";
import { isTauriRuntime } from "../services/desktopBridge";
import { loadOpenClawQuestions } from "../services/questionLoader";
import { flushReviewWrites } from "../services/reviewPersistStorage";
import { cancelPdfJob, claimCompletedPdfJob, confirmPdfJob, getPdfPreview, getPdfJob, listPdfBatches, pickPdfFile, startPdfJob, undoPdfBatch,
  pickAnswerDirectory, type AnswerMatch, type PdfBatch, type PdfInput, type PdfJob, type PdfPreview } from "../services/pdfImportService";
import { useBookStore } from "../store/useBookStore";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";

const stages: Record<string, string> = { validating: "核对资料格式", scanning: "查找批注与题目边界", rendering: "生成题目和跨页图片", ready: "准备预览", preview: "等待确认导入", importing: "保存导入批次", done: "导入完成" };

// Keep exclusions while navigating between pages during the same draft.
const previewChoices = new Map<string, { index: number; keys: string[] }>();

export default function ImportPdfPage() {
  const navigate = useNavigate();
  const { books, activeBookId, addBook, switchBook } = useBookStore();
  const reviewLogs = useReviewStore((s) => s.reviewLogs);
  const cards = useReviewStore((s) => s.cards);
  const readyBookId = useReviewStore((s) => s.readyBookId);
  const [answerMatches, setAnswerMatches] = useState<AnswerMatch[]>([]);
  const [input, setInput] = useState<PdfInput | null>(null);
  const [targetId, setTargetId] = useState("");
  const [newBookName, setNewBookName] = useState("");
  const [undoConfirmation, setUndoConfirmation] = useState<string | null>(null);
  const [job, setJob] = useState<PdfJob | null>(null);
  const [preview, setPreview] = useState<PdfPreview | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [batches, setBatches] = useState<PdfBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const completed = useRef("");
  const target = books.find((b) => b.id === targetId);
  const running = job?.status === "running";
  const locked = running || job?.status === "preview";

  useEffect(() => {
    if (job?.status !== "preview") { setPreview(null); return; }
    let current = true;
    void getPdfPreview(job.jobId).then((value) => {
      if (!current) return;
      setPreview(value);
      const choices = previewChoices.get(job.jobId);
      const valid = value.questions.map((q) => q.pdfSource!.sourceKey!);
      setPreviewIndex(Math.min(choices?.index ?? 0, Math.max(0, value.questions.length - 1)));
      setSelectedKeys(choices ? choices.keys.filter((key) => valid.includes(key)) : valid);
    }).catch((e) => { if (current) setError(String(e)); });
    return () => { current = false; };
  }, [job?.jobId, job?.status]);

  useEffect(() => {
    if (job?.status === "preview" && preview) previewChoices.set(job.jobId, { index: previewIndex, keys: selectedKeys });
    else if (job?.jobId && (job.status === "done" || job.status === "cancelled" || job.status === "error")) previewChoices.delete(job.jobId);
  }, [job?.jobId, job?.status, preview, previewIndex, selectedKeys]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let mounted = true;
    let inFlight = false;
    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await getPdfJob();
        if (!mounted) return;
        setJob(next.jobId ? next : null);
        if (claimCompletedPdfJob(next, useBookStore.getState().activeBookId)) {
          await useQuestionStore.getState().loadQuestions();
        }
        if (next.status === "done" && completed.current !== next.jobId) {
          completed.current = next.jobId;
          const bookId = useBookStore.getState().activeBookId;
          if (bookId) {
            const list = await listPdfBatches(bookId);
            if (mounted && bookId === useBookStore.getState().activeBookId) setBatches(list);
          }
        }
      } catch (e) { if (mounted) setError(String(e)); }
      finally { inFlight = false; }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 900);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let current = true;
    setBatches([]);
    if (activeBookId && isTauriRuntime()) {
      void listPdfBatches(activeBookId).then((list) => { if (current) setBatches(list); })
        .catch((e) => { if (current) setError(String(e)); });
    }
    return () => { current = false; };
  }, [activeBookId]);

  async function choose() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const selected = await pickPdfFile();
      if (!selected) return;
      setInput(selected);
      setAnswerMatches([]);
      setNewBookName(selected.profileId === "math2-exams-2010-2026" ? "数学二真题错题" : `${selected.name}·错题`);
      const suggested = selected.boundBookId ?? (selected.profileId.startsWith("wzx")
        ? books.find((b) => b.id === "book005")?.id
        : selected.profileId.startsWith("linear")
          ? books.find((b) => b.name.includes("线代") || b.name.includes("线性代数"))?.id
          : undefined);
      setTargetId(suggested ?? "");
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function chooseAnswers() {
    if (!input) return;
    setBusy(true); setError(null);
    try {
      const chosen = await pickAnswerDirectory(input);
      if (chosen) { setInput({ ...input, answersDir: chosen.path }); setAnswerMatches(chosen.matches); }
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function createMatchingBook() {
    if (!input) return;
    const title = newBookName.trim();
    if (!title) { setError("请填写对应题库名称。"); return; }
    setBusy(true); setError(null);
    try {
      const entry = await addBook(input.boundBookId ?? `pdfbook-${crypto.randomUUID().slice(0, 12)}`, title);
      setTargetId(entry.id);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function start() {
    if (!input || !target) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const existing = await loadOpenClawQuestions(target.id);
      const jobId = await startPdfJob(input, target.id, target.name, existing);
      setJob({ jobId, bookId: target.id, status: "running", stage: "validating", done: 0, total: 0 });
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function confirmPreview() {
    if (!job || !selectedKeys.length) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const batch = await confirmPdfJob(job.jobId, selectedKeys);
      setJob({ ...job, status: "done", stage: "done", result: batch });
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function openImportedBook(bookId: string) {
    setBusy(true);
    try { await switchBook(bookId); navigate("/questions"); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  function reviewed(batch: PdfBatch) {
    if (batch.reviewed) return true;
    if (readyBookId !== batch.bookId) return false;
    return batch.questionIds.some((id) => cards[id]?.card.reps > 0 || !!cards[id]?.card.last_review
      || reviewLogs.some((log) => log.questionId === id));
  }

  async function undo(batch: PdfBatch) {
    if (undoConfirmation !== batch.batchId) { setUndoConfirmation(batch.batchId); return; }
    setUndoConfirmation(null);
    setBusy(true); setError(null);
    try {
      await flushReviewWrites(batch.bookId);
      const raw = await undoPdfBatch(batch.batchId);
      if (input?.sourceFingerprint === batch.sourceFingerprint && input.boundBookId) {
        setInput(null);
      }
      if (useBookStore.getState().activeBookId === batch.bookId) {
        if (raw && useReviewStore.getState().readyBookId === batch.bookId) {
          const parsed = JSON.parse(raw);
          useReviewStore.getState().importReviewState(parsed.state ?? parsed);
        }
        await useQuestionStore.getState().loadQuestions();
        setBatches(await listPdfBatches(batch.bookId));
      }
      setMessage("本批导入已撤销。");
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  if (!isTauriRuntime()) return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <h1 className="text-2xl font-semibold">PDF 错题导入</h1>
      <p className="mt-4 text-ink/60">请在 Mac 桌面版选择 PDF。识别在本机完成，网页版暂不支持。</p>
    </div>
  );

  const result = job?.status === "done" ? job.result : null;
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
      <div>
        <p className="text-xs font-semibold tracking-widest text-slateblue">本地识别 · 按资料归档</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">从 PDF 导入错题</h1>
        <p className="mt-3 text-sm leading-6 text-ink/60">按资料的批注提取题目、引用图表及已有解析，预览后加入题库。无法可靠裁切的内容会跳过，并说明原因。</p>
      </div>
      <section className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="font-semibold">1. 选择复习资料</h2><p className="mt-1 text-xs text-ink/50">已支持：高数与线代讲义的红笔批注、自控课本的蓝色批注、数学二真题套卷及独立答案</p></div>
          <button type="button" disabled={busy || locked} onClick={() => void choose()} className="apple-pill px-5 py-2.5 text-sm font-semibold disabled:opacity-40">{busy ? "正在处理…" : input ? "更换 PDF" : "选择 PDF"}</button>
        </div>
        {input && <div className="mt-5 rounded-2xl bg-slateblue/5 p-4"><p className="font-medium">{input.name}</p><p className="mt-1 break-all text-xs text-ink/50">{input.pages} 页 · {input.pdfPath}</p></div>}
        {input?.profileId === "math2-exams-2010-2026" && <div className="mt-4 rounded-2xl border border-black/10 p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">真题答案文件夹</p><button type="button" disabled={busy || locked} onClick={() => void chooseAnswers()} className="apple-ghost-pill px-4 py-2 text-sm">选择答案文件夹</button></div>
          <p className="mt-2 break-all text-xs text-ink/60">{input.answersDir ?? "请选择按年份保存解析 PDF 的文件夹。题目和答案将分别保存来源整页。"}</p>
          {answerMatches.length > 0 && <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-2">{answerMatches.map((m) => <li key={m.year} className={m.status === "matched" ? "text-moss" : "text-cinnabar"}>{m.year}年：{m.detail}</li>)}</ul>}
        </div>}
        <div className="mt-6 border-t border-black/5 pt-5">
          <label htmlFor="pdf-target" className="font-semibold">2. 选择这份资料对应的题库</label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select id="pdf-target" value={targetId} disabled={!input || busy || locked || !!input.boundBookId} onChange={(e) => setTargetId(e.target.value)} className="min-w-64 flex-1 rounded-xl border border-black/10 px-4 py-3 text-sm">
              <option value="">请选择对应书本</option>{books.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
            </select>
          </div>
          {input && (!input.boundBookId || !books.some((book) => book.id === input.boundBookId)) && <div className="mt-3 flex flex-wrap items-center gap-3">
            <input aria-label="新建题库名称" value={newBookName} maxLength={80} disabled={busy || locked} onChange={(event) => setNewBookName(event.target.value)} className="min-w-64 flex-1 rounded-xl border border-black/10 px-4 py-3 text-sm" />
            <button type="button" disabled={busy || locked || !newBookName.trim()} onClick={() => void createMatchingBook()} className="apple-ghost-pill px-4 py-2 text-sm">{input.boundBookId ? "恢复对应题库" : "新建对应题库"}</button>
          </div>}
          {input?.boundBookId && <p className="mt-2 text-xs text-ink/50">这份资料已绑定对应题库，后续只追加到该书本。</p>}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="button" disabled={!input || !target || busy || locked || (input.profileId === "math2-exams-2010-2026" && !input.answersDir)} onClick={() => void start()} className="apple-pill px-6 py-3 text-sm font-semibold disabled:opacity-40">识别并预览</button>
            <p className="text-xs text-ink/50">保留批注原迹 · 自动去重 · 原 PDF 只读</p>
          </div>
        </div>
      </section>
      {running && <section className="rounded-3xl border border-white/70 bg-white/70 p-6" aria-live="polite">
        <div className="flex items-center justify-between gap-4"><p className="font-semibold">{stages[job.stage] ?? "正在处理"}</p>
          <button type="button" disabled={job.stage === "importing"} onClick={() => void cancelPdfJob(job.jobId).catch((e) => setError(String(e)))} className="apple-ghost-pill px-4 py-2 text-sm disabled:opacity-40">取消任务</button></div>
        {job.total > 0 && <><p className="mt-3 text-sm text-ink/60">{job.done} / {job.total}</p><progress className="mt-3 h-2 w-full" value={job.done} max={job.total} /></>}
        <p className="mt-3 text-xs text-ink/50">可以切换页面。识别完成后请返回预览，确认后才会加入题库。</p>
      </section>}
      {(error || job?.error) && <p role="alert" className="rounded-2xl bg-cinnabar/10 p-4 text-sm text-cinnabar">{error ?? job?.error}</p>}
      {(message || job?.status === "cancelled") && <p role="status" className="rounded-2xl bg-moss/10 p-4 text-sm">{message ?? "任务已取消，未导入本批题目。"}</p>}
      {job?.status === "preview" && <PdfImportPreview
        jobId={job.jobId} bookName={books.find((b) => b.id === job.bookId)?.name ?? job.bookId}
        preview={preview} index={previewIndex} selectedKeys={selectedKeys} busy={busy}
        onIndex={setPreviewIndex} onSelection={setSelectedKeys} onConfirm={() => void confirmPreview()}
        onCancel={() => void cancelPdfJob(job.jobId).catch((e) => setError(String(e)))}
      />}
      {result && <section className="rounded-3xl border border-white/70 bg-white/70 p-6">
        <h2 className="text-xl font-semibold">导入完成</h2><p className="mt-3 text-sm text-ink/70">{result.sourceName} → {books.find((b) => b.id === result.bookId)?.name ?? result.bookId}</p>
        <p className="mt-2 text-sm">新增 {result.imported} 道 · 跳过重复 {result.duplicates} 道 · {new Set(result.issues.map((issue) => issue.page)).size} 页有待检查项</p>
        <button type="button" disabled={busy} onClick={() => void openImportedBook(result.bookId)} className="apple-ghost-pill mt-4 inline-block px-4 py-2 text-sm">打开对应题库</button>
        {result.issues.length > 0 && <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">查看跳过原因</summary><ul className="mt-3 space-y-2 text-ink/60">{result.issues.map((item, i) => <li key={i}>PDF第 {item.page} 页：{item.reason}</li>)}</ul></details>}
      </section>}
      <section className="rounded-3xl border border-white/70 bg-white/70 p-6">
        <h2 className="font-semibold">当前题库的导入记录</h2><p className="mt-2 text-xs text-ink/50">仅未开始复习的批次可以撤销，记录会保留。</p>
        {batches.length === 0 && <p className="mt-5 text-sm text-ink/45">尚无导入批次。</p>}
        <div className="mt-4 divide-y divide-black/5">{batches.map((batch) => <div key={batch.batchId} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><p className="text-sm font-medium">{batch.sourceName}</p><p className="mt-1 text-xs text-ink/50">{new Date(batch.createdAt).toLocaleString("zh-CN")} · 新增 {batch.imported} 道 · {batch.undone ? "已撤销" : reviewed(batch) ? "已开始复习" : "尚未复习"}</p></div>
          <div className="flex items-center gap-2">
            {undoConfirmation === batch.batchId && <><span className="text-xs text-cinnabar">移除本批新增的 {batch.imported} 道题目？</span><button type="button" onClick={() => setUndoConfirmation(null)} className="px-2 text-xs text-ink/50">取消</button></>}
            <button type="button" disabled={busy || locked || batch.undone || reviewed(batch) || batch.imported === 0} onClick={() => void undo(batch)} className="apple-ghost-pill px-4 py-2 text-xs disabled:opacity-35">{undoConfirmation === batch.batchId ? "确认撤销" : "撤销本批"}</button>
          </div>
        </div>)}</div>
      </section>
    </div>
  );
}
