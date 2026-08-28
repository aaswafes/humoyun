// =========================================================
// Honest pace.
//
// The plan says what should happen. This file only looks at what did:
// logged sittings first, ticked-off reading blocks where no sitting was
// logged. Every projection here comes from that history, never from
// pages_per_day.
// =========================================================

import { addDays, diffDays, startOfWeek, todayISO } from "@/lib/date";
import type { Book, Task } from "@/lib/types";
import { isDoneReading, pagesOf, readingDay } from "./metrics";
import type { ReadingSession } from "./library-prefs";

/** How many days of history a pace is averaged over. */
export const PACE_WINDOW = 28;

export interface ReadDay {
  date: string;
  pages: number;
  minutes: number;
  /** true when the day came from an explicitly logged sitting */
  logged: boolean;
}

/**
 * One row per day this book was actually read, oldest first.
 *
 * A logged sitting supersedes the ticked blocks on the same day: the block
 * says "p.120–150 was the plan", the sitting says "I read 22 pages in 35
 * minutes". Counting both would double the day.
 */
export function readDays(
  bookId: string, tasks: Task[], sessions: ReadingSession[],
): ReadDay[] {
  const byDay = new Map<string, ReadDay>();

  for (const t of tasks) {
    if (t.book_id !== bookId || !isDoneReading(t)) continue;
    const day = readingDay(t);
    if (!day) continue;
    const row = byDay.get(day);
    if (row) row.pages += pagesOf(t);
    else byDay.set(day, { date: day, pages: pagesOf(t), minutes: 0, logged: false });
  }

  for (const s of sessions) {
    if (s.book_id !== bookId) continue;
    const row = byDay.get(s.date);
    if (row?.logged) {
      row.pages += s.pages;
      row.minutes += s.minutes;
    } else {
      // First sitting on this day replaces whatever the blocks implied.
      byDay.set(s.date, { date: s.date, pages: s.pages, minutes: s.minutes, logged: true });
    }
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Read history for every book, bucketed once.
 *
 * readDays() scans the whole task list per book, so calling it in a loop over
 * a library is quadratic. Everything that needs more than one book goes
 * through this index instead.
 */
export function readDaysIndex(tasks: Task[], sessions: ReadingSession[]): Map<string, ReadDay[]> {
  const tasksBy = new Map<string, Task[]>();
  const sessionsBy = new Map<string, ReadingSession[]>();

  for (const t of tasks) if (t.book_id && isDoneReading(t)) push(tasksBy, t.book_id, t);
  for (const s of sessions) push(sessionsBy, s.book_id, s);

  const out = new Map<string, ReadDay[]>();
  for (const id of new Set([...tasksBy.keys(), ...sessionsBy.keys()])) {
    out.set(id, readDays(id, tasksBy.get(id) ?? [], sessionsBy.get(id) ?? []));
  }
  return out;
}

/** Every day any book was read, pages and minutes pooled across books. */
export function mergeReadDays(index: Map<string, ReadDay[]>): ReadDay[] {
  const byDate = new Map<string, ReadDay>();
  for (const days of index.values()) {
    for (const d of days) {
      const row = byDate.get(d.date);
      if (row) {
        row.pages += d.pages;
        row.minutes += d.minutes;
        row.logged = row.logged || d.logged;
      } else {
        byDate.set(d.date, { ...d });
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Days in a row ending today — or yesterday, while today is still open. */
export function streaks(days: ReadDay[], upTo = todayISO()): { current: number; best: number } {
  const set = new Set(days.map((d) => d.date));
  if (!set.size) return { current: 0, best: 0 };

  let cursor = set.has(upTo) ? upTo : addDays(upTo, -1);
  let current = 0;
  while (set.has(cursor) && current < 3650) { current++; cursor = addDays(cursor, -1); }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d.date ? run + 1 : 1;
    if (run > best) best = run;
    prev = d.date;
  }
  return { current, best };
}

export interface WeekBucket {
  start: string;
  end: string;
  pages: number;
  minutes: number;
}

/** `weeks` buckets ending with the week containing today, oldest first. */
export function weeklyBuckets(days: ReadDay[], weeks: number, weekStart: number): WeekBucket[] {
  const thisWeek = startOfWeek(todayISO(), weekStart);
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, (i - (weeks - 1)) * 7);
    return { start, end: addDays(start, 6), pages: 0, minutes: 0 };
  });
  const index = new Map(buckets.map((b) => [b.start, b]));

  for (const d of days) {
    const bucket = index.get(startOfWeek(d.date, weekStart));
    if (!bucket) continue;
    bucket.pages += d.pages;
    bucket.minutes += d.minutes;
  }
  return buckets;
}

/** Pages and minutes inside a 'yyyy-MM' month. */
export function monthTotals(days: ReadDay[], month: string): { pages: number; minutes: number; activeDays: number } {
  let pages = 0;
  let minutes = 0;
  let activeDays = 0;
  for (const d of days) {
    if (d.date.slice(0, 7) !== month) continue;
    pages += d.pages;
    minutes += d.minutes;
    activeDays++;
  }
  return { pages, minutes, activeDays };
}

export interface PaceStats {
  /** days with any reading at all */
  activeDays: number;
  pages: number;
  minutes: number;
  /** first..today inclusive, the denominator behind the honest rate */
  spanDays: number;
  /** pages per calendar day across the window — the number projections use */
  perDay: number;
  /** pages on the days actually read */
  perActiveDay: number;
  /** minutes a page, when any sitting carried a duration */
  minutesPerPage: number | null;
  lastRead: string | null;
  /** share of days in the window that saw any reading, 0..1 */
  consistency: number;
}

export const EMPTY_PACE: PaceStats = {
  activeDays: 0, pages: 0, minutes: 0, spanDays: 0, perDay: 0,
  perActiveDay: 0, minutesPerPage: null, lastRead: null, consistency: 0,
};

/**
 * Averages over the last `window` days, or over the whole history if it is
 * shorter — a book started three days ago should not be judged against 28.
 */
export function paceStats(days: ReadDay[], window = PACE_WINDOW, today = todayISO()): PaceStats {
  if (!days.length) return EMPTY_PACE;

  const first = days[0].date;
  const from = diffDays(today, first) + 1 > window ? addDays(today, -(window - 1)) : first;
  const recent = days.filter((d) => d.date >= from && d.date <= today);
  if (!recent.length) {
    return { ...EMPTY_PACE, lastRead: days[days.length - 1].date };
  }

  const pages = recent.reduce((s, d) => s + d.pages, 0);
  const minutes = recent.reduce((s, d) => s + d.minutes, 0);
  const spanDays = Math.max(1, diffDays(today, from) + 1);

  return {
    activeDays: recent.length,
    pages,
    minutes,
    spanDays,
    perDay: pages / spanDays,
    perActiveDay: pages / recent.length,
    minutesPerPage: minutes > 0 && pages > 0 ? minutes / pages : null,
    lastRead: days[days.length - 1].date,
    consistency: recent.length / spanDays,
  };
}

export interface Projection {
  /** pages still to read */
  remaining: number;
  /** the rate the projection used */
  perDay: number;
  /** null when there is no history to project from */
  finish: string | null;
  /** days between the projection and the planned end date; + = early */
  vsPlan: number | null;
  /** how many days the plan itself still has to run */
  planDaysLeft: number | null;
}

/** What the last few weeks say about when this book actually ends. */
export function projectFinish(
  book: Book, pace: PaceStats, today = todayISO(),
): Projection {
  const total = Math.max(1, book.total_pages);
  const remaining = Math.max(0, total - Math.min(book.current_page, total));
  const planEnd = book.end_date && book.end_date >= today ? book.end_date : null;
  const planDaysLeft = planEnd ? diffDays(planEnd, today) : null;

  if (!remaining) {
    return { remaining: 0, perDay: pace.perDay, finish: today, vsPlan: planDaysLeft, planDaysLeft };
  }
  if (pace.perDay <= 0) {
    return { remaining, perDay: 0, finish: null, vsPlan: null, planDaysLeft };
  }

  const finish = addDays(today, Math.max(1, Math.ceil(remaining / pace.perDay)));
  return {
    remaining,
    perDay: pace.perDay,
    finish,
    vsPlan: planEnd ? diffDays(planEnd, finish) : null,
    planDaysLeft,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "14 pages a day" / "0.6 pages a day" — never a bare "0.5833". */
export function ratePhrase(perDay: number): string {
  if (perDay <= 0) return "no pace yet";
  const n = perDay >= 10 ? Math.round(perDay) : round1(perDay);
  return `${n} ${n === 1 ? "page" : "pages"} a day`;
}

export function daysPhrase(days: number): string {
  const n = Math.abs(days);
  return `${n} ${n === 1 ? "day" : "days"}`;
}

// ---------------------------------------------------------
// Yearly goal
// ---------------------------------------------------------
export interface GoalPace {
  goal: number;
  finished: number;
  /** books the year should have delivered by today */
  expected: number;
  pct: number;
  /** + = ahead of pace, - = behind */
  daysAhead: number;
  onTrack: boolean;
  /** books left to hit the goal */
  remaining: number;
  daysLeftInYear: number;
}

export function goalPace(goal: number, finished: number, today = todayISO()): GoalPace {
  const year = today.slice(0, 4);
  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;
  const daysInYear = diffDays(dec31, jan1) + 1;
  const dayOfYear = diffDays(today, jan1) + 1;

  if (goal <= 0) {
    return {
      goal: 0, finished, expected: 0, pct: 0, daysAhead: 0,
      onTrack: true, remaining: 0, daysLeftInYear: daysInYear - dayOfYear,
    };
  }

  const perDay = goal / daysInYear;
  const expected = perDay * dayOfYear;

  return {
    goal,
    finished,
    expected,
    pct: Math.min(100, Math.round((finished / goal) * 100)),
    // A book's worth of lead, expressed in days — "3 days ahead" beats "0.1 books ahead".
    daysAhead: Math.round((finished - expected) / perDay),
    onTrack: finished >= Math.floor(expected),
    remaining: Math.max(0, goal - finished),
    daysLeftInYear: diffDays(dec31, today),
  };
}
