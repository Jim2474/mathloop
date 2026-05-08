import type { Question } from "../types/question";
import { toDesktopAssetUrl } from "../services/desktopBridge";

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
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
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

export function getQuestionPageImagePath(question: Question): string {
  if (!Number.isFinite(question.pageStart)) {
    return "";
  }
  return `pages/page_${String(question.pageStart).padStart(3, "0")}.png`;
}

function isNonEmptyPath(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}
