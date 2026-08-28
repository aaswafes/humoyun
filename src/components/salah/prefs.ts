"use client";

import * as React from "react";
import { useStore } from "@/lib/store";

/**
 * Salah preferences live inside `profile.prefs` alongside everything else,
 * so they survive a reload and follow the account. Writes merge, never
 * replace — another surface owns the other keys in there.
 */
export interface SalahPrefs {
  /** Secondary sunnah and nafl ticks. Off until asked for. */
  sunnah: boolean;
  /** Whole-day shift for the tabular Hijri date, -2..+2. */
  hijriOffset: number;
}

const DEFAULTS: SalahPrefs = { sunnah: false, hijriOffset: 0 };

export function useSalahPrefs(): [SalahPrefs, (changes: Partial<SalahPrefs>) => void] {
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);

  const prefs = React.useMemo<SalahPrefs>(() => {
    const root = (profile?.prefs ?? {}) as Record<string, unknown>;
    const raw = (root.salah ?? {}) as Record<string, unknown>;
    const offset = Number(raw.hijriOffset);
    return {
      sunnah: raw.sunnah === true,
      hijriOffset: Number.isFinite(offset) ? Math.max(-2, Math.min(2, Math.round(offset))) : 0,
    };
  }, [profile?.prefs]);

  const set = React.useCallback(
    (changes: Partial<SalahPrefs>) => {
      const root = (useStore.getState().profile?.prefs ?? {}) as Record<string, unknown>;
      const current = (root.salah ?? {}) as Record<string, unknown>;
      updateProfile({ prefs: { ...root, salah: { ...DEFAULTS, ...current, ...changes } } });
    },
    [updateProfile],
  );

  return [prefs, set];
}
