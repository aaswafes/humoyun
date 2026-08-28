// =========================================================
// Timeline mode — the layout that turns a mind map into a
// chronology. Dated nodes get an x from their date and a
// packed lane for y; undated nodes go to the tray.
//
// Three rules keep it readable at any density:
//   1. every shape has one timeline size, so no node dwarfs
//      the row it sits in;
//   2. lanes are a fixed pitch, so a node can be dragged
//      between them and land somewhere exact;
//   3. the axis scales to the range the board actually
//      covers, and the ruler steps down from months to
//      quarters to years as that range grows.
// =========================================================

import {
  addDays, addMonths, diffDays, monthName, quarterOf, startOfMonth, todayISO, yearOf,
} from "@/lib/date";
import type { MapNode } from "@/lib/types";
import { clamp, type Pos, type Size } from "./geometry";

/** One lane holds one row of nodes. Fixed pitch — drag maths depends on it. */
export const LANE_H = 92;
export const LANE_GAP = 14;
export const LANE_PITCH = LANE_H + LANE_GAP;
export const TOP = 52;

/** Horizontal breathing room claimed either side of a node when packing. */
const COLUMN_GAP = 18;
/** The whole dated range aims for this much world width before clamping. */
const TARGET_WIDTH = 2600;
const MIN_PX_PER_DAY = 2.4;
const MAX_PX_PER_DAY = 30;

/** One size per shape — the fix for "one circle node is far larger than the cards". */
export function timelineSize(node: Pick<MapNode, "shape">): Size {
  switch (node.shape) {
    case "pill": return { w: 172, h: 38 };
    case "circle":
    case "diamond": return { w: 84, h: 84 };
    case "sticky": return { w: 152, h: 88 };
    default: return { w: 208, h: 88 };
  }
}

export type TickUnit = "month" | "quarter" | "year";

export interface Tick {
  iso: string;
  x: number;
  label: string;
  /** the year, printed only where it changes */
  sub: string | null;
  /** starts a year (or a quarter, at year resolution) — drawn stronger */
  major: boolean;
}

export interface TimelineLayout {
  positions: Map<string, Pos>;
  sizes: Map<string, Size>;
  /** node id → lane index, so the outline and the drag preview can name the row */
  lanes: Map<string, number>;
  laneCount: number;
  dated: MapNode[];
  undated: MapNode[];
  origin: string;
  end: string;
  pxPerDay: number;
  ticks: Tick[];
  tickUnit: TickUnit;
  todayX: number;
  /** vertical extent of the packed lanes, for the gridline height */
  height: number;
  x0: number;
  x1: number;
}

export function xForDate(origin: string, iso: string, pxPerDay: number): number {
  return diffDays(iso, origin) * pxPerDay;
}

export function dateForX(origin: string, x: number, pxPerDay: number): string {
  return addDays(origin, Math.round(x / pxPerDay));
}

export function laneTop(lane: number): number {
  return TOP + lane * LANE_PITCH;
}

/** Which lane a world-space y falls in. Allows one lane past the last, to append. */
export function laneAtY(y: number, laneCount: number): number {
  return clamp(Math.round((y - TOP) / LANE_PITCH), 0, Math.max(0, laneCount));
}

interface Claim { left: number; right: number }

function fits(lanes: Claim[][], lane: number, left: number, right: number): boolean {
  const claims = lanes[lane];
  if (!claims) return true;
  return claims.every((c) => right <= c.left || left >= c.right);
}

function claim(lanes: Claim[][], lane: number, left: number, right: number) {
  (lanes[lane] ??= []).push({ left, right });
}

function tickUnitFor(pxPerDay: number): TickUnit {
  if (pxPerDay * 30.44 >= 68) return "month";
  if (pxPerDay * 91.3 >= 68) return "quarter";
  return "year";
}

/**
 * @param laneHints node id → the lane the user parked it in. Honoured when the
 * lane is free at that date; otherwise the node falls back to normal packing,
 * which is what keeps a stale hint from ever producing an overlap.
 */
export function timelineLayout(
  nodes: MapNode[],
  laneHints: Record<string, number> = {},
): TimelineLayout {
  const dated = nodes
    .filter((n) => !!n.date)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id));
  const undated = nodes.filter((n) => !n.date);
  const today = todayISO();

  const first = dated[0]?.date ?? today;
  const last = dated[dated.length - 1]?.date ?? today;
  const origin = startOfMonth(first < today ? first : today);
  const end = addMonths(startOfMonth(last > today ? last : today), 1);

  const spanDays = Math.max(1, diffDays(end, origin));
  const pxPerDay = clamp(TARGET_WIDTH / spanDays, MIN_PX_PER_DAY, MAX_PX_PER_DAY);

  const sizes = new Map<string, Size>();
  const spans = new Map<string, { x: number; left: number; right: number; size: Size }>();
  for (const node of dated) {
    const size = timelineSize(node);
    sizes.set(node.id, size);
    const x = xForDate(origin, node.date as string, pxPerDay) - size.w / 2;
    spans.set(node.id, { x, left: x - COLUMN_GAP, right: x + size.w + COLUMN_GAP, size });
  }
  for (const node of undated) sizes.set(node.id, timelineSize(node));

  const lanes: Claim[][] = [];
  const assigned = new Map<string, number>();
  const maxLane = Math.max(0, dated.length - 1);

  // Pass 1 — anyone the user has already placed by hand keeps their row.
  for (const node of dated) {
    const hint = laneHints[node.id];
    if (hint === undefined) continue;
    const lane = clamp(Math.round(hint), 0, maxLane);
    const s = spans.get(node.id);
    if (!s || !fits(lanes, lane, s.left, s.right)) continue;
    claim(lanes, lane, s.left, s.right);
    assigned.set(node.id, lane);
  }

  // Pass 2 — everything else drops into the first row with space at that date.
  for (const node of dated) {
    if (assigned.has(node.id)) continue;
    const s = spans.get(node.id);
    if (!s) continue;
    let lane = 0;
    while (!fits(lanes, lane, s.left, s.right)) lane++;
    claim(lanes, lane, s.left, s.right);
    assigned.set(node.id, lane);
  }

  const laneCount = lanes.length;
  const positions = new Map<string, Pos>();
  assigned.forEach((lane, id) => {
    const s = spans.get(id);
    if (!s) return;
    positions.set(id, { x: s.x, y: laneTop(lane) + (LANE_H - s.size.h) / 2 });
  });

  const unit = tickUnitFor(pxPerDay);
  const ticks: Tick[] = [];
  let cursor = origin;
  let guard = 0;
  let lastYear: number | null = null;
  while (cursor <= end && guard++ < 900) {
    const month = Number(cursor.slice(5, 7));
    const year = yearOf(cursor);
    const show =
      unit === "month" ? true
        : unit === "quarter" ? (month - 1) % 3 === 0
          : month === 1;
    if (show || ticks.length === 0) {
      const label =
        unit === "month" ? monthName(cursor, true)
          : unit === "quarter" ? `Q${quarterOf(cursor)}`
            : String(year);
      ticks.push({
        iso: cursor,
        x: xForDate(origin, cursor, pxPerDay),
        label,
        sub: unit !== "year" && year !== lastYear ? String(year) : null,
        major: unit === "year" ? true : month === 1,
      });
      lastYear = year;
    }
    cursor = addMonths(cursor, 1);
  }

  return {
    positions,
    sizes,
    lanes: assigned,
    laneCount,
    dated,
    undated,
    origin,
    end,
    pxPerDay,
    ticks,
    tickUnit: unit,
    todayX: xForDate(origin, today, pxPerDay),
    height: Math.max(laneTop(Math.max(laneCount, 1)) + 24, 320),
    x0: 0,
    x1: spanDays * pxPerDay,
  };
}
