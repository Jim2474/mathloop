import { expect, it, vi } from "vitest";
vi.mock("./desktopBridge", () => ({ toDesktopAssetUrl: () => null }));
vi.mock("../utils/bookId", () => ({ getActiveBookId: () => "control" }));
import { getLibrarySyncPreview } from "./librarySyncService";
import type { Question } from "../types/question";

it("counts broken expected answers while allowing intentionally answerless papers", () => {
  const base = { id: "q", chapter: "2010", questionNo: "3", questionImage: "q.png", questionImages: ["q.png"], answerImage: null, answerImages: [] } as unknown as Question;
  const result = getLibrarySyncPreview({ questions: [
    { ...base, id: "without-answer", answerMeta: { hasAnswer: false } },
    { ...base, id: "expected-answer", answerMeta: { hasAnswer: true } },
    { ...base, id: "legacy" },
  ], cards: {}, reviewLogs: [], questionFingerprints: {} });
  expect(result.missingAnswerImageCount).toBe(2);
  expect(result.missingQuestionImageCount).toBe(0);
});
