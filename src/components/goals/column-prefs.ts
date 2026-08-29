"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import type { Horizon, Tint } from "@/lib/types";
import { HORIZON_LABEL } from "./goal-model";

/**
 * Per-column display settings. The horizons themselves are a fixed ladder —
 * life, year, quarter, month, week — but what a column is *called*, what
 * colour it carries and whether it is on screen at all are the user's business.
 *
 * Stored in profile.prefs so they follow the account rather than the browser.
 */
export interface ColumnPref {
  label?: string;
  color?: Tint;
  hidden?: boolean;
}

export type ColumnPrefs = Partial<Record<Horizon, ColumnPref>>;

const KEY = "goalColumns";

function parse(raw: unknown): ColumnPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ColumnPrefs = {};
  for (const [horizon, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const pref: ColumnPref = {};
    if (typeof v.label === "string" && v.label.trim()) pref.label = v.label.trim();
    if (typeof v.color === "string") pref.color = v.color as Tint;
    if (v.hidden === true) pref.hidden = true;
    if (Object.keys(pref).length) out[horizon as Horizon] = pref;
  }
  return out;
}

export function useColumnPrefs(): ColumnPrefs {
  const prefs = useStore((s) => s.profile?.prefs);
  return React.useMemo(
    () => parse((prefs as Record<string, unknown> | undefined)?.[KEY]),
    [prefs],
  );
}

/** Merge one column's settings, dropping keys that fall back to the default. */
export function setColumnPref(horizon: Horizon, changes: ColumnPref): void {
  const profile = useStore.getState().profile;
  if (!profile) return;

  const current = parse((profile.prefs as Record<string, unknown>)[KEY]);
  const merged: ColumnPref = { ...current[horizon], ...changes };

  if (!merged.label?.trim() || merged.label.trim() === HORIZON_LABEL[horizon]) delete merged.label;
  if (!merged.color) delete merged.color;
  if (!merged.hidden) delete merged.hidden;

  const next: ColumnPrefs = { ...current };
  if (Object.keys(merged).length) next[horizon] = merged;
  else delete next[horizon];

  useStore.getState().updateProfile({ prefs: { ...profile.prefs, [KEY]: next } });
}

export function columnLabel(horizon: Horizon, prefs: ColumnPrefs): string {
  return prefs[horizon]?.label || HORIZON_LABEL[horizon];
}

export function isHidden(horizon: Horizon, prefs: ColumnPrefs): boolean {
  return prefs[horizon]?.hidden === true;
}
