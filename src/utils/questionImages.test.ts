import { describe, expect, it, vi } from "vitest";
vi.mock("../services/desktopBridge", () => ({ toDesktopAssetUrl: () => null }));
vi.mock("./bookId", () => ({ getActiveBookId: () => "math2" }));
import { getQuestionPageImagePath } from "./questionImages";
import { getQuestionLocator, getQuestionImageSourceLabel } from "./questionLocation";
import type { Question } from "../types/question";
const base = {
  id: "q", questionNo: "16", pageStart: 3, pageEnd: 4,
  pageImages: ["paper-3.png", "paper-4.png", "answer-3.png", "answer-4.png"],
  questionImages: ["q1.png", "q2.png"], answerImages: ["a1.png", "a2.png"],
  pdfSource: { pdfPath: "paper.pdf", questionPageRefs: [
    { pdfPath: "paper.pdf", sourceFingerprint: "q", pdfPageNumber: 3, pageImageIndex: 0 },
    { pdfPath: "paper.pdf", sourceFingerprint: "q", pdfPageNumber: 4, pageImageIndex: 1 },
  ], answerPageRefs: [
    { pdfPath: "answer.pdf", sourceFingerprint: "a", pdfPageNumber: 3, pageImageIndex: 2 },
    { pdfPath: "answer.pdf", sourceFingerprint: "a", pdfPageNumber: 4, pageImageIndex: 3 },
  ] },
} as Question;
describe("separate paper and answer pages", () => {
  it("resolves equal page numbers in different PDFs and cross-page slices", () => {
    expect(getQuestionPageImagePath(base, 0)).toBe("paper-3.png");
    expect(getQuestionPageImagePath(base, 1)).toBe("paper-4.png");
    expect(getQuestionPageImagePath(base, 0, true)).toBe("answer-3.png");
    expect(getQuestionPageImagePath(base, 1, true)).toBe("answer-4.png");
    expect(getQuestionPageImagePath(base, 2, true)).toBe("");
  });
  it("keeps the legacy one-PDF page mapping", () => {
    const q = { ...base, pdfSource: { pdfPath: "old.pdf", pageImageNumbers: [3, 4], questionPageNumbers: [3], answerPageNumbers: [4] } } as Question;
    expect(getQuestionPageImagePath(q)).toBe("paper-3.png");
    expect(getQuestionPageImagePath(q, 0, true)).toBe("paper-4.png");
  });
  it("shows the year, real question number and marked subquestion", () => {
    const q = { ...base, exam: { year: 2010, subject: "数学二", questionNumber: 16, markedParts: ["Ⅱ"] } };
    expect(getQuestionLocator(q)).toContain("2010年数学二真题 · 第16题 · 标记小问：Ⅱ");
  });
  it("keeps booklet pages separate from PDF pages for cross-page control questions", () => {
    const q = { ...base, pageStart: 18, pageEnd: 19, printedPageNumber: "17–18",
      exam: { year: 2010, subject: "自动控制原理", questionNumber: 3, markedParts: [] },
      pdfSource: { ...base.pdfSource!, questionPageRefs: [
        { pdfPath: "control.pdf", sourceFingerprint: "q", pdfPageNumber: 18, printedPageNumber: "17", pageImageIndex: 0 },
        { pdfPath: "control.pdf", sourceFingerprint: "q", pdfPageNumber: 19, printedPageNumber: "18", pageImageIndex: 1 },
      ], answerPageRefs: [] },
    };
    expect(getQuestionLocator(q)).toContain("PDF 第18–19页 · 试卷册第17–18页");
    expect(getQuestionImageSourceLabel(q, 1)).toContain("PDF 第19页 · 试卷册第18页");
    expect(getQuestionPageImagePath(q, 1)).toBe("paper-4.png");
    expect(getQuestionPageImagePath(q, 0, true)).toBe("");
  });
});
