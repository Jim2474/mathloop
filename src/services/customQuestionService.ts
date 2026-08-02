/**
 * customQuestionService.ts
 *
 * Manages "custom questions" — user-created entries backed by a pasted screenshot.
 * Images are stored in IndexedDB (to avoid localStorage 5 MB limit).
 * Metadata (id, createdAt, note) is stored in localStorage.
 *
 * Custom question IDs follow the pattern: custom-{bookId}-{timestamp}
 * Question images use the path:  custom://{questionId}
 * The useAssetUrl hook resolves "custom://" paths from IndexedDB.
 */

import type { Question } from "../types/question";

// ─── IndexedDB helpers ───────────────────────────────────────────────────────

const DB_NAME = "mathloop-custom-images";
const DB_VERSION = 1;
const STORE_NAME = "images";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(key: string, value: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGet(key: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function dbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const META_KEY_PREFIX = "mathloop-custom-questions::";

interface CustomQuestionMeta {
  id: string;
  bookId: string;
  note: string;
  createdAt: string;
}

function getMetaKey(bookId: string): string {
  return `${META_KEY_PREFIX}${bookId}`;
}

function loadMeta(bookId: string): CustomQuestionMeta[] {
  try {
    const raw = localStorage.getItem(getMetaKey(bookId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomQuestionMeta[]) : [];
  } catch {
    return [];
  }
}

function saveMeta(bookId: string, items: CustomQuestionMeta[]): void {
  localStorage.setItem(getMetaKey(bookId), JSON.stringify(items));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Save a new custom question (screenshot + optional note) for the given book.
 * Returns the newly created question ID.
 */
export async function createCustomQuestion(
  bookId: string,
  imageDataUrl: string,
  note = "",
): Promise<string> {
  const id = `custom-${bookId}-${Date.now()}`;

  // Store image in IndexedDB
  await dbPut(id, imageDataUrl);

  // Store metadata in localStorage
  const meta = loadMeta(bookId);
  meta.push({ id, bookId, note: note.trim(), createdAt: new Date().toISOString() });
  saveMeta(bookId, meta);

  return id;
}

/**
 * Load the base64 data URL for a custom question image from IndexedDB.
 * Returns null if not found.
 */
export async function getCustomQuestionImageUrl(questionId: string): Promise<string | null> {
  return dbGet(questionId);
}

/**
 * Delete a custom question (image from IndexedDB + metadata from localStorage).
 */
export async function deleteCustomQuestion(bookId: string, questionId: string): Promise<void> {
  await dbDelete(questionId);
  const meta = loadMeta(bookId).filter((m) => m.id !== questionId);
  saveMeta(bookId, meta);
}

/**
 * Build Question objects for all custom questions of the given book.
 * These are merged into the question library so FSRS works normally.
 */
export function getCustomQuestions(bookId: string): Question[] {
  const meta = loadMeta(bookId);
  return meta.map((m) => buildCustomQuestion(m));
}

function buildCustomQuestion(m: CustomQuestionMeta): Question {
  const dateLabel = m.createdAt.slice(5, 10); // e.g. "08-02"
  return {
    id: m.id,
    bookName: "自定义截图",
    chapter: "自定义截图",
    section: "",
    questionNo: `截图 ${dateLabel}`,
    pageStart: 0,
    pageEnd: 0,
    pdfPageLabel: "",
    printedPageNumber: "",
    pageRangeText: "",
    questionText: m.note || "（截图题目）",
    tips: "",
    questionImage: `custom://${m.id}`,
    questionImages: [`custom://${m.id}`],
    answerImage: null,
    answerImages: null,
    knowledgeTags: [],
    mistakeTags: [],
    difficulty: 0,
    valueStar: 0,
    status: "active",
    fsrs: {
      state: "new",
      difficulty: null,
      stability: null,
      retrievability: null,
      lastReview: null,
      nextReview: null,
      reviewCount: 0,
      lapseCount: 0,
    },
    review: {
      mastery: 0,
      lastResult: null,
      history: [],
    },
    meta: {
      source: "custom-paste",
      uncertain: false,
      note: m.note,
    },
  };
}
