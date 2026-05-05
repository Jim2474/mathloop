import type { Question } from "../types/question";

const QUESTIONS_URL = "/data/questions.json";

export async function loadOpenClawQuestions(): Promise<Question[]> {
  const response = await fetch(QUESTIONS_URL, { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`读取 ${QUESTIONS_URL} 失败：${response.status} ${response.statusText}`);
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("questions.json 顶层必须是题目数组。");
  }

  return data as Question[];
}
