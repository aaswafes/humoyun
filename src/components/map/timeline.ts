// =========================================================
// Timeline mode — the layout that turns a mind map into a
// chronology. Dated nodes get a computed x from their date
// and a packed lane for y; undated nodes go to the tray.
// =========================================================

import {
  addDays, addMonths, diffDays, monthName, startOfMonth, todayISO, yearOf,
} from "@/lib/date";
import type { MapNode } from "@/lib/types";
import { sizeOf, type Pos } from "./geometry";

/** World px per day. A month lands at ~480px — two months fit on screen at 1×. */
export const PX_PER_DAY = 16;
const LANE_GAP = 26;
const COLUMN_GAP = 20;
const TOP = 56;

export interface MonthMark {
  iso: string;
  x: number;
  label: string;
  year: number;
  /** first month of its year — the ruler prints the year here */
  yearStart: boolean;
}

export interface TimelineLayout {
  positions: Map<string, Pos>;
  dated: MapNode[];
  undated: MapNode[];
  origin: string;
  months: MonthMark[];
  todayX: number;
  /** vertical extent of the packed lanes, for the gridline height */
  height: number;
  x0: number;
  x1: number;
}

export function xForDate(origin: string, iso: string): number {
  return diffDays(iso, origin) * PX_PER_DAY;
}

export function dateForX(origin: string, x: number): string {
  return addDays(origin, Math.round(x / PX_PER_DAY));
}

export function timelineLayout(nodes: MapNode[]): TimelineLayout {
  const dated = nodes.filter((n) => !!n.date).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const undated = nodes.filter((n) => !n.date);
  const today = todayISO();

  const first = dated[0]?.date ?? today;
  const last = dated[dated.length - 1]?.date ?? today;
  const origin = startOfMonth(first < today ? first : today);
  const end = addMonths(startOfMonth(last > today ? last : today), 1);

  // Lane packing: a node claims [left, right]; it drops into the first lane
  // whose last claim has already ended.
  const laneEnds: number[] = [];
  const laneHeights: number[] = [];
  const assigned: { node: MapNode; x: number; lane: number; h: number }[] = [];

  for (const node of dated) {
    const { w, h } = sizeOf(node);
    const cx = xForDate(origin, node.date as string);
    const x = cx - w / 2;
    const left = x - COLUMN_GAP;
    const right = x + w + COLUMN_GAP;

    let lane = laneEnds.findIndex((e) => e <= left);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(right); laneHeights.push(h); }
    else { laneEnds[lane] = right; laneHeights[lane] = Math.max(laneHeights[lane], h); }

    assigned.push({ node, x, lane, h });
  }

  const laneY: number[] = [];
  let cursor = TOP;
  laneHeights.forEach((h) => { laneY.push(cursor); cursor += h + LANE_GAP; });

  const positions = new Map<string, Pos>();
  assigned.forEach(({ node, x, lane, h }) => {
    // Nodes shorter than their lane sit on the lane's baseline so rows read straight.
    positions.set(node.id, { x, y: (laneY[lane] ?? TOP) + (laneHeights[lane] - h) / 2 });
  });

  const months: MonthMark[] = [];
  let m = origin;
  let guard = 0;
  while (m <= end && guard++ < 600) {
    const year = yearOf(m);
    months.push({
      iso: m,
      x: xForDate(origin, m),
      label: monthName(m, true),
      year,
      yearStart: m.slice(5, 7) === "01" || months.length === 0,
    });
    m = addMonths(m, 1);
  }

  return {
    positions,
    dated,
    undated,
    origin,
    months,
    todayX: xForDate(origin, today),
    height: Math.max(cursor - LANE_GAP + 40, 320),
    x0: 0,
    x1: xForDate(origin, end),
  };
}
