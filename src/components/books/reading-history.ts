import type { Book, DayLog, Task } from "@/lib/types";
import type { ReadingSession } from "./library-prefs";
import { finishedOn, isDoneReading, pagesOf } from "./metrics";
import { mergeReadDays, readDaysIndex, type ReadDay } from "./pace";

// =========================================================
// What was read, and when — for a window of days.
//
// The Books page has known how to answer this for a while: `pace.ts` folds
// logged sittings together with ticked reading blocks and refuses to count a
// day twice, and `finishedOn` dates a finish even for a book that was never
// scheduled. Review and Stats simply never asked it. They counted pages from
// ticked blocks alone, so reading a book off-plan — or finishing one by
// dragging the bookmark — produced a week that honestly reported nought.
//
// This file is the window layer over that model, and nothing more. It adds
// only the two things the shelf never needed: the Quran, which is tracked on
// the day log rather than as a `books` row, and settlement, below.
// =========================================================

/** Book pages only. The Quran is counted apart — it is not one of the rows. */
export interface ReadingDay {
  date: string;
  pages: number;
  minutes: number;
  quranPages: number;
}

export interface BookReading {
  book: Book;
  pages: number;
  minutes: number;
  /** Where the bookmark stands now, as a percentage of the whole book. */
  progress: number;
  /** Set when this book was finished inside the window. */
  finishedOn: string | null;
  /** Pages this book contributed that no dated record accounted for. */
  settled: number;
}

export interface ReadingHistory {
  /** One row per day in the window, in order, zeroes included. */
  days: ReadingDay[];
  /** Books read or finished in the window, heaviest first. */
  books: BookReading[];
  pages: number;
  minutes: number;
  quranPages: number;
  booksFinished: number;
  /** Days that saw a page of anything — the honest denominator for a daily rate. */
  daysRead: number;
  /**
   * How much of `pages` came from settlement rather than from a dated record.
   * Every surface that shows the total has to be able to say this out loud.
   */
  settledPages: number;
}

export const EMPTY_HISTORY: ReadingHistory = {
  days: [], books: [], pages: 0, minutes: 0, quranPages: 0,
  booksFinished: 0, daysRead: 0, settledPages: 0,
};

export interface ReadingSource {
  sessions: ReadingSession[];
  tasks: Task[];
  books: Book[];
  dayLogs: DayLog[];
}

export const QURAN_TAG = "quran";

const isQuranTask = (t: Task) =>
  t.kind === "reading" && t.status === "done" && !!t.date && t.tags.includes(QURAN_TAG);

/**
 * Quran pages for a day.
 *
 * Ticking a planned Quran reading adds its pages to `quran_pages` *and* closes
 * the task, so the two sources are two records of one act and the day takes the
 * larger of them. Reading off-plan only ever moves the counter; ticking a block
 * on the calendar only ever closes the task. Summing them would double every
 * day the planner was used, which is most of them.
 */
function quranByDay(src: ReadingSource): Map<string, number> {
  const out = new Map<string, number>();
  for (const log of src.dayLogs) {
    if (log.quran_pages > 0) out.set(log.date, log.quran_pages);
  }

  const planned = new Map<string, number>();
  for (const t of src.tasks) {
    if (!isQuranTask(t)) continue;
    const date = t.date as string;
    planned.set(date, (planned.get(date) ?? 0) + pagesOf(t));
  }
  for (const [date, pages] of planned) {
    out.set(date, Math.max(out.get(date) ?? 0, pages));
  }
  return out;
}

/**
 * A book finished before any of this was recorded has a full bookmark and no
 * dated history at all — its pages were read on days nothing was written down.
 *
 * Dropping them reports nought for a week in which two books were finished,
 * which is the bug this exists to fix. Spreading them over invented days would
 * be worse. So they are carried on the one date that is a real fact — the day
 * the book was finished — and counted separately as `settled`, so every
 * surface that prints the total can say plainly how much of it is settlement.
 *
 * A book read through logged sittings settles to nothing: its pages are already
 * accounted for, and are never counted twice.
 */
function settlementFor(book: Book, days: ReadDay[]): number {
  if (book.status !== "finished" || book.total_pages <= 0) return 0;
  const recorded = days.reduce((sum, d) => sum + d.pages, 0);
  return Math.max(0, book.total_pages - recorded);
}

/**
 * `days` is the window being reported on. History outside it still takes part —
 * it is what decides how much of a finished book is already accounted for — but
 * only what falls inside the window is counted.
 */
export function buildReadingHistory(days: string[], src: ReadingSource): ReadingHistory {
  if (!days.length) return EMPTY_HISTORY;

  const index = readDaysIndex(src.tasks, src.sessions);
  const quran = quranByDay(src);
  const inRange = new Set(days);

  const byDate = new Map<string, ReadingDay>(
    days.map((date) => [date, { date, pages: 0, minutes: 0, quranPages: quran.get(date) ?? 0 }]),
  );
  const books: BookReading[] = [];

  for (const book of src.books) {
    const history = index.get(book.id) ?? [];
    const finished = book.status === "finished" ? finishedOn(book, src.tasks) : null;
    const settled = settlementFor(book, history);
    const settledHere = finished && inRange.has(finished) ? settled : 0;

    let pages = settledHere;
    let minutes = 0;
    for (const d of history) {
      if (!inRange.has(d.date)) continue;
      pages += d.pages;
      minutes += d.minutes;
      const row = byDate.get(d.date);
      if (row) { row.pages += d.pages; row.minutes += d.minutes; }
    }

    if (settledHere > 0) {
      const row = byDate.get(finished as string);
      if (row) row.pages += settledHere;
    }

    const finishedInWindow = finished && inRange.has(finished) ? finished : null;
    if (pages > 0 || minutes > 0 || finishedInWindow) {
      books.push({
        book,
        pages,
        minutes,
        progress: book.total_pages > 0
          ? Math.min(100, Math.round((book.current_page / book.total_pages) * 100))
          : 0,
        finishedOn: finishedInWindow,
        settled: settledHere,
      });
    }
  }

  const rows = days.map((d) => byDate.get(d) as ReadingDay);
  books.sort((a, b) => b.pages - a.pages || b.minutes - a.minutes || a.book.title.localeCompare(b.book.title));

  return {
    days: rows,
    books,
    pages: rows.reduce((s, d) => s + d.pages, 0),
    minutes: rows.reduce((s, d) => s + d.minutes, 0),
    quranPages: rows.reduce((s, d) => s + d.quranPages, 0),
    booksFinished: books.filter((b) => b.finishedOn).length,
    daysRead: rows.filter((d) => d.pages > 0 || d.quranPages > 0).length,
    settledPages: books.reduce((s, b) => s + b.settled, 0),
  };
}

/** Every dated reading day across the whole library — for trends and streaks. */
export function allReadDays(src: ReadingSource): ReadDay[] {
  return mergeReadDays(readDaysIndex(src.tasks, src.sessions));
}

/** Re-exported so callers need one import, not three. */
export { isDoneReading, pagesOf };
