import type { Question } from "../types/question";
import { invokeDesktop } from "./desktopBridge";

export type PdfInput = {
  pdfPath: string; sourceFingerprint: string; profileId: string; name: string;
  answersDir?: string;
  pages: number; boundBookId?: string | null;
};
export type PdfBatch = {
  batchId: string; bookId: string; sourceName: string; sourceFingerprint: string;
  createdAt: string; imported: number; duplicates: number;
  issues: { page: number; reason: string }[]; questionIds: string[];
  reviewed: boolean; undone: boolean;
};
export type PdfJob = {
  jobId: string; bookId: string;
  status: "" | "running" | "preview" | "done" | "error" | "cancelled";
  stage: string; done: number; total: number; error?: string; result?: PdfBatch;
};
let appliedJobId = "";
export function claimCompletedPdfJob(job: PdfJob, activeBookId: string | null): boolean {
  if (job.status !== "done" || job.bookId !== activeBookId || !job.jobId || appliedJobId === job.jobId) return false;
  appliedJobId = job.jobId;
  return true;
}
export type AnswerMatch = { year: number; status: "matched" | "missing" | "conflict"; pdfPath?: string; detail: string };
export const pickAnswerDirectory = (input: PdfInput) => invokeDesktop<{ path: string; matches: AnswerMatch[] } | null>("pick_pdf_answer_directory", { input });
export const pickPdfFile = () => invokeDesktop<PdfInput | null>("pick_pdf_import_file");
export const getPdfJob = () => invokeDesktop<PdfJob>("get_pdf_import_job");
export const cancelPdfJob = (jobId: string) => invokeDesktop<void>("cancel_pdf_import", { jobId });
export const listPdfBatches = (bookId: string) => invokeDesktop<PdfBatch[]>("list_pdf_import_batches", { bookId });
export const undoPdfBatch = (batchId: string) => invokeDesktop<string | null>("undo_pdf_import", { batchId });
export const exportPdfLibrary = (bookId: string) => invokeDesktop<boolean>("export_pdf_library_backup", { bookId });
export const restorePdfLibrary = (bookId: string) => invokeDesktop<number | null>("restore_pdf_library_backup", { bookId });
export const startPdfJob = (input: PdfInput, bookId: string, bookName: string, questions: Question[]) =>
  invokeDesktop<string>("start_pdf_import", { input, bookId, bookName,
    // Compare with the full library, including legacy published PDF questions.
    existingQuestions: questions.filter((q) => q.pdfSource).map((q) => ({ id: q.id, pdfSource: q.pdfSource })),
  });
export function mergeImportedQuestions(base: Question[], imported: Question[]): Question[] {
  const ids = new Set(base.map((q) => q.id));
  for (const q of imported) {
    if (ids.has(q.id)) throw new Error(`PDF 导入题目 ID 冲突：${q.id}，请检查数据后重试。`);
    ids.add(q.id);
  }
  const questions = [...base, ...imported];
  if (questions.length && questions.every((q) => q.exam)) {
    questions.sort((a, b) => a.exam!.year - b.exam!.year || a.exam!.questionNumber - b.exam!.questionNumber);
  }
  return questions;
}

export type PdfPreview = {
  questions: Question[];
  duplicates: number;
  issues: { page: number; reason: string }[];
  profile: { name: string };
};
export const getPdfPreview = (jobId: string) => invokeDesktop<PdfPreview>("get_pdf_import_preview", { jobId });
export const confirmPdfJob = (jobId: string, sourceKeys: string[]) => invokeDesktop<PdfBatch>("confirm_pdf_import", { jobId, sourceKeys });
