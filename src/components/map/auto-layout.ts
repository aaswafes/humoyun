// =========================================================
// Auto-layout for the free canvas. Three arrangements, all
// pure: they hand back the positions and the caller decides
// what to do with them, which is what makes "undo" a matter
// of writing the old map back.
// =========================================================

import type { MapEdge, MapNode } from "@/lib/types";
import { sizeOf, type Pos, type Size } from "./geometry";

export type LayoutKind = "tree" | "radial" | "grid";

export const LAYOUT_LABELS: Record<LayoutKind, string> = {
  tree: "Tidy tree",
  radial: "Radial",
  grid: "Grid",
};

const H_GAP = 88;
const V_GAP = 28;
const RING = 230;

interface Forest {
  roots: string[];
  children: Map<string, string[]>;
  depth: Map<string, number>;
}

/**
 * Directed edges make the hierarchy; the first parent to reach a node wins, so
 * a cycle or a diamond becomes a tree instead of an infinite walk.
 */
function forestOf(nodes: MapNode[], edges: MapEdge[]): Forest {
  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  nodes.forEach((n) => { out.set(n.id, []); indeg.set(n.id, 0); });

  for (const e of edges) {
    if (!ids.has(e.source_id) || !ids.has(e.target_id) || e.source_id === e.target_id) continue;
    out.get(e.source_id)?.push(e.target_id);
    indeg.set(e.target_id, (indeg.get(e.target_id) ?? 0) + 1);
  }

  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const byOrder = (a: string, b: string) => (order.get(a) ?? 0) - (order.get(b) ?? 0);

  const roots = nodes
    .filter((n) => (indeg.get(n.id) ?? 0) === 0)
    .map((n) => n.id)
    .sort(byOrder);

  const children = new Map<string, string[]>();
  const depth = new Map<string, number>();
  const seen = new Set<string>();
  const queue: string[] = [];

  const seed = (id: string, d: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    depth.set(id, d);
    children.set(id, []);
    queue.push(id);
  };

  roots.forEach((id) => seed(id, 0));

  // Anything left over is inside a cycle — promote the first one and keep going.
  let head = 0;
  const all = nodes.map((n) => n.id);
  for (;;) {
    while (head < queue.length) {
      const id = queue[head++];
      const d = depth.get(id) ?? 0;
      for (const child of [...(out.get(id) ?? [])].sort(byOrder)) {
        if (seen.has(child)) continue;
        seed(child, d + 1);
        children.get(id)?.push(child);
      }
    }
    const orphan = all.find((id) => !seen.has(id));
    if (!orphan) break;
    roots.push(orphan);
    seed(orphan, 0);
  }

  return { roots, children, depth };
}

function tidyTree(nodes: MapNode[], edges: MapEdge[], sizes: Map<string, Size>): Map<string, Pos> {
  const { roots, children, depth } = forestOf(nodes, edges);
  const pos = new Map<string, Pos>();

  // Column x is the widest node in each depth, so long titles never collide.
  const widest = new Map<number, number>();
  nodes.forEach((n) => {
    const d = depth.get(n.id) ?? 0;
    widest.set(d, Math.max(widest.get(d) ?? 0, sizes.get(n.id)?.w ?? 220));
  });
  const colX: number[] = [];
  let x = 0;
  for (let d = 0; d <= Math.max(0, ...widest.keys()); d++) {
    colX[d] = x;
    x += (widest.get(d) ?? 220) + H_GAP;
  }

  let cursor = 0;

  const place = (id: string): number => {
    const kids = children.get(id) ?? [];
    const d = depth.get(id) ?? 0;
    const size = sizes.get(id) ?? { w: 220, h: 120 };
    let centre: number;
    if (!kids.length) {
      centre = cursor + size.h / 2;
      cursor += size.h + V_GAP;
    } else {
      const centres = kids.map(place);
      centre = (centres[0] + centres[centres.length - 1]) / 2;
    }
    pos.set(id, { x: colX[d] ?? 0, y: Math.round(centre - size.h / 2) });
    return centre;
  };

  roots.forEach((root) => {
    place(root);
    // a blank row between separate trees so the forest reads as a forest
    cursor += V_GAP * 1.5;
  });

  return pos;
}

function radial(nodes: MapNode[], edges: MapEdge[], sizes: Map<string, Size>): Map<string, Pos> {
  const { roots, children, depth } = forestOf(nodes, edges);
  const pos = new Map<string, Pos>();
  const memo = new Map<string, number>();

  const leafCount = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const kids = children.get(id) ?? [];
    const value = kids.length ? kids.reduce((s, k) => s + leafCount(k), 0) : 1;
    memo.set(id, value);
    return value;
  };

  const total = roots.reduce((s, r) => s + leafCount(r), 0) || 1;
  let angle = -Math.PI / 2;

  const place = (id: string, from: number, to: number) => {
    const d = depth.get(id) ?? 0;
    const mid = (from + to) / 2;
    const r = d * RING;
    const size = sizes.get(id) ?? { w: 220, h: 120 };
    pos.set(id, {
      x: Math.round(Math.cos(mid) * r - size.w / 2),
      y: Math.round(Math.sin(mid) * r - size.h / 2),
    });
    const kids = children.get(id) ?? [];
    if (!kids.length) return;
    const span = to - from;
    const leaves = leafCount(id) || 1;
    let cursor = from;
    for (const kid of kids) {
      const share = (leafCount(kid) / leaves) * span;
      place(kid, cursor, cursor + share);
      cursor += share;
    }
  };

  if (roots.length === 1) {
    place(roots[0], 0, Math.PI * 2);
  } else {
    for (const root of roots) {
      const share = (leafCount(root) / total) * Math.PI * 2;
      place(root, angle, angle + share);
      angle += share;
    }
  }

  return pos;
}

function grid(nodes: MapNode[], sizes: Map<string, Size>): Map<string, Pos> {
  const pos = new Map<string, Pos>();
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const cellW = Math.max(...nodes.map((n) => sizes.get(n.id)?.w ?? 220), 160) + H_GAP / 2;
  const cellH = Math.max(...nodes.map((n) => sizes.get(n.id)?.h ?? 120), 100) + V_GAP;
  const sorted = [...nodes].sort(
    (a, b) => a.kind.localeCompare(b.kind) || (a.title || "").localeCompare(b.title || ""),
  );
  sorted.forEach((n, i) => {
    const size = sizes.get(n.id) ?? { w: 220, h: 120 };
    pos.set(n.id, {
      x: Math.round((i % cols) * cellW + (cellW - size.w) / 2),
      y: Math.round(Math.floor(i / cols) * cellH),
    });
  });
  return pos;
}

/** Positions are top-left corners in world units, normalised to start near 0,0. */
export function autoLayout(kind: LayoutKind, nodes: MapNode[], edges: MapEdge[]): Map<string, Pos> {
  if (!nodes.length) return new Map();
  const sizes = new Map(nodes.map((n) => [n.id, sizeOf(n)] as const));
  const raw =
    kind === "tree" ? tidyTree(nodes, edges, sizes)
      : kind === "radial" ? radial(nodes, edges, sizes)
        : grid(nodes, sizes);

  let minX = Infinity;
  let minY = Infinity;
  raw.forEach((p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); });
  if (!Number.isFinite(minX)) return raw;

  const out = new Map<string, Pos>();
  raw.forEach((p, id) => out.set(id, { x: Math.round(p.x - minX), y: Math.round(p.y - minY) }));
  return out;
}
