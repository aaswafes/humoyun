"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { isScope, type ReviewScope } from "./period";

// =========================================================
// How this user likes to review. Kept in the profile's prefs bag so the choice
// survives a reload and follows them to another device — the same place the
// clock format and working hours already live.
// =========================================================

export type ReviewLayout = "guided" | "full";

export interface ReviewPrefs {
  layout: ReviewLayout;
  scope: ReviewScope;
}

// Guided is the resting state: one part of the ritual at a time is calmer
// than the whole page at once. "Full" is a deliberate choice, and remembered.
const DEFAULTS: ReviewPrefs = { layout: "guided", scope: "week" };

function read(prefs: Record<string, unknown> | undefined): ReviewPrefs {
  const raw = prefs?.review;
  if (!raw || typeof raw !== "object") return DEFAULTS;
  const rec = raw as Record<string, unknown>;
  return {
    layout: rec.layout === "full" ? "full" : "guided",
    scope: isScope(rec.scope) ? rec.scope : "week",
  };
}

export function useReviewPrefs(): [ReviewPrefs, (changes: Partial<ReviewPrefs>) => void] {
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);

  // The write is optimistic in the store, but a profile that has not hydrated
  // yet would swallow it — the local override keeps the click honest either way.
  const [override, setOverride] = React.useState<Partial<ReviewPrefs>>({});
  const stored = read(profile?.prefs);
  const value: ReviewPrefs = { ...stored, ...override };

  const set = React.useCallback((changes: Partial<ReviewPrefs>) => {
    setOverride((prev) => ({ ...prev, ...changes }));
    const current = useStore.getState().profile;
    if (!current) return;
    updateProfile({
      prefs: { ...(current.prefs ?? {}), review: { ...read(current.prefs), ...override, ...changes } },
    });
  }, [override, updateProfile]);

  return [value, set];
}
