import type { Question } from "../types/question";

type LookupParams = {
  questions: Question[];
  pageInput: string;
  questionNoInput: string;
};

export function findQuestionsByPageAndNumber({
  questions,
  pageInput,
  questionNoInput,
}: LookupParams): Question[] {
  const page = pageInput.trim();
  const questionNo = questionNoInput.trim();

  if (!page || !questionNo) {
    return [];
  }

  const printedPageMatches = questions.filter(
    (question) => matchesPrintedPage(question, page) && matchesQuestionNo(question, questionNo),
  );

  if (printedPageMatches.length > 0) {
    return printedPageMatches;
  }

  return questions.filter(
    (question) => matchesAnyPage(question, page) && matchesQuestionNo(question, questionNo),
  );
}

export function getQuestionLookupLabel(question: Question): string {
  return `${question.pageRangeText || `源页 ${question.pageStart}`} / ${question.section} / ${question.questionNo}`;
}

function matchesPrintedPage(question: Question, input: string): boolean {
  const numeric = Number(input);

  if (Number.isFinite(numeric)) {
    return extractNumber(question.printedPageNumber) === Math.trunc(numeric);
  }

  const normalizedInput = normalizeLoose(input);
  const printedValues = [question.printedPageNumber, question.pageRangeText].map((value) =>
    normalizeLoose(value),
  );
  return printedValues.some((value) => value === normalizedInput || value.includes(normalizedInput));
}

function matchesAnyPage(question: Question, input: string): boolean {
  const numeric = Number(input);

  if (Number.isFinite(numeric)) {
    const pageNumber = Math.trunc(numeric);
    if (pageNumber >= question.pageStart && pageNumber <= question.pageEnd) {
      return true;
    }
    return (
      extractNumber(question.pdfPageLabel) === pageNumber ||
      extractNumber(question.printedPageNumber) === pageNumber
    );
  }

  const pageTextValues = [
    question.pdfPageLabel,
    question.printedPageNumber,
    question.pageRangeText,
    String(question.pageStart),
    String(question.pageEnd),
  ].map((value) => normalizeLoose(value));
  const normalizedInput = normalizeLoose(input);
  return pageTextValues.some((value) => value === normalizedInput || value.includes(normalizedInput));
}

function matchesQuestionNo(question: Question, input: string): boolean {
  // When input contains a hyphen (e.g. "2-22"), match the full questionNo directly
  if (input.includes("-")) {
    return normalizeLoose(question.questionNo) === normalizeLoose(input);
  }

  const inputNumber = extractNumber(input);
  const questionNumber = extractNumber(question.questionNo);
  const idQuestionNumber = extractIdQuestionNumber(question.id);

  if (inputNumber !== null) {
    return questionNumber === inputNumber || idQuestionNumber === inputNumber;
  }

  return normalizeLoose(question.questionNo) === normalizeLoose(input);
}

function extractIdQuestionNumber(id: string): number | null {
  const match = id.match(/_q(\d+)/i);
  return match ? Number(match[1]) : null;
}

function extractNumber(value: string): number | null {
  const match = value.match(/\d+/);
  if (!match) {
    return null;
  }
  return Number(match[0]);
}

function normalizeLoose(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/^0+(\d)/, "$1");
}
