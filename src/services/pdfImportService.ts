/**
 * pdfImportService.ts
 *
 * Frontend service for the PDF import pipeline.
 * Reads staged import data (produced by the Python scripts) from the
 * Tauri data directory and handles importing questions into IndexedDB.
 *
 * Staging layout (written by Python scripts):
 *   ~/Library/Application Support/MathLoop/books/{bookId}/pdf-import/
 *     import_batch.json       — Question[] metadata
 *     images/p040_full.png    — Full-page image (with authentic red ink)
 *     images/p040_t1_crop.png — Focused problem crop (with authentic red ink)
 */

import type { Question } from "../types/question";
import { isTauriRuntime, invokeDesktop } from "./desktopBridge";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PdfImportQuestion = Question & {
  /** Extended field written by the Python import scripts. */
  pdfSource?: {
    pdfPath: string;
    pdfPageIndex: number;
    pdfPageNumber?: number;
    pdfPageLabel: string;
    targetIndex?: number;
    targetLabel?: string;
    totalTargetsOnPage?: number;
    annotBoundingBox: { x0: number; y0: number; x1: number; y1: number };
    cropBoundingBox?: { x0: number; y0: number; x1: number; y1: number };
    strokeCount?: number;
    cropImage?: string;
    fullImage?: string;
    importedAt: string;
    importVersion: number;
  };
};

export type ImportVerdict = "pending" | "ok" | "skip" | "wrong";

export type ImportPreviewItem = {
  question: PdfImportQuestion;
  verdict: ImportVerdict;
  imageDataUrl: string | null;       // crop image
  fullPageDataUrl?: string | null;   // full page image
  viewMode: "crop" | "full";
  /** True if a question with the same ID already exists in the book. */
  isDuplicate: boolean;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

// ─── Tauri bridge helpers ─────────────────────────────────────────────────────

async function readPdfImportStage(bookId: string): Promise<PdfImportQuestion[] | null> {
  if (!isTauriRuntime()) return null;
  const raw = await invokeDesktop<string | null>("read_pdf_import_stage", { bookId });
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PdfImportQuestion[]) : null;
  } catch {
    return null;
  }
}

async function loadStagedImageDataUrl(
  bookId: string,
  pathInImport: string,
): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invokeDesktop<string>("load_staged_image_data_url", {
      bookId,
      pathInImport,
    });
  } catch {
    return null;
  }
}

// ─── IndexedDB helpers (mirrors webBookService.ts) ────────────────────────────

const CUSTOM_BOOKS_DB_NAME = "mathloop-custom-books";
const CUSTOM_BOOKS_STORE = "data";

function openBooksDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CUSTOM_BOOKS_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CUSTOM_BOOKS_STORE)) {
        db.createObjectStore(CUSTOM_BOOKS_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openBooksDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_BOOKS_STORE, "readonly");
    const req = tx.objectStore(CUSTOM_BOOKS_STORE).get(key);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: string): Promise<void> {
  const db = await openBooksDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_BOOKS_STORE, "readwrite");
    tx.objectStore(CUSTOM_BOOKS_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadExistingQuestions(bookId: string): Promise<PdfImportQuestion[]> {
  const raw = await idbGet(`questions::${bookId}`);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PdfImportQuestion[]) : [];
  } catch {
    return [];
  }
}

// ─── Custom images DB (for screenshot questions — mirrors customQuestionService) ─

const CUSTOM_IMAGES_DB_NAME = "mathloop-custom-images";
const CUSTOM_IMAGES_STORE = "images";

function openImagesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CUSTOM_IMAGES_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CUSTOM_IMAGES_STORE)) {
        db.createObjectStore(CUSTOM_IMAGES_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutImage(key: string, dataUrl: string): Promise<void> {
  const db = await openImagesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_IMAGES_STORE, "readwrite");
    tx.objectStore(CUSTOM_IMAGES_STORE).put(dataUrl, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the staged import batch and prepare preview items.
 * Loads images lazily to avoid memory spikes.
 */
export async function loadImportPreview(bookId: string): Promise<ImportPreviewItem[]> {
  const staged = await readPdfImportStage(bookId);
  if (!staged || staged.length === 0) return [];

  // Build lookup of existing IDs
  const existing = await loadExistingQuestions(bookId);
  const existingIds = new Set(existing.map((q) => q.id));

  // Also check existing page & target combinations to prevent duplicate imports
  const existingPageTargets = new Set(
    existing
      .filter((q) => q.pdfSource !== undefined)
      .map((q) => `${q.pdfSource!.pdfPageIndex}_${q.pdfSource!.targetIndex ?? 1}`),
  );

  const items: ImportPreviewItem[] = staged.map((q) => {
    const pIdx = q.pdfSource?.pdfPageIndex;
    const tIdx = q.pdfSource?.targetIndex ?? 1;
    const isDup =
      existingIds.has(q.id) ||
      (pIdx !== undefined && existingPageTargets.has(`${pIdx}_${tIdx}`));

    return {
      question: q,
      verdict: isDup ? ("skip" as ImportVerdict) : ("pending" as ImportVerdict),
      imageDataUrl: null,
      fullPageDataUrl: null,
      viewMode: "crop",
      isDuplicate: isDup,
    };
  });

  return items;
}

/**
 * Load the image for a single preview item (crop or full page).
 * Called lazily per-item to keep memory usage low.
 */
export async function loadItemImage(
  bookId: string,
  item: ImportPreviewItem,
  variant: "crop" | "full" = "crop",
): Promise<string | null> {
  const imgPath =
    variant === "full"
      ? item.question.pdfSource?.fullImage
      : item.question.pdfSource?.cropImage ?? item.question.questionImage;

  if (!imgPath) return null;
  const pathInImport = imgPath.startsWith("pdf-import/")
    ? imgPath.slice("pdf-import/".length)
    : imgPath;

  return loadStagedImageDataUrl(bookId, pathInImport);
}

/**
 * Import approved questions into the book's IndexedDB question list.
 * Skips questions marked as "skip" or "wrong".
 * Does NOT delete or modify any existing questions.
 */
export async function confirmImport(
  bookId: string,
  items: ImportPreviewItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const toImport = items.filter((item) => item.verdict === "ok");
  if (toImport.length === 0) {
    return { imported: 0, skipped: items.length, errors: [] };
  }

  // Load existing questions (to append to, not replace)
  const existing = await loadExistingQuestions(bookId);
  const existingIds = new Set(existing.map((q) => q.id));

  const errors: string[] = [];
  let imported = 0;
  const newQuestions: PdfImportQuestion[] = [...existing];

  for (let i = 0; i < toImport.length; i++) {
    const item = toImport[i];
    const q = item.question;

    if (existingIds.has(q.id)) {
      continue;
    }

    try {
      // Store the focused question crop into IndexedDB so it renders in review
      if (item.imageDataUrl) {
        await idbPutImage(q.id, item.imageDataUrl);
      }
      // If full page image data URL was loaded, store it under {id}-full for full-page inspection
      if (item.fullPageDataUrl) {
        await idbPutImage(`${q.id}-full`, item.fullPageDataUrl);
      }

      newQuestions.push(q);
      existingIds.add(q.id);
      imported++;
    } catch (e) {
      errors.push(`${q.id}: ${e instanceof Error ? e.message : String(e)}`);
    }

    onProgress?.(i + 1, toImport.length);
  }

  // Write merged question list back to IndexedDB
  await idbPut(`questions::${bookId}`, JSON.stringify(newQuestions));

  return {
    imported,
    skipped: items.length - toImport.length,
    errors,
  };
}
