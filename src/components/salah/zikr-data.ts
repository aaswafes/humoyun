// =========================================================
// Zikr — what a button is, and where a count is kept.
//
// Nothing is shipped with the app: every zikr on this surface was written by
// the person using it. A button carries its own amount, so one press records
// the whole thirty-three rather than thirty-three taps — the counting happens
// on a tasbih, in the hand, and this only keeps the record of it.
//
// A count lives in `day_logs.data.zikr`, one row per day, next to the sunnah
// ticks already in `data.salah`. That keeps the day's whole record in one row,
// needs no table of its own, and makes every lifetime number a sum over rows
// the store already holds rather than a second source of truth.
// =========================================================

import type { DayLog, Tint } from "@/lib/types";

/** One button. `step` is what a single press records. */
export interface ZikrItem {
  id: string;
  label: string;
  step: number;
  tint: Tint;
}

/** One entry inside a set: a zikr, and how much of it the set records. */
export interface ZikrSetEntry {
  zikrId: string;
  count: number;
}

/** Several zikr recorded together — the tasbih after salah is one press. */
export interface ZikrSet {
  id: string;
  label: string;
  tint: Tint;
  entries: ZikrSetEntry[];
}

/** What one press of a set adds to the day, before any of it is written. */
export function setDeltas(set: ZikrSet): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const entry of set.entries) {
    if (entry.count <= 0) continue;
    deltas[entry.zikrId] = (deltas[entry.zikrId] ?? 0) + entry.count;
  }
  return deltas;
}

export function setTotal(set: ZikrSet): number {
  let sum = 0;
  for (const entry of set.entries) if (entry.count > 0) sum += entry.count;
  return sum;
}

// ---------------------------------------------------------
// Storage — `day_logs.data.zikr`
// ---------------------------------------------------------

/** Counts for one day, keyed by zikr id. Absent means zero, never null. */
export type ZikrCounts = Record<string, number>;

const EMPTY: ZikrCounts = {};

/** Reads the zikr block out of a day log, tolerating anything else in there. */
export function zikrCountsOf(log: DayLog | undefined): ZikrCounts {
  const raw = (log?.data as Record<string, unknown> | undefined)?.zikr;
  if (!raw || typeof raw !== "object") return EMPTY;
  const out: ZikrCounts = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value);
    // A row written by an older build, or edited by hand, can hold anything.
    if (Number.isFinite(n) && n > 0) out[id] = Math.floor(n);
  }
  return out;
}

/**
 * Merges the counts back into the day log's `data` without touching whatever
 * else another surface has parked there — the sunnah ticks live next door.
 */
export function withZikrCounts(log: DayLog | undefined, next: ZikrCounts): Record<string, unknown> {
  const clean: ZikrCounts = {};
  for (const [id, n] of Object.entries(next)) if (n > 0) clean[id] = n;
  return { ...(log?.data ?? {}), zikr: clean };
}

export function totalOf(counts: ZikrCounts): number {
  let sum = 0;
  for (const n of Object.values(counts)) sum += n;
  return sum;
}

/** A number a person can read at a glance: 12,400 rather than 12400. */
export function groupNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** Compact, for a tight rail or a bar label: 12.4k, 1.2M. */
export function shortNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
