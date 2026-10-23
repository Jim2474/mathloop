import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  return {
    storage,
    load: vi.fn(), persist: vi.fn(), listDesktopBooks: vi.fn(),
    addDesktopBook: vi.fn(), removeDesktopBook: vi.fn(), setActiveDesktopBook: vi.fn(),
    resetDesktopRuntime: vi.fn(), initializeDesktopRuntime: vi.fn(), isTauriRuntime: vi.fn(),
    getCustomBooks: vi.fn(), getCustomBooksAsync: vi.fn(), addCustomBook: vi.fn(), removeCustomBook: vi.fn(),
  };
});
vi.mock("../services/bookPresentationService", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/bookPresentationService")>(),
  loadBookPresentation: mocks.load,
  persistBookPresentation: mocks.persist,
}));
vi.mock("../services/desktopBridge", () => mocks);
vi.mock("../services/webBookService", () => mocks);

import { useBookStore } from "./useBookStore";
import { emptyBookPresentation } from "../services/bookPresentationService";

const books = [
  { id: "book001", name: "数学", addedAt: "2026-01-01" },
  { id: "custom", name: "截图", addedAt: "2026-02-01" },
];
const names = { book001: "数学新名称", custom: "截图新名称" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.clear();
  mocks.storage.set("review::book001", "KEEP_REVIEW");
  mocks.storage.set("mathloop-custom-books", "KEEP_MANIFEST");
  mocks.load.mockResolvedValue(emptyBookPresentation());
  mocks.persist.mockResolvedValue(undefined);
  mocks.isTauriRuntime.mockReturnValue(true);
  mocks.listDesktopBooks.mockResolvedValue([books[0]]);
  mocks.getCustomBooksAsync.mockResolvedValue([books[1]]);
  mocks.getCustomBooks.mockReturnValue([books[1]]);
  useBookStore.setState({
    books: structuredClone(books), activeBookId: "book001", customBookIds: new Set(["custom"]),
    presentation: emptyBookPresentation(), presentationError: null, isLoaded: true,
    isPresentationReady: true, isSavingPresentation: false,
  });
});

describe("book presentation store", () => {
  it("updates names and order after persistence without switching or changing book metadata/data", async () => {
    await useBookStore.getState().saveBookPresentation(["custom", "book001"], names);
    const state = useBookStore.getState();
    expect(state.books).toEqual([{ ...books[1], name: names.custom }, { ...books[0], name: names.book001 }]);
    expect(state.activeBookId).toBe("book001");
    expect(state.customBookIds).toEqual(new Set(["custom"]));
    expect(mocks.storage.get("review::book001")).toBe("KEEP_REVIEW");
    expect(mocks.storage.get("mathloop-custom-books")).toBe("KEEP_MANIFEST");
    for (const action of [mocks.setActiveDesktopBook, mocks.resetDesktopRuntime, mocks.initializeDesktopRuntime,
      mocks.addDesktopBook, mocks.removeDesktopBook, mocks.addCustomBook, mocks.removeCustomBook]) {
      expect(action).not.toHaveBeenCalled();
    }
  });

  it("preserves committed state on save failure and permits retry", async () => {
    mocks.persist.mockRejectedValueOnce(new Error("disk full"));
    await expect(useBookStore.getState().saveBookPresentation(["custom", "book001"], names)).rejects.toThrow("disk full");
    expect(useBookStore.getState().books).toEqual(books);
    expect(useBookStore.getState().presentation).toEqual(emptyBookPresentation());
    expect(useBookStore.getState().isSavingPresentation).toBe(false);
    await useBookStore.getState().saveBookPresentation(["custom", "book001"], names);
    expect(useBookStore.getState().books[0].id).toBe("custom");
  });

  it("blocks duplicate submissions and keeps original list until the write commits", async () => {
    let finish!: () => void;
    mocks.persist.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const saving = useBookStore.getState().saveBookPresentation(["custom", "book001"], names);
    expect(useBookStore.getState().books).toEqual(books);
    await expect(useBookStore.getState().saveBookPresentation(["custom", "book001"], names)).rejects.toThrow("正在保存");
    expect(mocks.persist).toHaveBeenCalledOnce();
    finish();
    await saving;
    expect(useBookStore.getState().isSavingPresentation).toBe(false);
  });

  it("restores settings on load and retains temporarily missing books on subsequent saves", async () => {
    mocks.load.mockResolvedValue({ version: 1, orderIds: ["missing", "custom", "book001"], namesById: { missing: "暂缺", ...names } });
    await useBookStore.getState().loadBooks();
    expect(useBookStore.getState().books.map((book) => book.id)).toEqual(["custom", "book001"]);
    await useBookStore.getState().saveBookPresentation(["book001", "custom"], names);
    expect(mocks.persist).toHaveBeenCalledWith({ version: 1, orderIds: ["book001", "custom", "missing"], namesById: { missing: "暂缺", ...names } });
  });

  it("shows the base list and blocks writes after read failure, then permits a successful reload", async () => {
    mocks.load.mockRejectedValueOnce(new Error("corrupt settings"));
    await useBookStore.getState().loadBooks();
    expect(useBookStore.getState().books).toEqual(books);
    expect(useBookStore.getState().presentationError).toContain("corrupt settings");
    await expect(useBookStore.getState().saveBookPresentation(["custom", "book001"], names)).rejects.toThrow("尚未成功读取");
    expect(mocks.persist).not.toHaveBeenCalled();
    await useBookStore.getState().loadBooks();
    expect(useBookStore.getState().isPresentationReady).toBe(true);
    expect(useBookStore.getState().presentationError).toBeNull();
  });

  it("applies presentation to web builtin and custom books too", async () => {
    mocks.isTauriRuntime.mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [books[0]] }));
    mocks.load.mockResolvedValue({ version: 1, orderIds: ["custom", "book001"], namesById: names });
    await useBookStore.getState().loadBooks();
    expect(useBookStore.getState().books).toEqual([{ ...books[1], name: names.custom }, { ...books[0], name: names.book001 }]);
    expect(mocks.listDesktopBooks).not.toHaveBeenCalled();
  });

  it("ignores an older load failure after a newer load has recovered", async () => {
    let fail!: (error: Error) => void;
    mocks.load.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    const olderLoad = useBookStore.getState().loadBooks();
    mocks.load.mockResolvedValueOnce({ version: 1, orderIds: ["custom", "book001"], namesById: names });
    await useBookStore.getState().loadBooks();
    fail(new Error("stale read failure"));
    await olderLoad;
    expect(useBookStore.getState().presentationError).toBeNull();
    expect(useBookStore.getState().isPresentationReady).toBe(true);
    expect(useBookStore.getState().books[0]).toEqual({ ...books[1], name: names.custom });
  });
});
