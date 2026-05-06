import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/common/EmptyState";
import {
  findQuestionsByPageAndNumber,
  getQuestionLookupLabel,
} from "../services/mistakeLookup";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";
import type { Question } from "../types/question";
import type { ReviewMistakeRecord } from "../types/review";
import { formatDateTime, parseDateTimeLocal, toDateTimeLocalValue } from "../utils/date";

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

    markMistakeQuestion({
      question: selectedQuestion,
      reviewAt,
      sourcePage: submittedPage,
      sourceQuestionNo: submittedQuestionNo,
      note: submittedNote,
    });

    setMessage(`${selectedQuestion.questionNo} 已加入错题复习，时间：${formatDateTime(reviewAt.toISOString())}`);
    setNote("");
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
        <form onSubmit={handleSubmit} className="apple-tile rounded-[26px] p-6">
          <h3 className="text-2xl font-semibold tracking-[-0.28px]">录入错题</h3>
          <p className="mt-2 text-sm leading-6 text-ink/56">输入最少信息，保留最高确定性。</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-ink/70">页码</span>
              <input
                name="page"
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value)}
                placeholder="例如 6"
                className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-ink/70">题号</span>
              <input
                name="questionNo"
                value={questionNoInput}
                onChange={(event) => setQuestionNoInput(event.target.value)}
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
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-semibold text-slateblue">
                            {question.id}
                          </p>
                          <p className="mt-1 text-sm text-ink/70">{getQuestionLookupLabel(question)}</p>
                          <p className="mt-1 truncate text-xs text-ink/55">{question.chapter}</p>
                          {alreadyMarked ? (
                            <span className="mt-2 inline-flex rounded-full bg-cinnabar/12 px-3 py-1 text-xs font-semibold text-cinnabar">
                              已在错题本
                            </span>
                          ) : null}
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

function getDefaultReviewAt(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}
