"use client";

import * as React from "react";
import { Eye, Maximize2, Network, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Note } from "@/lib/types";
import { IconButton, Segmented } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import type { CategoryIndex } from "./category-model";
import { CategoryIcon } from "./category-picker";
import { useStickyChoice } from "./note-fields";
import { UNFILED, buildGraph, type GraphNode, type GroupBy } from "./graph-model";

// =========================================================
// The graph.
//
// Islands, not a hairball. Each cluster sits inside a soft halo in its own
// tint, so "divided by category" is something you see rather than something
// you work out from edge density. The legend is a multiselect: switching a
// cluster off takes its notes out of the layout entirely, so the rest of the
// picture spreads into the space instead of leaving a hole.
//
// Everything sizes itself off a ResizeObserver rather than a fixed height —
// the sidebar collapses, the window changes, and the drawing has to keep
// filling whatever it is given.
// =========================================================

const GROUPS: readonly GroupBy[] = ["category", "tag", "kind"];

const GROUP_OPTIONS = [
  { value: "category" as const, label: "Categories", title: "One island per category" },
  { value: "tag" as const, label: "Tags", title: "One island per tag" },
  { value: "kind" as const, label: "Kinds", title: "One island per kind of note" },
];

/** Below this zoom a note's title is unreadable anyway, so it is not drawn. */
const LABEL_ZOOM = 0.68;

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.5;

interface View { x: number; y: number; k: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function GraphView({
  notes, index, matches, onOpen, className,
}: {
  notes: Note[];
  index: CategoryIndex;
  /** ids that survive the page's search, or null when nothing is typed */
  matches: Set<string> | null;
  onOpen: (id: string) => void;
  className?: string;
}) {
  const [by, setBy] = useStickyChoice<GroupBy>("humoyun.notes.graph.by", "category", GROUPS);
  const [hidden, setHidden] = React.useState<Set<string>>(() => new Set());
  const [hover, setHover] = React.useState<string | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });

  const hostRef = React.useRef<HTMLDivElement>(null);
  const pan = React.useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [panning, setPanning] = React.useState(false);

  const graph = React.useMemo(
    () => buildGraph(notes, { by, index, hidden, showHubs: true }),
    [notes, by, index, hidden]);

  // ---- the drawing always fills whatever it is given ----
  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        w: Math.round(entry.contentRect.width),
        h: Math.round(entry.contentRect.height),
      });
    });
    observer.observe(host);
    const box = host.getBoundingClientRect();
    setSize({ w: Math.round(box.width), h: Math.round(box.height) });
    return () => observer.disconnect();
  }, []);

  /**
   * The view is derived, not stored.
   *
   * A graph nobody has touched is always the fitted one, so a cluster switched
   * off re-frames itself with no effect to run and nothing to get out of sync.
   * Panning or zooming records a view against the shape it was made for; the
   * moment that shape changes, the fitted view takes over again.
   */
  const auto = React.useMemo<View>(() => {
    const b = graph.bounds;
    if (!size.w || !size.h || !b.w || !b.h) return { x: 0, y: 0, k: 1 };
    const k = clamp(Math.min(size.w / b.w, size.h / b.h), MIN_ZOOM, 1.5);
    return {
      k,
      x: size.w / 2 - (b.x + b.w / 2) * k,
      y: size.h / 2 - (b.y + b.h / 2) * k,
    };
  }, [graph.bounds, size.w, size.h]);

  const shape = React.useMemo(
    () => `${by}|${[...hidden].sort().join(",")}`, [by, hidden]);
  const [manual, setManual] = React.useState<{ shape: string; view: View } | null>(null);
  const view = manual?.shape === shape ? manual.view : auto;

  const setView = React.useCallback((next: View | ((v: View) => View)) => {
    setManual((cur) => {
      const base = cur?.shape === shape ? cur.view : auto;
      return { shape, view: typeof next === "function" ? next(base) : next };
    });
  }, [shape, auto]);

  const fit = React.useCallback(() => setManual(null), []);

  const zoomBy = (factor: number) => {
    setView((v) => {
      const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
      const scale = k / v.k;
      return {
        k,
        x: size.w / 2 - (size.w / 2 - v.x) * scale,
        y: size.h / 2 - (size.h / 2 - v.y) * scale,
      };
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    const box = hostRef.current?.getBoundingClientRect();
    if (!box) return;
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    setView((v) => {
      const k = clamp(v.k * Math.exp(-e.deltaY * 0.0016), MIN_ZOOM, MAX_ZOOM);
      const scale = k / v.k;
      return { k, x: px - (px - v.x) * scale, y: py - (py - v.y) * scale };
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    setPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pan.current;
    if (!p) return;
    setView((v) => ({ ...v, x: p.vx + (e.clientX - p.x), y: p.vy + (e.clientY - p.y) }));
  };

  const endPan = () => { pan.current = null; setPanning(false); };

  // ---- what is lit ----
  const near = hover ? graph.neighbours.get(hover) : null;
  const lit = React.useCallback((id: string) => {
    if (hover) return id === hover || !!near?.has(id);
    if (matches) return matches.has(id) || id.startsWith("hub:");
    return true;
  }, [hover, near, matches]);

  const toggleCluster = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const only = (key: string) => {
    const others = graph.clusters.filter((c) => c.key !== key).map((c) => c.key);
    // Pressing "only" on the one cluster already alone means "show me the rest".
    setHidden(hidden.size === others.length ? new Set() : new Set(others));
  };

  const shownNotes = graph.nodes.filter((n) => n.kind === "note").length;
  const summaryId = "hm-graph-summary";
  const anyHidden = hidden.size > 0;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<GroupBy> size="sm" value={by} onChange={setBy} options={GROUP_OPTIONS} />

        <span className="hidden text-[11.5px] text-ink-4 tnum sm:inline">
          {shownNotes} {shownNotes === 1 ? "note" : "notes"} · {graph.links.length} links
        </span>

        <div className="ml-auto flex items-center gap-1">
          {anyHidden && (
            <IconButton label="Show every cluster" onClick={() => setHidden(new Set())}>
              <RotateCcw />
            </IconButton>
          )}
          <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.3)}><ZoomOut /></IconButton>
          <span className="w-10 text-center text-[11.5px] text-ink-4 tnum">
            {Math.round(view.k * 100)}%
          </span>
          <IconButton label="Zoom in" onClick={() => zoomBy(1.3)}><ZoomIn /></IconButton>
          <IconButton label="Fit the whole graph" onClick={fit}><Maximize2 /></IconButton>
        </div>
      </div>

      {/* Under lg the legend is a scrolling strip of chips. A 190px rail on a
          narrow screen takes a third of the drawing and gives back a list. */}
      <ul className="-mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-0.5 lg:hidden">
        {graph.clusters.map((cluster) => {
          const off = hidden.has(cluster.key);
          const look = cluster.key === UNFILED ? null : index.look(cluster.key);
          return (
            <li key={cluster.key} className="shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={!off}
                onClick={() => toggleCluster(cluster.key)}
                className={cn(
                  `tint-${cluster.tint}`,
                  "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[12px]",
                  "transition-opacity duration-150",
                  off && "opacity-40",
                )}
                style={{ background: "var(--tint-soft)", color: "var(--tint-ink)" }}
              >
                {cluster.key === UNFILED
                  ? <Network className="size-3" aria-hidden />
                  : <CategoryIcon name={look?.icon ?? null} className="size-3" />}
                <span className="max-w-[120px] truncate">{cluster.label}</span>
                <span className="tnum opacity-60">{cluster.count}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex min-h-0 flex-1 gap-3">
        <div
          ref={hostRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onPointerLeave={() => { endPan(); setHover(null); }}
          className={cn(
            "relative min-h-[380px] flex-1 touch-none overflow-hidden rounded-xl border border-line",
            "bg-[radial-gradient(circle_at_50%_35%,var(--hover),transparent_70%)] bg-sunken",
            panning ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <VisuallyHidden id={summaryId}>
            {`A graph of ${shownNotes} notes in ${graph.halos.length} clusters, grouped by ${by}. `
              + "Every note is also listed in the Cards and List views."}
          </VisuallyHidden>

          <svg
            role="img"
            aria-describedby={summaryId}
            aria-label={`Notes grouped by ${by}`}
            width={size.w || 1}
            height={size.h || 1}
            className="block"
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {/* Islands first, behind everything. */}
              {graph.halos.map((halo) => (
                <g key={halo.key} className={`tint-${halo.tint}`} aria-hidden>
                  <circle
                    cx={halo.cx}
                    cy={halo.cy}
                    r={halo.r}
                    fill="var(--tint-soft)"
                    opacity={hover ? 0.4 : 0.85}
                    style={{ transition: "opacity 200ms" }}
                  />
                  <circle
                    cx={halo.cx}
                    cy={halo.cy}
                    r={halo.r}
                    fill="none"
                    stroke="var(--tint)"
                    strokeWidth={1 / Math.max(view.k, 0.4)}
                    strokeDasharray="4 7"
                    opacity={0.35}
                  />
                </g>
              ))}

              {graph.links.map((link, i) => {
                const a = graph.byId.get(link.a);
                const b = graph.byId.get(link.b);
                if (!a || !b) return null;
                const on = lit(link.a) && lit(link.b);
                const member = link.kind === "member";
                return (
                  <line
                    key={i}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={member ? "var(--line-strong)" : "var(--accent)"}
                    strokeWidth={(member ? 1 : 1.6) / Math.max(view.k, 0.5)}
                    strokeLinecap="round"
                    strokeDasharray={link.kind === "tag" ? "2 6" : undefined}
                    opacity={on ? (member ? 0.34 : 0.6) : 0.05}
                    style={{ transition: "opacity 200ms" }}
                  />
                );
              })}

              {graph.nodes.map((node) => (
                <GraphDot
                  key={node.id}
                  node={node}
                  lit={lit(node.id)}
                  zoom={view.k}
                  icon={node.kind === "hub" && node.group !== UNFILED
                    ? index.look(node.group).icon
                    : null}
                  onHover={setHover}
                  onOpen={onOpen}
                  onOnly={only}
                />
              ))}
            </g>
          </svg>

          {!shownNotes && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
              <p className="text-center text-[12.5px] text-ink-4">
                {anyHidden
                  ? "Every cluster is switched off."
                  : "Nothing to draw yet — write a note or two."}
              </p>
            </div>
          )}

          <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-ink-4">
            Drag to pan · scroll to zoom · click a note to open it
          </p>
        </div>

        <aside className="hidden w-[192px] shrink-0 overflow-y-auto lg:block">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Clusters
          </h3>

          <ul className="space-y-0.5">
            {graph.clusters.map((cluster) => {
              const off = hidden.has(cluster.key);
              const look = cluster.key === UNFILED ? null : index.look(cluster.key);
              return (
                <li key={cluster.key} className="group/row flex items-center gap-0.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!off}
                    onClick={() => toggleCluster(cluster.key)}
                    onPointerEnter={() => setHover(`hub:${cluster.key}`)}
                    onPointerLeave={() => setHover(null)}
                    className={cn(
                      `tint-${cluster.tint}`,
                      "flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left",
                      "transition-colors duration-150 hover:bg-hover",
                      off && "opacity-45",
                    )}
                  >
                    <span
                      aria-hidden
                      className="grid size-[17px] shrink-0 place-items-center rounded-[5px]"
                      style={{
                        background: off ? "transparent" : "var(--tint-soft)",
                        color: "var(--tint-ink)",
                        boxShadow: off ? "inset 0 0 0 1px var(--line-strong)" : undefined,
                      }}
                    >
                      {cluster.key === UNFILED
                        ? <Network className="size-2.5" />
                        : <CategoryIcon name={look?.icon ?? null} className="size-2.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                      {cluster.label}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-4 tnum">{cluster.count}</span>
                  </button>
                  <IconButton
                    label={`Show only ${cluster.label}`}
                    size="sm"
                    className="opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                    onClick={() => only(cluster.key)}
                  >
                    <Eye />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function GraphDot({
  node, lit, zoom, icon, onHover, onOpen, onOnly,
}: {
  node: GraphNode;
  lit: boolean;
  zoom: number;
  icon: string | null;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
  onOnly: (key: string) => void;
}) {
  const hub = node.kind === "hub";
  const showLabel = hub || zoom >= LABEL_ZOOM;
  const label = node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label;

  return (
    <g
      className={`tint-${node.tint}`}
      opacity={lit ? 1 : 0.14}
      tabIndex={0}
      role="button"
      aria-label={hub ? `Cluster ${node.label}, ${node.degree} notes` : `Note: ${node.label}`}
      style={{ cursor: "pointer", outline: "none", transition: "opacity 200ms" }}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => (hub ? onOnly(node.group) : onOpen(node.id))}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (hub) onOnly(node.group); else onOpen(node.id);
      }}
    >
      <title>{node.label}</title>

      {hub ? (
        <>
          <circle cx={node.x} cy={node.y} r={node.r} fill="var(--raised)" />
          <circle
            cx={node.x} cy={node.y} r={node.r}
            fill="var(--tint-soft)" stroke="var(--tint)" strokeWidth={2}
          />
        </>
      ) : (
        <circle
          cx={node.x}
          cy={node.y}
          r={node.r}
          fill="var(--tint)"
          // A ring in the page colour keeps a dot readable where links cross it.
          stroke="var(--sunken)"
          strokeWidth={2}
        />
      )}

      {hub && icon && (
        <g transform={`translate(${node.x - 7} ${node.y - 7})`} style={{ color: "var(--tint-ink)" }}>
          <foreignObject width={14} height={14} aria-hidden>
            <CategoryIcon name={icon} className="size-3.5" />
          </foreignObject>
        </g>
      )}

      {showLabel && (
        <text
          x={node.x}
          y={node.y + node.r + (hub ? 16 : 13)}
          textAnchor="middle"
          className="pointer-events-none select-none"
          style={{
            fontSize: hub ? 13 : 10.5,
            fontWeight: hub ? 600 : 500,
            fill: hub ? "var(--tint-ink)" : "var(--ink-2)",
            // Painting the stroke first gives the text a halo, so a label that
            // lands on a link is still readable.
            paintOrder: "stroke",
            stroke: "var(--sunken)",
            strokeWidth: 3.5,
            strokeLinejoin: "round",
          }}
        >
          {label}
        </text>
      )}
    </g>
  );
}
