// =========================================================
// Everything the stats strip and the pace chart count.
// A "reading day" is a day with at least one completed reading block.
// =========================================================

import { addDays, startOfWeek, toISO, todayISO, yearOf } from "@/lib/date";
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

export function doneReadingBlocks(tasks: Task[]): Task[] {
  return tasks.filter(isDoneReading);
}

export interface WeekBucket {
  start: string;
  end: string;
  pages: number;
}

/** `weeks` buckets ending with the week containing today, oldest first. */
export function weeklyPages(tasks: Task[], weeks: number, weekStart: number): WeekBucket[] {
  const thisWeek = startOfWeek(todayISO(), weekStart);
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, (i - (weeks - 1)) * 7);
    return { start, end: addDays(start, 6), pages: 0 };
  });
  const first = buckets[0].start;

  for (const t of tasks) {
    if (!isDoneReading(t)) continue;
    const day = readingDay(t);
    if (!day || day < first) continue;
    const bucketStart = startOfWeek(day, weekStart);
    const bucket = buckets.find((b) => b.start === bucketStart);
    if (bucket) bucket.pages += pagesOf(t);
  }
  return buckets;
}

/** Pages finished inside a 'yyyy-MM' month. */
export function pagesInMonth(tasks: Task[], month: string): number {
  return tasks.reduce((sum, t) => {
    if (!isDoneReading(t)) return sum;
    const day = readingDay(t);
    return day?.slice(0, 7) === month ? sum + pagesOf(t) : sum;
  }, 0);
}

/** Consecutive days ending today (or yesterday, while today is still open). */
export function readingStreak(tasks: Task[], upTo = todayISO()): number {
  const days = new Set<string>();
  for (const t of tasks) {
    if (!isDoneReading(t)) continue;
    const day = readingDay(t);
    if (day) days.add(day);
  }
  let cursor = upTo;
  if (!days.has(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (days.has(cursor) && streak < 3650) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
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
