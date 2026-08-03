/**
 * webBookService.ts
 *
 * Web-mode custom book management.
 * Custom books are defined by the user: they provide a book ID, a display name,
 * and upload a questions.json file.
 *
 * Storage layout:
 *   localStorage["mathloop-custom-books"]  →  CustomBookEntry[]  (metadata list)
 *   IndexedDB["mathloop-custom-books"]["questions::{bookId}"]  →  JSON string of Question[]
 */

import type { BookEntry } from "../types/book";
import type { Question } from "../types/question";

const CUSTOM_BOOKS_LS_KEY = "mathloop-custom-books";
const CUSTOM_BOOKS_DB_NAME = "mathloop-custom-books";
const CUSTOM_BOOKS_DB_VERSION = 1;
const CUSTOM_BOOKS_STORE = "data";

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openBooksDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CUSTOM_BOOKS_DB_NAME, CUSTOM_BOOKS_DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CUSTOM_BOOKS_STORE)) {
        db.createObjectStore(CUSTOM_BOOKS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbBooksPut(key: string, value: string): Promise<void> {
  const db = await openBooksDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_BOOKS_STORE, "readwrite");
    tx.objectStore(CUSTOM_BOOKS_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbBooksGet(key: string): Promise<string | null> {
  const db = await openBooksDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CUSTOM_BOOKS_STORE, "readonly");
    const request = tx.objectStore(CUSTOM_BOOKS_STORE).get(key);
    request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the list of all custom books (sync, from localStorage).
 */
export function getCustomBooks(): BookEntry[] {
  try {
    const raw = localStorage.getItem(CUSTOM_BOOKS_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BookEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Get the list of all custom books (async, with IndexedDB fallback).
 * Use this on app startup to reliably recover the list even if localStorage
 * was cleared between sessions (can happen in Tauri WKWebView on some systems).
 */
export async function getCustomBooksAsync(): Promise<BookEntry[]> {
  const fromLS = getCustomBooks();
  if (fromLS.length > 0) return fromLS;
  // Fallback: read the manifest backup from IndexedDB
  try {
    const raw = await dbBooksGet("__manifest__");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Restore into localStorage so future sync reads work
      localStorage.setItem(CUSTOM_BOOKS_LS_KEY, raw);
      return parsed as BookEntry[];
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Check if a book ID belongs to a custom (user-added) book.
 */
export function isCustomBook(bookId: string): boolean {
  if (getCustomBooks().some((b) => b.id === bookId)) return true;
  try {
    const raw = localStorage.getItem(CUSTOM_BOOKS_LS_KEY);
    if (raw && raw.includes(`"${bookId}"`)) return true;
  } catch {
    // ignore
  }
  return false;
}

/**
 * Add a new custom book. Saves questions to IndexedDB, metadata to both
 * localStorage and IndexedDB (for cross-session resilience).
 */
export async function addCustomBook(
  bookId: string,
  name: string,
  questions: Question[],
): Promise<BookEntry> {
  const existing = getCustomBooks();
  if (existing.some((b) => b.id === bookId)) {
    throw new Error(`书本 ID "${bookId}" 已存在，请换一个。`);
  }

  // Save questions to IndexedDB
  await dbBooksPut(`questions::${bookId}`, JSON.stringify(questions));

  // Save metadata to localStorage AND IndexedDB (dual-write for resilience)
  const entry: BookEntry = { id: bookId, name, addedAt: new Date().toISOString() };
  const updated = [...existing, entry];
  const manifestJson = JSON.stringify(updated);
  localStorage.setItem(CUSTOM_BOOKS_LS_KEY, manifestJson);
  await dbBooksPut("__manifest__", manifestJson); // IndexedDB backup

  return entry;
}

/**
 * Load questions for a custom book from IndexedDB.
 */
export async function loadCustomBookQuestions(bookId: string): Promise<Question[]> {
  const raw = await dbBooksGet(`questions::${bookId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Question[]) : [];
  } catch {
    return [];
  }
}

/**
 * Remove a custom book (metadata from localStorage, data from IndexedDB).
 */
export async function removeCustomBook(bookId: string): Promise<void> {
  const db = await openBooksDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CUSTOM_BOOKS_STORE, "readwrite");
    tx.objectStore(CUSTOM_BOOKS_STORE).delete(`questions::${bookId}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const updated = getCustomBooks().filter((b) => b.id !== bookId);
  localStorage.setItem(CUSTOM_BOOKS_LS_KEY, JSON.stringify(updated));
}
