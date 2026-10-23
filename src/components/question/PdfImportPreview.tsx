import type { PdfPreview } from "../../services/pdfImportService";
import type { Question } from "../../types/question";
import { getQuestionLocator, getQuestionImageSourceLabel } from "../../utils/questionLocation";
import QuestionImage from "./QuestionImage";

type Props = {
  jobId: string;
  bookName: string;
  preview: PdfPreview | null;
  index: number;
  selectedKeys: string[];
  busy: boolean;
  onIndex: (index: number) => void;
  onSelection: (keys: string[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function PdfImportPreview({ jobId, bookName, preview, index, selectedKeys, busy, onIndex, onSelection, onConfirm, onCancel }: Props) {
  const question = preview?.questions[index];
  const key = question?.pdfSource?.sourceKey;
  return (
    <section className="rounded-3xl border border-white/70 bg-white/70 p-6">
      <h2 className="text-xl font-semibold">3. 预览并确认</h2>
      <p className="mt-2 text-sm text-ink/60">将加入：{bookName}。请检查裁切和解析，确认前不会添加题目。</p>
      {!preview ? <p className="mt-5 text-sm">正在读取预览…</p> : <>
        <p className="mt-4 text-sm">待确认 {preview.questions.length} 道 · 已选 {selectedKeys.length} 道 · 跳过重复 {preview.duplicates} 道</p>
        {question && key ? <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy} onClick={() => onSelection(preview.questions.map((q) => q.pdfSource!.sourceKey!))} className="apple-ghost-pill px-4 py-2 text-xs">全选</button>
            <button type="button" disabled={busy} onClick={() => onSelection([])} className="apple-ghost-pill px-4 py-2 text-xs">全不选</button>
            <select aria-label="选择要预览的题目" value={index} disabled={busy} onChange={(e) => onIndex(Number(e.target.value))} className="min-w-0 flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm">
              {preview.questions.map((q, i) => <option key={q.id} value={i}>{i + 1}. {getQuestionLocator(q)}{selectedKeys.includes(q.pdfSource!.sourceKey!) ? " ✓" : ""}</option>)}
            </select>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-semibold">{preview.profile.name}</p><p className="mt-1 text-sm text-slateblue">{getQuestionLocator(question)}</p></div>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={selectedKeys.includes(key)} disabled={busy} onChange={(e) => onSelection(e.target.checked ? [...new Set([...selectedKeys, key])] : selectedKeys.filter((item) => item !== key))} />加入这道题</label>
          </div>
          <PreviewQuestion key={question.id} jobId={jobId} question={question} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <button type="button" disabled={busy || index === 0} onClick={() => onIndex(index - 1)} className="apple-ghost-pill px-4 py-2 text-sm disabled:opacity-35">上一题</button>
            <span className="text-xs text-ink/50">{index + 1} / {preview.questions.length}</span>
            <button type="button" disabled={busy || index >= preview.questions.length - 1} onClick={() => onIndex(index + 1)} className="apple-ghost-pill px-4 py-2 text-sm disabled:opacity-35">下一题</button>
          </div>
        </> : <p className="mt-4 text-sm text-ink/60">没有新的可导入题目。现有题目会保留原有数据。</p>}
        {preview.issues.length > 0 && <details className="mt-5 text-sm"><summary className="cursor-pointer">查看跳过原因</summary><ul className="mt-3 space-y-2 text-ink/60">{preview.issues.map((item, i) => <li key={i}>PDF 第 {item.page} 页：{item.reason}</li>)}</ul></details>}
      </>}
      <div className="mt-6 flex flex-wrap gap-3 border-t border-black/5 pt-5">
        <button type="button" disabled={busy || !preview || selectedKeys.length === 0} onClick={onConfirm} className="apple-pill px-6 py-3 text-sm font-semibold disabled:opacity-40">{busy ? "正在保存…" : `确认加入题库（${selectedKeys.length} 道）`}</button>
        <button type="button" disabled={busy} onClick={onCancel} className="apple-ghost-pill px-5 py-3 text-sm">取消预览</button>
      </div>
    </section>
  );
}

function PreviewQuestion({ jobId, question: q }: { jobId: string; question: Question }) {
  const imagePath = (name: string) => `pdf-preview://${jobId}/${encodeURIComponent(name)}`;
  const fullPath = (index: number, answer = false) => {
    const refs = answer ? q.pdfSource?.answerPageRefs : q.pdfSource?.questionPageRefs;
    if (refs) {
      const full = q.pageImages?.[refs[index]?.pageImageIndex];
      return full ? imagePath(full) : undefined;
    }
    const numbers = answer ? q.pdfSource?.answerPageNumbers : q.pdfSource?.questionPageNumbers;
    const page = numbers?.[index] ?? q.pageStart;
    const fullIndex = q.pdfSource?.pageImageNumbers?.indexOf(page) ?? -1;
    return fullIndex >= 0 && q.pageImages?.[fullIndex] ? imagePath(q.pageImages[fullIndex]) : undefined;
  };
  const answerStart = q.answerMeta?.answerPageStart;
  const answerEnd = q.answerMeta?.answerPageEnd;
  return <div className="mt-4 space-y-4">
    <p className="text-sm font-semibold">题目</p>
    {q.questionImages.map((name, index) => <QuestionImage key={name} path={imagePath(name)} alt={`${q.questionNo} 题目 ${index + 1}`} fullPagePath={fullPath(index)} fullPageLabel={getQuestionImageSourceLabel(q, index)} />)}
    {q.answerMeta?.hasAnswer === false ? <p className="rounded-2xl border border-black/5 p-4 text-sm text-ink/60">未附参考答案，仅导入题目和引用图表。可在复习时记录思路并自行评分。</p> : <details className="rounded-2xl border border-black/5 p-4"><summary className="cursor-pointer text-sm font-semibold">查看解析 · {q.answerMeta?.source ? `${q.answerMeta.source} · ` : ""}PDF 第 {answerStart === answerEnd ? answerStart : `${answerStart}–${answerEnd}`} 页{!q.exam && <> · 书本第 {q.answerMeta?.printedPageNumber || "未识别"} 页</>}</summary>
      <div className="mt-4 space-y-4">{q.answerImages?.map((name, index) => <QuestionImage key={name} path={imagePath(name)} alt={`${q.questionNo} 解析 ${index + 1}`} fullPagePath={fullPath(index, true)} fullPageLabel={getQuestionImageSourceLabel(q, index, true)} />)}</div>
    </details>}
  </div>;
}
