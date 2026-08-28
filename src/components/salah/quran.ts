import { addDays, diffDays, weekday } from "@/lib/date";
import type { Task } from "@/lib/types";

/** A khatm is the whole mushaf — 604 pages in the standard Madinah print. */
export const KHATM_PAGES = 604;

export const QURAN_TAG = "quran";

export const JUZ_COUNT = 30;

export function isQuranReading(task: Task): boolean {
  return task.kind === "reading" && task.tags.includes(QURAN_TAG);
}

export function pagesOf(task: Task): number {
  if (task.page_from == null || task.page_to == null) return 0;
  return Math.max(0, task.page_to - task.page_from + 1);
}

// ---------------------------------------------------------
// Juz
// ---------------------------------------------------------
/**
 * In the Madinah mushaf the first juz runs to page 21, the next
 * twenty-eight take twenty pages each, and the last one carries the rest.
 */
export function juzStart(n: number): number {
  const juz = Math.max(1, Math.min(JUZ_COUNT, Math.round(n)));
  return juz <= 1 ? 1 : 22 + (juz - 2) * 20;
}

export function juzEnd(n: number): number {
  const juz = Math.max(1, Math.min(JUZ_COUNT, Math.round(n)));
  return juz >= JUZ_COUNT ? KHATM_PAGES : juzStart(juz + 1) - 1;
}

export function juzPages(n: number): number {
  return juzEnd(n) - juzStart(n) + 1;
}

export function juzOfPage(page: number): number {
  const p = Math.max(1, Math.min(KHATM_PAGES, Math.round(page)));
  if (p <= 21) return 1;
  return Math.min(JUZ_COUNT, Math.floor((p - 22) / 20) + 2);
}

export interface JuzProgress {
  juz: number;
  /** 0..1 of this juz covered. */
  fill: number;
  pagesDone: number;
  pages: number;
  from: number;
  to: number;
  state: "done" | "current" | "todo";
}

/** Thirty cells, filled by however many pages of the current khatm are behind you. */
export function juzBreakdown(pagesRead: number): JuzProgress[] {
  const read = Math.max(0, Math.min(KHATM_PAGES, pagesRead));
  return Array.from({ length: JUZ_COUNT }, (_, i) => {
    const juz = i + 1;
    const from = juzStart(juz);
    const to = juzEnd(juz);
    const pages = to - from + 1;
    const pagesDone = Math.max(0, Math.min(pages, read - (from - 1)));
    return {
      juz, from, to, pages, pagesDone,
      fill: pagesDone / pages,
      state: pagesDone >= pages ? "done" : pagesDone > 0 ? "current" : "todo",
    };
  });
}

// ---------------------------------------------------------
// Plans
// ---------------------------------------------------------
export type PlanMode = "days" | "juz" | "pages";

export interface PlanInput {
  mode: PlanMode;
  /** mode "days" — finish the whole span in this many reading days. */
  days: number;
  /** mode "juz" — 0.5, 1, 2 or 3 juz a day, cut on juz boundaries. */
  juzPerDay: number;
  /** mode "pages" — a flat page count a day. */
  pagesPerDay: number;
  startDate: string;
  /** First page of the plan, 1-based. */
  startPage: number;
  /** Last page of the plan. */
  endPage: number;
  /** Weekday indices to leave empty, 0 = Sunday. */
  skipWeekdays: number[];
}

export interface PlanEntry {
  date: string;
  from: number;
  to: number;
}

/** Page numbers a day is allowed to end on, in ascending order. */
function juzCuts(step: number): number[] {
  const cuts: number[] = [];
  for (let n = 1; n <= JUZ_COUNT; n++) {
    if (step < 1) cuts.push(juzStart(n) + Math.ceil(juzPages(n) / 2) - 1);
    cuts.push(juzEnd(n));
  }
  if (step <= 1) return cuts;
  const whole = cuts.filter((_, i) => (i + 1) % Math.round(step) === 0);
  return whole.length && whole[whole.length - 1] === KHATM_PAGES ? whole : [...whole, KHATM_PAGES];
}

/** Average pages a day the input asks for — the number shown in the preview. */
export function planRate(input: PlanInput): number {
  const span = Math.max(1, input.endPage - input.startPage + 1);
  if (input.mode === "pages") return Math.max(1, Math.round(input.pagesPerDay));
  if (input.mode === "juz") return Math.max(1, Math.round(input.juzPerDay * (KHATM_PAGES / JUZ_COUNT)));
  return Math.max(1, Math.ceil(span / Math.max(1, input.days)));
}

/** One reading a day, page ranges continuous, skipped weekdays left alone. */
export function buildPlan(input: PlanInput): PlanEntry[] {
  const startPage = Math.max(1, Math.min(KHATM_PAGES, Math.round(input.startPage)));
  const endPage = Math.max(startPage, Math.min(KHATM_PAGES, Math.round(input.endPage)));
  const skip = input.skipWeekdays.length < 7 ? input.skipWeekdays : [];

  const stops: number[] = [];
  if (input.mode === "juz") {
    juzCuts(input.juzPerDay).forEach((cut) => { if (cut >= startPage && cut <= endPage) stops.push(cut); });
    if (!stops.length || stops[stops.length - 1] < endPage) stops.push(endPage);
  } else {
    const perDay = planRate(input);
    for (let page = startPage - 1 + perDay; page < endPage; page += perDay) stops.push(page);
    stops.push(endPage);
  }

  const entries: PlanEntry[] = [];
  let cursor = input.startDate;
  let from = startPage;
  let guard = 0;

  for (const stop of stops) {
    while (skip.includes(weekday(cursor)) && guard++ < 4000) cursor = addDays(cursor, 1);
    entries.push({ date: cursor, from, to: stop });
    from = stop + 1;
    cursor = addDays(cursor, 1);
    if (guard++ > 4000) break;
  }
  return entries;
}

// ---------------------------------------------------------
// Falling behind
// ---------------------------------------------------------
export interface CatchUp {
  /** Reading days already past and still open. */
  behindDays: number;
  behindPages: number;
  remainingPages: number;
  /** The last day the plan currently reaches. */
  endDate: string;
  daysLeft: number;
  /** Pages a day needed to still land on `endDate`. */
  neededPerDay: number;
  /** Pages a day the plan was drawn at. */
  plannedPerDay: number;
  /** First page still owed. */
  nextPage: number;
  lastPage: number;
}

/**
 * Reads the state of the scheduled readings rather than a stored plan, so it
 * stays true even after a day is edited by hand on the calendar.
 */
export function quranCatchUp(tasks: Task[], today: string): CatchUp | null {
  const scheduled = tasks.filter((t) => isQuranReading(t) && !!t.date);
  const pending = scheduled.filter((t) => t.status !== "done");
  if (!pending.length) return null;

  const dates = pending.map((t) => t.date as string).sort();
  // A plan whose last day is already behind us has to land today, not in the past.
  const endDate = dates[dates.length - 1] < today ? today : dates[dates.length - 1];
  const overdue = pending.filter((t) => (t.date as string) < today);
  const remainingPages = pending.reduce((sum, t) => sum + pagesOf(t), 0);
  const behindPages = overdue.reduce((sum, t) => sum + pagesOf(t), 0);
  const daysLeft = Math.max(1, diffDays(endDate, today) + 1);

  const sizes = scheduled.map(pagesOf).filter((n) => n > 0).sort((a, b) => a - b);
  const plannedPerDay = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;

  const pages = pending.map((t) => t.page_from ?? 0).filter((n) => n > 0);
  const ends = pending.map((t) => t.page_to ?? 0).filter((n) => n > 0);

  return {
    behindDays: new Set(overdue.map((t) => t.date)).size,
    behindPages,
    remainingPages,
    endDate,
    daysLeft,
    neededPerDay: Math.max(1, Math.ceil(remainingPages / daysLeft)),
    plannedPerDay,
    nextPage: pages.length ? Math.min(...pages) : 1,
    lastPage: ends.length ? Math.max(...ends) : KHATM_PAGES,
  };
}
