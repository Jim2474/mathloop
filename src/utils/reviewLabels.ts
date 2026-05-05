import { State } from "ts-fsrs";
import type { ReviewRating } from "../types/review";

export const ratingLabels: Record<ReviewRating, string> = {
  Again: "完全不会",
  Hard: "很吃力",
  Good: "做出来了",
  Easy: "秒杀",
};

export function stateLabel(state: State | string | number): string {
  if (state === State.New || state === "New" || state === "new") {
    return "New";
  }
  if (state === State.Learning || state === "Learning" || state === "learning") {
    return "Learning";
  }
  if (state === State.Review || state === "Review" || state === "review") {
    return "Review";
  }
  if (state === State.Relearning || state === "Relearning" || state === "relearning") {
    return "Relearning";
  }
  return String(state);
}
