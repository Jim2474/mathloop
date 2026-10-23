import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyBookPresentation,
  emptyBookPresentation,
  loadBookPresentation,
  persistBookPresentation,
  updateBookPresentation,
} from "./bookPresentationService";

const bridge = vi.hoisted(() => ({ isTauriRuntime: vi.fn(), invokeDesktop: vi.fn() }));
vi.mock("./desktopBridge", () => bridge);

const books = [
  { id: "book001", name: "高等数学", addedAt: "2026-01-01" },
  { id: "custom", name: "我的截图本", addedAt: "2026-02-01" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  bridge.isTauriRuntime.mockReturnValue(true);
});

describe("book presentation", () => {
  it("keeps original order without settings, renames by ID, and appends new books", () => {
    expect(applyBookPresentation(books, emptyBookPresentation())).toEqual(books);
    const original = structuredClone(books);
    const presentation = {
      version: 1 as const, orderIds: ["missing", "custom"], namesById: { custom: "重命名", missing: "暂缺" },
    };
    expect(applyBookPresentation(books, presentation)).toEqual([{ ...books[1], name: "重命名" }, books[0]]);
    expect(books).toEqual(original);
  });

  it("trims names, allows duplicates, and preserves settings for missing and newly added books", () => {
    const previous = { version: 1 as const, orderIds: ["missing", "book001"], namesById: { missing: "暂缺课本" } };
    const updated = updateBookPresentation(previous, books, ["book001"], { book001: "  同名  " });
    expect(updated).toEqual({
      version: 1, orderIds: ["book001", "custom", "missing"], namesById: { missing: "暂缺课本", book001: "同名" },
    });
    expect(updateBookPresentation(updated, books, ["custom", "book001"], { book001: "同名", custom: "同名" }).namesById.custom).toBe("同名");
    expect(previous.namesById).toEqual({ missing: "暂缺课本" });
  });

  it("rejects blank names, duplicate IDs, and removed books before writing", () => {
    expect(() => updateBookPresentation(emptyBookPresentation(), books, ["book001"], { book001: "  " })).toThrow("不能为空");
    expect(() => updateBookPresentation(emptyBookPresentation(), books, ["book001", "book001"], { book001: "名称" })).toThrow("列表已变化");
    expect(() => updateBookPresentation(emptyBookPresentation(), books, ["removed"], { removed: "名称" })).toThrow("列表已变化");
    expect(bridge.invokeDesktop).not.toHaveBeenCalled();
  });

  it("uses only the dedicated global desktop key and restores persisted settings", async () => {
    const presentation = updateBookPresentation(emptyBookPresentation(), books, ["custom", "book001"], { custom: "截图", book001: "数学" });
    await persistBookPresentation(presentation);
    expect(bridge.invokeDesktop).toHaveBeenCalledExactlyOnceWith("review_store_set", {
      key: "mathloop-book-presentation", value: JSON.stringify(presentation), bookId: null,
    });
    bridge.invokeDesktop.mockResolvedValueOnce(JSON.stringify(presentation));
    expect(await loadBookPresentation()).toEqual(presentation);
    expect(bridge.invokeDesktop).toHaveBeenLastCalledWith("review_store_get", { key: "mathloop-book-presentation", bookId: null });
  });

  it("uses defaults only for absent settings and propagates corrupt settings or read failures", async () => {
    bridge.invokeDesktop.mockResolvedValueOnce(null);
    expect(await loadBookPresentation()).toEqual(emptyBookPresentation());
    for (const raw of ["broken", '{"version":2}', '{"version":1,"orderIds":["a","a"],"namesById":{}}', '{"version":1,"orderIds":[],"namesById":{"a":" "}}']) {
      bridge.invokeDesktop.mockResolvedValueOnce(raw);
      await expect(loadBookPresentation()).rejects.toThrow();
    }
    bridge.invokeDesktop.mockRejectedValueOnce(new Error("disk error"));
    await expect(loadBookPresentation()).rejects.toThrow("disk error");
  });

  it("does not treat IndexedDB request success as transaction success", async () => {
    bridge.isTauriRuntime.mockReturnValue(false);
    const request = {} as IDBRequest;
    const tx = { objectStore: () => ({ put: vi.fn(() => request) }), error: new Error("aborted") } as unknown as IDBTransaction;
    const close = vi.fn();
    const db = { transaction: vi.fn(() => tx), close } as unknown as IDBDatabase;
    const openRequest = { result: db } as IDBOpenDBRequest;
    vi.stubGlobal("indexedDB", { open: vi.fn(() => {
      queueMicrotask(() => openRequest.onsuccess?.call(openRequest, {} as Event));
      return openRequest;
    }) });
    const saving = persistBookPresentation(emptyBookPresentation());
    await vi.waitFor(() => expect(db.transaction).toHaveBeenCalled());
    request.onsuccess?.call(request, {} as Event);
    const settled = vi.fn();
    void saving.then(settled, settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    tx.onabort?.call(tx, {} as Event);
    await expect(saving).rejects.toThrow("aborted");
    expect(close).toHaveBeenCalledOnce();
  });
});
