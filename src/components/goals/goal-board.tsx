"use client";

import * as React from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CalendarOff, GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { endOfMonth, formatDate, todayISO, yearOf } from "@/lib/date";
import type { Goal } from "@/lib/types";
import {
  TIMEFRAMES, TIMEFRAME_BLURB, TIMEFRAME_LABELS, timeframeOf, timeframeRange,
  type Timeframe,
} from "@/lib/timeframe";
import { IconButton } from "@/components/ui/primitives";
import { useDragBody } from "@/components/ui/drag";
import { GoalCard } from "./goal-card";
import type { GoalIndex } from "./goal-model";

const COL = "frame:";

/**
 * The last day a goal dropped on this shelf should be due. Dropping is a
 * statement about *when*, so it has to write a date — the shelf is derived
 * from the date, never the other way round.
 */
function dueDateFor(frame: Timeframe, today = todayISO()): string | null {
  const year = yearOf(today);
  switch (frame) {
    case "month": return endOfMonth(today);
    case "quarter": {
      // last day of the current quarter
      const q = Math.floor(new Date(`${today}T12:00:00`).getMonth() / 3);
      const lastMonth = q * 3 + 2;
      return endOfMonth(`${year}-${String(lastMonth + 1).padStart(2, "0")}-01`);
    }
    case "year": return `${year}-12-31`;
    case "nextYear": return `${year + 1}-12-31`;
    case "near": return `${year + 3}-12-31`;
    case "far": return `${year + 7}-12-31`;
    case "someday": return null;
  }
}

function BoardCard({
  goal, index, onOpen, activeId,
}: {
  goal: Goal;
  index: GoalIndex;
  onOpen: (id: string) => void;
  activeId: string | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: goal.id,
    data: { goalId: goal.id },
  });
  const body = useDragBody(listeners);

  return (
    <div ref={setNodeRef} className={cn("relative", isDragging && "opacity-40")}>
      <GoalCard
        goal={goal}
        stats={index.stats(goal.id)}
        onOpen={onOpen}
        dragging={activeId === goal.id}
        dragProps={body}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            data-no-drag
            aria-label={`Move ${goal.title || "goal"} to another timeframe`}
            className="grid size-5 cursor-grab place-items-center rounded text-ink-4 hover:text-ink-2 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        }
      />
    </div>
  );
}

function BoardColumn({
  frame, goals, index, onOpen, onCreate, activeId,
}: {
  frame: Timeframe;
  goals: Goal[];
  index: GoalIndex;
  onOpen: (id: string) => void;
  onCreate: (frame: Timeframe) => void;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL}${frame}` });
  const range = timeframeRange(frame);

  return (
    <section className="group/col relative w-[250px] shrink-0">
      <div className="mb-3 flex items-baseline gap-1.5 px-0.5">
        <h2 className="text-[12.5px] font-medium text-ink-2">{TIMEFRAME_LABELS[frame]}</h2>
        {range && <span className="text-[11px] text-ink-4">{range}</span>}
        <span className="text-[11px] text-ink-4 tnum">{goals.length}</span>
        <div className="flex-1" />
        <IconButton
          label={`New goal due ${TIMEFRAME_LABELS[frame].toLowerCase()}`}
          size="sm"
          className="opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/col:opacity-100"
          onClick={() => onCreate(frame)}
        >
          <Plus />
        </IconButton>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "min-h-[72px] space-y-2 rounded-lg p-1 -m-1 transition-colors duration-150",
          isOver && activeId && "bg-hover ring-1 ring-accent-line",
        )}
      >
        {goals.map((goal) => (
          <BoardCard key={goal.id} goal={goal} index={index} onOpen={onOpen} activeId={activeId} />
        ))}

        {goals.length === 0 && (
          <p className="px-1.5 py-2 text-[12px] leading-relaxed text-ink-4">
            {TIMEFRAME_BLURB[frame]}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Goals filed by when they are due rather than by a horizon picked from a menu.
 * Dragging a card to another column re-dates it, which is the only thing that
 * actually decides where it belongs.
 */
export function GoalBoard({
  goals, index, onOpen, onCreate,
}: {
  goals: Goal[];
  index: GoalIndex;
  onOpen: (id: string) => void;
  onCreate: (seed: Partial<Goal>) => void;
}) {
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = React.useMemo(() => {
    const map = new Map<Timeframe, Goal[]>(TIMEFRAMES.map((f) => [f, []]));
    for (const goal of goals) map.get(timeframeOf(goal.end_date))?.push(goal);
    for (const list of map.values()) {
      list.sort((a, b) =>
        (a.end_date ?? "9999").localeCompare(b.end_date ?? "9999")
        || a.order_index - b.order_index);
    }
    return map;
  }, [goals]);

  const dragged = activeId ? goals.find((g) => g.id === activeId) ?? null : null;

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId.startsWith(COL)) return;

    const frame = overId.slice(COL.length) as Timeframe;
    const goal = goals.find((g) => g.id === String(event.active.id));
    if (!goal || timeframeOf(goal.end_date) === frame) return;

    const due = dueDateFor(frame);
    patch("goals", goal.id, { end_date: due });
    toast({
      title: due
        ? `Due ${formatDate(due, { weekday: false, year: true })}`
        : "Back to someday",
      description: `${goal.title || "Goal"} · ${TIMEFRAME_LABELS[frame]}`,
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-5 overflow-x-auto pb-4">
        {TIMEFRAMES.map((frame) => (
          <BoardColumn
            key={frame}
            frame={frame}
            goals={columns.get(frame) ?? []}
            index={index}
            onOpen={onOpen}
            activeId={activeId}
            onCreate={(f) => onCreate({ end_date: dueDateFor(f) })}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="w-[250px] rounded-lg border border-line bg-raised px-2.5 py-2 shadow-pop">
            <p className="truncate text-[13.5px] font-medium text-ink">
              {dragged.title || "Untitled goal"}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-ink-4">
              {dragged.end_date
                ? formatDate(dragged.end_date, { weekday: false, year: true })
                : <><CalendarOff className="size-3" /> no date</>}
            </p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export { dueDateFor };
