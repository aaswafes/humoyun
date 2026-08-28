// =========================================================
// Reading-plan arithmetic.
// Mirrors store.scheduleBook exactly so the live preview and the
// blocks that actually land on the calendar can never disagree.
// =========================================================

import { addDays, formatDate, weekday, yearOf, todayISO } from "@/lib/date";

export type PlanMode = "rate" | "date";

/** Sunday + Saturday, the shape store.scheduleBook expects for skipWeekdays. */
export const WEEKEND: number[] = [0, 6];

export interface PlanDraft {
  mode: PlanMode;
  startDate: string;
  pagesPerDay: number;
  endDate: string;
  skipWeekends: boolean;
}

export interface PlanResult {
  remaining: number;
  perDay: number;
  /** how many reading days the plan needs */
  sessions: number;
  /** the day the last block lands on */
  finish: string;
  valid: boolean;
  problem: string | null;
}

const isWorkingDay = (iso: string, skip: number[]) => !skip.includes(weekday(iso));

export const skipWeekdaysOf = (skipWeekends: boolean): number[] => (skipWeekends ? WEEKEND : []);

export function countWorkingDays(from: string, to: string, skip: number[]): number {
  if (to < from) return 0;
  let n = 0;
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 4000) {
    if (isWorkingDay(cur, skip)) n++;
    cur = addDays(cur, 1);
  }
  return n;
}

/** The `count`-th working day on or after `start` (1-indexed). */
export function nthWorkingDay(start: string, count: number, skip: number[]): string {
  let cur = start;
  let seen = 0;
  let guard = 0;
  while (guard++ < 4000) {
    if (isWorkingDay(cur, skip)) {
      seen++;
      if (seen >= count) return cur;
    }
    cur = addDays(cur, 1);
  }
  return cur;
}

export function computePlan(
  draft: PlanDraft,
  totalPages: number,
  currentPage: number,
): PlanResult {
  const skip = skipWeekdaysOf(draft.skipWeekends);
  const total = Math.max(1, Math.round(totalPages || 0));
  const read = Math.max(0, Math.min(Math.round(currentPage || 0), total));
  const remaining = total - read;

  const base: PlanResult = {
    remaining, perDay: 0, sessions: 0, finish: draft.startDate, valid: false, problem: null,
  };

  if (remaining <= 0) return { ...base, problem: "Every page is already read." };

  let perDay: number;
  if (draft.mode === "rate") {
    perDay = Math.round(draft.pagesPerDay || 0);
    if (perDay < 1) return { ...base, problem: "Set a pace of at least one page a day." };
  } else {
    if (draft.endDate < draft.startDate) {
      return { ...base, problem: "Pick a finish date on or after the start date." };
    }
    const days = countWorkingDays(draft.startDate, draft.endDate, skip);
    if (!days) return { ...base, problem: "That range has no reading days — try turning weekends back on." };
    perDay = Math.max(1, Math.ceil(remaining / days));
  }

  const sessions = Math.ceil(remaining / perDay);
  return {
    remaining,
    perDay,
    sessions,
    finish: nthWorkingDay(draft.startDate, sessions, skip),
    valid: true,
    problem: null,
  };
}

/** "6 Sep", or "6 Sep 2027" once it leaves this year. */
export function shortDate(iso: string): string {
  return formatDate(iso, { weekday: false, year: yearOf(iso) !== yearOf(todayISO()) });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The live sentence under the plan controls — reads forwards or backwards. */
export function planSentence(draft: PlanDraft, result: PlanResult): string {
  if (!result.valid) return result.problem ?? "";
  if (draft.mode === "rate") {
    return `${result.perDay} pages/day → ${plural(result.sessions, "day", "days")}, done by ${shortDate(result.finish)}`;
  }
  return `Done by ${shortDate(result.finish)} → ${result.perDay} pages/day over ${plural(result.sessions, "day", "days")}`;
}
