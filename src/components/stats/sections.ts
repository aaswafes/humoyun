"use client";

import * as React from "react";

// =========================================================
// Which analysis sections on the Stats page are unfolded.
// A module-level store rather than context: the fold rows and
// the headline tiles both drive it, and a tile jumping to a
// folded panel has to open it on the way.
// =========================================================

const KEY = "humoyun.stats.sections";

/** Open on a first visit. Everything else starts folded behind its summary. */
const DEFAULT_OPEN = ["panel-completion", "panel-estimates"];

type State = Readonly<Record<string, boolean>>;

const EMPTY: State = Object.freeze({});

let snapshot: State | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): State {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return EMPTY;
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return EMPTY;
  }
}

function read(): State {
  if (snapshot === null) {
    snapshot = typeof window === "undefined" ? EMPTY : parse(window.localStorage.getItem(KEY));
  }
  return snapshot;
}

/** The server never knows what was remembered, so it renders the defaults. */
function readServer(): State {
  return EMPTY;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

function commit(next: State): void {
  snapshot = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota — the fold still holds for this session.
  }
  for (const listener of listeners) listener();
}

export function isSectionOpen(state: State, id: string): boolean {
  return state[id] ?? DEFAULT_OPEN.includes(id);
}

export function useSectionState(): State {
  return React.useSyncExternalStore(subscribe, read, readServer);
}

export function toggleSection(id: string): void {
  const state = read();
  commit({ ...state, [id]: !isSectionOpen(state, id) });
}

/** Used when something off-panel — a headline tile — needs the panel open. */
export function openSection(id: string): void {
  const state = read();
  if (isSectionOpen(state, id)) return;
  commit({ ...state, [id]: true });
}
