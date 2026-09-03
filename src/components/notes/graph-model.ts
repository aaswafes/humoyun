import type { Note, Tint } from "@/lib/types";
import type { CategoryIndex } from "./category-model";
import { notePlain } from "./note-model";
import { outgoingLinks } from "./rich-text";

// =========================================================
// The graph.
//
// Islands, not a hairball. Every note is pulled hard towards the hub of the
// category or tag it belongs to and pushed away from everything else, so the
// picture that falls out is a set of clusters with satellites around them —
// which is the only arrangement of a few hundred notes a person can actually
// read. A plain force layout over the same data draws one grey cloud.
//
// Three kinds of edge, and they are not the same thing:
//   member  a note sits on a shelf. Short, strong, drawn faint.
//   link    the note points at another with [[…]]. Long, weak, drawn solid.
//   tag     the two share a tag nothing else shares. Weakest, drawn dotted.
// =========================================================

export type GroupBy = "category" | "tag" | "kind";

export const UNFILED = "__unfiled";

export interface GraphNode {
  id: string;
  label: string;
  kind: "note" | "hub";
  group: string;
  tint: Tint;
  x: number;
  y: number;
  r: number;
  /** how many edges touch it — what makes a well-connected note draw bigger */
  degree: number;
}

export interface GraphLink {
  a: string;
  b: string;
  kind: "member" | "link" | "tag";
}

export interface GraphCluster {
  key: string;
  label: string;
  tint: Tint;
  count: number;
}

/**
 * The soft shape drawn behind an island.
 *
 * A halo is what makes "divided by category" legible at a glance: without one
 * the eye has to infer the grouping from edge density, which is exactly the
 * work the picture was supposed to do for you.
 */
export interface Halo {
  key: string;
  label: string;
  tint: Tint;
  cx: number;
  cy: number;
  r: number;
  count: number;
}

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
  clusters: GraphCluster[];
  halos: Halo[];
  byId: Map<string, GraphNode>;
  /** who touches whom, for the hover highlight */
  neighbours: Map<string, Set<string>>;
  bounds: { x: number; y: number; w: number; h: number };
}

// ---------------------------------------------------------
// A deterministic scatter
//
// The layout must be the same every render or the graph would twitch each
// time a note is edited somewhere else. Math.random is therefore banned here;
// this is seeded, and the seed never changes.
// ---------------------------------------------------------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function labelOf(note: Note): string {
  const title = note.title?.trim();
  if (title) return title;
  const first = notePlain(note).split("\n").find((l) => l.trim());
  return first?.trim().slice(0, 60) || "Untitled";
}

/** Which cluster a note calls home. The first answer wins; the rest are edges. */
function groupsOf(note: Note, by: GroupBy): string[] {
  if (by === "category") return note.categories.filter((c) => c.trim());
  if (by === "tag") return note.tags.filter((t) => t.trim());
  return [note.kind];
}

// ---------------------------------------------------------
// Building
// ---------------------------------------------------------

export interface GraphOptions {
  by: GroupBy;
  index: CategoryIndex;
  /** cluster keys the legend has switched off */
  hidden: Set<string>;
  /** hub nodes make the islands obvious; turning them off draws notes only */
  showHubs: boolean;
}

const ITERATIONS = 220;
// Tight enough that an island reads as one thing at the zoom the graph opens
// at. Pushed further apart, every note is a dot you cannot read the name of.
const HUB_RING = 360;

export function buildGraph(notes: Note[], opts: GraphOptions): Graph {
  const { by, index, hidden, showHubs } = opts;

  // ---- clusters ----
  const members = new Map<string, Note[]>();
  const primary = new Map<string, string>();

  for (const note of notes) {
    const groups = groupsOf(note, by);
    const home = groups[0] ?? UNFILED;
    primary.set(note.id, home);
    for (const g of groups.length ? groups : [UNFILED]) {
      const list = members.get(g);
      if (list) list.push(note);
      else members.set(g, [note]);
    }
  }

  const clusters: GraphCluster[] = [...members.entries()]
    .map(([key, list]) => ({
      key,
      label: key === UNFILED ? "Unfiled" : key,
      tint: key === UNFILED ? ("slate" as Tint) : index.look(key).color,
      count: list.length,
    }))
    .sort((a, b) =>
      a.key === UNFILED ? 1 : b.key === UNFILED ? -1
        : b.count - a.count || a.label.localeCompare(b.label));

  const live = clusters.filter((c) => !hidden.has(c.key));
  const liveKeys = new Set(live.map((c) => c.key));

  const shown = notes.filter((note) =>
    groupsOf(note, by).some((g) => liveKeys.has(g))
    || (liveKeys.has(UNFILED) && groupsOf(note, by).length === 0));

  // ---- nodes ----
  const random = rng(0x5eed);
  const nodes: GraphNode[] = [];
  const byId = new Map<string, GraphNode>();
  const hubOf = new Map<string, string>();

  live.forEach((cluster, i) => {
    // A ring, spaced by how many clusters there are, so islands never start
    // on top of each other and the settle has an easy job.
    const angle = (i / Math.max(live.length, 1)) * Math.PI * 2;
    const radius = HUB_RING * (live.length <= 1 ? 0 : 0.5 + 0.5 * Math.min(1, live.length / 8));
    const hub: GraphNode = {
      id: `hub:${cluster.key}`,
      label: cluster.label,
      kind: "hub",
      group: cluster.key,
      tint: cluster.tint,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      r: 15 + Math.sqrt(cluster.count) * 3.2,
      degree: cluster.count,
    };
    hubOf.set(cluster.key, hub.id);
    if (showHubs) { nodes.push(hub); byId.set(hub.id, hub); }
  });

  for (const note of shown) {
    const home = primary.get(note.id) ?? UNFILED;
    const cluster = live.find((c) => c.key === home) ?? live[0];
    const hub = cluster ? byId.get(hubOf.get(cluster.key) ?? "") : undefined;
    const angle = random() * Math.PI * 2;
    const spread = 70 + random() * 90;
    const node: GraphNode = {
      id: note.id,
      label: labelOf(note),
      kind: "note",
      group: cluster?.key ?? UNFILED,
      tint: note.color ?? cluster?.tint ?? "slate",
      x: (hub?.x ?? 0) + Math.cos(angle) * spread,
      y: (hub?.y ?? 0) + Math.sin(angle) * spread,
      r: 6,
      degree: 0,
    };
    nodes.push(node);
    byId.set(node.id, node);
  }

  // ---- links ----
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  const add = (a: string, b: string, kind: GraphLink["kind"]) => {
    if (a === b || !byId.has(a) || !byId.has(b)) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ a, b, kind });
  };

  for (const note of shown) {
    for (const g of groupsOf(note, by)) {
      const hubId = hubOf.get(g);
      if (hubId && liveKeys.has(g)) add(note.id, hubId, "member");
    }
    if (!groupsOf(note, by).length) {
      const hubId = hubOf.get(UNFILED);
      if (hubId) add(note.id, hubId, "member");
    }
  }

  const byTitle = new Map<string, string>();
  for (const note of notes) {
    const title = note.title?.trim().toLowerCase();
    if (title) byTitle.set(title, note.id);
  }
  for (const note of shown) {
    for (const target of outgoingLinks(note, byTitle)) add(note.id, target, "link");
  }

  // A tag two notes share and nothing else does is a real relation. A tag
  // twenty notes share is a category, and joining all twenty would draw a
  // blob — so the pairs are only made below that ceiling.
  if (by !== "tag") {
    const byTag = new Map<string, string[]>();
    for (const note of shown) {
      for (const tag of note.tags) {
        const list = byTag.get(tag);
        if (list) list.push(note.id);
        else byTag.set(tag, [note.id]);
      }
    }
    for (const ids of byTag.values()) {
      if (ids.length < 2 || ids.length > 6) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) add(ids[i], ids[j], "tag");
      }
    }
  }

  // ---- degree, which is what a note's size means ----
  const neighbours = new Map<string, Set<string>>();
  for (const node of nodes) neighbours.set(node.id, new Set());
  for (const link of links) {
    neighbours.get(link.a)?.add(link.b);
    neighbours.get(link.b)?.add(link.a);
    if (link.kind === "member") continue;
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (a) a.degree += 1;
    if (b) b.degree += 1;
  }
  for (const node of nodes) {
    if (node.kind === "note") node.r = 7 + Math.min(node.degree, 6) * 1.4;
  }

  settle(nodes, links, byId);
  separateLabels(nodes);

  return {
    nodes, links, clusters, byId, neighbours,
    halos: halosOf(nodes, live),
    bounds: boundsOf(nodes),
  };
}

/**
 * One blob per island, sized to hold its members.
 *
 * A cluster of one still gets a circle wide enough to read as a cluster — a
 * halo that hugged a single dot would look like a rendering mistake.
 */
function halosOf(nodes: GraphNode[], clusters: GraphCluster[]): Halo[] {
  const out: Halo[] = [];

  for (const cluster of clusters) {
    const members = nodes.filter((n) => n.group === cluster.key);
    if (!members.length) continue;

    let cx = 0;
    let cy = 0;
    for (const n of members) { cx += n.x; cy += n.y; }
    cx /= members.length;
    cy /= members.length;

    let r = 0;
    for (const n of members) r = Math.max(r, Math.hypot(n.x - cx, n.y - cy) + n.r);

    out.push({
      key: cluster.key,
      label: cluster.label,
      tint: cluster.tint,
      cx,
      cy,
      r: Math.max(r + 32, 74),
      count: cluster.count,
    });
  }

  return out;
}

// ---------------------------------------------------------
// The settle
//
// Run to completion once rather than animated frame by frame. A live
// simulation looks alive for two seconds and then costs a rAF loop forever;
// this costs one memo and never moves again unless the data does.
// ---------------------------------------------------------
function settle(nodes: GraphNode[], links: GraphLink[], byId: Map<string, GraphNode>) {
  // A note is held hard to its own hub and only loosely to anything else:
  // that difference is what makes islands instead of a mesh.
  const SPRING = { member: 0.095, link: 0.016, tag: 0.009 };
  const REST = { member: 86, link: 170, tag: 210 };

  for (let step = 0; step < ITERATIONS; step++) {
    const cool = 1 - step / ITERATIONS;

    // Repulsion. Hubs push harder so their satellites do not drift into the
    // next island.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 > 360000) continue;              // far enough to ignore
        if (d2 < 0.01) { dx = 0.1; dy = 0.1; d2 = 0.02; }
        const mass = (a.kind === "hub" ? 4 : 1) * (b.kind === "hub" ? 4 : 1);
        // Two notes push each other harder than a note pushes a hub. Islands
        // stay where they are; the titles inside them stop landing on top of
        // each other, which is the only thing that made the picture unreadable.
        const base = a.kind === "hub" || b.kind === "hub" ? 620 : 1600;
        const push = (base * mass) / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * push;
        const fy = (dy / d) * push;
        if (a.kind !== "hub") { a.x -= fx * cool; a.y -= fy * cool; }
        if (b.kind !== "hub") { b.x += fx * cool; b.y += fy * cool; }
      }
    }

    // Springs.
    for (const link of links) {
      const a = byId.get(link.a);
      const b = byId.get(link.b);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const pull = ((d - REST[link.kind]) / d) * SPRING[link.kind] * cool;
      const fx = dx * pull;
      const fy = dy * pull;
      if (a.kind !== "hub") { a.x += fx; a.y += fy; }
      if (b.kind !== "hub") { b.x -= fx; b.y -= fy; }
    }
  }
}

/**
 * Stop the titles from landing on top of each other.
 *
 * A note that belongs to two categories is pulled towards both hubs and comes
 * to rest between them — which is correct, and which is why three notes filed
 * under Books *and* Islam ended up in the same spot with their names stacked.
 *
 * The dots were never the problem; the labels are. So this only pushes nodes
 * apart vertically, by the height of a line of text, and never far enough to
 * move a note out of its own island.
 */
const LABEL_W = 150;
// A line of label plus the gap that makes two of them read as two things.
const LABEL_H = 26;

function separateLabels(nodes: GraphNode[]) {
  const notes = nodes.filter((n) => n.kind === "note");

  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const a = notes[i];
        const b = notes[j];
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        if (dx > LABEL_W || dy > LABEL_H) continue;
        const push = (LABEL_H - dy) / 2 + 0.5;
        const dir = a.y <= b.y ? -1 : 1;
        a.y += push * dir;
        b.y -= push * dir;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function boundsOf(nodes: GraphNode[]) {
  if (!nodes.length) return { x: -200, y: -150, w: 400, h: 300 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x - n.r);
    y0 = Math.min(y0, n.y - n.r);
    x1 = Math.max(x1, n.x + n.r);
    y1 = Math.max(y1, n.y + n.r);
  }
  const pad = 80;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
