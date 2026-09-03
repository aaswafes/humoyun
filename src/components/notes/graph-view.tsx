"use client";

import * as React from "react";
import { Eye, EyeOff, Maximize2, Network, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Note } from "@/lib/types";
import { Button, IconButton, Segmented } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import type { CategoryIndex } from "./category-model";
import { CategoryIcon } from "./category-picker";
import { useSticky, useStickyChoice } from "./note-fields";
import { UNFILED, buildGraph, type GraphNode, type GroupBy } from "./graph-model";

// =========================================================
// The graph.
//
// Islands with satellites, divided by whatever you are grouping by, and a
// legend that is a multiselect rather than a key: switching a cluster off
// takes its notes out of the layout, so the rest of the picture spreads into
// the space rather than sitting in a hole where a cluster used to be.
// =========================================================

const GROUPS: readonly GroupBy[] = ["category", "tag", "kind"];

const GROUP_OPTIONS = [
  { value: "category" as const, label: "Categories", title: "One island per category" },
  { value: "tag" as const, label: "Tags", title: "One island per tag" },
  { value: "kind" as const, label: "Kinds", title: "One island per kind of note" },
];

/** Below this zoom a note's title is unreadable anyway, so it is not drawn. */
const LABEL_ZOOM = 0.5;

/**
 * The graph never opens further out than this.
 *
 * Fitting a wide board into the panel is the right instinct until it zooms
 * past the point where a note has a readable name — at which point the picture
 * is a scatter of dots and the user has to zoom in before it says anything.
 * Better to open readable and let them pan.
 */
const MIN_FIT = 0.55;

const LINK_STYLE = {
  member: { width: 1, opacity: 0.3, dash: undefined as string | undefined },
  link: { width: 1.6, opacity: 0.75, dash: undefined as string | undefined },
  tag: { width: 1, opacity: 0.45, dash: "2 5" },
};

interface View { x: number; y: number; k: number }

export function GraphView({
  notes, index, matches, onOpen, className,
}: {
  /** already filtered by the toolbar — the graph draws what the page shows */
  notes: Note[];
  index: CategoryIndex;
  /** ids that survive the page's search, or null when nothing is typed */
  matches: Set<string> | null;
  onOpen: (id: string) => void;
  className?: string;
}) {
  const [by, setBy] = useStickyChoice<GroupBy>("humoyun.notes.graph.by", "category", GROUPS);
  const [showHubs, setShowHubs] = useSticky("humoyun.notes.graph.hubs", true);
  const [hidden, setHidden] = React.useState<Set<string>>(() => new Set());
  const [hover, setHover] = React.useState<string | null>(null);
  const [view, setView] = React.useState<View>({ x: 0, y: 0, k: 1 });

  const hostRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  // The cursor is the one thing about a drag that render needs to know, so it
  // is state; the coordinates stay in the ref where they belong.
  const [panning, setPanning] = React.useState(false);

  const graph = React.useMemo(
    () => buildGraph(notes, { by, index, hidden, showHubs }),
    [notes, by, index, hidden, showHubs]);

  // ---- fitting ----
  const fit = React.useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const { width, height } = host.getBoundingClientRect();
    const b = graph.bounds;
    if (!width || !height || !b.w || !b.h) return;
    const k = clamp(Math.min(width / b.w, height / b.h), MIN_FIT, 1.6);
    setView({
      k,
      x: width / 2 - (b.x + b.w / 2) * k,
      y: height / 2 - (b.y + b.h / 2) * k,
    });
  }, [graph.bounds]);

  // Refit whenever the shape of the graph changes — a cluster switched off
  // leaves the drawing a different size, and staying at the old zoom would
  // strand it off screen.
  React.useEffect(() => { fit(); }, [fit]);

  const zoomBy = (factor: number) => {
    const host = hostRef.current;
    if (!host) return;
    const { width, height } = host.getBoundingClientRect();
    setView((v) => {
      const k = clamp(v.k * factor, 0.12, 4);
      const scale = k / v.k;
      return { k, x: width / 2 - (width / 2 - v.x) * scale, y: height / 2 - (height / 2 - v.y) * scale };
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    const host = hostRef.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    setView((v) => {
      const k = clamp(v.k * Math.exp(-e.deltaY * 0.0016), 0.12, 4);
      const scale = k / v.k;
      return { k, x: px - (px - v.x) * scale, y: py - (py - v.y) * scale };
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    setPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }));
  };

  const endDrag = () => { drag.current = null; setPanning(false); };

  // ---- what is lit ----
  const near = hover ? graph.neighbours.get(hover) : null;
  const lit = (id: string) => {
    if (hover) return id === hover || !!near?.has(id);
    if (matches) return matches.has(id) || id.startsWith("hub:");
    return true;
  };

  const toggleCluster = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const only = (key: string) => {
    setHidden(new Set(graph.clusters.filter((c) => c.key !== key).map((c) => c.key)));
  };

  const summaryId = "hm-graph-summary";
  const shownNotes = graph.nodes.filter((n) => n.kind === "note").length;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<GroupBy> size="sm" value={by} onChange={setBy} options={GROUP_OPTIONS} />

        <span className="text-[11.5px] text-ink-4 tnum">
          {shownNotes} {shownNotes === 1 ? "note" : "notes"} · {graph.links.length} links
        </span>

        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label={showHubs ? "Hide the cluster hubs" : "Show the cluster hubs"}
            aria-pressed={showHubs}
            active={showHubs}
            onClick={() => setShowHubs(!showHubs)}
          >
            <Network />
          </IconButton>
          <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.25)}><ZoomOut /></IconButton>
          <IconButton label="Zoom in" onClick={() => zoomBy(1.25)}><ZoomIn /></IconButton>
          <IconButton label="Fit the whole graph" onClick={fit}><Maximize2 /></IconButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div
          ref={hostRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => { endDrag(); setHover(null); }}
          className={cn(
            "relative min-h-[420px] flex-1 touch-none overflow-hidden rounded-lg border border-line bg-sunken",
            panning ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <VisuallyHidden id={summaryId}>
            {`A graph of ${shownNotes} notes in ${graph.clusters.length - hidden.size} clusters, `
              + `grouped by ${by}. Every note is also listed in the Cards and List views.`}
          </VisuallyHidden>

          <svg
            role="img"
            aria-describedby={summaryId}
            aria-label={`Notes grouped by ${by}`}
            className="size-full"
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {graph.links.map((link, i) => {
                const a = graph.byId.get(link.a);
                const b = graph.byId.get(link.b);
                if (!a || !b) return null;
                const style = LINK_STYLE[link.kind];
                const on = lit(link.a) && lit(link.b);
                return (
                  <line
                    key={i}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={link.kind === "member" ? "var(--line-strong)" : "var(--ink-4)"}
                    strokeWidth={style.width / Math.max(view.k, 0.5)}
                    strokeDasharray={style.dash}
                    opacity={on ? style.opacity : 0.06}
                  />
                );
              })}

              {graph.nodes.map((node) => (
                <GraphDot
                  key={node.id}
                  node={node}
                  lit={lit(node.id)}
                  zoom={view.k}
                  onHover={setHover}
                  onOpen={onOpen}
                  onOnly={only}
                />
              ))}
            </g>
          </svg>

          {!shownNotes && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <p className="text-[12.5px] text-ink-4">
                Every cluster is switched off.
              </p>
            </div>
          )}
        </div>

        <aside className="hidden w-[188px] shrink-0 overflow-y-auto lg:block">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Clusters
            </h3>
            {hidden.size > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setHidden(new Set())}>
                Show all
              </Button>
            )}
          </div>

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
                    className={cn(
                      `tint-${cluster.tint}`,
                      "flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left",
                      "transition-colors duration-150 hover:bg-hover",
                      off && "opacity-45",
                    )}
                  >
                    <span
                      aria-hidden
                      className="grid size-[16px] shrink-0 place-items-center rounded-[5px]"
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
                    {off ? <EyeOff /> : <Eye />}
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
  node, lit, zoom, onHover, onOpen, onOnly,
}: {
  node: GraphNode;
  lit: boolean;
  zoom: number;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
  onOnly: (key: string) => void;
}) {
  const hub = node.kind === "hub";
  const label = hub || zoom >= LABEL_ZOOM;

  return (
    <g
      className={`tint-${node.tint}`}
      opacity={lit ? 1 : 0.16}
      tabIndex={0}
      role="button"
      aria-label={hub ? `Cluster ${node.label}, ${node.degree} notes` : `Note: ${node.label}`}
      style={{ cursor: "pointer", outline: "none" }}
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
      <circle
        cx={node.x}
        cy={node.y}
        r={node.r}
        fill={hub ? "var(--tint-soft)" : "var(--tint)"}
        stroke="var(--tint)"
        strokeWidth={hub ? 2 : 0}
      />
      {label && (
        <text
          x={node.x}
          y={node.y + node.r + (hub ? 15 : 12)}
          textAnchor="middle"
          className="pointer-events-none select-none"
          style={{
            fontSize: hub ? 13 : 10.5,
            fontWeight: hub ? 600 : 500,
            fill: hub ? "var(--tint-ink)" : "var(--ink-2)",
            paintOrder: "stroke",
            stroke: "var(--sunken)",
            strokeWidth: 3,
            strokeLinejoin: "round",
          }}
        >
          {node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label}
        </text>
      )}
    </g>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
