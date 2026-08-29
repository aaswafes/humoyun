"use client";

// =========================================================
// Board view preferences that have no column in the schema:
// how the board is coloured, which panels are open, the
// curvature of a single link, and which timeline lane a node
// was dragged into. All of it is arrangement, not content, so
// it lives on the device rather than in the row.
// =========================================================

import * as React from "react";

export type ColorBy = "tint" | "kind" | "goal";

export interface MapPrefs {
  colorBy: ColorBy;
  /** the three canvas panels — all closed at rest, all reopened from the View menu */
  outline: boolean;
  legend: boolean;
  minimap: boolean;
  /** edge id → curvature multiplier, 0 (straight) … 2 (loose arc). 1 is the default. */
  curve: Record<string, number>;
  /** node id → the timeline lane the user parked it in */
  lane: Record<string, number>;
  /** bumped when the resting state of the panels changes underneath a saved blob */
  v: number;
}

const KEY = "humoyun.map.prefs";
const VERSION = 2;

export const DEFAULT_PREFS: MapPrefs = {
  colorBy: "tint",
  outline: false,
  legend: false,
  minimap: false,
  curve: {},
  lane: {},
  v: VERSION,
};

function load(): MapPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<MapPrefs>;
    const next: MapPrefs = {
      ...DEFAULT_PREFS,
      ...parsed,
      curve: parsed.curve && typeof parsed.curve === "object" ? parsed.curve : {},
      lane: parsed.lane && typeof parsed.lane === "object" ? parsed.lane : {},
      v: VERSION,
    };
    // v1 opened the legend on every load. Panels now rest closed, so a blob
    // written before that decision gets the new resting state once — the
    // curves, lanes and colour-by it carries are real work and survive.
    if ((parsed.v ?? 1) < 2) {
      next.outline = false;
      next.legend = false;
      next.minimap = false;
    }
    return next;
  } catch {
    return DEFAULT_PREFS;
  }
}

// The app shell renders a loading gate until the store hydrates, so this module
// is only ever evaluated in the browser during a real render — reading storage
// at module scope cannot desync a server pass.
let state: MapPrefs = typeof window === "undefined" ? DEFAULT_PREFS : load();

const listeners = new Set<() => void>();

function commit(next: MapPrefs) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

export function getMapPrefs(): MapPrefs {
  return state;
}

export function setMapPrefs(changes: Partial<MapPrefs>) {
  commit({ ...state, ...changes });
}

/** `null` clears the override and falls back to the default arc. */
export function setEdgeCurve(edgeId: string, value: number | null) {
  const curve = { ...state.curve };
  if (value === null) delete curve[edgeId];
  else curve[edgeId] = value;
  commit({ ...state, curve });
}

export function setNodeLane(nodeId: string, lane: number | null) {
  const next = { ...state.lane };
  if (lane === null) delete next[nodeId];
  else next[nodeId] = lane;
  commit({ ...state, lane: next });
}

export function clearNodeLanes(ids: Iterable<string>) {
  const next = { ...state.lane };
  let touched = false;
  for (const id of ids) {
    if (id in next) { delete next[id]; touched = true; }
  }
  if (touched) commit({ ...state, lane: next });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

export function useMapPrefs(): MapPrefs {
  return React.useSyncExternalStore(subscribe, () => state, () => DEFAULT_PREFS);
}
