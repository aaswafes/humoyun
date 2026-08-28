"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import type { Review } from "@/lib/types";
import { isScope, type ReviewScope } from "./period";

// =========================================================
// Reading and writing a review row.
//
// One table now holds weekly, monthly and yearly reviews, so the scope is
// carried in the row's `data` bag and every lookup matches on it. The store's
// `setReview` matches on `week_start` alone, which would confuse a month that
// happens to start on a Monday with the week that starts the same day — so
// this module owns the writes instead.
// =========================================================

export const REVIEW_FIELDS = ["went_well", "went_bad", "learned", "next_week"] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];

/** Two extra prompts that the schema has no column for, kept in `data`. */
export const EXTRA_FIELDS = ["stop", "grateful"] as const;
export type ExtraField = (typeof EXTRA_FIELDS)[number];

export interface ReviewDraft {
  went_well: string;
  went_bad: string;
  learned: string;
  next_week: string;
  stop: string;
  grateful: string;
  rating: number | null;
}

export const EMPTY_DRAFT: ReviewDraft = {
  went_well: "", went_bad: "", learned: "", next_week: "", stop: "", grateful: "", rating: null,
};

function bag(r: Review | undefined): Record<string, unknown> {
  return (r?.data as Record<string, unknown> | null) ?? {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function scopeOf(r: Review): ReviewScope {
  const raw = bag(r).scope;
  return isScope(raw) ? raw : "week";
}

export function findReview(
  reviews: Review[], start: string, scope: ReviewScope,
): Review | undefined {
  return reviews.find((r) => r.week_start === start && scopeOf(r) === scope);
}

export function draftOf(review: Review | undefined): ReviewDraft {
  if (!review) return { ...EMPTY_DRAFT };
  const data = bag(review);
  return {
    went_well: review.went_well ?? "",
    went_bad: review.went_bad ?? "",
    learned: review.learned ?? "",
    next_week: review.next_week ?? "",
    stop: str(data.stop),
    grateful: str(data.grateful),
    rating: review.rating,
  };
}

export function draftText(d: ReviewDraft): string[] {
  return [d.went_well, d.went_bad, d.learned, d.next_week, d.stop, d.grateful];
}

export function hasContent(d: ReviewDraft): boolean {
  return d.rating != null || draftText(d).some((v) => v.trim().length > 0);
}

/** How many of the prompts carry an answer — the guided mode's progress. */
export function answeredCount(d: ReviewDraft): number {
  return draftText(d).filter((v) => v.trim().length > 0).length;
}

export function isWritten(r: Review): boolean {
  return hasContent(draftOf(r));
}

/**
 * Insert-or-patch, matched on start date *and* scope. Reads the newest store
 * state at call time so a burst of autosaves cannot resurrect a stale row.
 */
export function useSaveReview() {
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);

  return React.useCallback((start: string, scope: ReviewScope, draft: ReviewDraft) => {
    const trimmed = (s: string) => (s.trim() ? s.trim() : null);
    const existing = findReview(useStore.getState().reviews, start, scope);
    const data = {
      ...bag(existing),
      scope,
      stop: trimmed(draft.stop),
      grateful: trimmed(draft.grateful),
    };
    const changes: Partial<Review> = {
      went_well: trimmed(draft.went_well),
      went_bad: trimmed(draft.went_bad),
      learned: trimmed(draft.learned),
      next_week: trimmed(draft.next_week),
      rating: draft.rating,
      data,
    };
    if (existing) patch("reviews", existing.id, changes);
    else insert("reviews", { week_start: start, ...changes });
  }, [insert, patch]);
}
