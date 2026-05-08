import { convertFileSrc, invoke } from "@tauri-apps/api/core";

type BootstrapInfo = {
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

export async function initializeDesktopRuntime(): Promise<BootstrapInfo | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  bootstrapPromise ??= invoke<BootstrapInfo>("bootstrap_mathloop_data").then((info) => {
    desktopDataDir = info.dataDir;
    return info;
  });
  return bootstrapPromise;
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
