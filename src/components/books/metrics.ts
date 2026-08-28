// =========================================================
// What a ticked reading block is worth.
//
// Day-level aggregation lives in pace.ts, which folds these blocks together
// with logged sittings. This file only knows about blocks.
// =========================================================

import { toISO, todayISO, yearOf } from "@/lib/date";
import type { Book, Task } from "@/lib/types";

export const pagesOf = (t: Task): number =>
  t.page_from != null && t.page_to != null ? Math.max(0, t.page_to - t.page_from + 1) : 0;

export const isDoneReading = (t: Task): boolean =>
  t.kind === "reading" && t.status === "done" && !!t.book_id;

/** The day a block counts for: the day it was planned, falling back to the tick. */
export function readingDay(t: Task): string | null {
  if (t.date) return t.date;
  if (t.completed_at) return toISO(new Date(t.completed_at));
  return null;
}

/**
 * Books table carries no finished_at, so the last completed reading block dates
 * the finish; a book read outside the scheduler falls back to updated_at.
 */
export function finishedOn(book: Book, tasks: Task[]): string {
  let last: string | null = null;
  for (const t of tasks) {
    if (t.book_id !== book.id || !isDoneReading(t)) continue;
    const day = readingDay(t);
    if (day && (!last || day > last)) last = day;
  }
  return last ?? toISO(new Date(book.updated_at));
}

export function finishedInYear(books: Book[], tasks: Task[], year = yearOf(todayISO())): Book[] {
  return books.filter((b) => b.status === "finished" && yearOf(finishedOn(b, tasks)) === year);
}
