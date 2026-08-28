// =========================================================
// The arithmetic behind Today's planner: what counts as an
// estimate, what the day has room for, and where the gaps are.
// Feature-local on purpose — the shared kit is not mine to edit.
// =========================================================

import type { Task } from "@/lib/types";

/** A day ends when you stop working, not at midnight. Anything later stretches it. */
export const DAY_END_MIN = 23 * 60;
/** Drops and auto-fill land on the half hour. */
export const SLOT_MIN = 30;
/** How long a block gets when the task never said. */
export const DEFAULT_BLOCK_MIN = 60;

export const isOpenTask = (t: Task) => t.status !== "done" && t.status !== "dropped";

/**
 * Explicit estimates only. Inventing a number for every untimed task would make
 * the budget agree with you, which is the opposite of useful — so unestimated
 * tasks are counted separately and shown as their own figure.
 */
export function estimateOf(t: Task): number | null {
  if (t.start_min != null && t.end_min != null && t.end_min > t.start_min) return t.end_min - t.start_min;
  if (t.duration_min != null && t.duration_min > 0) return t.duration_min;
  return null;
}

/** The span a block occupies once it is on the ribbon. */
export function blockLength(t: Task): number {
  return estimateOf(t) ?? DEFAULT_BLOCK_MIN;
}

export interface Budget {
  /** Minutes of estimated work still open today. */
  planned: number;
  /** Open tasks with no estimate at all. */
  unestimated: number;
  /** Minutes between now and the end of the day. */
  left: number;
  /** How far past `left` the plan reaches. 0 when it fits. */
  over: number;
  /** Minute-of-day the count stops at. */
  dayEnd: number;
  /** Minutes already finished today — context, not part of the claim. */
  spent: number;
}

export function budgetFor(dayTasks: Task[], minutesNow: number): Budget {
  let planned = 0;
  let unestimated = 0;
  let spent = 0;
  let dayEnd = DAY_END_MIN;

  for (const t of dayTasks) {
    if (t.parent_id) continue;
    const end = t.end_min ?? (t.start_min != null ? t.start_min + blockLength(t) : null);
    if (end != null && end > dayEnd) dayEnd = Math.min(24 * 60, end);

    const est = estimateOf(t);
    if (!isOpenTask(t)) {
      if (t.status === "done") spent += est ?? t.actual_min ?? 0;
      continue;
    }
    if (est == null) unestimated++;
    else planned += est;
  }

  const left = Math.max(0, dayEnd - minutesNow);
  return { planned, unestimated, left, over: Math.max(0, planned - left), dayEnd, spent };
}

export interface Range { start: number; end: number; label?: string }

/** Everything already holding a slice of the day, done or not. */
export function busyRanges(dayTasks: Task[]): Range[] {
  return dayTasks
    .filter((t) => !t.parent_id && t.start_min != null)
    .map((t) => ({
      start: t.start_min as number,
      end: Math.max((t.start_min as number) + 5, t.end_min ?? (t.start_min as number) + blockLength(t)),
      label: t.title,
    }))
    .sort((a, b) => a.start - b.start);
}

export const overlaps = (a: Range, b: Range) => a.start < b.end && b.start < a.end;

/** First slot at or after `from` where `duration` fits without landing on anything. */
export function nextFreeSlot(
  from: number,
  duration: number,
  blocked: Range[],
  dayEnd: number,
): number | null {
  let cursor = Math.ceil(Math.max(0, from) / SLOT_MIN) * SLOT_MIN;
  for (let guard = 0; guard < 96 && cursor + duration <= dayEnd; guard++) {
    const candidate = { start: cursor, end: cursor + duration };
    const clash = blocked.find((b) => overlaps(candidate, b));
    if (!clash) return cursor;
    cursor = Math.ceil(clash.end / SLOT_MIN) * SLOT_MIN;
  }
  return null;
}

/**
 * Lane packing so two blocks at the same hour do not draw on top of each other.
 * Returns the lane index per input index, and how many lanes were needed.
 */
export function packLanes(ranges: Range[], maxLanes = 3): { lanes: number[]; count: number } {
  const laneEnds: number[] = [];
  const lanes = ranges.map((r) => {
    const free = laneEnds.findIndex((end) => end <= r.start);
    const lane = free >= 0 ? free : Math.min(laneEnds.length, maxLanes - 1);
    laneEnds[lane] = r.end;
    return lane;
  });
  return { lanes, count: Math.max(1, Math.min(maxLanes, laneEnds.length)) };
}

/** Compact hour label for the ribbon: 7a, 12p, 3p. */
export function hourLabel(hour: number, hour12: boolean): string {
  const h = ((hour % 24) + 24) % 24;
  if (!hour12) return String(h).padStart(2, "0");
  const suffix = h < 12 ? "a" : "p";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${suffix}`;
}
