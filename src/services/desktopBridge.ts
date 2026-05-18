import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { BookEntry } from "../types/book";

export type BootstrapInfo = {
  dataDir: string;
  dbPath: string;
  createdBackup: boolean;
  backupPath: string | null;
};

let bootstrapPromise: Promise<BootstrapInfo | null> | null = null;
let desktopDataDir = "";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function initializeDesktopRuntime(bookId?: string): Promise<BootstrapInfo | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  bootstrapPromise ??= invoke<BootstrapInfo>("bootstrap_mathloop_data", { bookId: bookId ?? null }).then((info) => {
    desktopDataDir = info.dataDir;
    return info;
  });
  return bootstrapPromise;
}

export function resetDesktopRuntime(): void {
  bootstrapPromise = null;
  desktopDataDir = "";
}

export async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

export function toDesktopAssetUrl(path: string): string {
  if (!isTauriRuntime() || !desktopDataDir) {
    return "";
  }
  const relativePath = path.replace(/^\/+/, "").replace(/\//g, "\\");
  const separator = desktopDataDir.endsWith("\\") || desktopDataDir.endsWith("/") ? "" : "\\";
  return convertFileSrc(`${desktopDataDir}${separator}${relativePath}`);
}

export async function loadDesktopAssetDataUrl(path: string): Promise<string> {
  if (!isTauriRuntime()) {
    return "";
  }
  await initializeDesktopRuntime();
  return invokeDesktop<string>("load_asset_data_url", { relativePath: path });
}

export async function updateDesktopQuestionTips(
  questionId: string,
  tips: string,
  bookId?: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("只有桌面版可以把 tips 保存到外部题库。");
  }
  await initializeDesktopRuntime(bookId);
  await invokeDesktop<void>("update_question_tips", { questionId, tips, bookId: bookId ?? null });
}

export async function listDesktopBooks(): Promise<BookEntry[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  await initializeDesktopRuntime();
  return invokeDesktop<BookEntry[]>("list_books");
}

export async function addDesktopBook(bookId: string, name: string): Promise<BookEntry> {
  if (!isTauriRuntime()) {
    throw new Error("只有桌面版可以添加书本。");
  }
  await initializeDesktopRuntime();
  return invokeDesktop<BookEntry>("add_book", { bookId, name });
}

export async function removeDesktopBook(bookId: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("只有桌面版可以移除书本。");
  }
  await initializeDesktopRuntime();
  await invokeDesktop<void>("remove_book", { bookId });
}

export async function setActiveDesktopBook(bookId: string): Promise<BootstrapInfo> {
  if (!isTauriRuntime()) {
    throw new Error("只有桌面版可以切换书本。");
  }
  await initializeDesktopRuntime();
  return invokeDesktop<BootstrapInfo>("set_active_book", { bookId });
}
