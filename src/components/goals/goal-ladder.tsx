"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Goal, Horizon, Tint } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { GoalCard } from "./goal-card";
import { HORIZON_BLURB, HORIZON_LABEL, HORIZONS, type GoalIndex } from "./goal-model";

const CARD_SELECTOR = "[data-goal-card]";

interface Link {
  id: string;
  color: Tint;
  x1: number; y1: number;
  x2: number; y2: number;
  lit: boolean;
}

function sameLinks(a: Link[], b: Link[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (p.id !== q.id || p.lit !== q.lit) return false;
    if (Math.abs(p.x1 - q.x1) > 0.5 || Math.abs(p.y1 - q.y1) > 0.5) return false;
    if (Math.abs(p.x2 - q.x2) > 0.5 || Math.abs(p.y2 - q.y2) > 0.5) return false;
  }
  return true;
}

/**
 * Depth-first rank so a family stays vertically adjacent inside its column
 * and the connectors between columns stay close to untangled.
 */
function ladderRanks(index: GoalIndex): Map<string, string> {
  const rank = new Map<string, string>();
  const seen = new Set<string>();
  let counter = 0;

  const walk = (goal: Goal, prefix: string) => {
    if (seen.has(goal.id)) return;
    seen.add(goal.id);
    const key = `${prefix}${String(counter++).padStart(5, "0")}.`;
    rank.set(goal.id, key);
    for (const child of index.childrenOf.get(goal.id) ?? []) walk(child, key);
  };

  index.roots.forEach((root) => walk(root, ""));
  return rank;
}

export function GoalLadder({
  goals, index, openId, onOpen, onCreate,
}: {
  goals: Goal[];
  index: GoalIndex;
  openId: string | null;
  onOpen: (id: string) => void;
  onCreate: (horizon: Horizon) => void;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [links, setLinks] = React.useState<Link[]>([]);
  const [hoverId, setHoverId] = React.useState<string | null>(null);

  const ranks = React.useMemo(() => ladderRanks(index), [index]);

  const columns = React.useMemo(() => {
    const byHorizon = new Map<Horizon, Goal[]>(HORIZONS.map((h) => [h, []]));
    for (const goal of goals) byHorizon.get(goal.horizon)?.push(goal);
    for (const list of byHorizon.values()) {
      list.sort((a, b) => (ranks.get(a.id) ?? "zz").localeCompare(ranks.get(b.id) ?? "zz"));
    }
    return byHorizon;
  }, [goals, ranks]);

  const lineage = React.useMemo(
    () => (hoverId ? index.lineageOf(hoverId) : null),
    [hoverId, index],
  );

  // Cards announce themselves through a data attribute, so the ladder reads the
  // real laid-out geometry without holding a ref to every rung.
  const measure = React.useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const hb = host.getBoundingClientRect();

    const boxes = new Map<string, DOMRect>();
    host.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((el) => {
      const id = el.dataset.goalCard;
      if (id) boxes.set(id, el.getBoundingClientRect());
    });

    const next: Link[] = [];
    boxes.forEach((box, id) => {
      const goal = index.byId.get(id);
      const parentId = goal?.parent_id;
      const parentBox = parentId ? boxes.get(parentId) : undefined;
      if (!goal || !parentId || !parentBox) return;
      next.push({
        id,
        color: goal.color,
        x1: parentBox.right - hb.left,
        y1: parentBox.top - hb.top + parentBox.height / 2,
        x2: box.left - hb.left,
        y2: box.top - hb.top + box.height / 2,
        lit: !!lineage && lineage.has(id) && lineage.has(parentId),
      });
    });

    next.sort((p, q) => Number(p.lit) - Number(q.lit));
    setLinks((prev) => (sameLinks(prev, next) ? prev : next));
  }, [index, lineage]);

  React.useLayoutEffect(() => { measure(); }, [measure, columns]);

  const measureRef = React.useRef(measure);
  React.useEffect(() => { measureRef.current = measure; });

  // Re-observed only when the set of cards changes, never on hover.
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureRef.current());
    ro.observe(host);
    host.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [columns]);

  return (
    <div className="overflow-x-auto pb-3">
      <div ref={hostRef} className="relative flex min-w-max gap-6">
        <svg
          className="pointer-events-none absolute inset-0 size-full"
          aria-hidden
          focusable="false"
        >
          {links.map((link) => {
            const dx = Math.max(20, (link.x2 - link.x1) / 2);
            return (
              <g key={link.id} className={`tint-${link.color}`}>
                <path
                  d={`M ${link.x1} ${link.y1} C ${link.x1 + dx} ${link.y1}, ${link.x2 - dx} ${link.y2}, ${link.x2} ${link.y2}`}
                  fill="none"
                  stroke={link.lit ? "var(--tint)" : "var(--line-strong)"}
                  strokeWidth={link.lit ? 1.5 : 1}
                  strokeLinecap="round"
                  className="transition-[stroke,stroke-width] duration-200"
                />
                <circle
                  cx={link.x2}
                  cy={link.y2}
                  r={link.lit ? 2.5 : 1.75}
                  fill={link.lit ? "var(--tint)" : "var(--line-strong)"}
                  className="transition-[fill,r] duration-200"
                />
              </g>
            );
          })}
        </svg>

        {HORIZONS.map((horizon) => {
          const list = columns.get(horizon) ?? [];
          return (
            <section key={horizon} className="relative z-10 w-[240px] shrink-0">
              <div className="mb-2 flex items-center gap-1.5 px-0.5">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  {HORIZON_LABEL[horizon]}
                </h2>
                <span className="text-[11px] text-ink-4 tnum">{list.length}</span>
                <div className="flex-1" />
                <IconButton
                  label={`New ${HORIZON_LABEL[horizon].toLowerCase()} goal`}
                  size="sm"
                  onClick={() => onCreate(horizon)}
                >
                  <Plus />
                </IconButton>
              </div>

              <div className="space-y-2">
                {list.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    stats={index.stats(goal.id)}
                    onOpen={onOpen}
                    onHover={setHoverId}
                    active={goal.id === openId || goal.id === hoverId}
                    dimmed={!!lineage && !lineage.has(goal.id)}
                  />
                ))}

                <button
                  onClick={() => onCreate(horizon)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line",
                    "px-2.5 text-left text-[12.5px] text-ink-4 transition-colors duration-150",
                    "hover:border-line-strong hover:bg-hover hover:text-ink-3",
                    list.length ? "h-8" : "min-h-[76px] py-2.5",
                  )}
                >
                  <Plus className="size-3.5 shrink-0" />
                  {list.length ? (
                    <span>Add {HORIZON_LABEL[horizon].toLowerCase()} goal</span>
                  ) : (
                    <span className="leading-relaxed">{HORIZON_BLURB[horizon]}</span>
                  )}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
