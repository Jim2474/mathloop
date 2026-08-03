import type { Question } from "../types/question";
import { setQuestionImageFixes } from "../utils/questionImages";
import { getActiveBookId } from "../utils/bookId";
import { initializeDesktopRuntime, invokeDesktop, isTauriRuntime } from "./desktopBridge";
import { getCustomQuestions, getCustomQuestionsAsync } from "./customQuestionService";
import { isCustomBook, loadCustomBookQuestions } from "./webBookService";

const DEFAULT_QUESTIONS_URL = "/data/questions.json";
const DEFAULT_QUESTION_IMAGE_FIXES_URL = "/data/question-image-fixes.json";

export async function loadOpenClawQuestions(): Promise<Question[]> {
  const bookId = getActiveBookId();

  // Custom books (screenshot-only, registered in localStorage) load from IndexedDB
  // This works in both web and Tauri (WKWebView supports localStorage + IndexedDB)
  if (bookId && isCustomBook(bookId)) {
    const questions = await loadCustomBookQuestions(bookId);
    // Use async version to recover screenshots from IndexedDB if localStorage was cleared
    const customQ = await getCustomQuestionsAsync(bookId);
    return [...questions, ...customQ];
  }

  if (isTauriRuntime()) {
    await initializeDesktopRuntime(bookId ?? undefined);
    const text = await invokeDesktop<string>("load_questions_json", { bookId });
    const data: unknown = JSON.parse(text);

    if (!Array.isArray(data)) {
      throw new Error("questions.json 顶层必须是题目数组。");
    }

    // Also merge any pasted screenshot questions for this book (stored in IndexedDB)
    // Use async version so screenshots survive app restarts even if localStorage is cleared
    const customQ = bookId ? await getCustomQuestionsAsync(bookId) : [];
    return [...(data as Question[]), ...customQ];
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

  // Merge screenshot questions for this book (async for restart resilience)
  const baseQuestions = data as Question[];
  const customQ = bookId ? await getCustomQuestionsAsync(bookId) : [];
  return [...baseQuestions, ...customQ];
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
