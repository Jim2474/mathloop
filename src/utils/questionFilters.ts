import type { Question, UncertainFilter } from "../types/question";

type FilterParams = {
  questions: Question[];
  selectedChapter: string;
  selectedSection: string;
  uncertainFilter: UncertainFilter;
  searchTerm: string;
};

export function filterQuestions({
  questions,
  selectedChapter,
  selectedSection,
  uncertainFilter,
  searchTerm,
}: FilterParams): Question[] {
  const query = searchTerm.trim().toLowerCase();

  return questions.filter((question) => {
    if (selectedChapter !== "all" && question.chapter !== selectedChapter) {
      return false;
    }

    if (selectedSection !== "all" && question.section !== selectedSection) {
      return false;
    }

    if (uncertainFilter === "uncertain" && !question.meta.uncertain) {
      return false;
    }

    if (uncertainFilter === "confirmed" && question.meta.uncertain) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [question.id, question.questionNo, question.pageRangeText].some((value) =>
      value.toLowerCase().includes(query),
    );
  });
}
