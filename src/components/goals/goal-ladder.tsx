"use client";

import * as React from "react";
import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor,
  pointerWithin, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, type SortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CornerDownRight, GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Goal, Horizon, Tint } from "@/lib/types";
import { Badge, IconButton } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/overlays";
import { GoalCard } from "./goal-card";
import { HORIZON_BLURB, HORIZON_LABEL, HORIZONS, type GoalIndex } from "./goal-model";
import { columnLabel, isHidden, setColumnPref, useColumnPrefs, type ColumnPrefs } from "./column-prefs";
import { ColumnHeader, HiddenColumns } from "./column-header";
import {
  horizonMoves, isBlocked, moveCommands, planMove, useGoalMove,
  type DropIntent, type MoveContext,
} from "./goal-move";

const CARD_SELECTOR = "[data-goal-card]";
const NEST = "nest:";
const COL = "col:";

/**
 * Cards hold still while something is dragged over them. A column that shifted
 * to open a gap would move the very nest targets the pointer is aiming at, and
 * the insertion line already says exactly where the drop lands.
 */
const HOLD_STILL: SortingStrategy = () => null;

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

type Hint = { targetId: string; kind: "before" | "after" | "nest" } | { horizon: Horizon } | null;

function sameHint(a: Hint, b: Hint): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if ("horizon" in a) return "horizon" in b && a.horizon === b.horizon;
  if ("horizon" in b) return false;
  return a.targetId === b.targetId && a.kind === b.kind;
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
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState<Hint>(null);

  const columnPrefs = useColumnPrefs();
  const applyMove = useGoalMove();
  const ctx = React.useMemo<MoveContext>(() => ({ goals, index }), [goals, index]);

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

  // -------------------------------------------------------
  // Drag and drop
  // -------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * A card's middle band means "become a child of this"; its edges mean
   * "sit next to this". Nest zones win whenever the pointer is inside one,
   * and are skipped entirely for keyboard drags, which fall through to the
   * nearest card so arrow keys behave like a plain sortable list.
   */
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const dragged = String(args.active.id);
    const containers = args.droppableContainers;

    const pointer = pointerWithin(args);
    const nest = pointer.find(
      (c) => String(c.id).startsWith(NEST) && String(c.id) !== `${NEST}${dragged}`,
    );
    if (nest) return [nest];

    const cards = pointer.filter(
      (c) => !String(c.id).startsWith(NEST) && !String(c.id).startsWith(COL),
    );
    if (cards.length) return cards;

    const cols = pointer.filter((c) => String(c.id).startsWith(COL));
    if (cols.length) return cols;

    const nearCard = closestCenter({
      ...args,
      droppableContainers: containers.filter(
        (c) => !String(c.id).startsWith(NEST) && !String(c.id).startsWith(COL),
      ),
    });
    if (nearCard.length) return nearCard;

    return closestCenter({
      ...args,
      droppableContainers: containers.filter((c) => String(c.id).startsWith(COL)),
    });
  }, []);

  const readIntent = React.useCallback(
    (event: DragEndEvent | DragMoveEvent): DropIntent | null => {
      const over = event.over;
      if (!over) return null;
      const overId = String(over.id);

      if (overId.startsWith(NEST)) return { kind: "nest", targetId: overId.slice(NEST.length) };
      if (overId.startsWith(COL)) return { kind: "column", horizon: overId.slice(COL.length) as Horizon };
      if (overId === String(event.active.id)) return null;

      const activeRect = event.active.rect.current.translated;
      const overRect = over.rect;
      const activeMid = activeRect ? activeRect.top + activeRect.height / 2 : 0;
      const overMid = overRect.top + overRect.height / 2;
      return { kind: activeRect && activeMid < overMid ? "before" : "after", targetId: overId };
    },
    [],
  );

  const hintFor = React.useCallback((intent: DropIntent | null): Hint => {
    if (!intent) return null;
    if (intent.kind === "column") return { horizon: intent.horizon };
    return { targetId: intent.targetId, kind: intent.kind };
  }, []);

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setHoverId(null);
  }

  // dnd-kit only fires onDragOver when the target itself changes, and crossing
  // a card's midpoint flips before/after without changing the target — so the
  // hint is tracked on every move, and only committed when it really differs.
  function onDragMove(event: DragMoveEvent) {
    const next = hintFor(readIntent(event));
    setHint((prev) => (sameHint(prev, next) ? prev : next));
  }

  function onDragEnd(event: DragEndEvent) {
    const goal = index.byId.get(String(event.active.id));
    const intent = readIntent(event);
    setActiveId(null);
    setHint(null);
    if (!goal || !intent) return;
    applyMove(planMove(goal, intent, ctx));
  }

  function onDragCancel() {
    setActiveId(null);
    setHint(null);
  }

  const dragged = activeId ? index.byId.get(activeId) ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up ${index.byId.get(String(active.id))?.title || "goal"}. Use the arrow keys to move it, space to drop, escape to cancel.`,
          onDragOver: ({ over }) =>
            over ? `Over ${index.byId.get(String(over.id))?.title ?? "a drop area"}.` : "No drop area.",
          onDragEnd: ({ over }) =>
            over ? `Dropped on ${index.byId.get(String(over.id))?.title ?? "a drop area"}.` : "Dropped. Nothing changed.",
          onDragCancel: () => "Move cancelled.",
        },
      }}
    >
      <div className="overflow-x-auto pb-3 pl-7">
        {/* The columns are the ladder's rungs — they need to read as five
            separate places, not one block, so the gutter between them is wide. */}
        <div ref={hostRef} className="relative flex min-w-max gap-10">
          <svg
            className={cn(
              "pointer-events-none absolute inset-0 size-full transition-opacity duration-200",
              activeId && "opacity-25",
            )}
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

          {HORIZONS.filter((h) => !isHidden(h, columnPrefs)).map((horizon) => {
            const list = columns.get(horizon) ?? [];
            return (
              <LadderColumn
                key={horizon}
                horizon={horizon}
                columnPrefs={columnPrefs}
                goals={list}
                index={index}
                ctx={ctx}
                openId={openId}
                hoverId={hoverId}
                lineage={lineage}
                activeId={activeId}
                hint={hint}
                onOpen={onOpen}
                onHover={setHoverId}
                onCreate={onCreate}
                onMove={applyMove}
              />
            );
          })}
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {dragged && (
          <div className="w-[240px] cursor-grabbing rounded-lg border border-accent-line bg-raised p-2.5 shadow-pop">
            <div className="flex items-center gap-2">
              <span
                className={cn(`tint-${dragged.color}`, "size-2.5 shrink-0 rounded-full")}
                style={{ background: "var(--tint)" }}
              />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                {dragged.title || "Untitled goal"}
              </span>
            </div>
            <div className="mt-1.5 pl-[18px]">
              <Badge tint={dragged.color}>{HORIZON_LABEL[dragged.horizon]}</Badge>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ---------------------------------------------------------
// Column
// ---------------------------------------------------------
function LadderColumn({
  horizon, goals, index, ctx, openId, hoverId, lineage, activeId, hint, columnPrefs,
  onOpen, onHover, onCreate, onMove,
}: {
  horizon: Horizon;
  columnPrefs: ColumnPrefs;
  goals: Goal[];
  index: GoalIndex;
  ctx: MoveContext;
  openId: string | null;
  hoverId: string | null;
  lineage: Set<string> | null;
  activeId: string | null;
  hint: Hint;
  onOpen: (id: string) => void;
  onHover: (id: string | null) => void;
  onCreate: (horizon: Horizon) => void;
  onMove: ReturnType<typeof useGoalMove>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL}${horizon}` });
  const ids = React.useMemo(() => goals.map((g) => g.id), [goals]);
  const columnHinted = !!hint && "horizon" in hint && hint.horizon === horizon;

  return (
    <section className="group/col relative z-10 w-[240px] shrink-0">
      {/* The column header is the only place the horizon needs saying — every
          card below it inherits the answer, so none of them repeats it. */}
      <ColumnHeader
        horizon={horizon}
        count={goals.length}
        prefs={columnPrefs}
        onCreate={() => onCreate(horizon)}
      />

      <div
        ref={setNodeRef}
        className={cn(
          "space-y-2 rounded-lg transition-colors duration-150",
          (columnHinted || (isOver && activeId)) && "bg-hover ring-1 ring-accent-line",
        )}
      >
        <SortableContext items={ids} strategy={HOLD_STILL}>
          {goals.map((goal) => (
            <LadderCard
              key={goal.id}
              goal={goal}
              index={index}
              ctx={ctx}
              openId={openId}
              hoverId={hoverId}
              lineage={lineage}
              activeId={activeId}
              hint={hint}
              onOpen={onOpen}
              onHover={onHover}
              onMove={onMove}
            />
          ))}
        </SortableContext>

        {/* A column that already has cards does not need a dashed box to say
            "more goes here" — the row alone is enough. */}
        <button
          onClick={() => onCreate(horizon)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-lg",
            "px-2.5 text-left text-[12.5px] text-ink-4 transition-colors duration-150",
            "hover:bg-hover hover:text-ink-3",
            goals.length
              ? "h-8"
              : "min-h-[76px] border border-dashed border-line py-2.5 hover:border-line-strong",
          )}
        >
          <Plus className="size-3.5 shrink-0" />
          {goals.length ? (
            <span>Add {HORIZON_LABEL[horizon].toLowerCase()} goal</span>
          ) : (
            <span className="leading-relaxed">{HORIZON_BLURB[horizon]}</span>
          )}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------
// Card wrapper — draggable, droppable, and nestable
// ---------------------------------------------------------
function LadderCard({
  goal, index, ctx, openId, hoverId, lineage, activeId, hint, onOpen, onHover, onMove,
}: {
  goal: Goal;
  index: GoalIndex;
  ctx: MoveContext;
  openId: string | null;
  hoverId: string | null;
  lineage: Set<string> | null;
  activeId: string | null;
  hint: Hint;
  onOpen: (id: string) => void;
  onHover: (id: string | null) => void;
  onMove: ReturnType<typeof useGoalMove>;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: goal.id });

  // The middle band of the card: drop here to become a child rather than a peer.
  const { setNodeRef: setNestRef } = useDroppable({ id: `${NEST}${goal.id}` });

  const dropHint =
    hint && "targetId" in hint && hint.targetId === goal.id ? hint.kind : null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-20")}
    >
      <span
        ref={setNestRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-[26%] h-[48%]"
      />

      <GoalCard
        goal={goal}
        stats={index.stats(goal.id)}
        onOpen={onOpen}
        onHover={onHover}
        active={goal.id === openId || goal.id === hoverId}
        dimmed={!!lineage && !lineage.has(goal.id) && !activeId}
        dragging={isDragging}
        dropHint={dropHint}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            aria-label={`Move ${goal.title || "goal"}`}
            title="Drag to reorder or nest. Space then arrow keys works too."
            className={cn(
              "grid size-7 cursor-grab place-items-center rounded-md border border-line bg-raised text-ink-4",
              "opacity-0 transition-opacity duration-150 active:cursor-grabbing",
              "hover:text-ink-2 focus-visible:opacity-100 group-hover/goal:opacity-100",
              isDragging && "opacity-100",
            )}
          >
            <GripVertical className="size-3.5" />
          </button>
        }
        menuExtra={(close) => (
          <MoveMenu goal={goal} ctx={ctx} onMove={onMove} onDone={close} />
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------
// The keyboard path — everything a drag can do, as menu items
// ---------------------------------------------------------
function MoveMenu({
  goal, ctx, onMove, onDone,
}: {
  goal: Goal;
  ctx: MoveContext;
  onMove: ReturnType<typeof useGoalMove>;
  onDone: () => void;
}) {
  const commands = React.useMemo(() => moveCommands(goal, ctx), [goal, ctx]);
  const horizons = React.useMemo(
    () => horizonMoves(goal, ctx).filter((h) => !isBlocked(h.plan)),
    [goal, ctx],
  );

  if (!commands.length && !horizons.length) return null;

  return (
    <>
      <MenuSeparator />
      <MenuLabel>Move</MenuLabel>
      {commands.map((command) => (
        <MenuItem
          key={command.key}
          icon={command.key === "indent" ? CornerDownRight : undefined}
          onClick={() => { onMove(command.plan); onDone(); }}
        >
          <span className="block truncate">{command.label}</span>
        </MenuItem>
      ))}
      {horizons.length > 0 && (
        <>
          <MenuLabel>To horizon</MenuLabel>
          {horizons.map(({ horizon, plan }) => (
            <MenuItem key={horizon} onClick={() => { onMove(plan); onDone(); }}>
              {HORIZON_LABEL[horizon]}
            </MenuItem>
          ))}
        </>
      )}
    </>
  );
}
