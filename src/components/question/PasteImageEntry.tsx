/**
 * PasteImageEntry.tsx
 *
 * Allows the user to Ctrl+V a screenshot anywhere on the MistakeEntry page
 * to instantly record it as a mistake. No chapter, no question number needed.
 *
 * Also shows a list of all custom screenshot questions for the current book,
 * with individual delete buttons.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCustomQuestion,
  deleteCustomQuestion,
  getCustomQuestions,
} from "../../services/customQuestionService";
import { getCustomQuestionImageUrl } from "../../services/customQuestionService";
import { useBookStore } from "../../store/useBookStore";
import { useReviewStore } from "../../store/useReviewStore";
import { useQuestionStore } from "../../store/useQuestionStore";
import { toDateTimeLocalValue } from "../../utils/date";
import type { Question } from "../../types/question";

type EntryState = "idle" | "preview" | "saving" | "done";

function getDefaultReviewAt(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

// ─── Sub-component: thumbnail of a custom question image ───────────────────
function CustomQuestionThumb({
  question,
  onDelete,
}: {
  question: Question;
  onDelete: (id: string) => void;
}) {
  const [imgUrl, setImgUrl] = useState<string>("");
  const questionId = question.id;

  useEffect(() => {
    void getCustomQuestionImageUrl(questionId).then((url) => {
      if (url) setImgUrl(url);
    });
  }, [questionId]);

  return (
    <div className="group relative overflow-hidden rounded-[16px] bg-white/40 border border-white/50 shadow-sm">
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={question.questionNo}
          className="h-28 w-full object-cover"
        />
      ) : (
        <div className="flex h-28 w-full items-center justify-center text-ink/30 text-sm">
          加载中…
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/20" />
      <button
        type="button"
        onClick={() => onDelete(question.id)}
        title="彻底删除"
        className="absolute right-2 top-2 hidden rounded-full bg-cinnabar px-2 py-1 text-[11px] font-bold text-white shadow group-hover:flex"
      >
        删除
      </button>
      <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-2 py-1 text-[11px] text-white/90 truncate">
        {question.questionNo}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
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
  // Tracks custom questions to render the list below
  const [customList, setCustomList] = useState<Question[]>(() =>
    activeBookId ? getCustomQuestions(activeBookId) : [],
  );

  // Refresh custom list whenever activeBookId changes or after save/delete
  const refreshList = useCallback(() => {
    setCustomList(activeBookId ? getCustomQuestions(activeBookId) : []);
  }, [activeBookId]);

  // Re-read list when book changes
  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
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
      const reviewAt = new Date(reviewAtInput);
      if (isNaN(reviewAt.getTime())) throw new Error("请选择有效的复习时间");

      const questionId = await createCustomQuestion(activeBookId, imageDataUrl);

      if (mistakeRecords[questionId]?.active) {
        setSavedMsg("已在错题本中。");
        setEntryState("done");
        return;
      }

      // Build a minimal Question to pass to markMistakeQuestion
      const q: Question = {
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
        fsrs: {
          state: "new",
          difficulty: null,
          stability: null,
          retrievability: null,
          lastReview: null,
          nextReview: null,
          reviewCount: 0,
          lapseCount: 0,
        },
        review: { mastery: 0, lastResult: null, history: [] },
        meta: { source: "custom-paste", uncertain: false, note: "" },
      };

      markMistakeQuestion({
        question: q,
        reviewAt,
        sourcePage: "截图",
        sourceQuestionNo: q.questionNo,
      });

      await loadQuestions();
      refreshList();

      setSavedMsg("✅ 截图已录入错题本！");
      setEntryState("done");
      setTimeout(() => {
        setImageDataUrl("");
        setEntryState("idle");
        setSavedMsg("");
      }, 2500);
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

  async function handleDeleteCustom(questionId: string) {
    if (!activeBookId) return;
    if (!window.confirm("确定彻底删除这道截图题吗？图片和复习记录都会清除，无法恢复。")) return;
    // Remove from mistake records
    const { removeMistakeQuestion } = useReviewStore.getState();
    removeMistakeQuestion(questionId);
    await deleteCustomQuestion(activeBookId, questionId);
    await loadQuestions();
    refreshList();
  }

  // ── Idle / Done wrapper: always show the sticky paste hint ─────────────────
  const pasteHint = (
    <div className="flex items-center gap-2 rounded-[18px] border border-dashed border-slateblue/25 bg-slateblue/5 px-4 py-3 text-sm text-ink/50">
      <span className="text-base">⌨️</span>
      <span>
        在此页面按{" "}
        <kbd className="rounded border border-white/60 bg-white/50 px-1.5 py-0.5 text-xs font-semibold shadow-sm">
          ⌘V
        </kbd>{" "}
        /{" "}
        <kbd className="rounded border border-white/60 bg-white/50 px-1.5 py-0.5 text-xs font-semibold shadow-sm">
          Ctrl+V
        </kbd>{" "}
        粘贴截图，即可直接录入错题
      </span>
    </div>
  );

  // ── The custom question list ───────────────────────────────────────────────
  const customListSection = customList.length > 0 && (
    <div className="mt-4">
      <p className="mb-2 text-sm font-semibold text-ink/60">
        已录入的截图（共 {customList.length} 张）
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {customList.map((q) => (
          <CustomQuestionThumb
            key={q.id}
            question={q}
            onDelete={(id) => void handleDeleteCustom(id)}
          />
        ))}
      </div>
    </div>
  );

  // ── Preview / Saving state ────────────────────────────────────────────────
  if (state === "preview" || state === "saving") {
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

        <div className="mt-4 overflow-hidden rounded-[20px] border border-white/50 bg-white/30">
          <img src={imageDataUrl} alt="截图预览" className="max-h-72 w-full object-contain" />
        </div>

        <div className="mt-4 space-y-2">
          <label className="block text-sm font-medium text-ink/70">复习时间</label>
          <input
            type="datetime-local"
            value={reviewAtInput}
            onChange={(e) => setReviewAtInput(e.target.value)}
            className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {(["now", "tonight", "tomorrow"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setQuickReviewTime(k)}
                className="apple-ghost-pill px-3 py-1.5 text-xs font-semibold text-ink/62 hover:text-slateblue"
              >
                {k === "now" ? "现在" : k === "tonight" ? "今晚 21:00" : "明早 09:00"}
              </button>
            ))}
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

  // ── Idle / Done state ─────────────────────────────────────────────────────
  return (
    <div className="apple-tile rounded-[26px] p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slateblue/10 text-2xl">
          📸
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-semibold tracking-[-0.28px]">截图录入</h3>
          <p className="mt-1 text-sm leading-6 text-ink/60">
            截好图后直接粘贴，一键录入错题，无需填写任何其他信息。
          </p>
        </div>
      </div>

      <div className="mt-4">
        {state === "done" ? (
          <div className="flex items-center gap-2 rounded-[18px] bg-moss/10 px-4 py-3 text-sm text-moss">
            <span>✅</span>
            <span>{savedMsg || "录入成功！"}</span>
          </div>
        ) : (
          pasteHint
        )}
      </div>

      {customListSection}
    </div>
  );
}
