// =========================================================
// Watch-plan arithmetic.
//
// Mirrors store.scheduleMedia exactly, so the live preview in the sheet and the
// blocks that actually land on the calendar can never disagree. The books
// surface has the same file for pages; this one cannot import it because every
// signature there is typed for a Book.
//
// The one difference that matters: a film is a one-episode title. Anything with
// total_episodes <= 1 collapses to a single block on a single day, and no pace
// is ever computed, quoted or stored for it.
// =========================================================

import { addDays, formatDate, todayISO, weekday, yearOf } from "@/lib/date";
import type { Task } from "@/lib/types";

export type WatchPlanMode = "perDay" | "finishBy";

/** Sunday + Saturday, the shape store.scheduleMedia expects for skipWeekdays. */
export const WEEKEND: number[] = [0, 6];

export interface WatchPlanDraft {
  mode: WatchPlanMode;
  startDate: string;
  perDay: number;
  endDate: string;
  skipWeekends: boolean;
}

export interface WatchPlanResult {
  valid: boolean;
  /** episodes a day — always 1 for a film, and never shown for one */
  perDay: number;
  /** how many watching days the plan needs */
  days: number;
  /** the day the last block lands on */
  endDate: string;
  /** why the plan cannot be scheduled, when it cannot */
  reason?: string;
  remaining: number;
  /** true when this is a one-sitting title */
  single: boolean;
}

const isWatchDay = (iso: string, skip: number[]) => !skip.includes(weekday(iso));

export const skipWeekdaysOf = (skipWeekends: boolean): number[] => (skipWeekends ? WEEKEND : []);

export function countWatchDays(from: string, to: string, skip: number[]): number {
  if (to < from) return 0;
  let n = 0;
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 4000) {
    if (isWatchDay(cur, skip)) n++;
    cur = addDays(cur, 1);
  }
  return n;
}

/** The `count`-th watching day on or after `start` (1-indexed). */
export function nthWatchDay(start: string, count: number, skip: number[]): string {
  let cur = start;
  let seen = 0;
  let guard = 0;
  while (guard++ < 4000) {
    if (isWatchDay(cur, skip)) {
      seen++;
      if (seen >= count) return cur;
    }
    cur = addDays(cur, 1);
  }
  return cur;
}

export function computeWatchPlan(
  draft: WatchPlanDraft,
  totalEpisodes: number,
  currentEpisode: number,
): WatchPlanResult {
  const skip = skipWeekdaysOf(draft.skipWeekends);
  const total = Math.max(1, Math.round(totalEpisodes || 0));
  const seen = Math.max(0, Math.min(Math.round(currentEpisode || 0), total));
  const remaining = total - seen;
  const single = total <= 1;

  const base: WatchPlanResult = {
    valid: false, perDay: 0, days: 0, endDate: draft.startDate, remaining, single,
  };

  if (remaining <= 0) {
    return { ...base, reason: single ? "You have already watched it." : "Every episode is watched." };
  }

  // A film has no pace to pick and no second day to land on.
  if (single) {
    return { ...base, valid: true, perDay: 1, days: 1, endDate: nthWatchDay(draft.startDate, 1, skip) };
  }

  let perDay: number;
  if (draft.mode === "perDay") {
    perDay = Math.round(draft.perDay || 0);
    if (perDay < 1) return { ...base, reason: "Set a pace of at least one episode a day." };
  } else {
    if (draft.endDate < draft.startDate) {
      return { ...base, reason: "Pick a finish date on or after the start date." };
    }
    const available = countWatchDays(draft.startDate, draft.endDate, skip);
    if (!available) {
      return { ...base, reason: "That range has no watching days — try turning weekends back on." };
    }
    perDay = Math.max(1, Math.ceil(remaining / available));
  }

  const days = Math.ceil(remaining / perDay);
  return { ...base, valid: true, perDay, days, endDate: nthWatchDay(draft.startDate, days, skip) };
}

// ---------------------------------------------------------
// Projection — what scheduleMedia would put on the calendar
// ---------------------------------------------------------
export interface EpisodeRange {
  from: number;
  to: number;
}

export interface ProjectedWatchBlock extends EpisodeRange {
  date: string;
}

export function projectWatchBlocks(
  draft: WatchPlanDraft, totalEpisodes: number, currentEpisode: number,
): ProjectedWatchBlock[] {
  const plan = computeWatchPlan(draft, totalEpisodes, currentEpisode);
  if (!plan.valid) return [];

  const skip = skipWeekdaysOf(draft.skipWeekends);
  const total = Math.max(1, Math.round(totalEpisodes));
  const out: ProjectedWatchBlock[] = [];

  let episode = Math.max(0, Math.min(Math.round(currentEpisode), total));
  let cursor = draft.startDate;
  let guard = 0;

  // The 1200-iteration ceiling mirrors store.scheduleMedia's own guard.
  while (episode < total && guard++ < 1200) {
    if (skip.includes(weekday(cursor))) { cursor = addDays(cursor, 1); continue; }
    const to = Math.min(total, episode + plan.perDay);
    out.push({ date: cursor, from: episode + 1, to });
    episode = to;
    cursor = addDays(cursor, 1);
  }
  return out;
}

// ---------------------------------------------------------
// Diff — the damage a reschedule would do, before it does it
// ---------------------------------------------------------
export type WatchDiffKind = "added" | "removed" | "changed" | "same";

export interface WatchDiffRow {
  date: string;
  before: EpisodeRange | null;
  after: EpisodeRange | null;
  kind: WatchDiffKind;
}

export interface WatchDiff {
  rows: WatchDiffRow[];
  added: number;
  removed: number;
  changed: number;
  same: number;
  /** blocks the reschedule leaves alone: ticked off, or before the start date */
  kept: number;
  /** rows that are not `same` */
  touched: number;
  firstChange: string | null;
  finish: string | null;
}

const EMPTY_DIFF: WatchDiff = {
  rows: [], added: 0, removed: 0, changed: 0, same: 0,
  kept: 0, touched: 0, firstChange: null, finish: null,
};

const sameRange = (a: EpisodeRange | null, b: EpisodeRange | null) =>
  !!a && !!b && a.from === b.from && a.to === b.to;

/**
 * `existing` is every watch block for the title. A block is safe from the
 * reschedule when it is already ticked or sits before the start date — exactly
 * the rows store.unscheduleMedia skips.
 */
export function diffWatchPlan(
  existing: Task[], projected: ProjectedWatchBlock[], startDate: string,
): WatchDiff {
  if (!projected.length && !existing.length) return EMPTY_DIFF;

  const before = new Map<string, EpisodeRange>();
  let kept = 0;

  for (const t of existing) {
    const date = t.date ?? "";
    if (t.status === "done" || date < startDate) { kept++; continue; }
    const range: EpisodeRange = { from: t.episode_from ?? 0, to: t.episode_to ?? 0 };
    const current = before.get(date);
    // Two blocks on one day read as a single run, which is how the day shows them.
    before.set(date, current
      ? { from: Math.min(current.from, range.from), to: Math.max(current.to, range.to) }
      : range);
  }

  const after = new Map<string, EpisodeRange>();
  for (const b of projected) after.set(b.date, { from: b.from, to: b.to });

  const dates = [...new Set([...before.keys(), ...after.keys()])].sort();
  const rows: WatchDiffRow[] = dates.map((date) => {
    const b = before.get(date) ?? null;
    const a = after.get(date) ?? null;
    const kind: WatchDiffKind = !b ? "added" : !a ? "removed" : sameRange(a, b) ? "same" : "changed";
    return { date, before: b, after: a, kind };
  });

  const count = (k: WatchDiffKind) => rows.filter((r) => r.kind === k).length;
  const added = count("added");
  const removed = count("removed");
  const changed = count("changed");
  const same = count("same");

  return {
    rows,
    added,
    removed,
    changed,
    same,
    kept,
    touched: added + removed + changed,
    firstChange: rows.find((r) => r.kind !== "same")?.date ?? null,
    finish: projected.length ? projected[projected.length - 1].date : null,
  };
}

// ---------------------------------------------------------
// Words
// ---------------------------------------------------------

/** "6 Sep", or "6 Sep 2027" once it leaves this year. */
export function shortDate(iso: string): string {
  return formatDate(iso, { weekday: false, year: yearOf(iso) !== yearOf(todayISO()) });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 eps/day". Never called for a film — a film has no rate. */
export const rateLabel = (perDay: number): string =>
  `${perDay} ${perDay === 1 ? "ep" : "eps"}/day`;

/** "ep. 4" or "ep. 4–6". */
export const episodeRangeLabel = (r: EpisodeRange | null): string => {
  if (!r) return "—";
  return r.from === r.to ? `ep. ${r.from}` : `ep. ${r.from}–${r.to}`;
};

/** The live sentence under the plan controls — reads forwards or backwards. */
export function watchPlanSentence(draft: WatchPlanDraft, result: WatchPlanResult): string {
  if (!result.valid) return result.reason ?? "";
  // A film states a day, never a rate.
  if (result.single) return `One sitting on ${shortDate(result.endDate)}`;
  if (draft.mode === "perDay") {
    return `${rateLabel(result.perDay)} → ${plural(result.days, "day", "days")}, done by ${shortDate(result.endDate)}`;
  }
  return `Done by ${shortDate(result.endDate)} → ${rateLabel(result.perDay)} over ${plural(result.days, "day", "days")}`;
}

/** The one-line verdict above the diff list. */
export function watchDiffSummary(diff: WatchDiff): string {
  if (!diff.rows.length) return "Nothing to schedule.";
  if (!diff.touched) return "This plan matches the blocks already on your calendar.";
  const parts: string[] = [];
  if (diff.added) parts.push(`${diff.added} new`);
  if (diff.changed) parts.push(`${diff.changed} re-cut`);
  if (diff.removed) parts.push(`${diff.removed} dropped`);
  return `${plural(diff.touched, "day", "days")} change · ${parts.join(", ")}`;
}
