import { useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useBookStore } from "../../store/useBookStore";
import { isTauriRuntime } from "../../services/desktopBridge";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/mistakes", label: "错题录入" },
  { to: "/questions", label: "题库" },
  { to: "/review", label: "复习" },
  { to: "/backup", label: "备份" },
];

export default function Navbar() {
  const { books, activeBookId, isSwitching, switchBook, addBook } = useBookStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentBook = books.find((b) => b.id === activeBookId);

  function handleSelect(bookId: string) {
    setDropdownOpen(false);
    if (bookId !== activeBookId) {
      void switchBook(bookId);
    }
  }

  function handleAddConfirm(bookId: string, name: string, questions?: unknown[]) {
    setShowAddDialog(false);
    void addBook(bookId, name, questions).then((entry) => {
      void switchBook(entry.id);
    });
  }

  return (
    <nav className="flex flex-wrap items-center gap-1 rounded-full border border-white/45 bg-white/25 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] backdrop-blur-xl">
      {/* Book Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          disabled={isSwitching}
          className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium tracking-[-0.224px] text-ink/58 transition hover:bg-white/45 hover:text-ink disabled:opacity-50"
        >
          <span className="text-base">📘</span>
          <span className="max-w-[8rem] truncate">
            {isSwitching ? "切换中..." : currentBook?.name ?? "选择书本"}
          </span>
          <span className="text-xs text-ink/40">▾</span>
        </button>

        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setDropdownOpen(false)}
            />
            <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/50 bg-white/90 shadow-xl backdrop-blur-xl">
              <div className="max-h-64 overflow-auto p-1.5">
                {books.map((book) => (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => handleSelect(book.id)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/70"
                  >
                    {book.id === activeBookId && (
                      <span className="text-moss">✓</span>
                    )}
                    <span className={book.id === activeBookId ? "font-semibold text-ink" : "text-ink/70"}>
                      {book.name}
                    </span>
                  </button>
                ))}
              </div>
              <div className="border-t border-white/50 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    setShowAddDialog(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slateblue transition hover:bg-white/70"
                >
                  <span>+</span>
                  <span>添加新书</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Nav Links */}
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            [
              "rounded-full px-3.5 py-2 text-sm font-medium tracking-[-0.224px] transition",
              isActive
                ? "bg-white/70 text-ink shadow-[0_8px_18px_rgba(29,29,31,0.08),inset_0_1px_0_rgba(255,255,255,0.72)]"
                : "text-ink/58 hover:bg-white/45 hover:text-ink",
            ].join(" ")
          }
        >
          {item.label}
        </NavLink>
      ))}

      {/* Add Book Dialog */}
      {showAddDialog && (
        <AddBookDialog
          onConfirm={handleAddConfirm}
          onCancel={() => setShowAddDialog(false)}
        />
      )}
    </nav>
  );
}

function AddBookDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (bookId: string, name: string, questions?: unknown[]) => void;
  onCancel: () => void;
}) {
  const [bookId, setBookId] = useState("");
  const [name, setName] = useState("");
  const [questions, setQuestions] = useState<unknown[] | null>(null);
  const [fileError, setFileError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const isWeb = !isTauriRuntime();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("文件顶层必须是数组");
      setQuestions(parsed);
      if (!name) {
        const baseName = file.name.replace(/\.json$/i, "");
        if (baseName !== "questions") setName(baseName);
      }
    } catch {
      setFileError("文件解析失败，请上传有效的 questions.json");
      setQuestions(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedId = bookId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const trimmedName = name.trim();
    if (!trimmedId || !trimmedName) return;
    if (!isWeb) {
      // Desktop: needs file already copied to directory
      onConfirm(trimmedId, trimmedName);
      return;
    }
    // Web: create with questions array (may be empty — that's fine, user will paste screenshots)
    onConfirm(trimmedId, trimmedName, questions ?? []);
  }

  const canSubmit = bookId.trim() && name.trim();

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/50 bg-white/95 p-6 shadow-2xl backdrop-blur-xl">
        <h3 className="text-xl font-semibold text-ink">添加新书</h3>
        {isWeb ? (
          <p className="mt-2 text-sm text-ink/60">
            建一个空书本，之后直接在错题录入页用 <kbd className="rounded bg-black/8 px-1 text-xs font-semibold">Ctrl+V</kbd> 粘贴截图录入。
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink/60">
            请先将 questions.json 放到桌面数据目录的 books\&lt;书本ID&gt;\data\ 目录下。
          </p>
        )}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-ink/70">书本 ID（字母数字横线）</span>
            <input
              type="text"
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
              placeholder="例如: book004"
              className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-ink/70">显示名称</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 武忠祥强化截图本"
              className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
            />
          </label>

          {/* Optional JSON upload — only in web mode */}
          {isWeb && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowUpload(!showUpload)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slateblue/70 hover:text-slateblue"
              >
                <span className="text-[10px]">{showUpload ? "▾" : "▸"}</span>
                可选：导入 questions.json（高级）
              </button>
              {showUpload && (
                <div className="space-y-1.5">
                  <div className={[
                    "flex items-center gap-3 rounded-[18px] border-2 border-dashed px-4 py-2.5 transition",
                    questions ? "border-moss/50 bg-moss/5" : "border-white/60 bg-white/30",
                  ].join(" ")}>
                    <span className="text-lg">{questions ? "✅" : "📄"}</span>
                    <span className="flex-1 truncate text-sm text-ink/60">
                      {questions ? `已读取 ${(questions as unknown[]).length} 题` : "点击选择文件"}
                    </span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleFileChange}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      style={{ position: "relative" }}
                    />
                  </div>
                  {fileError && <p className="text-xs text-cinnabar">{fileError}</p>}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="apple-ghost-pill px-4 py-2 text-sm font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="apple-pill px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              创建并切换
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
