import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/common/EmptyState";
import QuestionThumbnail from "../components/question/QuestionThumbnail";
import {
  findQuestionsByPageAndNumber,
  getQuestionLookupLabel,
} from "../services/mistakeLookup";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";
import type { Question } from "../types/question";
import type { ReviewMistakeRecord } from "../types/review";
import { formatDateTime, parseDateTimeLocal, toDateTimeLocalValue } from "../utils/date";

type BatchSectionKey = "choice" | "fill" | "solution";

const batchSections: Array<{
  key: BatchSectionKey;
  title: string;
  section: string;
  placeholder: string;
}> = [
  {
    key: "choice",
    title: "选择题题号",
    section: "一、选择题",
    placeholder: "例如 1 3 5-8",
  },
  {
    key: "fill",
    title: "填空题题号",
    section: "二、填空题",
    placeholder: "例如 2 4 6",
  },
  {
    key: "solution",
    title: "解答题题号",
    section: "三、解答题",
    placeholder: "例如 1 2 7-9",
  },
];

export default function MistakeEntryPage() {
  const { questions, isLoading, error } = useQuestionStore();
  const { cards, mistakeRecords, markMistakeQuestion, removeMistakeQuestion } = useReviewStore();
  const [pageInput, setPageInput] = useState("");
  const [questionNoInput, setQuestionNoInput] = useState("");
  const [reviewAtInput, setReviewAtInput] = useState(() => toDateTimeLocalValue(getDefaultReviewAt()));
  const [note, setNote] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [batchChapter, setBatchChapter] = useState("");
  const [batchChoiceInput, setBatchChoiceInput] = useState("");
  const [batchFillInput, setBatchFillInput] = useState("");
  const [batchSolutionInput, setBatchSolutionInput] = useState("");
  const [batchReviewAtInput, setBatchReviewAtInput] = useState(() =>
    toDateTimeLocalValue(getDefaultReviewAt()),
  );
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const chapters = useMemo(
    () => Array.from(new Set(questions.map((question) => question.chapter).filter(Boolean))),
    [questions],
  );

  const matches = useMemo(
    () =>
      findQuestionsByPageAndNumber({
        questions,
        pageInput,
        questionNoInput,
      }),
    [pageInput, questionNoInput, questions],
  );

  const activeMistakes = useMemo(() => {
    return Object.values(mistakeRecords ?? {})
      .filter((record) => record.active)
      .map((record) => ({
        record,
        question: questions.find((question) => question.id === record.questionId),
      }))
      .filter((item): item is { record: ReviewMistakeRecord; question: Question } =>
        Boolean(item.question),
      )
      .sort((left, right) => left.record.reviewAt.localeCompare(right.record.reviewAt));
  }, [mistakeRecords, questions]);

  useEffect(() => {
    if (!batchChapter && chapters.length > 0) {
      setBatchChapter(chapters[0]);
    }
  }, [batchChapter, chapters]);

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

  function setBatchQuickReviewTime(kind: "now" | "tomorrow") {
    const next = new Date();
    if (kind === "tomorrow") {
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
    } else {
      next.setSeconds(0, 0);
    }
    setBatchReviewAtInput(toDateTimeLocalValue(next));
  }

  function stopEnterSubmit(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  }

  useEffect(() => {
    if (matches.length === 1) {
      setSelectedQuestionId(matches[0].id);
      return;
    }
    if (!matches.some((question) => question.id === selectedQuestionId)) {
      setSelectedQuestionId("");
    }
  }, [matches, selectedQuestionId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const submittedPage = String(formData.get("page") ?? "").trim();
    const submittedQuestionNo = String(formData.get("questionNo") ?? "").trim();
    const submittedReviewAt = String(formData.get("reviewAt") ?? "");
    const submittedNote = String(formData.get("note") ?? "");
    const submittedQuestionId = String(formData.get("selectedQuestion") ?? selectedQuestionId);
    const submittedMatches = findQuestionsByPageAndNumber({
      questions,
      pageInput: submittedPage,
      questionNoInput: submittedQuestionNo,
    });
    const selectedQuestion =
      submittedMatches.find((question) => question.id === submittedQuestionId) ??
      (submittedMatches.length === 1 ? submittedMatches[0] : undefined);
    const reviewAt = parseDateTimeLocal(submittedReviewAt);

    if (!submittedPage || !submittedQuestionNo) {
      setFormError("请先填写页码和题号。");
      return;
    }

    if (submittedMatches.length === 0) {
      setFormError("没有找到匹配题目，请检查页码和题号。");
      return;
    }

    if (!selectedQuestion) {
      setFormError("请选择要加入错题本的题目。");
      return;
    }

    if (!reviewAt) {
      setFormError("请选择有效的复习时间。");
      return;
    }

    if (mistakeRecords[selectedQuestion.id]?.active) {
      setMessage(`${selectedQuestion.questionNo} 已在错题本，未重复录入。`);
      setQuestionNoInput("");
      setSelectedQuestionId("");
      return;
    }

    markMistakeQuestion({
      question: selectedQuestion,
      reviewAt,
      sourcePage: submittedPage,
      sourceQuestionNo: submittedQuestionNo,
      note: submittedNote,
    });

    setMessage(`${selectedQuestion.questionNo} 已加入错题复习，时间：${formatDateTime(reviewAt.toISOString())}`);
    setNote("");
    setQuestionNoInput("");
    setSelectedQuestionId("");
  }

  function handleBatchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBatchMessage(null);
    setBatchError(null);

    const reviewAt = parseDateTimeLocal(batchReviewAtInput);
    if (!reviewAt) {
      setBatchError("请选择有效的批量复习时间。");
      return;
    }

    if (!batchChapter) {
      setBatchError("请先选择章节。");
      return;
    }

    const inputBySection: Record<BatchSectionKey, string> = {
      choice: batchChoiceInput,
      fill: batchFillInput,
      solution: batchSolutionInput,
    };
    const requestedItems = batchSections.flatMap((section) =>
      parseQuestionNumbers(inputBySection[section.key]).map((questionNo) => ({
        section: section.section,
        questionNo,
      })),
    );

    if (requestedItems.length === 0) {
      setBatchError("请至少填写一个题号。支持空格、逗号和 1-5 这样的范围。");
      return;
    }

    const activeIds = new Set(
      Object.values(mistakeRecords ?? {})
        .filter((record) => record.active)
        .map((record) => record.questionId),
    );
    const batchSeenIds = new Set<string>();
    const addedQuestions: Question[] = [];
    const skippedQuestions: Question[] = [];
    const missingLabels: string[] = [];

    for (const item of requestedItems) {
      const question = findBatchQuestion({
        questions,
        chapter: batchChapter,
        section: item.section,
        questionNo: item.questionNo,
      });

      if (!question) {
        missingLabels.push(`${item.section.replace(/^[一二三]、/, "")} ${item.questionNo}`);
        continue;
      }

      if (activeIds.has(question.id) || batchSeenIds.has(question.id)) {
        skippedQuestions.push(question);
        continue;
      }

      markMistakeQuestion({
        question,
        reviewAt,
        sourcePage: question.printedPageNumber || String(question.pageStart),
        sourceQuestionNo: question.questionNo,
        note: "",
      });
      activeIds.add(question.id);
      batchSeenIds.add(question.id);
      addedQuestions.push(question);
    }

    if (addedQuestions.length > 0) {
      setBatchChoiceInput("");
      setBatchFillInput("");
      setBatchSolutionInput("");
    }

    const missingText =
      missingLabels.length > 0 ? `，未找到 ${missingLabels.slice(0, 8).join("、")}` : "";
    setBatchMessage(
      `批量录入完成：新增 ${addedQuestions.length} 题，已存在跳过 ${skippedQuestions.length} 题${missingText}。`,
    );

    if (addedQuestions.length === 0 && missingLabels.length > 0) {
      setBatchError("没有新增题目，请检查章节、题型和题号是否对应。");
    }
  }

  if (isLoading) {
    return <EmptyState title="正在读取题库" description="正在加载 /data/questions.json。" />;
  }

  if (error) {
    return <EmptyState title="题库读取失败" description={error} />;
  }

  return (
    <div className="space-y-6">
      <section className="apple-glass rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="apple-kicker">Mistake Intake</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.28px] md:text-5xl">
              Capture a mistake, then let it wait for you.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-ink/58">
              按页码和题号定位题目。只有手动标记过的错题，才会进入你的本地 FSRS 复习节奏。
            </p>
          </div>
          <Link
            to="/review"
            className="apple-pill w-fit px-5 py-2.5 text-sm font-semibold"
          >
            去复习
          </Link>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-5">
          <form onSubmit={handleBatchSubmit} className="apple-tile rounded-[26px] p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="apple-kicker">Batch Intake</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.28px]">按章节批量录入</h3>
                <p className="mt-2 text-sm leading-6 text-ink/56">
                  选择章节后，把选择题、填空题、解答题的错题题号分别填进去。推荐用空格分隔，连续题号用短横线，例如 1 3 5-8。
                </p>
              </div>
              <span className="w-fit rounded-full bg-white/48 px-3 py-1 text-xs font-semibold text-ink/52">
                默认每日 10 题
              </span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium text-ink/70">章节</span>
                <select
                  value={batchChapter}
                  onChange={(event) => setBatchChapter(event.target.value)}
                  className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
                >
                  {chapters.map((chapter) => (
                    <option key={chapter} value={chapter}>
                      {chapter}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium text-ink/70">批量复习时间</span>
                <input
                  type="datetime-local"
                  value={batchReviewAtInput}
                  onChange={(event) => setBatchReviewAtInput(event.target.value)}
                  className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
                />
              </label>

              <div className="flex flex-wrap items-end gap-2">
                <QuickTimeButton label="现在开始排队" onClick={() => setBatchQuickReviewTime("now")} />
                <QuickTimeButton label="明早 09:00" onClick={() => setBatchQuickReviewTime("tomorrow")} />
              </div>

              {batchSections.map((section) => {
                const value =
                  section.key === "choice"
                    ? batchChoiceInput
                    : section.key === "fill"
                      ? batchFillInput
                      : batchSolutionInput;
                const updateValue =
                  section.key === "choice"
                    ? setBatchChoiceInput
                    : section.key === "fill"
                      ? setBatchFillInput
                      : setBatchSolutionInput;

                return (
                  <label key={section.key} className="space-y-1 text-sm md:col-span-2">
                    <span className="font-medium text-ink/70">{section.title}</span>
                    <textarea
                      value={value}
                      onChange={(event) => updateValue(event.target.value)}
                      rows={2}
                      placeholder={section.placeholder}
                      className="apple-control w-full resize-y rounded-[20px] px-4 py-3 text-sm"
                    />
                  </label>
                );
              })}
            </div>

            {(batchMessage || batchError) && (
              <div
                className={[
                  "mt-4 rounded-[18px] border p-3 text-sm backdrop-blur",
                  batchError
                    ? "border-cinnabar/30 bg-cinnabar/10 text-cinnabar"
                    : "border-moss/30 bg-moss/10 text-moss",
                ].join(" ")}
              >
                {batchError ?? batchMessage}
              </div>
            )}

            <button type="submit" className="apple-pill mt-5 w-full px-4 py-3 text-sm font-semibold">
              批量加入错题
            </button>
          </form>

        <form onSubmit={handleSubmit} className="apple-tile rounded-[26px] p-6">
          <h3 className="text-2xl font-semibold tracking-[-0.28px]">录入错题</h3>
          <p className="mt-2 text-sm leading-6 text-ink/56">
            页码默认按书本印刷页搜索。回车只保留当前匹配结果，不会直接加入错题本。
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-ink/70">书本印刷页码</span>
              <input
                name="page"
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value)}
                onKeyDown={stopEnterSubmit}
                placeholder="例如 25"
                className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-ink/70">题号</span>
              <input
                name="questionNo"
                value={questionNoInput}
                onChange={(event) => setQuestionNoInput(event.target.value)}
                onKeyDown={stopEnterSubmit}
                placeholder="例如 1"
                className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
              />
            </label>

            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-ink/70">计划复习时间</span>
              <input
                name="reviewAt"
                type="datetime-local"
                value={reviewAtInput}
                onChange={(event) => setReviewAtInput(event.target.value)}
                className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
              />
            </label>

            <div className="flex flex-wrap gap-2 md:col-span-2">
              <QuickTimeButton label="现在复习" onClick={() => setQuickReviewTime("now")} />
              <QuickTimeButton label="今晚 21:00" onClick={() => setQuickReviewTime("tonight")} />
              <QuickTimeButton label="明早 09:00" onClick={() => setQuickReviewTime("tomorrow")} />
            </div>

            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-ink/70">备注</span>
              <textarea
                name="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="可写错因、卡住的步骤或要提醒自己的点"
                className="apple-control w-full resize-y rounded-[20px] px-4 py-3 text-sm"
              />
            </label>
          </div>

          <div className="apple-soft-card mt-5 rounded-[22px] p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold">匹配结果</h4>
              <span className="rounded-full bg-white/54 px-3 py-1 text-xs font-semibold text-ink/56">
                {matches.length} 个
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {matches.length === 0 ? (
                <p className="text-sm text-ink/55">输入页码和题号后会在这里显示候选题。</p>
              ) : (
                matches.map((question) => {
                  const selected = selectedQuestionId === question.id;
                  const alreadyMarked = mistakeRecords[question.id]?.active;
                  return (
                    <label
                      key={question.id}
                      className={[
                        "block cursor-pointer rounded-[18px] border p-3 transition",
                        selected
                          ? "border-slateblue/35 bg-white/64 shadow-[0_10px_26px_rgba(0,102,204,0.08)]"
                          : "border-white/50 bg-white/38 hover:bg-white/54",
                      ].join(" ")}
                    >
                      <div className="flex gap-3">
                        <input
                          type="radio"
                          name="selectedQuestion"
                          value={question.id}
                          checked={selected}
                          onChange={() => setSelectedQuestionId(question.id)}
                          className="mt-1"
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start">
                          <QuestionThumbnail question={question} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-sm font-semibold text-slateblue">
                              {question.id}
                            </p>
                            <p className="mt-1 text-sm text-ink/70">{getQuestionLookupLabel(question)}</p>
                            <p className="mt-1 truncate text-xs text-ink/55">
                              {question.chapter} / {question.section}
                            </p>
                            {alreadyMarked ? (
                              <span className="mt-2 inline-flex rounded-full bg-cinnabar/12 px-3 py-1 text-xs font-semibold text-cinnabar">
                                已在错题本
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {(message || formError) && (
            <div
              className={[
              "mt-4 rounded-[18px] border p-3 text-sm backdrop-blur",
                formError
                  ? "border-cinnabar/30 bg-cinnabar/10 text-cinnabar"
                  : "border-moss/30 bg-moss/10 text-moss",
              ].join(" ")}
            >
              {formError ?? message}
            </div>
          )}

          <button
            type="submit"
            className="apple-pill mt-5 w-full px-4 py-3 text-sm font-semibold"
          >
            标记为错题
          </button>
        </form>
        </div>

        <section className="apple-tile rounded-[26px] p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-xl font-semibold">当前错题复习池</h3>
              <p className="mt-1 text-sm text-ink/60">共 {activeMistakes.length} 题。</p>
            </div>
            <span className="text-sm text-ink/55">按复习时间排序</span>
          </div>

          {activeMistakes.length === 0 ? (
            <EmptyState title="还没有错题" description="先用左侧页码和题号加入一题。" />
          ) : (
            <div className="mt-5 max-h-[42rem] space-y-3 overflow-auto pr-1">
              {activeMistakes.map(({ record, question }) => {
                const due = cards[question.id]?.card.due ?? record.reviewAt;
                return (
                  <article key={question.id} className="apple-soft-card rounded-[20px] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-semibold text-slateblue">
                          {question.id}
                        </p>
                        <h4 className="mt-1 font-semibold">{question.questionNo}</h4>
                        <p className="mt-1 text-sm text-ink/60">{question.chapter}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMistakeQuestion(question.id)}
                        className="apple-ghost-pill w-fit px-3 py-2 text-xs font-semibold text-ink/64 hover:text-cinnabar"
                      >
                        移出
                      </button>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                      <Info label="录入页码" value={record.sourcePage} />
                      <Info label="录入题号" value={record.sourceQuestionNo} />
                      <Info label="下次复习" value={formatDateTime(due)} />
                      <Info label="复习次数" value={cards[question.id]?.card.reps ?? 0} />
                    </div>
                    {record.note ? <p className="mt-3 text-sm text-ink/65">{record.note}</p> : null}
                    <Link
                      to={`/questions/${encodeURIComponent(question.id)}`}
                      className="mt-3 inline-flex text-sm font-semibold text-slateblue hover:underline"
                    >
                      查看题目
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span className="text-xs font-semibold text-ink/45">{label}</span>
      <p className="mt-1 font-medium text-ink">{value || "暂无"}</p>
    </div>
  );
}

function QuickTimeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="apple-ghost-pill px-3 py-1.5 text-xs font-semibold text-ink/62 hover:text-slateblue"
    >
      {label}
    </button>
  );
}

function findBatchQuestion({
  questions,
  chapter,
  section,
  questionNo,
}: {
  questions: Question[];
  chapter: string;
  section: string;
  questionNo: string;
}): Question | undefined {
  const normalizedQuestionNo = normalizeQuestionNo(questionNo);
  return questions.find(
    (question) =>
      question.chapter === chapter &&
      (question.section === section || question.section === "") &&
      normalizeQuestionNo(question.questionNo) === normalizedQuestionNo,
  );
}

function parseQuestionNumbers(value: string): string[] {
  const normalized = value
    .replace(/[，、；;]/g, " ")
    .replace(/\s*[-~—–至]\s*/g, "-")
    .trim();

  if (!normalized) {
    return [];
  }

  const result: string[] = [];
  for (const token of normalized.split(/\s+/)) {
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      // If the second number has 2+ digits, treat as a question ID (e.g. "2-22"), not a range
      if (range[2].length >= 2) {
        result.push(token);
        continue;
      }
      const start = Number(range[1]);
      const end = Number(range[2]);
      const direction = start <= end ? 1 : -1;
      for (let current = start; current !== end + direction; current += direction) {
        result.push(String(current));
      }
      continue;
    }

    const single = token.match(/\d+/);
    if (single) {
      result.push(String(Number(single[0])));
    }
  }

  return Array.from(new Set(result));
}

function normalizeQuestionNo(value: string): string {
  // Preserve hyphenated question numbers like "2-22" for exact matching
  if (value.includes("-")) {
    return value.toLowerCase().replace(/\s+/g, "");
  }
  const match = value.match(/\d+/);
  return match ? String(Number(match[0])) : value.trim();
}

function getDefaultReviewAt(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}
