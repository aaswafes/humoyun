"use client";

import * as React from "react";
import { uid, useStore } from "@/lib/store";
import type { DayLog, Tint } from "@/lib/types";
import {
  withZikrCounts, zikrCountsOf,
  type ZikrCounts, type ZikrItem, type ZikrSet, type ZikrSetEntry,
} from "./zikr-data";

// =========================================================
// The buttons a person made, and the one way a press is written.
//
// The buttons follow the account in `profile.prefs.zikr`, the same jsonb the
// rest of the app keeps its knobs in — a new one never needs a migration.
// Counts do not go there: they are per-day and would grow without limit, so
// they live in the day log next to the rest of the day.
// =========================================================

export interface ZikrPrefs {
  items: ZikrItem[];
  sets: ZikrSet[];
}

const DEFAULTS: ZikrPrefs = { items: [], sets: [] };

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function asItems(value: unknown): ZikrItem[] {
  if (!Array.isArray(value)) return [];
  const out: ZikrItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.label !== "string") continue;
    out.push({
      id: r.id,
      label: r.label,
      // `target` is what the first build of this surface called it.
      step: asNumber(r.step ?? r.target, 33),
      tint: (typeof r.tint === "string" ? r.tint : "slate") as Tint,
    });
  }
  return out;
}

function asSets(value: unknown): ZikrSet[] {
  if (!Array.isArray(value)) return [];
  const out: ZikrSet[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.label !== "string") continue;
    const entries: ZikrSetEntry[] = [];
    if (Array.isArray(r.entries)) {
      for (const e of r.entries) {
        if (!e || typeof e !== "object") continue;
        const entry = e as Record<string, unknown>;
        if (typeof entry.zikrId !== "string") continue;
        entries.push({ zikrId: entry.zikrId, count: asNumber(entry.count, 1) });
      }
    }
    out.push({
      id: r.id,
      label: r.label,
      tint: (typeof r.tint === "string" ? r.tint : "slate") as Tint,
      entries,
    });
  }
  return out;
}

export function useZikrPrefs(): [ZikrPrefs, (changes: Partial<ZikrPrefs>) => void] {
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);

  const prefs = React.useMemo<ZikrPrefs>(() => {
    const root = (profile?.prefs ?? {}) as Record<string, unknown>;
    const raw = (root.zikr ?? {}) as Record<string, unknown>;
    // `custom` is the key the first build used for the same thing.
    return { items: asItems(raw.items ?? raw.custom), sets: asSets(raw.sets) };
  }, [profile?.prefs]);

  const set = React.useCallback(
    (changes: Partial<ZikrPrefs>) => {
      // Read the live prefs rather than the closed-over copy: two writes in one
      // tick would otherwise drop the first.
      const root = (useStore.getState().profile?.prefs ?? {}) as Record<string, unknown>;
      const current = (root.zikr ?? {}) as Record<string, unknown>;
      updateProfile({ prefs: { ...root, zikr: { ...DEFAULTS, ...current, ...changes } } });
    },
    [updateProfile],
  );

  return [prefs, set];
}

export function newZikrItem(partial: Partial<ZikrItem>): ZikrItem {
  return {
    id: `z-${uid().slice(0, 8)}`,
    label: partial.label?.trim() || "New zikr",
    step: partial.step && partial.step > 0 ? Math.floor(partial.step) : 33,
    tint: partial.tint ?? "slate",
  };
}

export function newZikrSet(partial: Partial<ZikrSet>): ZikrSet {
  return {
    id: `s-${uid().slice(0, 8)}`,
    label: partial.label?.trim() || "New set",
    tint: partial.tint ?? "slate",
    entries: partial.entries ?? [],
  };
}

// ---------------------------------------------------------
// Writing a press
// ---------------------------------------------------------

export interface ZikrLog {
  counts: ZikrCounts;
  /** One press: several zikr at once for a set, one for a button. */
  add: (deltas: Record<string, number>) => void;
  /** An absolute write — correcting a number by hand, or clearing it. */
  setCount: (id: string, value: number) => void;
}

/**
 * Today's counts, and the single door a press goes through.
 *
 * A press is a whole thirty-three, so there is nothing to buffer: one press is
 * one patch and one undo step, and a set that touches three zikr is still one
 * of each because the whole block is written at once. The row is re-read at
 * write time rather than closed over — another surface may have written the
 * same day while this screen sat open.
 */
export function useZikrLog(date: string): ZikrLog {
  const dayLogs = useStore((s) => s.dayLogs);
  const log = React.useMemo(() => dayLogs.find((d) => d.date === date), [dayLogs, date]);
  const counts = React.useMemo(() => zikrCountsOf(log), [log]);

  const add = React.useCallback((deltas: Record<string, number>) => {
    const state = useStore.getState();
    const row = state.dayLogs.find((d) => d.date === date) as DayLog | undefined;
    const next: ZikrCounts = { ...zikrCountsOf(row) };
    for (const [id, by] of Object.entries(deltas)) {
      next[id] = Math.max(0, (next[id] ?? 0) + by);
    }
    state.setDayLog(date, { data: withZikrCounts(row, next) });
  }, [date]);

  const setCount = React.useCallback((id: string, value: number) => {
    const state = useStore.getState();
    const row = state.dayLogs.find((d) => d.date === date) as DayLog | undefined;
    const next = { ...zikrCountsOf(row), [id]: Math.max(0, Math.floor(value)) };
    state.setDayLog(date, { data: withZikrCounts(row, next) });
  }, [date]);

  return { counts, add, setCount };
}

/** A short buzz on a press, where the device has one. */
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not every browser has it and some throw inside an iframe; it is a nicety.
  }
}
