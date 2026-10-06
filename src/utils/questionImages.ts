import type { Question } from "../types/question";
import { toDesktopAssetUrl } from "../services/desktopBridge";
import { getActiveBookId } from "./bookId";

let questionImageFixes: Record<string, string> = {};

export function setQuestionImageFixes(fixes: Record<string, string>): void {
  questionImageFixes = fixes;
}

export function toPublicAssetUrl(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }
  const desktopUrl = toDesktopAssetUrl(trimmed);
  if (desktopUrl) {
    return desktopUrl;
  }
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const bookId = getActiveBookId();
  if (bookId && !cleanPath.startsWith("/books/")) {
    return `/books/${bookId}${cleanPath}`;
  }
  return cleanPath;
}

export function getQuestionImagePaths(question: Question): string[] {
  const fixedPath = questionImageFixes[question.id];
  if (isNonEmptyPath(fixedPath)) {
    return [fixedPath];
  }
  const paths = [
    question.questionImage,
    ...(question.questionImages ?? []),
  ].filter(isNonEmptyPath);
  return Array.from(new Set(paths));
}

export function getAnswerImagePaths(question: Question): string[] {
  const paths = [question.answerImage, ...(question.answerImages ?? [])].filter(isNonEmptyPath);
  return Array.from(new Set(paths));
}

export function getQuestionPageImagePath(question: Question, index = 0, answer = false): string {
  const source = question.pdfSource;
  const pages = answer ? source?.answerPageNumbers : source?.questionPageNumbers;
  const page = pages?.[index] ?? (answer ? question.answerMeta?.answerPageStart : question.pageStart) ?? question.pageStart;
  const fullIndex = source?.pageImageNumbers?.indexOf(page) ?? -1;
  if (fullIndex >= 0 && question.pageImages?.[fullIndex]) return question.pageImages[fullIndex];
  if (source?.fullImage && index === 0 && !answer) return source.fullImage;
  if (source?.sourceFingerprint && source.batchId) {
    let resolvedPage = page;
    if (!pages) {
      const count = (answer ? question.answerImages : question.questionImages)?.length ?? 1;
      const first = answer ? question.answerMeta?.answerPageStart : question.pageStart;
      const last = answer ? question.answerMeta?.answerPageEnd : question.pageEnd;
      if (!first || !last) return "";
      // Older imports omit per-image pages. The final slice has a known end page;
      // other answer slices are safe only when there are no omitted blank pages.
      if (index === count - 1) resolvedPage = last;
      else if ((index === 0 && !answer) || last - first + 1 === count) resolvedPage = first + index;
      else return "";
    }
    const bookId = getActiveBookId();
    return bookId ? `pdf-source-page://${encodeURIComponent(bookId)}/${encodeURIComponent(question.id)}/${resolvedPage}` : "";
  }
  if (source && answer) return "";
  if (!Number.isFinite(question.pageStart) || question.pageStart <= 0 || question.questionImage?.startsWith("custom://")) return "";
  const bookId = getActiveBookId();
  const pageFile = `page_${String(question.pageStart).padStart(3, "0")}.png`;
  return bookId ? `books/${bookId}/pages/${pageFile}` : `pages/${pageFile}`;
}

function isNonEmptyPath(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}
