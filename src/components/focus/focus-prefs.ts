"use client";

import * as React from "react";
import { useStore, uid } from "@/lib/store";

// =========================================================
// Session presets and focus targets.
//
// These are per-user settings, not entities, so they live in `profile.prefs`
// — the store already syncs that object and merges it on write. Nothing here
// touches the schema.
// =========================================================

export interface SessionPreset {
  id: string;
  name: string;
  /** Minutes in one focus block. */
  focus: number;
  /** Minutes of the short break between blocks. */
  short: number;
  /** Minutes of the long break at the end of a set. */
  long: number;
  /** Focus blocks in a set, before the long break. */
  cycles: number;
  builtIn?: boolean;
}

export const BUILT_IN_PRESETS: SessionPreset[] = [
  { id: "sprint", name: "Sprint", focus: 15, short: 3, long: 12, cycles: 4, builtIn: true },
  { id: "classic", name: "Classic", focus: 25, short: 5, long: 15, cycles: 4, builtIn: true },
  { id: "deep", name: "Deep", focus: 50, short: 10, long: 25, cycles: 3, builtIn: true },
  { id: "marathon", name: "Marathon", focus: 90, short: 20, long: 30, cycles: 2, builtIn: true },
];

export interface FocusPrefs {
  /** User-made presets, shown after the built-ins. */
  presets: SessionPreset[];
  activePresetId: string;
  /** Minutes of focus aimed at per day. */
  dailyGoal: number;
  /** Minutes of focus aimed at per week. */
  weeklyGoal: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  /** The slow breathing ring behind the deep-work dial. */
  ambient: boolean;
}

export const DEFAULT_PREFS: FocusPrefs = {
  presets: [],
  activePresetId: "classic",
  dailyGoal: 120,
  weeklyGoal: 600,
  autoStartBreaks: false,
  autoStartFocus: false,
  ambient: true,
};

export const PRESET_LIMITS = {
  focus: [5, 240] as const,
  short: [1, 60] as const,
  long: [5, 120] as const,
  cycles: [2, 8] as const,
  dailyGoal: [15, 900] as const,
  weeklyGoal: [30, 4200] as const,
};

function clamp(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  const n = typeof value === "number" ? Math.round(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function readPreset(raw: unknown): SessionPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  const focus = clamp(r.focus, PRESET_LIMITS.focus, 25);
  return {
    id: r.id,
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 32) : "Preset",
    focus,
    short: clamp(r.short, PRESET_LIMITS.short, Math.max(1, Math.round(focus / 5))),
    long: clamp(r.long, PRESET_LIMITS.long, Math.max(5, Math.round(focus / 2))),
    cycles: clamp(r.cycles, PRESET_LIMITS.cycles, 4),
  };
}

/** prefs.focus is untyped JSON from the database — everything is re-validated here. */
export function readFocusPrefs(prefs: Record<string, unknown> | null | undefined): FocusPrefs {
  const raw = (prefs?.focus ?? null) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;

  const presets = Array.isArray(raw.presets)
    ? raw.presets.map(readPreset).filter((p): p is SessionPreset => !!p).slice(0, 12)
    : [];

  const known = new Set([...BUILT_IN_PRESETS, ...presets].map((p) => p.id));
  const activePresetId =
    typeof raw.activePresetId === "string" && known.has(raw.activePresetId)
      ? raw.activePresetId
      : DEFAULT_PREFS.activePresetId;

  return {
    presets,
    activePresetId,
    dailyGoal: clamp(raw.dailyGoal, PRESET_LIMITS.dailyGoal, DEFAULT_PREFS.dailyGoal),
    weeklyGoal: clamp(raw.weeklyGoal, PRESET_LIMITS.weeklyGoal, DEFAULT_PREFS.weeklyGoal),
    autoStartBreaks: raw.autoStartBreaks === true,
    autoStartFocus: raw.autoStartFocus === true,
    ambient: raw.ambient !== false,
  };
}

export function presetRhythm(preset: SessionPreset): string {
  return `${preset.focus}/${preset.short}`;
}

export function presetSummary(preset: SessionPreset): string {
  return `${preset.focus} min focus · ${preset.short} min break · ${preset.long} min long break after ${preset.cycles}`;
}

export interface FocusPrefsApi {
  prefs: FocusPrefs;
  /** Every preset the picker offers: built-ins first, then the user's. */
  presets: SessionPreset[];
  preset: SessionPreset;
  setPrefs: (changes: Partial<FocusPrefs>) => void;
  selectPreset: (id: string) => void;
  savePreset: (draft: Omit<SessionPreset, "id" | "builtIn"> & { id?: string }) => SessionPreset;
  deletePreset: (id: string) => void;
}

export function useFocusPrefs(): FocusPrefsApi {
  const profileprefs = useStore((s) => s.profile?.prefs);
  const updateProfile = useStore((s) => s.updateProfile);

  const prefs = React.useMemo(() => readFocusPrefs(profileprefs), [profileprefs]);
  const presets = React.useMemo(() => [...BUILT_IN_PRESETS, ...prefs.presets], [prefs.presets]);
  const preset = presets.find((p) => p.id === prefs.activePresetId) ?? BUILT_IN_PRESETS[1];

  // prefs is shared with the rest of the app (hour12 lives there too), so every
  // write spreads what is already stored instead of replacing the object.
  const write = React.useCallback(
    (next: FocusPrefs) => {
      const base = useStore.getState().profile?.prefs ?? {};
      updateProfile({ prefs: { ...base, focus: next } });
    },
    [updateProfile],
  );

  const setPrefs = React.useCallback(
    (changes: Partial<FocusPrefs>) => {
      const current = readFocusPrefs(useStore.getState().profile?.prefs);
      write({ ...current, ...changes });
    },
    [write],
  );

  const selectPreset = React.useCallback(
    (id: string) => setPrefs({ activePresetId: id }),
    [setPrefs],
  );

  const savePreset = React.useCallback<FocusPrefsApi["savePreset"]>(
    (draft) => {
      const current = readFocusPrefs(useStore.getState().profile?.prefs);
      const focus = clamp(draft.focus, PRESET_LIMITS.focus, 25);
      const saved: SessionPreset = {
        id: draft.id && !BUILT_IN_PRESETS.some((p) => p.id === draft.id) ? draft.id : uid(),
        name: draft.name.trim().slice(0, 32) || `${focus} minutes`,
        focus,
        short: clamp(draft.short, PRESET_LIMITS.short, 5),
        long: clamp(draft.long, PRESET_LIMITS.long, 15),
        cycles: clamp(draft.cycles, PRESET_LIMITS.cycles, 4),
      };
      const others = current.presets.filter((p) => p.id !== saved.id);
      write({
        ...current,
        presets: [...others, saved].slice(0, 12),
        activePresetId: saved.id,
      });
      return saved;
    },
    [write],
  );

  const deletePreset = React.useCallback(
    (id: string) => {
      const current = readFocusPrefs(useStore.getState().profile?.prefs);
      const presetsLeft = current.presets.filter((p) => p.id !== id);
      write({
        ...current,
        presets: presetsLeft,
        activePresetId:
          current.activePresetId === id ? DEFAULT_PREFS.activePresetId : current.activePresetId,
      });
    },
    [write],
  );

  return { prefs, presets, preset, setPrefs, selectPreset, savePreset, deletePreset };
}
