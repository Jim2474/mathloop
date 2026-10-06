export type Question = {
  pdfSource?: {
    pdfPath: string;
    pdfPageIndex: number;
    pdfPageNumber?: number;
    pdfPageLabel?: string;
    sourceFingerprint?: string;
    sourceKey?: string;
    profileId?: string;
    batchId?: string;
    targetIndex?: number;
    targetLabel?: string;
    questionBoundingBox?: { x0: number; y0: number; x1: number; y1: number };
    cropBoundingBox?: { x0: number; y0: number; x1: number; y1: number };
    importedAt?: string;
    importVersion?: number;
    fullImage?: string;
    pageImageNumbers?: number[];
    questionPageNumbers?: number[];
    answerPageNumbers?: number[];
  };
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
  tips?: string;
  questionImage: string;
  questionImages: string[];
  pageImages?: string[];
  answerImage?: string | null;
  answerImages?: string[] | null;
  answerMeta?: {
    source?: string;
    answerPageStart?: number;
    answerPageEnd?: number;
    printedPageNumber?: string;
    uncertain?: boolean;
    note?: string;
  };
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
