"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import type { MapEdge, MapNode, Tint } from "@/lib/types";
import { edgeGeometry, sizeOf, type Box, type Pos, type Size } from "./geometry";
import { NodeCard, type NodeApi } from "./node-card";
import { LANE_H, laneTop, type TimelineLayout } from "./timeline";

export type EdgePart = "line" | "head" | "hit" | "label";

const DASH: Record<MapEdge["style"], string | undefined> = {
  solid: undefined,
  dashed: "8 6",
  dotted: "0.1 6",
};

export interface WorldLayerProps {
  nodes: MapNode[];
  edges: MapEdge[];
  boxes: Map<string, Box>;
  /** rendered size per node — timeline mode overrides the stored w/h */
  sizes: Map<string, Size>;
  selectedNodes: Set<string>;
  selectedEdge: string | null;
  editing: { id: string; field: "title" | "body" } | null;
  editingEdge: string | null;
  api: NodeApi;
  registerNode: (id: string, el: HTMLElement | null) => void;
  registerEdge: (id: string, part: EdgePart, el: Element | null) => void;
  linkRef: React.RefObject<SVGPathElement | null>;
  onEdgeDown: (e: React.PointerEvent<SVGPathElement>, id: string) => void;
  onEdgeSelect: (id: string) => void;
  onEdgeLabelEdit: (id: string | null) => void;
  onEdgeLabelCommit: (id: string, value: string) => void;
  timeline: TimelineLayout | null;
  tintOf: (node: MapNode) => Tint;
  curveOf: (edgeId: string) => number;
  /** ids that survive the current search / legend filter, or null when neither is on */
  matches: Set<string> | null;
  goalLabelOf: (node: MapNode) => string | null;
}

function EdgeLabelInput({
  value, onCommit, onCancel,
}: {
  value: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const cancelled = React.useRef(false);

  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      defaultValue={value}
      aria-label="Link label"
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => { if (!cancelled.current) onCommit(e.target.value); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") { cancelled.current = true; onCancel(); }
        if (e.key === "Enter") onCommit(e.currentTarget.value);
      }}
      className="h-[22px] w-[140px] rounded-[5px] border border-accent bg-raised px-1.5 text-[11px] font-medium text-ink outline-none"
    />
  );
}

/**
 * Everything drawn in world coordinates. Deliberately memoised: panning and
 * zooming only touch the parent's transform, so this subtree never re-renders
 * during a gesture no matter how many nodes are on the board.
 */
function WorldLayerImpl({
  nodes, edges, boxes, sizes, selectedNodes, selectedEdge, editing, editingEdge, api,
  registerNode, registerEdge, linkRef, onEdgeDown, onEdgeSelect, onEdgeLabelEdit,
  onEdgeLabelCommit, timeline, tintOf, curveOf, matches, goalLabelOf,
}: WorldLayerProps) {
  const titleOf = React.useMemo(() => {
    const map = new Map(nodes.map((n) => [n.id, n.title || "Untitled"]));
    return (id: string) => map.get(id) ?? "a removed note";
  }, [nodes]);

  const drawn = edges
    .map((edge) => {
      const a = boxes.get(edge.source_id);
      const b = boxes.get(edge.target_id);
      if (!a || !b) return null;
      return { edge, geom: edgeGeometry(a, b, curveOf(edge.id)) };
    })
    .filter(Boolean) as { edge: MapEdge; geom: ReturnType<typeof edgeGeometry> }[];

  const dim = (id: string) => !!matches && !matches.has(id);

  return (
    <>
      <svg
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        width={1}
        height={1}
        role="list"
        aria-label={`${drawn.length} connections`}
      >
        {timeline && (
          <g aria-hidden>
            {/* lane bands first — rows you can aim a node at */}
            {Array.from({ length: Math.max(timeline.laneCount, 1) }, (_, i) => (
              <rect
                key={`lane-${i}`}
                x={timeline.x0 - 40}
                y={laneTop(i)}
                width={timeline.x1 - timeline.x0 + 80}
                height={LANE_H}
                rx={10}
                fill="var(--hover)"
                opacity={i % 2 === 0 ? 0.55 : 0.25}
              />
            ))}
            {timeline.ticks.map((t) => (
              <line
                key={t.iso}
                x1={t.x} y1={0} x2={t.x} y2={timeline.height}
                stroke={t.major ? "var(--line-strong)" : "var(--line)"}
                strokeWidth={t.major ? 1.5 : 1}
              />
            ))}
            <line
              x1={timeline.todayX} y1={0} x2={timeline.todayX} y2={timeline.height}
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              opacity={0.7}
            />
          </g>
        )}

        {drawn.map(({ edge, geom }) => {
          const active = edge.id === selectedEdge;
          const faded = dim(edge.source_id) || dim(edge.target_id);
          return (
            <g
              key={edge.id}
              className={`tint-${edge.color}`}
              role="listitem"
              tabIndex={0}
              aria-current={active || undefined}
              aria-label={
                edge.label
                  ? `Connection: ${edge.label}, ${titleOf(edge.source_id)} to ${titleOf(edge.target_id)}`
                  : `Connection from ${titleOf(edge.source_id)} to ${titleOf(edge.target_id)}`
              }
              style={{ pointerEvents: "auto", opacity: faded && !active ? 0.15 : 1 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onEdgeSelect(edge.id);
                }
              }}
              onFocus={() => onEdgeSelect(edge.id)}
            >
              <title>
                {edge.label
                  ? `${edge.label}: ${titleOf(edge.source_id)} → ${titleOf(edge.target_id)}`
                  : `${titleOf(edge.source_id)} → ${titleOf(edge.target_id)}`}
              </title>
              <path
                ref={(el) => { registerEdge(edge.id, "hit", el); }}
                d={geom.d}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onPointerDown={(e) => onEdgeDown(e, edge.id)}
                onDoubleClick={(e) => { e.stopPropagation(); onEdgeLabelEdit(edge.id); }}
              />
              <path
                ref={(el) => { registerEdge(edge.id, "line", el); }}
                d={geom.d}
                fill="none"
                stroke="var(--tint)"
                strokeWidth={active ? 3.4 : 1.7}
                strokeLinecap="round"
                strokeDasharray={DASH[edge.style]}
                opacity={active ? 1 : 0.85}
              />
              <path
                ref={(el) => { registerEdge(edge.id, "head", el); }}
                d={geom.head}
                fill="var(--tint)"
                opacity={active ? 1 : 0.85}
              />
            </g>
          );
        })}

        <path
          ref={linkRef}
          d=""
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="6 5"
          style={{ display: "none" }}
        />
      </svg>

      {drawn.map(({ edge, geom }) => {
        const editingThis = editingEdge === edge.id;
        if (!edge.label && !editingThis) return null;
        const faded = dim(edge.source_id) || dim(edge.target_id);
        return (
          <div
            key={`label-${edge.id}`}
            ref={(el) => { registerEdge(edge.id, "label", el); }}
            className={cn("absolute left-0 top-0", `tint-${edge.color}`)}
            style={{
              transform: `translate(${geom.mid.x}px, ${geom.mid.y}px) translate(-50%, -50%)`,
              opacity: faded && edge.id !== selectedEdge ? 0.15 : 1,
            }}
          >
            {editingThis ? (
              <EdgeLabelInput
                value={edge.label ?? ""}
                onCommit={(v) => onEdgeLabelCommit(edge.id, v)}
                onCancel={() => onEdgeLabelEdit(null)}
              />
            ) : (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onEdgeSelect(edge.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); onEdgeLabelEdit(edge.id); }}
                aria-label={`Edit the label “${edge.label}”`}
                className={cn(
                  "cursor-pointer whitespace-nowrap rounded-[5px] px-1.5 py-1 text-[11px] font-medium leading-none",
                  "transition-transform duration-150 ease-[var(--ease-out-apple)] active:scale-[0.96]",
                )}
                style={{
                  background: "var(--raised)",
                  color: "var(--tint-ink)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {edge.label}
              </button>
            )}
          </div>
        );
      })}

      {nodes.map((node) => {
        const pos = boxes.get(node.id) as Pos | undefined;
        if (!pos) return null;
        return (
          <NodeCard
            key={node.id}
            node={node}
            pos={pos}
            size={sizes.get(node.id) ?? sizeOf(node)}
            selected={selectedNodes.has(node.id)}
            editing={editing?.id === node.id ? editing.field : null}
            api={api}
            register={registerNode}
            tint={tintOf(node)}
            dimmed={dim(node.id)}
            compact={!!timeline}
            goalLabel={goalLabelOf(node)}
          />
        );
      })}
    </>
  );
}

export const WorldLayer = React.memo(WorldLayerImpl);
