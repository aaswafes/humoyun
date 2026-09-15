"use client";

import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import { addSession } from "./library-prefs";

// =========================================================
// Moving the bookmark is the moment the reading happened, and it was the
// moment the date was thrown away: `logReading` writes a cumulative
// `current_page` and nothing else, so a week of reading left no record a week
// could be measured against.
//
// Every bookmark move goes through here instead. The sitting is recorded with
// the day it happened, which is all the review and the stats page ever needed.
// =========================================================

/**
 * Advance a book's bookmark and record the sitting that moved it.
 *
 * `SessionLog` writes its own row — it knows the day and the minutes, which
 * this cannot — and so keeps calling `logReading` directly. Everywhere else
 * calls this.
 */
export function recordReading(
  bookId: string,
  page: number,
  opts: { date?: string; minutes?: number } = {},
): void {
  const { books, logReading } = useStore.getState();
  const book = books.find((b) => b.id === bookId);
  if (!book) return;

  const total = Math.max(0, book.total_pages);
  const target = total > 0 ? Math.min(page, total) : page;
  const pages = target - book.current_page;

  // Only forward motion is reading. Correcting the bookmark back down is an
  // edit, not a sitting, and inventing a negative one would corrupt the week.
  if (pages > 0) {
    addSession({
      bookId,
      date: opts.date ?? todayISO(),
      pages,
      minutes: Math.max(0, Math.round(opts.minutes ?? 0)),
      endPage: target,
    });
  }

  logReading(bookId, page);
}
