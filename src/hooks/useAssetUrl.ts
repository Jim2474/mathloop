import { useEffect, useState } from "react";
import { isTauriRuntime, loadDesktopAssetDataUrl } from "../services/desktopBridge";
import { getCustomQuestionImageUrl } from "../services/customQuestionService";
import { getActiveBookId } from "../utils/bookId";

type AssetUrlState = {
  status: "idle" | "loading" | "loaded" | "error";
  url: string;
};

const desktopAssetCache = new Map<string, string>();

export function clearDesktopAssetCache(): void {
  desktopAssetCache.clear();
}

export function useAssetUrl(path: string | undefined): AssetUrlState {
  const normalizedPath = normalizeAssetPath(path);
  const [state, setState] = useState<AssetUrlState>(() => createInitialState(normalizedPath));

  useEffect(() => {
    let cancelled = false;

    if (!normalizedPath) {
      setState({ status: "idle", url: "" });
      return () => {
        cancelled = true;
      };
    }

    // Handle custom:// protocol (user-pasted screenshots stored in IndexedDB)
    if (normalizedPath.startsWith("custom://")) {
      const questionId = normalizedPath.slice("custom://".length);
      setState({ status: "loading", url: "" });
      void getCustomQuestionImageUrl(questionId).then((url) => {
        if (!cancelled) {
          setState(url ? { status: "loaded", url } : { status: "error", url: "" });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    if (!isTauriRuntime()) {
      setState({ status: "loaded", url: toBrowserAssetUrl(normalizedPath) });
      return () => {
        cancelled = true;
      };
    }

    const cachedUrl = desktopAssetCache.get(normalizedPath);
    if (cachedUrl) {
      setState({ status: "loaded", url: cachedUrl });
      return () => {
        cancelled = true;
      };
    }

    setState({ status: "loading", url: "" });

    async function loadDesktopAsset() {
      try {
        const bookId = getActiveBookId();
        const url = await loadDesktopAssetDataUrl(normalizedPath, bookId ?? undefined);
        desktopAssetCache.set(normalizedPath, url);
        if (!cancelled) {
          setState({ status: "loaded", url });
        }
      } catch {
        if (!cancelled) {
          setState({ status: "error", url: "" });
        }
      }
    }

    void loadDesktopAsset();

    return () => {
      cancelled = true;
    };
  }, [normalizedPath]);

  return state;
}

function createInitialState(path: string): AssetUrlState {
  if (!path) {
    return { status: "idle", url: "" };
  }
  // custom:// images load asynchronously from IndexedDB — always start as loading
  if (path.startsWith("custom://")) {
    return { status: "loading", url: "" };
  }
  if (!isTauriRuntime()) {
    return { status: "loaded", url: toBrowserAssetUrl(path) };
  }
  const cachedUrl = desktopAssetCache.get(path);
  return cachedUrl ? { status: "loaded", url: cachedUrl } : { status: "loading", url: "" };
}

function normalizeAssetPath(path: string | undefined): string {
  return path?.trim() ?? "";
}

function toBrowserAssetUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const bookId = getActiveBookId();
  // Page images and legacy top-level assets are NOT book-scoped.
  // Questions and answers ARE book-scoped (under books/{bookId}/).
  if (bookId && !cleanPath.startsWith(`/books/`) && !cleanPath.startsWith(`/pages/`)) {
    return `/books/${bookId}${cleanPath}`;
  }
  return cleanPath;
}
