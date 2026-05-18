import type { Question } from "../types/question";
import { setQuestionImageFixes } from "../utils/questionImages";
import { initializeDesktopRuntime, invokeDesktop, isTauriRuntime } from "./desktopBridge";

const QUESTIONS_URL = "/data/questions.json";
const QUESTION_IMAGE_FIXES_URL = "/data/question-image-fixes.json";

function getActiveBookId(): string | null {
  try {
    const raw = localStorage.getItem("mathloop-active-book");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.activeBookId ?? null;
  } catch {
    return null;
  }
}

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

  const response = await fetch(QUESTIONS_URL, { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`读取 ${QUESTIONS_URL} 失败：${response.status} ${response.statusText}`);
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("questions.json 顶层必须是题目数组。");
  }

  setQuestionImageFixes(await loadQuestionImageFixes());
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

async function loadQuestionImageFixes(): Promise<Record<string, string>> {
  try {
    const response = await fetch(QUESTION_IMAGE_FIXES_URL, { cache: "no-cache" });
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
