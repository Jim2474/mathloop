import type { Question, QuestionType } from "../types/question";

export function inferQuestionType(question: Question): QuestionType {
  return inferFromText(question.section) ?? inferFromText(question.questionNo) ?? "未分类";
}

function inferFromText(text: string): QuestionType | null {
  if (text.includes("选择")) {
    return "选择题";
  }
  if (text.includes("填空")) {
    return "填空题";
  }
  if (text.includes("解答") || text.includes("计算") || text.includes("证明")) {
    return "解答题";
  }
  return null;
}

export function getDashboardStats(questions: Question[]) {
  const chapterCounts = new Map<string, number>();
  const typeCounts: Record<QuestionType, number> = {
    选择题: 0,
    填空题: 0,
    解答题: 0,
    未分类: 0,
  };

  for (const question of questions) {
    const chapter = question.chapter || "未标注章节";
    chapterCounts.set(chapter, (chapterCounts.get(chapter) ?? 0) + 1);
    typeCounts[inferQuestionType(question)] += 1;
  }

  return {
    total: questions.length,
    chapterTotal: chapterCounts.size,
    uncertainTotal: questions.filter((question) => question.meta.uncertain).length,
    chapterCounts: Array.from(chapterCounts.entries()).map(([chapter, count]) => ({
      chapter,
      count,
    })),
    typeCounts,
  };
}

export function getUniqueValues(questions: Question[], key: "chapter" | "section") {
  return Array.from(new Set(questions.map((question) => question[key]).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right, "zh-CN"),
  );
}
