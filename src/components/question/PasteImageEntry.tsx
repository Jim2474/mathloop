/**
 * PasteImageEntry.tsx
 *
 * Allows the user to Ctrl+V a screenshot anywhere on the page to instantly
 * record it as a mistake. No chapter, no question number required.
 *
 * Flow:
 *  1. User presses Ctrl+V anywhere on the MistakeEntry page
 *  2. Component detects image in clipboard, shows preview
 *  3. User clicks "立即录入错题" 
 *  4. Image is stored in IndexedDB, metadata in localStorage
 *  5. A new Question is created and markMistakeQuestion() is called
 */

import { useCallback, useEffect, useState } from "react";
import { createCustomQuestion } from "../../services/customQuestionService";
import { useBookStore } from "../../store/useBookStore";
import { useReviewStore } from "../../store/useReviewStore";
import { useQuestionStore } from "../../store/useQuestionStore";
import { toDateTimeLocalValue } from "../../utils/date";

type EntryState = "idle" | "preview" | "saving" | "done";

function getDefaultReviewAt(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

export default function PasteImageEntry() {
  const { activeBookId } = useBookStore();
  const { markMistakeQuestion, mistakeRecords } = useReviewStore();
  const { loadQuestions } = useQuestionStore();

  const [state, setEntryState] = useState<EntryState>("idle");
  const [imageDataUrl, setImageDataUrl] = useState<string>("");
  const [reviewAtInput, setReviewAtInput] = useState(() =>
    toDateTimeLocalValue(getDefaultReviewAt()),
  );
  const [savedMsg, setSavedMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      // Only intercept if there's image data
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      event.preventDefault();

      const file = imageItem.getAsFile();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === "string") {
          setImageDataUrl(result);
          setEntryState("preview");
          setSavedMsg("");
          setErrorMsg("");
          // Reset review time to now
          setReviewAtInput(toDateTimeLocalValue(getDefaultReviewAt()));
        }
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  async function handleSave() {
    if (!imageDataUrl || !activeBookId) return;
    setEntryState("saving");
    setErrorMsg("");

    try {
      // Parse review time
      const reviewAt = new Date(reviewAtInput);
      if (isNaN(reviewAt.getTime())) {
        throw new Error("请选择有效的复习时间");
      }

      // Save image to IndexedDB + create metadata
      const questionId = await createCustomQuestion(activeBookId, imageDataUrl);

      // Check if already in mistake records
      if (mistakeRecords[questionId]?.active) {
        setSavedMsg("已在错题本中。");
        setEntryState("done");
        return;
      }

      // Build a minimal Question object to pass to markMistakeQuestion
      const fakeQuestion = {
        id: questionId,
        bookName: "自定义截图",
        chapter: "自定义截图",
        section: "",
        questionNo: `截图 ${new Date().toLocaleDateString("zh-CN")}`,
        pageStart: 0,
        pageEnd: 0,
        pdfPageLabel: "",
        printedPageNumber: "",
        pageRangeText: "",
        questionText: "（截图题目）",
        tips: "",
        questionImage: `custom://${questionId}`,
        questionImages: [`custom://${questionId}`],
        answerImage: null,
        answerImages: null,
        knowledgeTags: [],
        mistakeTags: [],
        difficulty: 0,
        valueStar: 0,
        status: "active",
        fsrs: { state: "new", difficulty: null, stability: null, retrievability: null, lastReview: null, nextReview: null, reviewCount: 0, lapseCount: 0 },
        review: { mastery: 0, lastResult: null, history: [] },
        meta: { source: "custom-paste", uncertain: false, note: "" },
      };

      markMistakeQuestion({
        question: fakeQuestion,
        reviewAt,
        sourcePage: "截图",
        sourceQuestionNo: fakeQuestion.questionNo,
      });

      // Reload questions so the new custom question appears in the list
      await loadQuestions();

      setSavedMsg("✅ 截图已录入错题本！");
      setEntryState("done");
      // Auto-reset after 3s
      setTimeout(() => {
        setImageDataUrl("");
        setEntryState("idle");
        setSavedMsg("");
      }, 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "录入失败，请重试");
      setEntryState("preview");
    }
  }

  function handleDiscard() {
    setImageDataUrl("");
    setEntryState("idle");
    setSavedMsg("");
    setErrorMsg("");
  }

  function setQuickReviewTime(kind: "now" | "tonight" | "tomorrow") {
    const next = new Date();
    if (kind === "now") {
      next.setSeconds(0, 0);
    } else if (kind === "tonight") {
      next.setHours(21, 0, 0, 0);
    } else {
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
    }
    setReviewAtInput(toDateTimeLocalValue(next));
  }

  // ── Idle state: hint ──────────────────────────────────────────────────────
  if (state === "idle") {
    return (
      <div className="apple-tile rounded-[26px] p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slateblue/10 text-2xl">
            📸
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-semibold tracking-[-0.28px]">截图录入</h3>
            <p className="mt-1.5 text-sm leading-6 text-ink/60">
              截好图后，直接在此页面按{" "}
              <kbd className="rounded-md border border-white/60 bg-white/50 px-1.5 py-0.5 text-xs font-semibold shadow-sm">
                ⌘V
              </kbd>
              {" "}或{" "}
              <kbd className="rounded-md border border-white/60 bg-white/50 px-1.5 py-0.5 text-xs font-semibold shadow-sm">
                Ctrl+V
              </kbd>
              {" "}粘贴截图，即可立即录入为错题。无需填写任何其他信息。
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-[18px] border border-dashed border-slateblue/25 bg-slateblue/5 px-4 py-3 text-sm text-ink/50">
          <span className="text-base">⌨️</span>
          <span>等待粘贴截图…</span>
        </div>
      </div>
    );
  }

  // ── Done state ────────────────────────────────────────────────────────────
  if (state === "done") {
    return (
      <div className="apple-tile rounded-[26px] p-6">
        <div className="flex items-center gap-3 text-moss">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-semibold">{savedMsg}</p>
            <p className="mt-1 text-sm text-ink/60">3 秒后自动清除，可继续粘贴下一张截图。</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Preview / Saving state ────────────────────────────────────────────────
  return (
    <div className="apple-tile rounded-[26px] p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold tracking-[-0.28px]">截图预览</h3>
        <button
          type="button"
          onClick={handleDiscard}
          className="apple-ghost-pill px-3 py-1.5 text-xs font-semibold text-ink/60 hover:text-cinnabar"
        >
          丢弃
        </button>
      </div>

      {/* Image preview */}
      <div className="mt-4 overflow-hidden rounded-[20px] border border-white/50 bg-white/30">
        <img
          src={imageDataUrl}
          alt="截图预览"
          className="max-h-72 w-full object-contain"
        />
      </div>

      {/* Review time */}
      <div className="mt-4 space-y-2">
        <label className="block text-sm font-medium text-ink/70">复习时间</label>
        <input
          type="datetime-local"
          value={reviewAtInput}
          onChange={(e) => setReviewAtInput(e.target.value)}
          className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setQuickReviewTime("now")}
            className="apple-ghost-pill px-3 py-1.5 text-xs font-semibold text-ink/62 hover:text-slateblue"
          >
            现在复习
          </button>
          <button
            type="button"
            onClick={() => setQuickReviewTime("tonight")}
            className="apple-ghost-pill px-3 py-1.5 text-xs font-semibold text-ink/62 hover:text-slateblue"
          >
            今晚 21:00
          </button>
          <button
            type="button"
            onClick={() => setQuickReviewTime("tomorrow")}
            className="apple-ghost-pill px-3 py-1.5 text-xs font-semibold text-ink/62 hover:text-slateblue"
          >
            明早 09:00
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-3 rounded-[16px] border border-cinnabar/30 bg-cinnabar/10 px-4 py-2.5 text-sm text-cinnabar">
          {errorMsg}
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={state === "saving"}
        className="apple-pill mt-4 w-full px-4 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {state === "saving" ? "录入中…" : "立即录入错题"}
      </button>
    </div>
  );
}
