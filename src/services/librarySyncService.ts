import type { Question } from "../types/question";
import type {
  ReviewCardRecord,
  ReviewLog,
  ReviewQuestionFingerprint,
} from "../types/review";
import { getAnswerImagePaths, getQuestionImagePaths } from "../utils/questionImages";

type SyncPreviewParams = {
  questions: Question[];
  cards: Record<string, ReviewCardRecord>;
  reviewLogs: ReviewLog[];
  questionFingerprints: Record<string, ReviewQuestionFingerprint>;
};

export type LibrarySyncPreview = {
  questionTotal: number;
  cardTotal: number;
  newQuestionCount: number;
  changedQuestionCount: number;
  orphanCardCount: number;
  orphanReviewLogCount: number;
  missingQuestionImageCount: number;
  missingAnswerImageCount: number;
  uncertainQuestionCount: number;
  uncertainAnswerMetaCount: number;
  emptyChapterCount: number;
  emptyQuestionNoCount: number;
  newQuestionIds: string[];
  changedQuestionIds: string[];
  orphanCardIds: string[];
};

export function buildQuestionFingerprint(question: Question): ReviewQuestionFingerprint {
  return {
    id: normalizeText(question.id),
    chapter: normalizeText(question.chapter),
    section: normalizeText(question.section),
    questionNo: normalizeText(question.questionNo),
    pageRangeText: normalizeText(question.pageRangeText),
    questionImage: normalizeText(question.questionImage),
    answerImage: normalizeText(question.answerImage),
    answerImages: normalizeArray(question.answerImages),
    metaUncertain: Boolean(question.meta?.uncertain),
    answerMetaUncertain:
      typeof question.answerMeta?.uncertain === "boolean" ? question.answerMeta.uncertain : null,
  };
}

export function areQuestionFingerprintsEqual(
  left: ReviewQuestionFingerprint,
  right: ReviewQuestionFingerprint,
): boolean {
  return (
    left.id === right.id &&
    left.chapter === right.chapter &&
    left.section === right.section &&
    left.questionNo === right.questionNo &&
    left.pageRangeText === right.pageRangeText &&
    left.questionImage === right.questionImage &&
    left.answerImage === right.answerImage &&
    left.metaUncertain === right.metaUncertain &&
    left.answerMetaUncertain === right.answerMetaUncertain &&
    left.answerImages.length === right.answerImages.length &&
    left.answerImages.every((value, index) => value === right.answerImages[index])
  );
}

export function getLibrarySyncPreview({
  questions,
  cards,
  reviewLogs,
  questionFingerprints,
}: SyncPreviewParams): LibrarySyncPreview {
  const questionIds = new Set(questions.map((question) => question.id));
  const newQuestionIds = questions
    .filter((question) => !cards[question.id])
    .map((question) => question.id);
  const changedQuestionIds = questions
    .filter((question) => {
      const current = questionFingerprints[question.id];
      return Boolean(
        current && !areQuestionFingerprintsEqual(current, buildQuestionFingerprint(question)),
      );
    })
    .map((question) => question.id);
  const orphanCardIds = Object.keys(cards).filter((questionId) => !questionIds.has(questionId));

  let missingQuestionImageCount = 0;
  let missingAnswerImageCount = 0;
  let uncertainQuestionCount = 0;
  let uncertainAnswerMetaCount = 0;
  let emptyChapterCount = 0;
  let emptyQuestionNoCount = 0;

  for (const question of questions) {
    if (getQuestionImagePaths(question).length === 0) {
      missingQuestionImageCount += 1;
    }
    if (getAnswerImagePaths(question).length === 0) {
      missingAnswerImageCount += 1;
    }
    if (question.meta?.uncertain) {
      uncertainQuestionCount += 1;
    }
    if (question.answerMeta?.uncertain) {
      uncertainAnswerMetaCount += 1;
    }
    if (!question.chapter.trim()) {
      emptyChapterCount += 1;
    }
    if (!question.questionNo.trim()) {
      emptyQuestionNoCount += 1;
    }
  }

  return {
    questionTotal: questions.length,
    cardTotal: Object.keys(cards).length,
    newQuestionCount: newQuestionIds.length,
    changedQuestionCount: changedQuestionIds.length,
    orphanCardCount: orphanCardIds.length,
    orphanReviewLogCount: reviewLogs.filter((log) => !questionIds.has(log.questionId)).length,
    missingQuestionImageCount,
    missingAnswerImageCount,
    uncertainQuestionCount,
    uncertainAnswerMetaCount,
    emptyChapterCount,
    emptyQuestionNoCount,
    newQuestionIds,
    changedQuestionIds,
    orphanCardIds,
  };
}

export function buildFingerprintMap(
  questions: Question[],
): Record<string, ReviewQuestionFingerprint> {
  return Object.fromEntries(
    questions.map((question) => [question.id, buildQuestionFingerprint(question)]),
  );
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeArray(value: string[] | null | undefined): string[] {
  return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)));
}
