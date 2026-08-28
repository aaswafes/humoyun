// =========================================================
// Everything a goal knows that the `goals` table has no column for.
//
// src/lib/types.ts mirrors the Supabase schema 1:1 and is shared with every
// other surface, so this one cannot add columns. The extras the ladder needs —
// what done looks like, which signal drives the bar, the check-in log,
// milestones, links to books and habits — ride in a sidecar appended to
// `description` behind a marker.
//
// The prose the user types stays FIRST and untouched, so any surface that
// renders or truncates a goal description still shows exactly what they wrote.
// Pure module: no React, no store.
// =========================================================

import type { Goal, Horizon } from "@/lib/types";
import { addDays, diffDays, todayISO } from "@/lib/date";

export type ProgressMode = "auto" | "target" | "tasks" | "children" | "milestones";

export const PROGRESS_MODES: ProgressMode[] = ["auto", "target", "children", "tasks", "milestones"];

export const PROGRESS_MODE_LABEL: Record<ProgressMode, string> = {
  auto: "Blend",
  target: "Target",
  children: "Child goals",
  tasks: "Linked tasks",
  milestones: "Milestones",
};

export type CheckInCadence = "off" | "week" | "fortnight" | "month";

export const CADENCE_LABEL: Record<CheckInCadence, string> = {
  off: "Never ask",
  week: "Every week",
  fortnight: "Every two weeks",
  month: "Every month",
};

export const CADENCE_DAYS: Record<CheckInCadence, number> = {
  off: 0, week: 7, fortnight: 14, month: 30,
};

export interface Milestone {
  id: string;
  title: string;
  /** yyyy-MM-dd. Milestones without a date still list, they just cannot plot. */
  date: string | null;
  done: boolean;
  /** the day it was ticked — this is what "recent activity" reads */
  done_on: string | null;
}

export interface CheckIn {
  id: string;
  date: string;
  value: number;
  note: string | null;
}

export interface GoalMeta {
  /** "What does done look like" — the acceptance test for the goal. */
  done_looks_like: string;
  mode: ProgressMode;
  /** undefined means "use the rhythm this horizon deserves" */
  cadence: CheckInCadence | null;
  milestones: Milestone[];
  checkins: CheckIn[];
  book_ids: string[];
  habit_ids: string[];
}

export const EMPTY_META: GoalMeta = {
  done_looks_like: "",
  mode: "auto",
  cadence: null,
  milestones: [],
  checkins: [],
  book_ids: [],
  habit_ids: [],
};

const MARK_OPEN = "<!--goal-meta";
const MARK_CLOSE = "-->";

export function metaId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------
// Parse / compose
// ---------------------------------------------------------
const asString = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const asBool = (v: unknown) => v === true;
const asNumber = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const asIso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function asIdList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) if (typeof item === "string" && item && !out.includes(item)) out.push(item);
  return out;
}

function asMilestones(v: unknown): Milestone[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 200).map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      id: asString(row.id) || metaId(),
      title: asString(row.title),
      date: asIso(row.date),
      done: asBool(row.done),
      done_on: asIso(row.done_on),
    };
  });
}

function asCheckIns(v: unknown): CheckIn[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(-400)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return {
        id: asString(row.id) || metaId(),
        date: asIso(row.date) ?? todayISO(),
        value: asNumber(row.value),
        note: typeof row.note === "string" && row.note ? row.note : null,
      };
    })
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
}

function asMode(v: unknown): ProgressMode {
  return PROGRESS_MODES.includes(v as ProgressMode) ? (v as ProgressMode) : "auto";
}

function asCadence(v: unknown): CheckInCadence | null {
  return v === "off" || v === "week" || v === "fortnight" || v === "month" ? v : null;
}

// Parsing runs inside the progress rollup, which runs on every store change.
// A tiny string-keyed cache keeps that free without holding on to goal objects.
const cache = new Map<string, GoalMeta>();
const CACHE_MAX = 400;

function parse(description: string): GoalMeta {
  const hit = cache.get(description);
  if (hit) return hit;

  const open = description.indexOf(MARK_OPEN);
  let meta = EMPTY_META;
  if (open >= 0) {
    const close = description.lastIndexOf(MARK_CLOSE);
    const json = close > open ? description.slice(open + MARK_OPEN.length, close) : "";
    try {
      const raw = JSON.parse(json) as Record<string, unknown>;
      meta = {
        done_looks_like: asString(raw.done_looks_like),
        mode: asMode(raw.mode),
        cadence: asCadence(raw.cadence),
        milestones: asMilestones(raw.milestones),
        checkins: asCheckIns(raw.checkins),
        book_ids: asIdList(raw.book_ids),
        habit_ids: asIdList(raw.habit_ids),
      };
    } catch {
      // A hand-edited description should never cost the user their goal.
      meta = EMPTY_META;
    }
  }

  if (cache.size > CACHE_MAX) cache.clear();
  cache.set(description, meta);
  return meta;
}

/** The structured sidecar. Always returns a value — never null. */
export function readMeta(goal: Pick<Goal, "description">): GoalMeta {
  return goal.description ? parse(goal.description) : EMPTY_META;
}

/** The prose half of `description` — the goal's "why", with the sidecar stripped. */
export function readWhy(goal: Pick<Goal, "description">): string {
  const raw = goal.description ?? "";
  const open = raw.indexOf(MARK_OPEN);
  return (open >= 0 ? raw.slice(0, open) : raw).trim();
}

function isDefaultMeta(meta: GoalMeta): boolean {
  return (
    !meta.done_looks_like &&
    meta.mode === "auto" &&
    meta.cadence === null &&
    meta.milestones.length === 0 &&
    meta.checkins.length === 0 &&
    meta.book_ids.length === 0 &&
    meta.habit_ids.length === 0
  );
}

/** Rebuild the whole `description` value. Prose first, sidecar last. */
export function composeDescription(why: string, meta: GoalMeta): string | null {
  const prose = why.trim();
  if (isDefaultMeta(meta)) return prose || null;
  const payload = JSON.stringify({
    v: 1,
    done_looks_like: meta.done_looks_like || undefined,
    mode: meta.mode === "auto" ? undefined : meta.mode,
    cadence: meta.cadence ?? undefined,
    milestones: meta.milestones.length ? meta.milestones : undefined,
    checkins: meta.checkins.length ? meta.checkins : undefined,
    book_ids: meta.book_ids.length ? meta.book_ids : undefined,
    habit_ids: meta.habit_ids.length ? meta.habit_ids : undefined,
  });
  return `${prose}${prose ? "\n\n" : ""}${MARK_OPEN}${payload}${MARK_CLOSE}`;
}

/** The `{ description }` patch that applies `changes` without losing the prose. */
export function metaPatch(goal: Goal, changes: Partial<GoalMeta>): { description: string | null } {
  const next = { ...readMeta(goal), ...changes };
  return { description: composeDescription(readWhy(goal), next) };
}

/** The `{ description }` patch that rewrites the prose without losing the sidecar. */
export function whyPatch(goal: Goal, why: string): { description: string | null } {
  return { description: composeDescription(why, readMeta(goal)) };
}

// ---------------------------------------------------------
// Milestones
// ---------------------------------------------------------
export function sortMilestones(list: Milestone[]): Milestone[] {
  return [...list].sort((a, b) => {
    const ad = a.date ?? "9999-99-99";
    const bd = b.date ?? "9999-99-99";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export function milestoneCounts(meta: GoalMeta): { done: number; total: number } {
  return { done: meta.milestones.filter((m) => m.done).length, total: meta.milestones.length };
}

/** The next milestone still ahead of the user — what the card should tease. */
export function nextMilestone(meta: GoalMeta, today = todayISO()): Milestone | null {
  const pending = sortMilestones(meta.milestones).filter((m) => !m.done);
  return pending.find((m) => m.date && m.date >= today) ?? pending[0] ?? null;
}

// ---------------------------------------------------------
// Check-ins
// ---------------------------------------------------------
/**
 * A goal with a number to move deserves to be asked about it. The rhythm a
 * horizon deserves is obvious enough that asking the user first would be
 * ceremony — they can still turn it off or change it per goal.
 */
export function defaultCadence(horizon: Horizon): CheckInCadence {
  switch (horizon) {
    case "week": return "week";
    case "month": return "week";
    case "quarter": return "fortnight";
    default: return "month";
  }
}

export function effectiveCadence(goal: Goal, meta: GoalMeta): CheckInCadence {
  if (meta.cadence) return meta.cadence;
  if (goal.target == null) return "off";
  return defaultCadence(goal.horizon);
}

export function lastCheckIn(meta: GoalMeta): CheckIn | null {
  return meta.checkins.length ? meta.checkins[meta.checkins.length - 1] : null;
}

/** The day the next check-in falls due, or null when the goal never asks. */
export function checkInDueOn(goal: Goal, meta: GoalMeta): string | null {
  const cadence = effectiveCadence(goal, meta);
  if (cadence === "off" || goal.status !== "active") return null;
  const last = lastCheckIn(meta);
  const base =
    last?.date ??
    goal.start_date ??
    (goal.created_at ? goal.created_at.slice(0, 10) : null) ??
    todayISO();
  return addDays(base, CADENCE_DAYS[cadence]);
}

export function checkInDue(goal: Goal, meta: GoalMeta, today = todayISO()): boolean {
  const due = checkInDueOn(goal, meta);
  return due != null && due <= today;
}

/** How overdue the ask is, in days. Negative means it is not due yet. */
export function checkInLateBy(goal: Goal, meta: GoalMeta, today = todayISO()): number | null {
  const due = checkInDueOn(goal, meta);
  return due == null ? null : diffDays(today, due);
}

// ---------------------------------------------------------
// Definition — a goal without these two is a wish
// ---------------------------------------------------------
export function isDefined(goal: Goal, meta: GoalMeta): boolean {
  return readWhy(goal).length > 0 && meta.done_looks_like.trim().length > 0;
}
