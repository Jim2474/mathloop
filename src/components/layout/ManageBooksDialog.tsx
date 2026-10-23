import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useBookStore } from "../../store/useBookStore";

export default function ManageBooksDialog({ onClose }: { onClose: () => void }) {
  const { books, isPresentationReady, presentationError, isSavingPresentation, saveBookPresentation, loadBooks } = useBookStore();
  const [draft, setDraft] = useState(() => books.map((book) => ({ ...book })));
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const editable = isPresentationReady && !presentationError && !isSavingPresentation && !isRetrying;
  const hasEmptyName = draft.some((book) => !book.name.trim());

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  function moveBook(id: string, targetIndex: number) {
    if (!editable) return;
    setDraft((current) => {
      const fromIndex = current.findIndex((book) => book.id === id);
      if (fromIndex < 0 || targetIndex < 0 || targetIndex >= current.length || fromIndex === targetIndex) return current;
      const next = [...current];
      const [book] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, book);
      return next;
    });
  }

  function clearDrag() {
    dragRef.current = null;
    setDraggedId(null);
    setDropId(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isSavingPresentation && !isRetrying && !submittingRef.current) onClose();
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
    ) ?? []);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      first?.focus();
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editable || hasEmptyName || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    try {
      await saveBookPresentation(draft.map((book) => book.id), Object.fromEntries(draft.map((book) => [book.id, book.name])));
      onClose();
    } catch (failure) {
      setError(`保存失败：${failure instanceof Error ? failure.message : String(failure)}`);
    } finally {
      submittingRef.current = false;
    }
  }

  async function retryLoad() {
    setIsRetrying(true);
    try {
      await loadBooks();
      if (useBookStore.getState().isPresentationReady) {
        setDraft(useBookStore.getState().books.map((book) => ({ ...book })));
        setError(null);
      }
    } finally {
      setIsRetrying(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 p-3 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-books-title"
        aria-describedby="manage-books-description"
        aria-busy={isSavingPresentation}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="flex max-h-[90dvh] w-full max-w-xl flex-col rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl outline-none sm:p-6"
      >
        <h3 id="manage-books-title" className="text-xl font-semibold text-ink">管理课本</h3>
        <p id="manage-books-description" className="mt-2 text-sm text-ink/60">拖动左侧手柄或使用上下箭头调整顺序，点击名称即可重命名。保存后生效。</p>
        <form onSubmit={handleSubmit} className="mt-4 flex min-h-0 flex-col">
          <ul ref={listRef} aria-label="课本排列顺序" className="min-h-0 space-y-2 overflow-y-auto overscroll-contain p-1">
            {draft.map((book, index) => (
              <li
                key={book.id}
                data-book-id={book.id}
                onDragOver={(event) => {
                  if (!editable || !dragRef.current) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropId(book.id);
                  const list = listRef.current;
                  if (list) {
                    const bounds = list.getBoundingClientRect();
                    if (event.clientY < bounds.top + 36) list.scrollTop -= 12;
                    else if (event.clientY > bounds.bottom - 36) list.scrollTop += 12;
                  }
                }}
                onDrop={(event) => {
                  if (!dragRef.current) return;
                  event.preventDefault();
                  moveBook(dragRef.current, index);
                  clearDrag();
                }}
                className={`flex items-center gap-2 rounded-2xl border p-2 transition sm:gap-3 sm:p-3 ${dropId === book.id && draggedId !== book.id ? "border-slateblue bg-slateblue/5" : "border-white/60 bg-white/50"} ${draggedId === book.id ? "opacity-50" : ""}`}
              >
                <span
                  draggable={editable}
                  title="拖动排序，也可使用右侧上下移按钮"
                  aria-hidden="true"
                  onDragStart={(event) => {
                    dragRef.current = book.id;
                    setDraggedId(book.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", book.id);
                  }}
                  onDragEnd={clearDrag}
                  className={`select-none px-1 py-3 text-xl text-ink/40 ${editable ? "cursor-grab active:cursor-grabbing" : ""}`}
                >⠿</span>
                <label className="min-w-0 flex-1">
                  <span className="sr-only">{book.id} 的课本名称</span>
                  <input
                    type="text"
                    value={book.name}
                    disabled={!editable}
                    required
                    aria-invalid={!book.name.trim()}
                    onChange={(event) => setDraft((current) => current.map((item) => item.id === book.id ? { ...item, name: event.target.value } : item))}
                    className="apple-control w-full rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                  />
                  <span className="mt-1 block break-all px-1 text-xs text-ink/45">{book.id}</span>
                </label>
                <div className="flex flex-col gap-1">
                  <button type="button" aria-label={`上移 ${book.id}`} disabled={!editable || index === 0} onClick={() => moveBook(book.id, index - 1)} className="apple-ghost-pill px-3 py-1 text-sm disabled:opacity-30">↑</button>
                  <button type="button" aria-label={`下移 ${book.id}`} disabled={!editable || index === draft.length - 1} onClick={() => moveBook(book.id, index + 1)} className="apple-ghost-pill px-3 py-1 text-sm disabled:opacity-30">↓</button>
                </div>
              </li>
            ))}
          </ul>
          {draft.length === 0 && <p className="py-4 text-sm text-ink/60">暂无课本，请先添加新书。</p>}
          {hasEmptyName && <p className="mt-3 text-sm text-cinnabar">课本名称不能为空。</p>}
          <div aria-live="polite">
            {(presentationError || error) && <p role="alert" className="mt-3 text-sm text-cinnabar">{presentationError || error}</p>}
            {isSavingPresentation && <p className="mt-3 text-sm text-ink/60">正在保存…</p>}
          </div>
          {presentationError && <button type="button" onClick={() => void retryLoad()} disabled={isRetrying} className="mt-2 self-start text-sm text-slateblue disabled:opacity-50">{isRetrying ? "正在读取…" : "重新读取设置"}</button>}
          <div className="mt-4 flex justify-end gap-2 border-t border-white/60 pt-4">
            <button type="button" onClick={onClose} disabled={isSavingPresentation || isRetrying} className="apple-ghost-pill px-4 py-2 text-sm font-medium disabled:opacity-40">取消</button>
            <button type="submit" disabled={!editable || hasEmptyName || draft.length === 0} className="apple-pill px-4 py-2 text-sm font-semibold disabled:opacity-40">{isSavingPresentation ? "保存中…" : "保存"}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
