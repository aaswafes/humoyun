"use client";

import * as React from "react";
import { ChevronRight, ListTree, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";
import type { MapEdge, MapNode, Tint } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import { KIND_META } from "./node-menu";
import { checklistStats, parseBody } from "./markdown";

interface Row {
  node: MapNode;
  depth: number;
  children: string[];
}

/**
 * Links point somewhere, so the board is already a tree if you read the arrows.
 * Roots are the nodes nothing points at; the first arrow to reach a node claims
 * it, which turns a diamond or a cycle into something you can actually list.
 */
function buildRows(nodes: MapNode[], edges: MapEdge[]): { order: Row[]; childrenOf: Map<string, string[]> } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  nodes.forEach((n) => { out.set(n.id, []); indeg.set(n.id, 0); });

  for (const e of edges) {
    if (!byId.has(e.source_id) || !byId.has(e.target_id) || e.source_id === e.target_id) continue;
    out.get(e.source_id)?.push(e.target_id);
    indeg.set(e.target_id, (indeg.get(e.target_id) ?? 0) + 1);
  }

  const rank = new Map(nodes.map((n, i) => [n.id, i]));
  const byRank = (a: string, b: string) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0);

  const childrenOf = new Map<string, string[]>();
  const seen = new Set<string>();
  const order: Row[] = [];

  const walk = (id: string, depth: number) => {
    const node = byId.get(id);
    if (!node) return;
    const kids = [...(out.get(id) ?? [])].sort(byRank).filter((k) => !seen.has(k));
    kids.forEach((k) => seen.add(k));
    childrenOf.set(id, kids);
    order.push({ node, depth, children: kids });
    kids.forEach((k) => walk(k, depth + 1));
  };

  const roots = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
  roots.forEach((n) => { if (!seen.has(n.id)) { seen.add(n.id); walk(n.id, 0); } });
  // whatever is left is inside a cycle — it still deserves a line
  nodes.forEach((n) => { if (!seen.has(n.id)) { seen.add(n.id); walk(n.id, 0); } });

  return { order, childrenOf };
}

export function OutlinePanel({
  nodes, edges, selected, matches, query, tintOf, laneOf, onFocus, onClose,
}: {
  nodes: MapNode[];
  edges: MapEdge[];
  selected: Set<string>;
  /** null when no search or filter is running */
  matches: Set<string> | null;
  query: string;
  tintOf: (node: MapNode) => Tint;
  laneOf: (id: string) => number | undefined;
  onFocus: (id: string, additive: boolean) => void;
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const { order } = React.useMemo(() => buildRows(nodes, edges), [nodes, edges]);

  const hidden = React.useMemo(() => {
    // A collapsed branch hides its descendants, unless a search is running —
    // then hiding a match would be the panel lying about what it found.
    if (query) return new Set<string>();
    const out = new Set<string>();
    let cutDepth: number | null = null;
    for (const row of order) {
      if (cutDepth !== null && row.depth > cutDepth) { out.add(row.node.id); continue; }
      cutDepth = null;
      if (collapsed.has(row.node.id) && row.children.length) cutDepth = row.depth;
    }
    return out;
  }, [order, collapsed, query]);

  const shown = order.filter((r) => !hidden.has(r.node.id));

  return (
    <div
      data-no-zoom
      onPointerDown={(e) => e.stopPropagation()}
      style={{ animationDuration: "200ms" }}
      className="anim-fade flex h-full w-[248px] flex-col bg-sunken hairline-r"
    >
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <ListTree className="size-3.5 text-ink-4" aria-hidden />
        <span className="flex-1 text-[11px] font-medium text-ink-3">Outline</span>
        <span className="text-[11px] text-ink-4 tnum">{nodes.length}</span>
        <IconButton label="Hide outline" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {!nodes.length ? (
          <MiniEmpty>Nothing on this board yet.</MiniEmpty>
        ) : (
          <ul className="space-y-px">
            {shown.map((row) => {
              const { node, depth, children } = row;
              const Icon = KIND_META[node.kind].icon;
              const isCollapsed = collapsed.has(node.id);
              const dim = matches ? !matches.has(node.id) : false;
              const checks = checklistStats(parseBody(node.body));
              const lane = laneOf(node.id);

              return (
                <li key={node.id} className={cn(`tint-${tintOf(node)}`)}>
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-md transition-colors",
                      selected.has(node.id) ? "bg-selected" : "hover:bg-hover",
                      dim && "opacity-40",
                    )}
                    style={{ paddingLeft: depth * 10 }}
                  >
                    {children.length ? (
                      <button
                        onClick={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
                            return next;
                          })
                        }
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${node.title || "Untitled"}`}
                        className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-ink-4 hover:text-ink-2"
                      >
                        <ChevronRight
                          className={cn(
                            "size-3 transition-transform duration-150 ease-[var(--ease-out-apple)]",
                            !isCollapsed && "rotate-90",
                          )}
                          aria-hidden
                        />
                      </button>
                    ) : (
                      <span className="size-5 shrink-0" aria-hidden />
                    )}

                    <button
                      onClick={(e) => onFocus(node.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-[5px] pr-1.5 text-left"
                    >
                      <Icon className="size-3 shrink-0 text-[var(--tint)]" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                        {node.title || <span className="text-ink-4">Untitled</span>}
                      </span>
                      {checks.total > 0 && (
                        <span className="shrink-0 text-[10.5px] text-ink-4 tnum">
                          {checks.done}/{checks.total}
                        </span>
                      )}
                      {lane !== undefined && (
                        <span className="shrink-0 text-[10.5px] text-ink-4 tnum" title="Timeline row">
                          R{lane + 1}
                        </span>
                      )}
                      {node.date && (
                        <span className="shrink-0 text-[10.5px] text-ink-4 tnum">
                          {formatDate(node.date, { weekday: false })}
                        </span>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="px-2.5 py-2 text-[11px] leading-snug text-ink-4 hairline-t">
        Click a line to fly to it. Shift-click adds it to the selection.
      </p>
    </div>
  );
}
