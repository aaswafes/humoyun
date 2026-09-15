"use client";

import * as React from "react";
import { uid, useStore } from "@/lib/store";
import type { DayLog, Tint } from "@/lib/types";
import {
  LIBRARY_BY_ID, ZIKR_LIBRARY, zikrCountsOf, withZikrCounts,
  type ZikrCategory, type ZikrCounts, type ZikrDef,
} from "./zikr-data";

// =========================================================
// Zikr preferences and the write path.
//
// Preferences follow the account in `profile.prefs.zikr`, the same jsonb the
// rest of the app keeps its knobs in — a new one never needs a migration.
// Counts do not go there: they are per-day and would grow without limit, so
// they live in the day log next to the rest of the day.
// =========================================================

export interface ZikrPrefs {
  /** Zikr the user wrote themselves. Kept small on purpose. */
  custom: ZikrDef[];
  /** Daily target overrides, by id. Absent means the library's own count. */
  goals: Record<string, number>;
}

const DEFAULTS: ZikrPrefs = { custom: [], goals: {} };

function asCustom(value: unknown): ZikrDef[] {
  if (!Array.isArray(value)) return [];
  const out: ZikrDef[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.label !== "string") continue;
    const target = Number(r.target);
    out.push({
      id: r.id,
      label: r.label,
      arabic: typeof r.arabic === "string" ? r.arabic : "",
      translit: typeof r.translit === "string" ? r.translit : "",
      meaning: typeof r.meaning === "string" ? r.meaning : "",
      target: Number.isFinite(target) && target > 0 ? Math.floor(target) : 33,
      category: (typeof r.category === "string" ? r.category : "anytime") as ZikrCategory,
      tint: (typeof r.tint === "string" ? r.tint : "slate") as Tint,
      custom: true,
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
    const goals: Record<string, number> = {};
    for (const [id, value] of Object.entries((raw.goals ?? {}) as Record<string, unknown>)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) goals[id] = Math.floor(n);
    }
    return { custom: asCustom(raw.custom), goals };
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

/** Library plus anything the user wrote, in one list. */
export function useZikrCatalog(): { all: ZikrDef[]; byId: Record<string, ZikrDef> } {
  const [prefs] = useZikrPrefs();
  return React.useMemo(() => {
    const all = [...ZIKR_LIBRARY, ...prefs.custom];
    return { all, byId: { ...LIBRARY_BY_ID, ...Object.fromEntries(prefs.custom.map((z) => [z.id, z])) } };
  }, [prefs.custom]);
}

export function makeCustomZikr(partial: Partial<ZikrDef>): ZikrDef {
  return {
    id: `c-${uid().slice(0, 8)}`,
    label: partial.label?.trim() || "New zikr",
    arabic: partial.arabic?.trim() ?? "",
    translit: partial.translit?.trim() ?? "",
    meaning: partial.meaning?.trim() ?? "",
    target: partial.target && partial.target > 0 ? Math.floor(partial.target) : 33,
    category: partial.category ?? "anytime",
    tint: partial.tint ?? "slate",
    custom: true,
  };
}

/** The target for one zikr today: the user's override, else the library's count. */
export function targetFor(def: ZikrDef, goals: Record<string, number>): number {
  return goals[def.id] ?? def.target;
}

// ---------------------------------------------------------
// Counting
// ---------------------------------------------------------

const FLUSH_MS = 700;

export interface ZikrToday {
  /** Saved plus everything still buffered — what the screen must show. */
  counts: ZikrCounts;
  add: (id: string, by?: number) => void;
  /** An absolute write: reset to zero, or correct a number by hand. */
  setCount: (id: string, value: number) => void;
  flush: () => void;
}

/**
 * Today's counts, buffered.
 *
 * A tasbih is thirty-three taps in under a minute. Writing each one straight
 * through would be thirty-three round trips and thirty-three undo entries for
 * one sitting, so taps accumulate locally and land as a single patch once the
 * hand stops. The buffer is also flushed when the tab is hidden, when the day
 * rolls over and on unmount — every path where the component could otherwise
 * take the last few taps with it.
 */
export function useZikrToday(date: string): ZikrToday {
  const dayLogs = useStore((s) => s.dayLogs);
  const log = React.useMemo(() => dayLogs.find((d) => d.date === date), [dayLogs, date]);
  const saved = React.useMemo(() => zikrCountsOf(log), [log]);

  const [pending, setPending] = React.useState<ZikrCounts>({});
  const pendingRef = React.useRef<ZikrCounts>({});
  const dateRef = React.useRef(date);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushTo = React.useCallback((target: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const delta = pendingRef.current;
    if (!Object.keys(delta).length) return;
    pendingRef.current = {};
    setPending({});

    // Re-read at flush time: another surface may have written the same row
    // while the taps were buffered.
    const state = useStore.getState();
    const row = state.dayLogs.find((d) => d.date === target) as DayLog | undefined;
    const current = zikrCountsOf(row);
    const next: ZikrCounts = { ...current };
    for (const [id, by] of Object.entries(delta)) next[id] = Math.max(0, (next[id] ?? 0) + by);
    state.setDayLog(target, { data: withZikrCounts(row, next) });
  }, []);

  const flush = React.useCallback(() => flushTo(dateRef.current), [flushTo]);

  // A day that rolls over mid-session belongs to the date the taps were made on.
  React.useEffect(() => {
    if (dateRef.current !== date) {
      flushTo(dateRef.current);
      dateRef.current = date;
    }
  }, [date, flushTo]);

  React.useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const add = React.useCallback((id: string, by = 1) => {
    const next = { ...pendingRef.current };
    next[id] = (next[id] ?? 0) + by;
    // Never let the buffer take a count below zero — the floor belongs to the
    // saved row, which only flush can see.
    pendingRef.current = next;
    setPending(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushTo(dateRef.current), FLUSH_MS);
  }, [flushTo]);

  const setCount = React.useCallback((id: string, value: number) => {
    // Absolute writes cannot be expressed as a delta against a row that may
    // already have moved, so the buffer is settled first.
    flushTo(dateRef.current);
    const state = useStore.getState();
    const row = state.dayLogs.find((d) => d.date === dateRef.current) as DayLog | undefined;
    const next = { ...zikrCountsOf(row), [id]: Math.max(0, Math.floor(value)) };
    state.setDayLog(dateRef.current, { data: withZikrCounts(row, next) });
  }, [flushTo]);

  const counts = React.useMemo(() => {
    if (!Object.keys(pending).length) return saved;
    const merged: ZikrCounts = { ...saved };
    for (const [id, by] of Object.entries(pending)) merged[id] = Math.max(0, (merged[id] ?? 0) + by);
    return merged;
  }, [saved, pending]);

  return { counts, add, setCount, flush };
}

/** A short buzz on a completed set, where the device has one. */
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not every browser has it and some throw inside an iframe; it is a nicety.
  }
}
