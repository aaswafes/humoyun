// =========================================================
// Mind map geometry — pure math shared by the canvas, the
// edge layer and the minimap. No React, no DOM.
// World units are CSS pixels at zoom 1.
// =========================================================

import type { MapNode } from "@/lib/types";

export interface Pos { x: number; y: number }
export interface Size { w: number; h: number }
export interface Box extends Pos, Size { shape: MapNode["shape"] }
export interface Rect extends Pos, Size {}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Rendered footprint. Every shape has one size rule and one pair of bounds, so
 * a circle can never end up three times the size of the cards around it.
 * Square shapes read `min(w, h)` and `resizeTo` writes both, which keeps the
 * two functions each other's inverse.
 */
export const SIZE_BOUNDS: Record<MapNode["shape"], { min: Size; max: Size }> = {
  card: { min: { w: 132, h: 64 }, max: { w: 560, h: 520 } },
  sticky: { min: { w: 120, h: 120 }, max: { w: 320, h: 320 } },
  pill: { min: { w: 120, h: 44 }, max: { w: 520, h: 44 } },
  circle: { min: { w: 104, h: 104 }, max: { w: 340, h: 340 } },
  diamond: { min: { w: 104, h: 104 }, max: { w: 340, h: 340 } },
};

const SQUARE = new Set<MapNode["shape"]>(["circle", "diamond", "sticky"]);

export function sizeOf(node: Pick<MapNode, "w" | "h" | "shape">): Size {
  const b = SIZE_BOUNDS[node.shape] ?? SIZE_BOUNDS.card;
  const w = node.w || 220;
  const h = node.h || 120;
  if (node.shape === "pill") return { w: clamp(w, b.min.w, b.max.w), h: 44 };
  if (SQUARE.has(node.shape)) {
    const s = clamp(Math.min(w, h), b.min.w, b.max.w);
    return { w: s, h: s };
  }
  return { w: clamp(w, b.min.w, b.max.w), h: clamp(h, b.min.h, b.max.h) };
}

/** What to store when a resize lands on `w`×`h`. Round-trips through `sizeOf`. */
export function resizeTo(shape: MapNode["shape"], w: number, h: number): Size {
  const b = SIZE_BOUNDS[shape] ?? SIZE_BOUNDS.card;
  if (shape === "pill") return { w: Math.round(clamp(w, b.min.w, b.max.w)), h: 44 };
  if (SQUARE.has(shape)) {
    const s = Math.round(clamp((w + h) / 2, b.min.w, b.max.w));
    return { w: s, h: s };
  }
  return {
    w: Math.round(clamp(w, b.min.w, b.max.w)),
    h: Math.round(clamp(h, b.min.h, b.max.h)),
  };
}

export function boxOf(node: MapNode, pos: Pos, size?: Size): Box {
  const { w, h } = size ?? sizeOf(node);
  return { x: pos.x, y: pos.y, w, h, shape: node.shape };
}

export function centerOf(b: Rect): Pos {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export type Side = "l" | "r" | "t" | "b";

const NORMAL: Record<Side, Pos> = {
  l: { x: -1, y: 0 }, r: { x: 1, y: 0 }, t: { x: 0, y: -1 }, b: { x: 0, y: 1 },
};

/** Where a link leaves `box` heading for `to`, and which side it exits through. */
export function anchor(box: Box, to: Pos, gap = 5): { p: Pos; side: Side } {
  const c = centerOf(box);
  const dx = to.x - c.x;
  let dy = to.y - c.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) dy = 1;

  const hw = box.w / 2;
  const hh = box.h / 2;
  const len = Math.hypot(dx, dy) || 1;

  let s: number;
  if (box.shape === "circle") {
    s = Math.min(hw, hh) / len;
  } else if (box.shape === "diamond") {
    s = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  } else {
    const sx = Math.abs(dx) < 0.001 ? Infinity : hw / Math.abs(dx);
    const sy = Math.abs(dy) < 0.001 ? Infinity : hh / Math.abs(dy);
    s = Math.min(sx, sy);
  }

  return {
    p: { x: c.x + dx * s + (dx / len) * gap, y: c.y + dy * s + (dy / len) * gap },
    side: Math.abs(dx) / hw >= Math.abs(dy) / hh ? (dx > 0 ? "r" : "l") : (dy > 0 ? "b" : "t"),
  };
}

export interface EdgeGeom {
  /** cubic bezier for the stroke */
  d: string;
  /** filled triangle sitting on the target anchor */
  head: string;
  /** midpoint of the curve — where the label and the inspector sit */
  mid: Pos;
}

function cubicAt(p0: Pos, p1: Pos, p2: Pos, p3: Pos, t: number): Pos {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** The default arc strength. `curve` scales it: 0 is a straight line, 2 loops wide. */
export const DEFAULT_CURVE = 1;
export const MAX_CURVE = 2;

/** Smooth link between two boxes, leaving and entering along the border normals. */
export function edgeGeometry(from: Box, to: Box, curve = DEFAULT_CURVE): EdgeGeom {
  const a = anchor(from, centerOf(to));
  const b = anchor(to, centerOf(from));
  const dist = Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y);
  const off = clamp(dist * 0.45, 38, 240) * clamp(curve, 0, MAX_CURVE);
  const n1 = NORMAL[a.side];
  const n2 = NORMAL[b.side];
  const c1 = { x: a.p.x + n1.x * off, y: a.p.y + n1.y * off };
  const c2 = { x: b.p.x + n2.x * off, y: b.p.y + n2.y * off };

  // Tangent at t=1 is p3 - c2, so the head always sits flush on the curve.
  // At curve 0 that vector collapses, so fall back to the chord direction.
  let vx = b.p.x - c2.x;
  let vy = b.p.y - c2.y;
  let vl = Math.hypot(vx, vy);
  if (vl < 0.5) {
    vx = b.p.x - a.p.x;
    vy = b.p.y - a.p.y;
    vl = Math.hypot(vx, vy);
  }
  vl = vl || 1;
  vx /= vl; vy /= vl;
  const L = 11, W = 4.4;
  const bx = b.p.x - vx * L;
  const by = b.p.y - vy * L;
  const px = -vy, py = vx;

  return {
    d: `M ${r1(a.p.x)} ${r1(a.p.y)} C ${r1(c1.x)} ${r1(c1.y)}, ${r1(c2.x)} ${r1(c2.y)}, ${r1(b.p.x)} ${r1(b.p.y)}`,
    head: `M ${r1(b.p.x)} ${r1(b.p.y)} L ${r1(bx + px * W)} ${r1(by + py * W)} L ${r1(bx - px * W)} ${r1(by - py * W)} Z`,
    mid: cubicAt(a.p, c1, c2, b.p, 0.5),
  };
}

/** Straight link used while the user is still dragging one out. */
export function pendingPath(from: Box, to: Pos): string {
  const a = anchor(from, to);
  const n = NORMAL[a.side];
  const dist = Math.hypot(to.x - a.p.x, to.y - a.p.y);
  const off = clamp(dist * 0.45, 24, 200);
  const c1 = { x: a.p.x + n.x * off, y: a.p.y + n.y * off };
  return `M ${r1(a.p.x)} ${r1(a.p.y)} C ${r1(c1.x)} ${r1(c1.y)}, ${r1(to.x)} ${r1(to.y)}, ${r1(to.x)} ${r1(to.y)}`;
}

export function boundsOf(rects: Iterable<Rect>): Rect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}
