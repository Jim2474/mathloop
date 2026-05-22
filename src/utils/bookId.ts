import { useBookStore } from "../store/useBookStore";

export function getActiveBookId(): string | null {
  return useBookStore.getState().activeBookId;
}
