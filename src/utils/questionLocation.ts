import type { Question } from "../types/question";

// Read-time compatibility: enrich old imports without rewriting IDs or review data.
export function enrichQuestionLocation(q: Question): Question {
  if (q.printedPageNumber || !q.pdfSource?.sourceFingerprint) return q;
  const page = q.pdfSource.pdfPageNumber ?? q.pageStart;
  const offsets: Record<string, { offset: number; last: number }> = {
    "3a86329ba20153d00b52a1e1f72b7a77c751c61a8c18a35ef9daad12bb638b0a": { offset: 4, last: 108 },
    "2982c22df232fcd23181ab865b147a0784e49259d7a0dd1bdb78d95a92da5006": { offset: 13, last: 315 },
  };
  const mapping = offsets[q.pdfSource.sourceFingerprint];
  if (!mapping || page <= mapping.offset || page > mapping.last) return q;
  const end = q.pageEnd || page;
  if (end > mapping.last) return q;
  return { ...q, printedPageNumber: page === end ? String(page - mapping.offset) : `${page - mapping.offset}–${end - mapping.offset}` };
}

export function getQuestionLocator(q: Question): string {
  if (q.exam) {
    const parts = q.exam.markedParts.length ? ` · 标记小问：${q.exam.markedParts.join("、")}` : "";
    const pages = q.pageStart === q.pageEnd ? String(q.pageStart) : `${q.pageStart}–${q.pageEnd}`;
    const printed = q.printedPageNumber && q.printedPageNumber !== pages ? ` · 试卷册第${q.printedPageNumber}页` : "";
    return `${q.exam.year}年${q.exam.subject}真题 · ${q.exam.sectionLabel ?? ""}第${q.exam.questionNumber}题${parts} · PDF 第${pages}页${printed}`;
  }
  const start = q.pdfSource?.pdfPageNumber ?? q.pageStart;
  const end = q.pageEnd || start;
  const pdf = Number.isFinite(start) && start > 0
    ? `PDF 第 ${start === end ? start : `${start}–${end}`} 页` : q.pdfPageLabel || "PDF 页码未标注";
  const label = /^\d+$/.test(q.questionNo) ? `第 ${q.questionNo} 题` : q.questionNo;
  return `${pdf} · ${q.printedPageNumber ? `书本第 ${q.printedPageNumber} 页` : "书本页码未识别"} · ${label}`;
}

export function getQuestionSourceName(q: Question): string {
  return q.pdfSource?.pdfPath.split(/[\\/]/).pop() || q.bookName;
}

export function getQuestionImageSourceLabel(q: Question, index = 0, answer = false): string {
  const ref = (answer ? q.pdfSource?.answerPageRefs : q.pdfSource?.questionPageRefs)?.[index];
  if (!ref) return answer ? `${q.bookName} · 解析所在页` : getQuestionLocator(q);
  const name = ref.pdfPath.split(/[\\/]/).pop();
  const location = q.exam ? `${q.exam.year}年${q.exam.subject}真题 · ${q.exam.sectionLabel ?? ""}第${q.exam.questionNumber}题` : q.bookName;
  const printed = ref.printedPageNumber ? ` · 试卷册第${ref.printedPageNumber}页` : "";
  return `${location} · ${name} · PDF 第${ref.pdfPageNumber}页${printed}`;
}
