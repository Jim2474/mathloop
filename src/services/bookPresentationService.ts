import type { BookEntry } from "../types/book";
import { invokeDesktop, isTauriRuntime } from "./desktopBridge";

const PRESENTATION_KEY = "mathloop-book-presentation";
const STORE_NAME = "settings";

export type BookPresentation = {
  version: 1;
  orderIds: string[];
  namesById: Record<string, string>;
};

export function emptyBookPresentation(): BookPresentation {
  return { version: 1, orderIds: [], namesById: {} };
}

function parsePresentation(raw: string): BookPresentation {
  const data = JSON.parse(raw) as Partial<BookPresentation> | null;
  if (!data || data.version !== 1 || !Array.isArray(data.orderIds)
    || !data.orderIds.every((id) => typeof id === "string" && id.length > 0)
    || new Set(data.orderIds).size !== data.orderIds.length
    || !data.namesById || typeof data.namesById !== "object" || Array.isArray(data.namesById)
    || !Object.values(data.namesById).every((name) => typeof name === "string" && name.trim().length > 0)) {
    throw new Error("课本显示设置格式错误，未覆盖原设置。");
  }
  return data as BookPresentation;
}

async function openPresentationDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PRESENTATION_KEY, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) db.close();
      else resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("课本显示设置被其他窗口占用，请关闭其他窗口后重试。"));
    };
  });
}

// This database contains only presentation settings. It never opens question/image databases.
async function accessWebPresentation(value?: string): Promise<string | null> {
  const db = await openPresentationDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, value === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = value === undefined ? store.get(PRESENTATION_KEY) : store.put(value, PRESENTATION_KEY);
      let result: string | null = null;
      request.onsuccess = () => {
        if (value === undefined) result = (request.result as string | undefined) ?? null;
      };
      // A successful request is insufficient: a transaction can still abort afterward.
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("课本显示设置读写失败。"));
      tx.onabort = () => reject(tx.error ?? new Error("课本显示设置事务已取消。"));
    });
  } finally {
    db.close();
  }
}

export async function loadBookPresentation(): Promise<BookPresentation> {
  const raw = isTauriRuntime()
    ? await invokeDesktop<string | null>("review_store_get", { key: PRESENTATION_KEY, bookId: null })
    : await accessWebPresentation();
  return raw === null ? emptyBookPresentation() : parsePresentation(raw);
}

export async function persistBookPresentation(presentation: BookPresentation): Promise<void> {
  const raw = JSON.stringify(presentation);
  parsePresentation(raw);
  if (isTauriRuntime()) {
    await invokeDesktop<void>("review_store_set", { key: PRESENTATION_KEY, value: raw, bookId: null });
  } else {
    await accessWebPresentation(raw);
  }
}

export function applyBookPresentation(books: BookEntry[], presentation: BookPresentation): BookEntry[] {
  const byId = new Map(books.map((book) => [book.id, book]));
  const orderedIds = new Set([...presentation.orderIds.filter((id) => byId.has(id)), ...byId.keys()]);
  return [...orderedIds].map((id) => {
    const book = byId.get(id)!;
    return Object.hasOwn(presentation.namesById, id)
      ? { ...book, name: presentation.namesById[id] }
      : book;
  });
}

export function updateBookPresentation(
  previous: BookPresentation,
  books: BookEntry[],
  orderIds: string[],
  namesById: Record<string, string>,
): BookPresentation {
  const currentIds = new Set(books.map((book) => book.id));
  if (new Set(orderIds).size !== orderIds.length || orderIds.some((id) => !currentIds.has(id))) {
    throw new Error("课本列表已变化，请重新打开管理课本。");
  }
  const names = { ...previous.namesById };
  for (const id of orderIds) {
    const name = Object.hasOwn(namesById, id) ? namesById[id].trim() : "";
    if (!name) throw new Error("课本名称不能为空。");
    Object.defineProperty(names, id, { value: name, enumerable: true, configurable: true, writable: true });
  }
  return {
    version: 1,
    // Keep settings for temporarily missing books; append books added since the draft opened.
    orderIds: [...orderIds, ...books.filter((book) => !orderIds.includes(book.id)).map((book) => book.id),
      ...previous.orderIds.filter((id) => !currentIds.has(id))],
    namesById: names,
  };
}
