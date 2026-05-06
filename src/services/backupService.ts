import type {
  ReviewBackupData,
  ReviewCardRecord,
  ReviewLog,
  ReviewMistakeRecord,
  ReviewQuestionFingerprint,
  ReviewSettings,
  ReviewSyncResult,
} from "../types/review";
import { defaultReviewSettings } from "./fsrsService";

export const REVIEW_BACKUP_VERSION = 1;
export const REVIEW_STORAGE_KEY = "openclaw-review-state";

export function createReviewBackup(
  cards: Record<string, ReviewCardRecord>,
  reviewLogs: ReviewLog[],
  settings: ReviewSettings,
  mistakeRecords: Record<string, ReviewMistakeRecord> = {},
  questionFingerprints: Record<string, ReviewQuestionFingerprint> = {},
  lastSyncResult: ReviewSyncResult | null = null,
): ReviewBackupData {
  return {
    version: REVIEW_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    cards,
    reviewLogs,
    settings: normalizeSettings(settings),
    mistakeRecords,
    questionFingerprints,
    lastSyncResult,
  };
}

export function downloadReviewBackup(backup: ReviewBackupData): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `math-review-backup-${formatFileDate(new Date())}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readBackupFile(file: File): Promise<ReviewBackupData> {
  const text = await file.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("备份文件不是有效的 JSON。");
  }

  return validateReviewBackup(parsed);
}

export function validateReviewBackup(value: unknown): ReviewBackupData {
  if (!isRecord(value)) {
    throw new Error("备份文件格式错误：顶层必须是对象。");
  }

  if (value.version !== REVIEW_BACKUP_VERSION) {
    throw new Error(`备份版本不兼容：当前支持 version ${REVIEW_BACKUP_VERSION}。`);
  }

  if (typeof value.exportedAt !== "string") {
    throw new Error("备份文件缺少 exportedAt。");
  }

  if (!isRecord(value.cards)) {
    throw new Error("备份文件缺少 cards，或 cards 格式错误。");
  }

  if (!Array.isArray(value.reviewLogs)) {
    throw new Error("备份文件缺少 reviewLogs，或 reviewLogs 格式错误。");
  }

  if (!isRecord(value.settings)) {
    throw new Error("备份文件缺少 settings，或 settings 格式错误。");
  }

  return {
    version: REVIEW_BACKUP_VERSION,
    exportedAt: value.exportedAt,
    cards: value.cards as Record<string, ReviewCardRecord>,
    reviewLogs: value.reviewLogs as ReviewLog[],
    settings: normalizeSettings(value.settings as Partial<ReviewSettings>),
    mistakeRecords: isRecord(value.mistakeRecords)
      ? (value.mistakeRecords as Record<string, ReviewMistakeRecord>)
      : {},
    questionFingerprints: isRecord(value.questionFingerprints)
      ? (value.questionFingerprints as Record<string, ReviewQuestionFingerprint>)
      : {},
    lastSyncResult: isRecord(value.lastSyncResult)
      ? (value.lastSyncResult as ReviewSyncResult)
      : null,
  };
}

export function normalizeSettings(settings: Partial<ReviewSettings>): ReviewSettings {
  return {
    maxDailyReviews: clampInteger(
      settings.maxDailyReviews,
      defaultReviewSettings.maxDailyReviews,
      1,
      100,
    ),
    maxNewPerDay: clampInteger(settings.maxNewPerDay, defaultReviewSettings.maxNewPerDay, 0, 100),
    desiredRetention: clampNumber(
      settings.desiredRetention,
      defaultReviewSettings.desiredRetention,
      0.8,
      0.95,
    ),
  };
}

export function hasStoredReviewState(): boolean {
  return localStorage.getItem(REVIEW_STORAGE_KEY) !== null;
}

function formatFileDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}
