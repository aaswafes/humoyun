"use client";

import * as React from "react";
import {
  CalendarPlus, Maximize2, Minus, Plus, Waypoints,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, formatDate, todayISO } from "@/lib/date";
import type { Board, MapEdge, MapNode } from "@/lib/types";
import { Button, IconButton, Kbd, SectionLabel } from "@/components/ui/primitives";
import {
  boundsOf, boxOf, clamp, edgeGeometry, normalizeRect, pendingPath,
  rectsIntersect, sizeOf, type Box, type Pos, type Rect,
} from "./geometry";
import { dateForX, timelineLayout, type TimelineLayout } from "./timeline";
import { WorldLayer, type EdgePart } from "./world";
import type { NodeApi } from "./node-card";
import { KIND_META, NodeMenu, type NodeMenuState } from "./node-menu";
import { EdgeInspector } from "./edge-inspector";
import { Minimap } from "./minimap";

export interface MapControls {
  fit: () => void;
  addNode: () => void;
}

const TRAY_H = 96;
const RULER_H = 34;
const MIN_K = 0.12;
const MAX_K = 3;

interface Viewport { x: number; y: number; k: number }
interface Selection { nodes: Set<string>; edge: string | null }

type Gesture =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | { kind: "marquee"; sx: number; sy: number; additive: boolean; moved: boolean }
  | {
      kind: "drag";
      ids: string[];
      base: Map<string, Pos>;
      start: Pos;
      edges: MapEdge[];
      temp: Map<string, Pos>;
      moved: boolean;
    }
  | { kind: "link"; sourceId: string; target: string | null }
  | { kind: "tray"; nodeId: string; moved: boolean };

function isTyping(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node) return false;
  return node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable;
}

export const MapCanvas = React.forwardRef<MapControls, {
  board: Board;
  timelineMode: boolean;
  /** the first board also shows nodes that were never assigned to one */
  adoptOrphans: boolean;
}>(function MapCanvas({ board, timelineMode, adoptOrphans }, ref) {
  const allNodes = useStore((s) => s.nodes);
  const allEdges = useStore((s) => s.edges);

  const [vp, setVp] = React.useState<Viewport>({ x: 0, y: 0, k: 1 });
  const [selection, setSelection] = React.useState<Selection>({ nodes: new Set(), edge: null });
  const [editing, setEditing] = React.useState<{ id: string; field: "title" | "body" } | null>(null);
  const [menu, setMenu] = React.useState<NodeMenuState | null>(null);
  const [spacePan, setSpacePan] = React.useState(false);
  const [size, setSize] = React.useState({ w: 1200, h: 800 });

  // Selection is mirrored into a ref: a pointer sequence reads it several times
  // before React has re-rendered, and a stale snapshot would drop nodes from a
  // shift-select or a multi-node drag.
  const selectionRef = React.useRef<Selection>(selection);
  const setSel = React.useCallback((next: Selection | ((prev: Selection) => Selection)) => {
    const value = typeof next === "function" ? next(selectionRef.current) : next;
    selectionRef.current = value;
    setSelection(value);
  }, []);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const worldRef = React.useRef<HTMLDivElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const marqueeRef = React.useRef<HTMLDivElement>(null);
  const linkRef = React.useRef<SVGPathElement | null>(null);
  const ghostRef = React.useRef<HTMLDivElement>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);

  const nodeEls = React.useRef(new Map<string, HTMLElement>()).current;
  const edgeEls = React.useRef(new Map<string, Partial<Record<EdgePart, Element>>>()).current;
  const gestureRef = React.useRef<Gesture | null>(null);
  const spaceRef = React.useRef(false);
  const pending = React.useRef(new Map<string, Pos>()).current;
  const flushRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------
  const nodes = React.useMemo(
    () => allNodes.filter((n) => n.board_id === board.id || (adoptOrphans && n.board_id === null)),
    [allNodes, board.id, adoptOrphans],
  );
  const nodeIds = React.useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = React.useMemo(
    () => allEdges.filter((e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id)),
    [allEdges, nodeIds],
  );

  const tl: TimelineLayout | null = React.useMemo(
    () => (timelineMode ? timelineLayout(nodes) : null),
    [timelineMode, nodes],
  );

  const boxes = React.useMemo(() => {
    const m = new Map<string, Box>();
    for (const n of nodes) {
      const p = tl ? tl.positions.get(n.id) : { x: n.x, y: n.y };
      if (p) m.set(n.id, boxOf(n, p));
    }
    return m;
  }, [nodes, tl]);

  const visible = React.useMemo(() => nodes.filter((n) => boxes.has(n.id)), [nodes, boxes]);

  /** Everything the imperative handlers need, without making them re-bind. */
  const S = React.useRef({ nodes, edges, boxes, tl, selection, vp, timelineMode, board, editing });
  S.current = { nodes, edges, boxes, tl, selection: selectionRef.current, vp, timelineMode, board, editing };

  // ---------------------------------------------------------
  // Coordinates
  // ---------------------------------------------------------
  const screenToWorld = React.useCallback((clientX: number, clientY: number): Pos => {
    const r = containerRef.current?.getBoundingClientRect();
    const { x, y, k } = S.current.vp;
    return { x: ((clientX - (r?.left ?? 0)) - x) / k, y: ((clientY - (r?.top ?? 0)) - y) / k };
  }, []);

  const localOf = React.useCallback((clientX: number, clientY: number) => {
    const r = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  }, []);

  const zoomAt = React.useCallback((clientX: number, clientY: number, factor: number) => {
    const r = containerRef.current?.getBoundingClientRect();
    setVp((v) => {
      const k = clamp(v.k * factor, MIN_K, MAX_K);
      const ratio = k / v.k;
      const px = clientX - (r?.left ?? 0);
      const py = clientY - (r?.top ?? 0);
      return { k, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
    });
  }, []);

  const fit = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const inset = S.current.timelineMode ? TRAY_H + RULER_H : 0;
    const cw = el.clientWidth;
    const ch = el.clientHeight - inset;
    const b = boundsOf(S.current.boxes.values());
    if (!b) { setVp({ x: cw / 2, y: ch / 2, k: 1 }); return; }
    const pad = 72;
    const k = clamp(Math.min((cw - pad * 2) / b.w, (ch - pad * 2) / b.h), MIN_K, 1.25);
    setVp({
      k,
      x: (cw - b.w * k) / 2 - b.x * k,
      y: (ch - b.h * k) / 2 - b.y * k + (S.current.timelineMode ? RULER_H : 0),
    });
  }, []);

  const centerOnWorld = React.useCallback((w: Pos) => {
    const el = containerRef.current;
    if (!el) return;
    const ch = el.clientHeight - (S.current.timelineMode ? TRAY_H : 0);
    setVp((v) => ({ ...v, x: el.clientWidth / 2 - w.x * v.k, y: ch / 2 - w.y * v.k }));
  }, []);

  // Refit whenever the board or the layout model changes — the old viewport
  // means nothing once every node has moved.
  React.useLayoutEffect(() => { fit(); }, [board.id, timelineMode, fit]);

  // ---------------------------------------------------------
  // Imperative redraw helpers (drag path — never touches React)
  // ---------------------------------------------------------
  const boxWith = React.useCallback((id: string, overrides: Map<string, Pos>): Box | null => {
    const node = S.current.nodes.find((n) => n.id === id);
    if (!node) return null;
    const p = overrides.get(id) ?? S.current.boxes.get(id);
    if (!p) return null;
    return boxOf(node, p);
  }, []);

  const redrawEdges = React.useCallback((list: MapEdge[], overrides: Map<string, Pos>) => {
    for (const e of list) {
      const a = boxWith(e.source_id, overrides);
      const b = boxWith(e.target_id, overrides);
      if (!a || !b) continue;
      const g = edgeGeometry(a, b);
      const parts = edgeEls.get(e.id);
      parts?.line?.setAttribute("d", g.d);
      parts?.hit?.setAttribute("d", g.d);
      parts?.head?.setAttribute("d", g.head);
      const label = parts?.label as HTMLElement | undefined;
      if (label) label.style.transform = `translate(${g.mid.x}px, ${g.mid.y}px) translate(-50%, -50%)`;
    }
  }, [boxWith, edgeEls]);

  const edgesTouching = React.useCallback((ids: Iterable<string>) => {
    const set = new Set(ids);
    return S.current.edges.filter((e) => set.has(e.source_id) || set.has(e.target_id));
  }, []);

  const flushPending = React.useCallback(() => {
    if (!pending.size) return;
    const { patch } = useStore.getState();
    pending.forEach((p, id) => patch("nodes", id, { x: Math.round(p.x), y: Math.round(p.y) }));
    pending.clear();
  }, [pending]);

  const schedulePendingFlush = React.useCallback(() => {
    if (flushRef.current) clearTimeout(flushRef.current);
    flushRef.current = setTimeout(flushPending, 260);
  }, [flushPending]);

  React.useEffect(() => () => {
    if (flushRef.current) clearTimeout(flushRef.current);
    flushPending();
  }, [flushPending]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------
  const createNode = React.useCallback((world: Pos, extra: Partial<MapNode> = {}) => {
    const { insert } = useStore.getState();
    const { board: b, timelineMode: tlMode, tl: layout } = S.current;
    const node = insert("nodes", {
      board_id: b.id,
      title: "",
      x: Math.round(world.x - 110),
      y: Math.round(world.y - 60),
      color: b.color,
      date: tlMode && layout ? dateForX(layout.origin, world.x) : null,
      ...extra,
    });
    setSel({ nodes: new Set([node.id]), edge: null });
    setEditing({ id: node.id, field: "title" });
    return node;
  }, [setSel]);

  const deleteSelection = React.useCallback(() => {
    const { remove, removeWhere, toast } = useStore.getState();
    const sel = S.current.selection;
    if (sel.edge) {
      remove("edges", sel.edge);
      setSel((s) => ({ ...s, edge: null }));
      return;
    }
    const ids = new Set(sel.nodes);
    if (!ids.size) return;
    removeWhere("edges", (e) => ids.has(e.source_id) || ids.has(e.target_id));
    ids.forEach((id) => remove("nodes", id));
    setSel({ nodes: new Set(), edge: null });
    toast({ title: ids.size > 1 ? `${ids.size} nodes deleted` : "Node deleted" });
  }, [setSel]);

  /** Keyboard route to an edge: select nodes in order, press L. */
  const linkSelection = React.useCallback(() => {
    const { insert, toast } = useStore.getState();
    const ids = [...S.current.selection.nodes];
    if (ids.length < 2) return;
    let made = 0;
    for (let i = 0; i < ids.length - 1; i++) {
      const [a, b] = [ids[i], ids[i + 1]];
      const exists = S.current.edges.some(
        (e) => (e.source_id === a && e.target_id === b) || (e.source_id === b && e.target_id === a),
      );
      if (exists) continue;
      insert("edges", {
        board_id: S.current.board.id,
        source_id: a,
        target_id: b,
        color: S.current.nodes.find((n) => n.id === a)?.color ?? "slate",
      });
      made++;
    }
    toast(made
      ? { title: made > 1 ? `${made} links created` : "Linked", tone: "success" }
      : { title: "Those are already linked" });
  }, []);

  // ---------------------------------------------------------
  // Node gestures
  // ---------------------------------------------------------
  const startNodeDrag = React.useCallback((clientX: number, clientY: number, ids: string[]) => {
    const base = new Map<string, Pos>();
    ids.forEach((id) => {
      const b = S.current.boxes.get(id);
      if (b) base.set(id, { x: b.x, y: b.y });
    });
    if (!base.size) return;

    const g: Gesture = {
      kind: "drag",
      ids: [...base.keys()],
      base,
      start: screenToWorld(clientX, clientY),
      edges: edgesTouching(base.keys()),
      temp: new Map(),
      moved: false,
    };
    gestureRef.current = g;

    const move = (ev: PointerEvent) => {
      const p = screenToWorld(ev.clientX, ev.clientY);
      const dx = p.x - g.start.x;
      const dy = S.current.timelineMode ? 0 : p.y - g.start.y;
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
      g.moved = true;

      for (const id of g.ids) {
        const b = g.base.get(id) as Pos;
        const np = { x: b.x + dx, y: b.y + dy };
        g.temp.set(id, np);
        const el = nodeEls.get(id);
        if (el) el.style.transform = `translate(${np.x}px, ${np.y}px)`;
      }
      redrawEdges(g.edges, g.temp);

      const layout = S.current.tl;
      const preview = previewRef.current;
      if (layout && preview) {
        const node = S.current.nodes.find((n) => n.id === g.ids[0]);
        const p0 = g.temp.get(g.ids[0]);
        if (node && p0) {
          const iso = dateForX(layout.origin, p0.x + sizeOf(node).w / 2);
          const local = localOf(ev.clientX, ev.clientY);
          preview.style.display = "";
          preview.style.transform = `translate(${local.x}px, ${local.y - 34}px) translate(-50%, 0)`;
          preview.textContent = formatDate(iso, { year: true });
        }
      }
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      gestureRef.current = null;
      if (previewRef.current) previewRef.current.style.display = "none";
      if (!g.moved) return;

      const { patch } = useStore.getState();
      const layout = S.current.tl;
      for (const id of g.ids) {
        const p = g.temp.get(id);
        if (!p) continue;
        if (layout) {
          const node = S.current.nodes.find((n) => n.id === id);
          if (node) patch("nodes", id, { date: dateForX(layout.origin, p.x + sizeOf(node).w / 2) });
        } else {
          patch("nodes", id, { x: Math.round(p.x), y: Math.round(p.y) });
        }
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [screenToWorld, localOf, edgesTouching, redrawEdges, nodeEls]);

  // ---------------------------------------------------------
  // Stable API handed to every node
  // ---------------------------------------------------------
  const api = React.useMemo<NodeApi>(() => ({
    pointerDown(e, id) {
      if (e.button !== 0 || spaceRef.current) return;
      e.stopPropagation();
      containerRef.current?.focus();

      const sel = S.current.selection;
      let ids: string[];
      if (e.shiftKey) {
        const next = new Set(sel.nodes);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSel({ nodes: next, edge: null });
        ids = [...next];
      } else if (sel.nodes.has(id)) {
        ids = [...sel.nodes];
        if (sel.edge) setSel({ nodes: sel.nodes, edge: null });
      } else {
        ids = [id];
        setSel({ nodes: new Set([id]), edge: null });
      }
      if (S.current.editing?.id === id) return;
      startNodeDrag(e.clientX, e.clientY, ids);
    },

    contextMenu(e, id) {
      e.preventDefault();
      e.stopPropagation();
      const sel = S.current.selection;
      const ids = sel.nodes.has(id) ? [...sel.nodes] : [id];
      if (!sel.nodes.has(id)) setSel({ nodes: new Set([id]), edge: null });
      setMenu({ ids, x: e.clientX, y: e.clientY, page: "main" });
    },

    openMenu(e, id, page = "main") {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const sel = S.current.selection;
      const ids = sel.nodes.has(id) ? [...sel.nodes] : [id];
      if (!sel.nodes.has(id)) setSel({ nodes: new Set([id]), edge: null });
      setMenu({ ids, x: rect.left, y: rect.bottom + 6, page });
    },

    startLink(e, id) {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      containerRef.current?.focus();
      const g: Gesture = { kind: "link", sourceId: id, target: null };
      gestureRef.current = g;
      const path = linkRef.current;
      if (path) path.style.display = "";

      const move = (ev: PointerEvent) => {
        const src = S.current.boxes.get(g.sourceId);
        if (!src || !path) return;
        path.setAttribute("d", pendingPath(src, screenToWorld(ev.clientX, ev.clientY)));

        const host = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)
          ?.closest("[data-node-id]") as HTMLElement | null;
        const found = host?.dataset.nodeId ?? null;
        const next = found && found !== g.sourceId && S.current.boxes.has(found) ? found : null;
        if (next !== g.target) {
          if (g.target) nodeEls.get(g.target)?.removeAttribute("data-link-target");
          if (next) nodeEls.get(next)?.setAttribute("data-link-target", "true");
          g.target = next;
        }
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        gestureRef.current = null;
        if (path) { path.style.display = "none"; path.setAttribute("d", ""); }
        if (g.target) nodeEls.get(g.target)?.removeAttribute("data-link-target");
        if (!g.target) return;

        const { insert, toast } = useStore.getState();
        const exists = S.current.edges.some(
          (edge) =>
            (edge.source_id === g.sourceId && edge.target_id === g.target) ||
            (edge.source_id === g.target && edge.target_id === g.sourceId),
        );
        if (exists) { toast({ title: "Those two are already linked" }); return; }
        const source = S.current.nodes.find((n) => n.id === g.sourceId);
        const edge = insert("edges", {
          board_id: S.current.board.id,
          source_id: g.sourceId,
          target_id: g.target,
          color: source?.color ?? "slate",
        });
        setSel({ nodes: new Set(), edge: edge.id });
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },

    focusNode(id) {
      if (!S.current.selection.nodes.has(id)) setSel({ nodes: new Set([id]), edge: null });
    },

    edit(id, field) {
      setSel({ nodes: new Set([id]), edge: null });
      setEditing({ id, field });
    },

    commit(id, field, value) {
      const { patch } = useStore.getState();
      const node = S.current.nodes.find((n) => n.id === id);
      setEditing(null);
      if (!node) return;
      if (field === "title") {
        const next = value.trim();
        if (next !== node.title) patch("nodes", id, { title: next });
      } else {
        const next = value.trim();
        if (next !== (node.body ?? "")) patch("nodes", id, { body: next || null });
      }
    },

    cancelEdit() { setEditing(null); },
  }), [screenToWorld, startNodeDrag, nodeEls, setSel]);

  const registerNode = React.useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodeEls.set(id, el); else nodeEls.delete(id);
  }, [nodeEls]);

  const registerEdge = React.useCallback((id: string, part: EdgePart, el: Element | null) => {
    const entry = edgeEls.get(id) ?? {};
    if (el) { entry[part] = el; edgeEls.set(id, entry); }
    else { delete entry[part]; if (!Object.keys(entry).length) edgeEls.delete(id); }
  }, [edgeEls]);

  const selectEdge = React.useCallback((id: string) => {
    containerRef.current?.focus();
    setSel({ nodes: new Set(), edge: id });
    setMenu(null);
  }, [setSel]);

  const onEdgeDown = React.useCallback((e: React.PointerEvent<SVGPathElement>, id: string) => {
    e.stopPropagation();
    selectEdge(id);
  }, [selectEdge]);

  // ---------------------------------------------------------
  // Canvas gestures
  // ---------------------------------------------------------
  const startPan = React.useCallback((clientX: number, clientY: number) => {
    const g: Gesture = { kind: "pan", sx: clientX, sy: clientY, vx: S.current.vp.x, vy: S.current.vp.y };
    gestureRef.current = g;
    const move = (ev: PointerEvent) => {
      setVp((v) => ({ ...v, x: g.vx + (ev.clientX - g.sx), y: g.vy + (ev.clientY - g.sy) }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      gestureRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  const startMarquee = React.useCallback((clientX: number, clientY: number, additive: boolean) => {
    const start = localOf(clientX, clientY);
    const g: Gesture = { kind: "marquee", sx: start.x, sy: start.y, additive, moved: false };
    gestureRef.current = g;
    const before = new Set(S.current.selection.nodes);

    const move = (ev: PointerEvent) => {
      const p = localOf(ev.clientX, ev.clientY);
      if (!g.moved && Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) < 4) return;
      g.moved = true;
      const box = marqueeRef.current;
      if (box) {
        const r = normalizeRect(g.sx, g.sy, p.x, p.y);
        box.style.display = "";
        box.style.transform = `translate(${r.x}px, ${r.y}px)`;
        box.style.width = `${r.w}px`;
        box.style.height = `${r.h}px`;
      }
      const a = screenToWorld(clientX, clientY);
      const b = screenToWorld(ev.clientX, ev.clientY);
      const world = normalizeRect(a.x, a.y, b.x, b.y);
      const hit = new Set(g.additive ? before : []);
      S.current.boxes.forEach((box2, id) => { if (rectsIntersect(world, box2 as Rect)) hit.add(id); });
      // only publish real changes — a marquee fires 60×/s and every write
      // re-renders every node and edge
      const current = S.current.selection.nodes;
      if (hit.size === current.size && [...hit].every((id) => current.has(id))) return;
      setSel({ nodes: hit, edge: null });
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      gestureRef.current = null;
      if (marqueeRef.current) marqueeRef.current.style.display = "none";
      if (!g.moved && !additive) setSel({ nodes: new Set(), edge: null });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [localOf, screenToWorld, setSel]);

  function onCanvasPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    setMenu(null);
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      containerRef.current?.focus();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    containerRef.current?.focus();
    startMarquee(e.clientX, e.clientY, e.shiftKey);
  }

  // Wheel has to be a native non-passive listener to be able to cancel the page zoom.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // floating chrome (tray, minimap, HUD) keeps its own scrolling
      if ((e.target as HTMLElement | null)?.closest?.("[data-no-zoom]")) return;
      e.preventDefault();
      if (e.shiftKey && !e.ctrlKey) {
        setVp((v) => ({ ...v, x: v.x - (e.deltaY || e.deltaX) }));
        return;
      }
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Space turns the pointer into a hand, the way every canvas app works.
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target) || spaceRef.current) return;
      spaceRef.current = true;
      setSpacePan(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      spaceRef.current = false;
      setSpacePan(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ---------------------------------------------------------
  // Keyboard — scoped to the canvas so global hotkeys stay out of the way
  // ---------------------------------------------------------
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (isTyping(e.target)) return;
    const sel = S.current.selection;
    const mod = e.metaKey || e.ctrlKey;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };

    if (e.key === "Escape") {
      stop();
      if (menu) setMenu(null);
      else setSel({ nodes: new Set(), edge: null });
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") { stop(); deleteSelection(); return; }
    if (e.key === "Enter" && sel.nodes.size === 1) {
      stop();
      setEditing({ id: [...sel.nodes][0], field: "title" });
      return;
    }
    if (!mod && e.key.toLowerCase() === "l" && sel.nodes.size > 1) {
      stop();
      linkSelection();
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      stop();
      setSel({ nodes: new Set(S.current.boxes.keys()), edge: null });
      return;
    }
    if (e.code === "Digit1" && e.shiftKey) { stop(); fit(); return; }
    if (e.code === "Digit0" && e.shiftKey) {
      stop();
      const el = containerRef.current;
      if (el) zoomAt(el.getBoundingClientRect().left + el.clientWidth / 2, el.getBoundingClientRect().top + el.clientHeight / 2, 1 / S.current.vp.k);
      return;
    }
    if (e.key.startsWith("Arrow")) {
      if (!sel.nodes.size) return;
      stop();
      const step = e.shiftKey ? 1 : 8;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;

      if (S.current.timelineMode) {
        if (!dx) return;
        const { patch } = useStore.getState();
        sel.nodes.forEach((id) => {
          const n = S.current.nodes.find((x) => x.id === id);
          if (n?.date) patch("nodes", id, { date: addDays(n.date, Math.sign(dx)) });
        });
        return;
      }

      sel.nodes.forEach((id) => {
        const cur = pending.get(id) ?? S.current.boxes.get(id);
        if (!cur) return;
        const np = { x: cur.x + dx, y: cur.y + dy };
        pending.set(id, np);
        const el = nodeEls.get(id);
        if (el) el.style.transform = `translate(${np.x}px, ${np.y}px)`;
      });
      redrawEdges(edgesTouching(sel.nodes), pending);
      schedulePendingFlush();
    }
  }

  // ---------------------------------------------------------
  // Tray drag (timeline mode) — drop an undated node onto the axis
  // ---------------------------------------------------------
  const startTrayDrag = React.useCallback((e: React.PointerEvent<HTMLElement>, node: MapNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const g: Gesture = { kind: "tray", nodeId: node.id, moved: false };
    gestureRef.current = g;
    const ghost = ghostRef.current;
    if (ghost) ghost.textContent = node.title || "Untitled";

    const move = (ev: PointerEvent) => {
      g.moved = true;
      if (ghost) {
        ghost.style.display = "";
        ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px) translate(-50%, -140%)`;
      }
    };

    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      gestureRef.current = null;
      if (ghost) ghost.style.display = "none";
      const rect = containerRef.current?.getBoundingClientRect();
      const layout = S.current.tl;
      if (!g.moved || !rect || !layout) return;
      if (ev.clientY > rect.bottom - TRAY_H) return;   // dropped back in the tray
      const world = screenToWorld(ev.clientX, ev.clientY);
      useStore.getState().patch("nodes", node.id, { date: dateForX(layout.origin, world.x) });
      setSel({ nodes: new Set([node.id]), edge: null });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [screenToWorld, setSel]);

  // ---------------------------------------------------------
  React.useImperativeHandle(ref, () => ({
    fit,
    addNode() {
      const el = containerRef.current;
      if (!el) return;
      createNode(screenToWorld(
        el.getBoundingClientRect().left + el.clientWidth / 2,
        el.getBoundingClientRect().top + (el.clientHeight - (S.current.timelineMode ? TRAY_H : 0)) / 2,
      ), S.current.timelineMode ? { date: todayISO() } : {});
    },
  }), [fit, createNode, screenToWorld]);

  // ---------------------------------------------------------
  // Render
  // ---------------------------------------------------------
  const gridStep = 24 * (vp.k < 0.4 ? 4 : vp.k < 0.8 ? 2 : 1) * vp.k;
  const selectedEdge = selection.edge ? edges.find((e) => e.id === selection.edge) ?? null : null;
  const edgeAnchor = React.useMemo(() => {
    if (!selectedEdge) return null;
    const a = boxes.get(selectedEdge.source_id);
    const b = boxes.get(selectedEdge.target_id);
    if (!a || !b) return null;
    return edgeGeometry(a, b).mid;
  }, [selectedEdge, boxes]);

  const view: Rect = React.useMemo(
    () => ({ x: -vp.x / vp.k, y: -vp.y / vp.k, w: size.w / vp.k, h: size.h / vp.k }),
    [vp, size],
  );

  const undated = tl?.undated ?? [];

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label={`${board.name} mind map`}
      onPointerDown={onCanvasPointerDown}
      onKeyDown={onKeyDown}
      onAuxClick={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={(e) => {
        if (e.target !== worldRef.current && e.target !== gridRef.current && e.target !== containerRef.current) return;
        createNode(screenToWorld(e.clientX, e.clientY));
      }}
      className={cn(
        "relative h-full w-full touch-none overflow-hidden bg-canvas outline-none",
        spacePan ? "cursor-grab" : "cursor-default",
      )}
    >
      {/* dotted grid, locked to the world by background-position */}
      <div
        ref={gridRef}
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, var(--line-strong) 1px, transparent 0)",
          backgroundSize: `${gridStep}px ${gridStep}px`,
          backgroundPosition: `${vp.x}px ${vp.y}px`,
          opacity: 0.7,
        }}
      />

      <div
        ref={worldRef}
        className="absolute inset-0 origin-top-left"
        style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.k})`, willChange: "transform" }}
      >
        <WorldLayer
          nodes={visible}
          edges={edges}
          boxes={boxes}
          selectedNodes={selection.nodes}
          selectedEdge={selection.edge}
          editing={editing}
          api={api}
          registerNode={registerNode}
          registerEdge={registerEdge}
          linkRef={linkRef}
          onEdgeDown={onEdgeDown}
          onEdgeSelect={selectEdge}
          timeline={tl}
        />
      </div>

      {/* month ruler */}
      {tl && (
        <div
          className="absolute inset-x-0 top-0 z-10 material hairline-b"
          style={{ height: RULER_H }}
          onPointerDown={(e) => { e.stopPropagation(); startPan(e.clientX, e.clientY); }}
        >
          <div className="relative h-full overflow-hidden">
            {tl.months.map((m) => {
              const sx = m.x * vp.k + vp.x;
              if (sx < -80 || sx > size.w + 40) return null;
              return (
                <div
                  key={m.iso}
                  className="absolute top-0 flex h-full items-center gap-1.5 pl-2"
                  style={{ left: sx }}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                    {m.label}
                  </span>
                  {m.yearStart && (
                    <span className="display-serif text-[13px] leading-none text-ink-2 tnum">{m.year}</span>
                  )}
                </div>
              );
            })}
            <div
              className="absolute top-1/2 h-[18px] rounded-full bg-accent px-1.5 text-[10.5px] font-semibold leading-[18px] text-accent-ink"
              style={{ left: tl.todayX * vp.k + vp.x, transform: "translate(-50%, -50%)" }}
            >
              Today
            </div>
          </div>
        </div>
      )}

      {/* marquee */}
      <div
        ref={marqueeRef}
        className="pointer-events-none absolute left-0 top-0 z-10 rounded-[4px] border border-accent bg-accent-soft"
        style={{ display: "none" }}
      />

      {/* live date readout while dragging along the axis */}
      <div
        ref={previewRef}
        className="pointer-events-none absolute left-0 top-0 z-20 rounded-md bg-ink px-2 py-1 text-[11.5px] font-medium text-canvas tnum shadow-[var(--shadow-md)]"
        style={{ display: "none" }}
      />

      {/* tray ghost */}
      <div
        ref={ghostRef}
        className="pointer-events-none fixed left-0 top-0 z-[70] max-w-[200px] truncate rounded-md border border-line bg-raised px-2 py-1 text-[12.5px] text-ink shadow-[var(--shadow-lg)]"
        style={{ display: "none" }}
      />

      {selectedEdge && edgeAnchor && (
        <EdgeInspector
          key={selectedEdge.id}
          edge={selectedEdge}
          x={edgeAnchor.x * vp.k + vp.x}
          y={edgeAnchor.y * vp.k + vp.y}
          placement={edgeAnchor.y * vp.k + vp.y < 190 ? "below" : "above"}
          onClose={() => setSel((s) => ({ ...s, edge: null }))}
        />
      )}

      {/* zoom HUD */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        data-no-zoom
        className="absolute left-3 z-20 flex items-center gap-0.5 rounded-lg border border-line p-0.5 material shadow-[var(--shadow-md)]"
        style={{ bottom: (tl ? TRAY_H : 0) + 12 }}
      >
        <IconButton
          label="Zoom out"
          size="sm"
          onClick={() => {
            const el = containerRef.current;
            if (el) { const r = el.getBoundingClientRect(); zoomAt(r.left + el.clientWidth / 2, r.top + el.clientHeight / 2, 1 / 1.25); }
          }}
        >
          <Minus />
        </IconButton>
        <span className="w-11 text-center text-[11.5px] font-medium text-ink-2 tnum">
          {Math.round(vp.k * 100)}%
        </span>
        <IconButton
          label="Zoom in"
          size="sm"
          onClick={() => {
            const el = containerRef.current;
            if (el) { const r = el.getBoundingClientRect(); zoomAt(r.left + el.clientWidth / 2, r.top + el.clientHeight / 2, 1.25); }
          }}
        >
          <Plus />
        </IconButton>
        <div className="mx-0.5 h-4 w-px bg-line" />
        <IconButton label="Fit to content" size="sm" onClick={fit}>
          <Maximize2 />
        </IconButton>
      </div>

      {/* minimap */}
      {visible.length > 0 && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          data-no-zoom
          className="absolute right-3 z-20"
          style={{ bottom: (tl ? TRAY_H : 0) + 12 }}
        >
          <Minimap
            nodes={visible}
            boxes={boxes}
            view={view}
            onCenter={centerOnWorld}
          />
        </div>
      )}

      {/* undated tray */}
      {tl && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          data-no-zoom
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1.5 px-3 py-2.5 material hairline-t"
          style={{ height: TRAY_H }}
        >
          <div className="flex items-baseline gap-2">
            <SectionLabel>Undated</SectionLabel>
            <span className="text-[11px] text-ink-4 tnum">{undated.length}</span>
            <span className="truncate text-[11.5px] text-ink-4">
              {undated.length ? "Drag one onto the timeline to date it" : "Every node on this board sits on the timeline"}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 items-start gap-1.5 overflow-x-auto no-scrollbar">
            {undated.map((n) => {
              const Icon = KIND_META[n.kind].icon;
              return (
                <button
                  key={n.id}
                  onPointerDown={(e) => startTrayDrag(e, n)}
                  onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setSel({ nodes: new Set([n.id]), edge: null });
                    setMenu({ ids: [n.id], x: r.left, y: r.top - 8, page: "date" });
                  }}
                  className={cn(
                    `tint-${n.color}`,
                    "group/chip flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line bg-raised px-2.5",
                    "max-w-[200px] cursor-grab text-[12.5px] text-ink transition-[transform,background-color] duration-150",
                    "hover:bg-hover active:scale-[0.97] active:cursor-grabbing",
                  )}
                >
                  <Icon className="size-3 shrink-0 text-[var(--tint)]" />
                  <span className="truncate">{n.title || "Untitled"}</span>
                  <CalendarPlus className="size-3 shrink-0 text-ink-4 opacity-0 transition-opacity group-hover/chip:opacity-100" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* first-run */}
      {!nodes.length && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto max-w-[380px] text-center"
          >
            <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-hover text-ink-3">
              <Waypoints className="size-5" />
            </div>
            <p className="display-serif text-[32px] leading-tight text-ink">A blank canvas</p>
            <p className="mx-auto mt-1.5 max-w-[36ch] text-[13px] leading-relaxed text-ink-3">
              Double-click anywhere to drop an idea, drag from a node&rsquo;s edge to link it to
              another, and give any node a date to put it on the timeline.
            </p>
            <p className="mx-auto mt-2 max-w-[36ch] text-[12px] leading-relaxed text-ink-4">
              Space or middle-drag pans · scroll zooms · two nodes selected + <Kbd>L</Kbd> links them
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={() => {
                const el = containerRef.current;
                if (!el) return;
                const r = el.getBoundingClientRect();
                createNode(screenToWorld(r.left + el.clientWidth / 2, r.top + el.clientHeight / 2));
              }}
            >
              <Plus className="size-3.5" />
              Add your first node
            </Button>
          </div>
        </div>
      )}

      {menu && (
        <NodeMenu
          state={menu}
          onClose={() => setMenu(null)}
          onPage={(page) => setMenu((m) => (m ? { ...m, page } : m))}
        />
      )}
    </div>
  );
});
