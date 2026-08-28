// =========================================================
// What a reschedule would actually do.
//
// store.scheduleBook clears every unfinished block from the start date and
// lays fresh ones down. This file re-runs that arithmetic without touching
// the store, so the sheet can show the damage before anyone commits to it.
// =========================================================

import { addDays, weekday } from "@/lib/date";
import type { Task } from "@/lib/types";
import { computePlan, skipWeekdaysOf, type PlanDraft } from "./plan";

export interface BlockRange {
  from: number;
  to: number;
}

export interface ProjectedBlock extends BlockRange {
  date: string;
}

/** The blocks scheduleBook would create, in the order it would create them. */
export function projectBlocks(
  draft: PlanDraft, totalPages: number, currentPage: number,
): ProjectedBlock[] {
  const plan = computePlan(draft, totalPages, currentPage);
  if (!plan.valid) return [];

  const skip = skipWeekdaysOf(draft.skipWeekends);
  const total = Math.max(1, Math.round(totalPages));
  const out: ProjectedBlock[] = [];

  let page = Math.max(0, Math.min(Math.round(currentPage), total));
  let cursor = draft.startDate;
  let guard = 0;

  // The 1200-iteration ceiling mirrors store.scheduleBook's own guard.
  while (page < total && guard++ < 1200) {
    if (skip.includes(weekday(cursor))) { cursor = addDays(cursor, 1); continue; }
    const to = Math.min(total, page + plan.perDay);
    out.push({ date: cursor, from: page + 1, to });
    page = to;
    cursor = addDays(cursor, 1);
  }
  return out;
}

export type DiffKind = "added" | "removed" | "changed" | "same";

export interface PlanDiffRow {
  date: string;
  before: BlockRange | null;
  after: BlockRange | null;
  kind: DiffKind;
}

export interface PlanDiff {
  rows: PlanDiffRow[];
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

const EMPTY_DIFF: PlanDiff = {
  rows: [], added: 0, removed: 0, changed: 0, same: 0,
  kept: 0, touched: 0, firstChange: null, finish: null,
};

const sameRange = (a: BlockRange | null, b: BlockRange | null) =>
  !!a && !!b && a.from === b.from && a.to === b.to;

/**
 * `existing` is every reading block for the book. A block is safe from the
 * reschedule when it is already done or sits before the start date — exactly
 * the rows store.unscheduleBook skips.
 */
export function diffPlan(
  existing: Task[], projected: ProjectedBlock[], startDate: string,
): PlanDiff {
  if (!projected.length && !existing.length) return EMPTY_DIFF;

  const before = new Map<string, BlockRange>();
  let kept = 0;

  for (const t of existing) {
    const date = t.date ?? "";
    if (t.status === "done" || date < startDate) { kept++; continue; }
    const range: BlockRange = { from: t.page_from ?? 0, to: t.page_to ?? 0 };
    const current = before.get(date);
    // Two blocks on one day read as a single span, which is how they look on the day.
    before.set(date, current
      ? { from: Math.min(current.from, range.from), to: Math.max(current.to, range.to) }
      : range);
  }

  const after = new Map<string, BlockRange>();
  for (const b of projected) after.set(b.date, { from: b.from, to: b.to });

  const dates = [...new Set([...before.keys(), ...after.keys()])].sort();
  const rows: PlanDiffRow[] = dates.map((date) => {
    const b = before.get(date) ?? null;
    const a = after.get(date) ?? null;
    const kind: DiffKind = !b ? "added" : !a ? "removed" : sameRange(a, b) ? "same" : "changed";
    return { date, before: b, after: a, kind };
  });

  const count = (k: DiffKind) => rows.filter((r) => r.kind === k).length;
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

/** "p.120–150" */
export const rangeLabel = (r: BlockRange | null): string =>
  r ? `p.${r.from}–${r.to}` : "—";

/** The one-line verdict above the diff list. */
export function diffSummary(diff: PlanDiff): string {
  if (!diff.rows.length) return "Nothing to schedule.";
  if (!diff.touched) return "This plan matches the blocks already on your calendar.";
  const parts: string[] = [];
  if (diff.added) parts.push(`${diff.added} new`);
  if (diff.changed) parts.push(`${diff.changed} re-paged`);
  if (diff.removed) parts.push(`${diff.removed} dropped`);
  const days = `${diff.touched} ${diff.touched === 1 ? "day" : "days"} change`;
  return `${days} · ${parts.join(", ")}`;
}
