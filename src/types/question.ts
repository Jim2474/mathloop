export type Question = {
  id: string;
  bookName: string;
  chapter: string;
  section: string;
  questionNo: string;
  pageStart: number;
  pageEnd: number;
  pdfPageLabel: string;
  printedPageNumber: string;
  pageRangeText: string;
  questionText: string;
  questionImage: string;
  questionImages: string[];
  answerImage: string;
  answerImages: string[];
  knowledgeTags: string[];
  mistakeTags: string[];
  difficulty: number;
  valueStar: number;
  status: string;
  fsrs: {
    state: string;
    difficulty: number | null;
    stability: number | null;
    retrievability: number | null;
    lastReview: string | null;
    nextReview: string | null;
    reviewCount: number;
    lapseCount: number;
  };
  review: {
    mastery: number;
    lastResult: string | null;
    history: unknown[];
  };
  meta: {
    source: string;
    uncertain: boolean;
    note: string;
  };
};

export type QuestionType = "选择题" | "填空题" | "解答题" | "未分类";

export type UncertainFilter = "all" | "uncertain" | "confirmed";
