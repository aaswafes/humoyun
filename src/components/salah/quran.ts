import type { Task } from "@/lib/types";

/** A khatm is the whole mushaf — 604 pages in the standard Madinah print. */
export const KHATM_PAGES = 604;

export const QURAN_TAG = "quran";

export function isQuranReading(task: Task): boolean {
  return task.kind === "reading" && task.tags.includes(QURAN_TAG);
}

export function pagesOf(task: Task): number {
  if (task.page_from == null || task.page_to == null) return 0;
  return Math.max(0, task.page_to - task.page_from + 1);
}
