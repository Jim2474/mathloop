import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import EmptyState from "../components/common/EmptyState";
import {
  createReviewBackup,
  downloadReviewBackup,
  hasStoredReviewState,
  readBackupFile,
} from "../services/backupService";
import { getLibrarySyncPreview } from "../services/librarySyncService";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";
import type { ReviewSettings } from "../types/review";
import { toPublicAssetUrl } from "../utils/questionImages";

type ImageStatus = "pending" | "ok" | "missing";

export default function BackupPage() {
  const { questions, isLoading, error } = useQuestionStore();
  const {
    cards,
    reviewLogs,
    mistakeRecords,
    questionFingerprints,
    lastSyncResult,
    settings,
    updateSettings,
    importReviewState,
    syncQuestionLibrary,
    cleanupOrphanReviewData,
    resetReviewState,
  } = useReviewStore();
  const [settingsDraft, setSettingsDraft] = useState<ReviewSettings>(settings);
  const [message, setMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [storageTouched, setStorageTouched] = useState(0);
  const [imageStatuses, setImageStatuses] = useState<Record<string, ImageStatus>>({});

  useEffect(() => {
    setSettingsDraft(settings);
  }, [settings]);

  const baseHealth = useMemo(() => {
    const chapterCounts = new Map<string, number>();
    let emptyChapterCount = 0;
    let emptyQuestionNoCount = 0;
    let emptyImageCount = 0;
    let uncertainCount = 0;
    let answerMetaUncertainCount = 0;

    for (const question of questions) {
      const chapter = question.chapter.trim() || "未标注章节";
      chapterCounts.set(chapter, (chapterCounts.get(chapter) ?? 0) + 1);
      if (!question.chapter.trim()) {
        emptyChapterCount += 1;
      }
      if (!question.questionNo.trim()) {
        emptyQuestionNoCount += 1;
      }
      if (!question.questionImage.trim()) {
        emptyImageCount += 1;
      }
      if (question.meta.uncertain) {
        uncertainCount += 1;
      }
      if (question.answerMeta?.uncertain) {
        answerMetaUncertainCount += 1;
      }
    }

    return {
      total: questions.length,
      uncertainCount,
      emptyChapterCount,
      emptyQuestionNoCount,
      emptyImageCount,
      chapterCounts: Array.from(chapterCounts.entries()).map(([chapter, count]) => ({
        chapter,
        count,
      })),
      answerMetaUncertainCount,
    };
  }, [questions]);

  const syncPreview = useMemo(
    () =>
      getLibrarySyncPreview({
        questions,
        cards,
        reviewLogs,
        questionFingerprints,
      }),
    [cards, questionFingerprints, questions, reviewLogs],
  );

  const failedImageCount = questions.filter(
    (question) => question.questionImage.trim() && imageStatuses[question.id] === "missing",
  ).length;
  const missingImageCount = syncPreview.missingQuestionImageCount + failedImageCount;
  const stored = hasStoredReviewState();

  function handleExport() {
    const backup = createReviewBackup(
      cards,
      reviewLogs,
      settings,
      mistakeRecords,
      questionFingerprints,
      lastSyncResult,
    );
    downloadReviewBackup(backup);
    setMessage("已生成本地复习数据备份。");
    setImportError(null);
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setMessage(null);
    setImportError(null);

    const confirmed = window.confirm("导入备份会覆盖当前本地复习状态，确定继续吗？");
    if (!confirmed) {
      return;
    }

    try {
      const backup = await readBackupFile(file);
      importReviewState({
        cards: backup.cards,
        reviewLogs: backup.reviewLogs,
        settings: backup.settings,
        mistakeRecords: backup.mistakeRecords,
        questionFingerprints: backup.questionFingerprints,
        lastSyncResult: backup.lastSyncResult,
      });
      syncQuestionLibrary(questions);
      setStorageTouched((value) => value + 1);
      setMessage(`导入成功：${file.name}`);
    } catch (importFailure) {
      const detail = importFailure instanceof Error ? importFailure.message : "导入失败。";
      setImportError(detail);
    }
  }

  function handleReset() {
    const firstConfirm = window.confirm("确定清空当前浏览器里的本地复习状态吗？");
    if (!firstConfirm) {
      return;
    }

    const secondConfirm = window.confirm("请再次确认：这会删除 cards、reviewLogs 和 settings。");
    if (!secondConfirm) {
      return;
    }

    resetReviewState(questions);
    setStorageTouched((value) => value + 1);
    setMessage("本地复习状态已重置，并已根据当前题库重新初始化 cards。");
    setImportError(null);
  }

  function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateSettings(settingsDraft);
    setStorageTouched((value) => value + 1);
    setMessage("设置已保存，后续 /review 队列会使用新参数。");
    setImportError(null);
  }

  function handleManualSync() {
    const result = syncQuestionLibrary(questions);
    setStorageTouched((value) => value + 1);
    setImportError(null);
    setMessage(
      `同步完成：新增 cards ${result.initializedCards}，orphan cards ${result.orphanCards}，当前 cards ${result.totalCards}。`,
    );
  }

  function handleCleanupOrphans() {
    if (syncPreview.orphanCardCount === 0 && syncPreview.orphanReviewLogCount === 0) {
      setMessage("当前没有需要清理的孤儿复习数据。");
      setImportError(null);
      return;
    }

    const firstConfirm = window.confirm(
      "清理孤儿数据会删除当前题库中已不存在题目的 cards、reviewLogs、错题记录和题目指纹。确定继续吗？",
    );
    if (!firstConfirm) {
      return;
    }
    const secondConfirm = window.confirm("请再次确认：这个操作只影响 localStorage，不能自动恢复。");
    if (!secondConfirm) {
      return;
    }

    const result = cleanupOrphanReviewData(questions);
    setStorageTouched((value) => value + 1);
    setImportError(null);
    setMessage(
      `清理完成：cards ${result.removedCards}，reviewLogs ${result.removedReviewLogs}，错题记录 ${result.removedMistakeRecords}，指纹 ${result.removedFingerprints}。`,
    );
  }

  function setImageStatus(questionId: string, status: ImageStatus) {
    setImageStatuses((current) =>
      current[questionId] === status ? current : { ...current, [questionId]: status },
    );
  }

  if (isLoading) {
    return <EmptyState title="正在读取题库" description="正在加载 /data/questions.json。" />;
  }

  if (error) {
    return <EmptyState title="题库读取失败" description={error} />;
  }

  return (
    <div className="space-y-6">
      <section className="apple-glass rounded-[30px] p-6 md:p-8">
        <p className="apple-kicker">Local Data Console</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-[-0.28px] md:text-5xl">
          Keep your review state portable.
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-ink/58">
          这里维护浏览器本地复习状态，不会修改 OpenClaw 的 questions.json，也不会上传任何数据。
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <Metric label="本地 cards" value={Object.keys(cards).length} />
          <Metric label="错题记录" value={Object.values(mistakeRecords).filter((record) => record.active).length} />
          <Metric label="复习历史" value={reviewLogs.length} />
          <Metric label="orphan cards" value={syncPreview.orphanCardCount} />
          <Metric label="localStorage" value={stored || storageTouched > 0 ? "已存在" : "为空"} />
        </div>
        {!stored && Object.keys(cards).length === 0 ? (
          <div className="apple-soft-card mt-4 rounded-[20px] border-dashed p-4 text-sm text-ink/60">
            当前 localStorage 为空。题库加载后会自动初始化本地 cards。
          </div>
        ) : null}
      </section>

      {(message || importError) && (
        <section
          className={[
            "rounded-[20px] border p-4 text-sm backdrop-blur",
            importError
              ? "border-cinnabar/35 bg-cinnabar/10 text-cinnabar"
              : "border-moss/30 bg-moss/10 text-moss",
          ].join(" ")}
        >
          {importError ?? message}
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="apple-tile rounded-[26px] p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-2xl font-semibold tracking-[-0.28px]">题库同步</h3>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                只同步 localStorage 中的复习状态和题目指纹，不写回 questions.json。
              </p>
            </div>
            <button
              type="button"
              onClick={handleManualSync}
              className="apple-pill w-fit px-5 py-2.5 text-sm font-semibold"
            >
              重新同步题库
            </button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Metric label="上次新增 cards" value={lastSyncResult?.initializedCards ?? "暂无"} />
            <Metric label="上次字段变化" value={lastSyncResult?.changedFingerprints ?? "暂无"} />
            <Metric label="上次 orphan" value={lastSyncResult?.orphanCards ?? "暂无"} />
            <Metric label="上次总 cards" value={lastSyncResult?.totalCards ?? "暂无"} />
          </div>
          <p className="mt-3 text-xs text-ink/50">
            最近同步：{lastSyncResult ? formatLocalDateTime(lastSyncResult.syncedAt) : "暂无"}
          </p>
        </div>

        <div className="apple-tile rounded-[26px] p-6">
          <h3 className="text-2xl font-semibold tracking-[-0.28px]">孤儿数据清理</h3>
          <p className="mt-2 text-sm leading-6 text-ink/65">
            当前题库不存在的 questionId 会保留为 orphan，只有手动确认后才会清理。
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Metric label="orphan cards" value={syncPreview.orphanCardCount} />
            <Metric label="orphan logs" value={syncPreview.orphanReviewLogCount} />
          </div>
          <button
            type="button"
            onClick={handleCleanupOrphans}
            className="apple-danger-pill mt-5 px-5 py-2.5 text-sm font-semibold"
            disabled={syncPreview.orphanCardCount === 0 && syncPreview.orphanReviewLogCount === 0}
          >
            清理孤儿复习记录
          </button>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="apple-tile rounded-[26px] p-6">
          <h3 className="text-2xl font-semibold tracking-[-0.28px]">备份与导入</h3>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            导出的 JSON 包含 cards、reviewLogs、settings、exportedAt 和 version。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExport}
              className="apple-pill px-5 py-2.5 text-sm font-semibold"
            >
              导出 JSON 备份
            </button>
            <label className="apple-ghost-pill cursor-pointer px-5 py-2.5 text-sm font-semibold text-ink/68 hover:text-slateblue">
              选择备份并导入
              <input type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
            </label>
          </div>
        </div>

        <div className="apple-tile rounded-[26px] p-6">
          <h3 className="text-2xl font-semibold tracking-[-0.28px]">重置本地复习状态</h3>
          <p className="mt-2 text-sm leading-6 text-ink/65">
            清空 localStorage 中的 openclaw-review-state，然后根据当前题库重新初始化 cards。
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="apple-danger-pill mt-5 px-5 py-2.5 text-sm font-semibold"
          >
            重置本地状态
          </button>
        </div>
      </section>

      <section className="apple-tile rounded-[26px] p-6">
        <h3 className="text-2xl font-semibold tracking-[-0.28px]">复习设置</h3>
        <form onSubmit={handleSettingsSubmit} className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <NumberField
            label="每日最多复习"
            value={settingsDraft.maxDailyReviews}
            min={1}
            max={100}
            step={1}
            onChange={(value) => setSettingsDraft((current) => ({ ...current, maxDailyReviews: value }))}
          />
          <NumberField
            label="每日最多新题"
            value={settingsDraft.maxNewPerDay}
            min={0}
            max={100}
            step={1}
            onChange={(value) => setSettingsDraft((current) => ({ ...current, maxNewPerDay: value }))}
          />
          <NumberField
            label="目标记忆率"
            value={settingsDraft.desiredRetention}
            min={0.8}
            max={0.95}
            step={0.01}
            onChange={(value) => setSettingsDraft((current) => ({ ...current, desiredRetention: value }))}
          />
          <button
            type="submit"
            className="apple-pill px-5 py-2.5 text-sm font-semibold"
          >
            保存设置
          </button>
        </form>
        <p className="mt-3 text-xs text-ink/55">desiredRetention 会被限制在 0.8 到 0.95 之间。</p>
      </section>

      <section className="apple-tile rounded-[26px] p-6">
        <h3 className="text-2xl font-semibold tracking-[-0.28px]">数据健康检查</h3>
        {questions.length === 0 ? (
          <EmptyState title="questions.json 为空" description="请放入 OpenClaw 导出的题库数组。" />
        ) : (
          <>
            <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-5">
              <Metric label="题库总题数" value={syncPreview.questionTotal} />
              <Metric label="本地 cards" value={syncPreview.cardTotal} />
              <Metric label="待新增题" value={syncPreview.newQuestionCount} />
              <Metric label="字段变化" value={syncPreview.changedQuestionCount} />
              <Metric label="orphan cards" value={syncPreview.orphanCardCount} />
              <Metric label="orphan logs" value={syncPreview.orphanReviewLogCount} />
              <Metric label="题目图缺失" value={missingImageCount} />
              <Metric label="答案图缺失" value={syncPreview.missingAnswerImageCount} />
              <Metric label="uncertain" value={syncPreview.uncertainQuestionCount} />
              <Metric label="answer uncertain" value={syncPreview.uncertainAnswerMetaCount} />
              <Metric label="空章节" value={syncPreview.emptyChapterCount} />
              <Metric label="空题号" value={syncPreview.emptyQuestionNoCount} />
            </div>

            {syncPreview.orphanCardIds.length > 0 ? (
              <div className="apple-soft-card mt-5 rounded-[22px] p-4">
                <h4 className="font-semibold text-cinnabar">孤儿 card</h4>
                <p className="mt-2 text-sm text-ink/65">这些题目已不在当前题库中。</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {syncPreview.orphanCardIds.slice(0, 20).map((questionId) => (
                    <span
                      key={questionId}
                      className="rounded-full bg-white/54 px-3 py-1 text-xs font-semibold text-ink/62"
                    >
                      {questionId}
                    </span>
                  ))}
                  {syncPreview.orphanCardIds.length > 20 ? (
                    <span className="rounded-full bg-white/54 px-3 py-1 text-xs font-semibold text-ink/62">
                      +{syncPreview.orphanCardIds.length - 20}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <div className="apple-soft-card rounded-[22px] p-4">
                <h4 className="font-semibold">各章节题目数量</h4>
                <div className="mt-4 space-y-2">
                  {baseHealth.chapterCounts.map((item) => (
                    <div key={item.chapter} className="flex items-center justify-between gap-4 text-sm">
                      <span className="truncate text-ink/70">{item.chapter}</span>
                      <span className="font-semibold">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="apple-soft-card rounded-[22px] p-4">
                <h4 className="font-semibold">题目图片预览</h4>
                <div className="mt-4 max-h-[34rem] space-y-3 overflow-auto pr-1">
                  {questions.map((question) => (
                    <div key={question.id} className="grid gap-3 rounded-[18px] border border-white/46 bg-white/40 p-3 md:grid-cols-[7rem_1fr_auto] md:items-center">
                      <HealthImagePreview
                        questionId={question.id}
                        path={question.questionImage}
                        status={imageStatuses[question.id]}
                        onStatus={setImageStatus}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-semibold text-slateblue">{question.id}</p>
                        <p className="truncate text-xs text-ink/55">{question.questionImage || "questionImage 为空"}</p>
                      </div>
                      <ImageStatusBadge path={question.questionImage} status={imageStatuses[question.id]} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="apple-soft-card rounded-[20px] p-4">
      <p className="text-xs font-semibold text-ink/50">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-ink/70">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="apple-control w-full rounded-full px-4 py-2.5 text-sm"
      />
    </label>
  );
}

function HealthImagePreview({
  questionId,
  path,
  status,
  onStatus,
}: {
  questionId: string;
  path: string;
  status?: ImageStatus;
  onStatus: (questionId: string, status: ImageStatus) => void;
}) {
  const url = toPublicAssetUrl(path);

  if (!url) {
    return (
      <div className="flex h-20 items-center justify-center rounded-[16px] border border-dashed border-white/50 bg-white/30 text-xs text-ink/45">
        无路径
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className="flex h-20 items-center justify-center rounded-[16px] border border-dashed border-cinnabar/30 bg-cinnabar/10 text-xs text-cinnabar">
        加载失败
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={path}
      loading="lazy"
      onLoad={() => onStatus(questionId, "ok")}
      onError={() => onStatus(questionId, "missing")}
      className="h-20 w-28 rounded-[16px] border border-white/52 bg-white/46 object-cover shadow-[0_8px_18px_rgba(29,29,31,0.05)]"
    />
  );
}

function ImageStatusBadge({ path, status }: { path: string; status?: ImageStatus }) {
  let label = "待检测";
  let className = "bg-line/60 text-ink/60";

  if (!path.trim()) {
    label = "缺路径";
    className = "bg-cinnabar/12 text-cinnabar";
  } else if (status === "ok") {
    label = "正常";
    className = "bg-moss/12 text-moss";
  } else if (status === "missing") {
    label = "缺失";
    className = "bg-cinnabar/12 text-cinnabar";
  }

  return <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function formatLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
