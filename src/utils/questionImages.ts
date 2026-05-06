import type { Question } from "../types/question";

export function toPublicAssetUrl(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function getQuestionImagePaths(question: Question): string[] {
  const paths = [question.questionImage, ...(question.questionImages ?? [])].filter(isNonEmptyPath);
  return Array.from(new Set(paths));
}

export function getAnswerImagePaths(question: Question): string[] {
  const paths = [question.answerImage, ...(question.answerImages ?? [])].filter(isNonEmptyPath);
  return Array.from(new Set(paths));
}

function isNonEmptyPath(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}
