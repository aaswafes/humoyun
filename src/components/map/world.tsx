"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import type { MapEdge, MapNode } from "@/lib/types";
import { edgeGeometry, sizeOf, type Box, type Pos } from "./geometry";
import { NodeCard, type NodeApi } from "./node-card";
import type { TimelineLayout } from "./timeline";

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
  selectedNodes: Set<string>;
  selectedEdge: string | null;
  editing: { id: string; field: "title" | "body" } | null;
  api: NodeApi;
  registerNode: (id: string, el: HTMLElement | null) => void;
  registerEdge: (id: string, part: EdgePart, el: Element | null) => void;
  linkRef: React.RefObject<SVGPathElement | null>;
  onEdgeDown: (e: React.PointerEvent<SVGPathElement>, id: string) => void;
  onEdgeSelect: (id: string) => void;
  timeline: TimelineLayout | null;
}

/**
 * Everything drawn in world coordinates. Deliberately memoised: panning and
 * zooming only touch the parent's transform, so this subtree never re-renders
 * during a gesture no matter how many nodes are on the board.
 */
function WorldLayerImpl({
  nodes, edges, boxes, selectedNodes, selectedEdge, editing, api,
  registerNode, registerEdge, linkRef, onEdgeDown, onEdgeSelect, timeline,
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
      return { edge, geom: edgeGeometry(a, b) };
    })
    .filter(Boolean) as { edge: MapEdge; geom: ReturnType<typeof edgeGeometry> }[];

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
            {timeline.months.map((m) => (
              <line
                key={m.iso}
                x1={m.x} y1={0} x2={m.x} y2={timeline.height}
                stroke="var(--line)"
                strokeWidth={1}
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
              style={{ pointerEvents: "auto" }}
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

      {drawn.map(({ edge, geom }) =>
        edge.label ? (
          <div
            key={`label-${edge.id}`}
            ref={(el) => { registerEdge(edge.id, "label", el); }}
            className={cn(
              "pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-[5px] px-1.5 py-0.5",
              "text-[11px] font-medium leading-none",
              `tint-${edge.color}`,
            )}
            style={{
              transform: `translate(${geom.mid.x}px, ${geom.mid.y}px) translate(-50%, -50%)`,
              background: "var(--raised)",
              color: "var(--tint-ink)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {edge.label}
          </div>
        ) : null,
      )}

      {nodes.map((node) => {
        const pos = boxes.get(node.id) as Pos | undefined;
        if (!pos) return null;
        return (
          <NodeCard
            key={node.id}
            node={node}
            pos={pos}
            size={sizeOf(node)}
            selected={selectedNodes.has(node.id)}
            editing={editing?.id === node.id ? editing.field : null}
            api={api}
            register={registerNode}
          />
        );
      })}
    </>
  );
}

export const WorldLayer = React.memo(WorldLayerImpl);
