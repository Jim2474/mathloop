import type { Question } from "../types/question";
import { setQuestionImageFixes } from "../utils/questionImages";
import { getActiveBookId } from "../utils/bookId";
import { initializeDesktopRuntime, invokeDesktop, isTauriRuntime } from "./desktopBridge";

const DEFAULT_QUESTIONS_URL = "/data/questions.json";
const DEFAULT_QUESTION_IMAGE_FIXES_URL = "/data/question-image-fixes.json";

export async function loadOpenClawQuestions(): Promise<Question[]> {
  const bookId = getActiveBookId();

  if (isTauriRuntime()) {
    await initializeDesktopRuntime(bookId ?? undefined);
    const text = await invokeDesktop<string>("load_questions_json", { bookId });
    const data: unknown = JSON.parse(text);

    if (!Array.isArray(data)) {
      throw new Error("questions.json 顶层必须是题目数组。");
    }

    setQuestionImageFixes(await loadDesktopQuestionImageFixes(bookId));
    return data as Question[];
  }

  const questionsUrl = bookId
    ? `/books/${bookId}/data/questions.json`
    : DEFAULT_QUESTIONS_URL;

  const response = await fetch(questionsUrl, { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`读取 ${questionsUrl} 失败：${response.status} ${response.statusText}`);
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("questions.json 顶层必须是题目数组。");
  }

  setQuestionImageFixes(await loadQuestionImageFixes(bookId));
  return data as Question[];
}

async function loadDesktopQuestionImageFixes(bookId: string | null): Promise<Record<string, string>> {
  try {
    const text = await invokeDesktop<string | null>("load_question_image_fixes_json", { bookId });
    if (!text) {
      return {};
    }
    const data: unknown = JSON.parse(text);
    if (!isRecord(data)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(data)
        .map(([questionId, value]) => [questionId, getFixImagePath(value)])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  } catch {
    return {};
  }
}

async function loadQuestionImageFixes(bookId: string | null): Promise<Record<string, string>> {
  try {
    const fixesUrl = bookId
      ? `/books/${bookId}/data/question-image-fixes.json`
      : DEFAULT_QUESTION_IMAGE_FIXES_URL;
    const response = await fetch(fixesUrl, { cache: "no-cache" });
    if (!response.ok) {
      return {};
    }
    const data: unknown = await response.json();
    if (!isRecord(data)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(data)
        .map(([questionId, value]) => [questionId, getFixImagePath(value)])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  } catch {
    return {};
  }
}

function getFixImagePath(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (isRecord(value) && typeof value.fixedImage === "string") {
    return value.fixedImage.trim();
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
