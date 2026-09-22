"use client";

import * as React from "react";

// =========================================================
// Recently opened, and pinned.
//
// Both live in localStorage rather than Supabase, for the same reason saved
// views do: they are a property of how this browser is being used, they must
// survive a reload with no round trip, and no table has a column to hang them
// on. Reads go through useSyncExternalStore so a second tab stays in step.
//
// Only ids are stored. Labels are resolved from the store at render time, so
// renaming a book renames it here too, and a deleted one simply stops being
// listed rather than lingering as a dead row.
// =========================================================

export type RecentKind = "task" | "book" | "media" | "project" | "goal";

export interface Ref {
  kind: RecentKind;
  id: string;
}

interface Snapshot {
  recent: Ref[];
  pinned: Ref[];
}

const KEY = "humoyun.recents.v1";
const LIMIT = 12;
const EMPTY: Snapshot = { recent: [], pinned: [] };

let cache: Snapshot = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

const KINDS: RecentKind[] = ["task", "book", "media", "project", "goal"];

function sanitise(raw: unknown): Snapshot {
  if (!raw || typeof raw !== "object") return EMPTY;
  const obj = raw as Partial<Snapshot>;
  const list = (input: unknown): Ref[] => {
    if (!Array.isArray(input)) return [];
    const out: Ref[] = [];
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const r = item as Partial<Ref>;
      if (typeof r.id !== "string" || !r.id) continue;
      if (!KINDS.includes(r.kind as RecentKind)) continue;
      out.push({ kind: r.kind as RecentKind, id: r.id });
    }
    return out;
  };
  return { recent: list(obj.recent).slice(0, LIMIT), pinned: list(obj.pinned).slice(0, LIMIT) };
}

function load(): Snapshot {
  if (loaded) return cache;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? sanitise(JSON.parse(raw)) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function save(next: Snapshot) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const same = (a: Ref, b: Ref) => a.kind === b.kind && a.id === b.id;

/** Note that something was opened. Cheap enough to call on every open. */
export function recordOpen(kind: RecentKind, id: string) {
  if (typeof window === "undefined" || !id) return;
  const snap = load();
  const ref: Ref = { kind, id };
  // Already at the front? Then nothing changed, and re-saving would wake
  // every subscriber for no reason.
  if (snap.recent[0] && same(snap.recent[0], ref)) return;
  save({
    ...snap,
    recent: [ref, ...snap.recent.filter((r) => !same(r, ref))].slice(0, LIMIT),
  });
}

export function togglePin(kind: RecentKind, id: string) {
  const snap = load();
  const ref: Ref = { kind, id };
  const has = snap.pinned.some((r) => same(r, ref));
  save({
    ...snap,
    pinned: has ? snap.pinned.filter((r) => !same(r, ref)) : [ref, ...snap.pinned].slice(0, LIMIT),
  });
}

export function forget(kind: RecentKind, id: string) {
  const snap = load();
  const ref: Ref = { kind, id };
  save({
    recent: snap.recent.filter((r) => !same(r, ref)),
    pinned: snap.pinned.filter((r) => !same(r, ref)),
  });
}

/** The server renders neither list — there is no localStorage there. */
const serverSnapshot = () => EMPTY;

export function useRecents(): Snapshot {
  return React.useSyncExternalStore(subscribe, load, serverSnapshot);
}

export function useIsPinned(kind: RecentKind, id: string): boolean {
  const { pinned } = useRecents();
  return pinned.some((r) => same(r, { kind, id }));
}
