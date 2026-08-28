"use client";

// =========================================================
// Habit metadata that has no column of its own.
//
// `habits` mirrors the Supabase schema 1:1 and this surface may not change it,
// so the things a habit needs beyond scheduling — the time of day it belongs
// to, the habit it is stacked onto, the days deliberately rested, and why it
// was archived — live in `profile.prefs.habits`, keyed by habit id. `prefs` is
// already the app's bag for user-scoped settings (`hour12` lives there), it is
// jsonb, and it syncs through `updateProfile` like everything else.
//
// Everything here is defensive: prefs is untyped JSON that older builds and
// other surfaces also write to, so a bad shape degrades to the default rather
// than throwing.
// =========================================================

import * as React from "react";
import { Clock, Moon, Sun, Sunrise } from "lucide-react";
import type { ComponentType } from "react";
import { useStore } from "@/lib/store";
import { addDays, todayISO } from "@/lib/date";
import type { Habit } from "@/lib/types";

export type Slot = "morning" | "midday" | "evening" | "anytime";

export const SLOTS: Slot[] = ["morning", "midday", "evening", "anytime"];

export const SLOT_LABEL: Record<Slot, string> = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
  anytime: "Anytime",
};

export const SLOT_HINT: Record<Slot, string> = {
  morning: "Before the day gets loud",
  midday: "Around the middle of the day",
  evening: "Winding down",
  anytime: "No fixed time",
};

export const SLOT_ICON: Record<Slot, ComponentType<{ className?: string }>> = {
  morning: Sunrise,
  midday: Sun,
  evening: Moon,
  anytime: Clock,
};

const SLOT_RANK: Record<Slot, number> = { morning: 0, midday: 1, evening: 2, anytime: 3 };

export interface HabitMeta {
  /** Which part of the day this belongs to. Drives grouping on Today. */
  slot: Slot;
  /** Habit id this one is stacked onto — it is done straight after that one. */
  after: string | null;
  /** The trigger sentence: "after I pour the coffee". */
  cue: string | null;
  /** date -> reason. A skipped day is rested on purpose and never breaks a streak. */
  skips: Record<string, string>;
  archivedReason: string | null;
  archivedAt: string | null;
}

export type HabitMetaMap = Record<string, HabitMeta>;

export const DEFAULT_META: HabitMeta = {
  slot: "anytime",
  after: null,
  cue: null,
  skips: {},
  archivedReason: null,
  archivedAt: null,
};

const EMPTY_SKIPS: ReadonlySet<string> = new Set<string>();

/** Skips older than this are dropped on the next write — prefs is not an archive. */
const SKIP_HORIZON_DAYS = 800;
const MAX_SKIPS = 400;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseSkips(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  // Arrays are accepted because the first shape of this field was a plain list
  // of dates; reading one back must not lose the user's rest days.
  if (Array.isArray(raw)) {
    for (const day of raw) if (typeof day === "string") out[day] = "";
    return out;
  }
  if (raw && typeof raw === "object") {
    for (const [day, reason] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof day === "string") out[day] = typeof reason === "string" ? reason : "";
    }
  }
  return out;
}

function parseMeta(raw: unknown): HabitMeta {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const slot = SLOTS.includes(row.slot as Slot) ? (row.slot as Slot) : "anytime";
  return {
    slot,
    after: str(row.after),
    cue: str(row.cue),
    skips: parseSkips(row.skips),
    archivedReason: str(row.archivedReason),
    archivedAt: str(row.archivedAt),
  };
}

export function readHabitMeta(prefs: Record<string, unknown> | null | undefined): HabitMetaMap {
  const bag = prefs?.habits;
  if (!bag || typeof bag !== "object") return {};
  const out: HabitMetaMap = {};
  for (const [id, value] of Object.entries(bag as Record<string, unknown>)) {
    out[id] = parseMeta(value);
  }
  return out;
}

export function metaFor(map: HabitMetaMap, habitId: string): HabitMeta {
  return map[habitId] ?? DEFAULT_META;
}

/** Only the fields that differ from the default are stored, so prefs stays small. */
function trim(meta: HabitMeta): Record<string, unknown> | null {
  const floor = addDays(todayISO(), -SKIP_HORIZON_DAYS);
  const skipDays = Object.keys(meta.skips).filter((d) => d >= floor).sort();
  const kept = skipDays.slice(-MAX_SKIPS);
  const skips: Record<string, string> = {};
  for (const day of kept) skips[day] = meta.skips[day] ?? "";

  const out: Record<string, unknown> = {};
  if (meta.slot !== "anytime") out.slot = meta.slot;
  if (meta.after) out.after = meta.after;
  if (meta.cue) out.cue = meta.cue;
  if (kept.length) out.skips = skips;
  if (meta.archivedReason) out.archivedReason = meta.archivedReason;
  if (meta.archivedAt) out.archivedAt = meta.archivedAt;
  return Object.keys(out).length ? out : null;
}

function serialise(map: HabitMetaMap): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, meta] of Object.entries(map)) {
    const row = trim(meta);
    if (row) out[id] = row;
  }
  return out;
}

/**
 * Display order: slots first, then each habit immediately followed by whatever
 * is stacked onto it. Broken links (missing, self-referential or circular) are
 * ignored rather than dropping the habit from the list.
 */
export function stackOrder(habits: Habit[], meta: HabitMetaMap): Habit[] {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const children = new Map<string, Habit[]>();
  const roots: Habit[] = [];

  for (const habit of habits) {
    const after = metaFor(meta, habit.id).after;
    if (after && after !== habit.id && byId.has(after) && !reaches(after, habit.id, meta, byId)) {
      const list = children.get(after) ?? [];
      list.push(habit);
      children.set(after, list);
    } else {
      roots.push(habit);
    }
  }

  const bySlot = (a: Habit, b: Habit) =>
    SLOT_RANK[metaFor(meta, a.id).slot] - SLOT_RANK[metaFor(meta, b.id).slot] ||
    a.order_index - b.order_index;

  roots.sort(bySlot);
  for (const list of children.values()) list.sort((a, b) => a.order_index - b.order_index);

  const out: Habit[] = [];
  const seen = new Set<string>();
  const walk = (habit: Habit) => {
    if (seen.has(habit.id)) return;
    seen.add(habit.id);
    out.push(habit);
    for (const child of children.get(habit.id) ?? []) walk(child);
  };
  roots.forEach(walk);
  for (const habit of habits) if (!seen.has(habit.id)) { seen.add(habit.id); out.push(habit); }
  return out;
}

/**
 * Rewrite `order_index` so the stored order is the displayed one.
 *
 * Today reads habits straight from the store sorted by `order_index`, so the
 * stack the user builds here only reaches the morning if it is written down.
 * Only rows whose index actually moved are patched.
 */
export function normaliseOrder(): void {
  const state = useStore.getState();
  const meta = readHabitMeta(state.profile?.prefs);
  const active = state.habits.filter((h) => !h.archived);
  stackOrder(active, meta).forEach((habit, i) => {
    if (habit.order_index !== i) state.patch("habits", habit.id, { order_index: i });
  });
}

/** Does following `after` links from `start` arrive at `target`? */
function reaches(start: string, target: string, meta: HabitMetaMap, byId: Map<string, Habit>): boolean {
  let cursor: string | null = start;
  for (let guard = 0; cursor && guard < 64; guard++) {
    if (cursor === target) return true;
    if (!byId.has(cursor)) return false;
    cursor = metaFor(meta, cursor).after;
  }
  return false;
}

/**
 * The part of the day a habit is actually shown in: its own, or — if it is
 * stacked onto something — the one at the root of its chain. Derived rather
 * than copied down, so moving the anchor never leaves a chain split across two
 * headings.
 */
export function slotOf(habitId: string, meta: HabitMetaMap, present: ReadonlySet<string>): Slot {
  let cursor = habitId;
  for (let guard = 0; guard < 64; guard++) {
    const row = metaFor(meta, cursor);
    if (!row.after || !present.has(row.after)) return row.slot;
    cursor = row.after;
  }
  return metaFor(meta, habitId).slot;
}

/** Habits stacked directly onto `habitId`, in their own order. */
export function stackedOnto(habits: Habit[], meta: HabitMetaMap, habitId: string): Habit[] {
  return habits
    .filter((h) => metaFor(meta, h.id).after === habitId)
    .sort((a, b) => a.order_index - b.order_index);
}

export interface HabitMetaApi {
  meta: HabitMetaMap;
  metaOf: (habitId: string) => HabitMeta;
  skipsOf: (habitId: string) => ReadonlySet<string>;
  setMeta: (habitId: string, changes: Partial<HabitMeta>) => void;
  setSkip: (habitId: string, date: string, reason: string | null) => void;
  clearMeta: (habitId: string) => void;
}

export function useHabitMeta(): HabitMetaApi {
  const prefs = useStore((s) => s.profile?.prefs);
  const updateProfile = useStore((s) => s.updateProfile);

  const meta = React.useMemo(() => readHabitMeta(prefs), [prefs]);

  const skipIndex = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [id, row] of Object.entries(meta)) map.set(id, new Set(Object.keys(row.skips)));
    return map;
  }, [meta]);

  // Reads the live profile rather than the closed-over one so two writes in the
  // same tick (slot + link, say) cannot clobber each other.
  const write = React.useCallback(
    (mutate: (map: HabitMetaMap) => HabitMetaMap) => {
      const current = useStore.getState().profile?.prefs ?? {};
      const next = mutate(readHabitMeta(current));
      updateProfile({ prefs: { ...current, habits: serialise(next) } });
    },
    [updateProfile],
  );

  const setMeta = React.useCallback(
    (habitId: string, changes: Partial<HabitMeta>) =>
      write((map) => ({ ...map, [habitId]: { ...metaFor(map, habitId), ...changes } })),
    [write],
  );

  const setSkip = React.useCallback(
    (habitId: string, date: string, reason: string | null) =>
      write((map) => {
        const row = metaFor(map, habitId);
        const skips = { ...row.skips };
        if (reason === null) delete skips[date];
        else skips[date] = reason;
        return { ...map, [habitId]: { ...row, skips } };
      }),
    [write],
  );

  const clearMeta = React.useCallback(
    (habitId: string) =>
      write((map) => {
        const next = { ...map };
        delete next[habitId];
        return next;
      }),
    [write],
  );

  return React.useMemo(
    () => ({
      meta,
      metaOf: (id: string) => metaFor(meta, id),
      skipsOf: (id: string) => skipIndex.get(id) ?? EMPTY_SKIPS,
      setMeta,
      setSkip,
      clearMeta,
    }),
    [meta, skipIndex, setMeta, setSkip, clearMeta],
  );
}
