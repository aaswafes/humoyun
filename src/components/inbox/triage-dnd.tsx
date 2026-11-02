"use client";

import * as React from "react";
import {
  DndContext, DragOverlay, closestCenter, pointerWithin, useDroppable,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppSensors, useDragBody } from "@/components/ui/drag";
import { useStore } from "@/lib/store";
import { friendlyDate } from "@/lib/date";
import type { Task } from "@/lib/types";
import { useTriage } from "./triage-context";
import { useTriageActions } from "./actions";
import { SelectableRow } from "./selectable-row";
import { TaskGlance } from "./task-glance";

// =========================================================
// Drag ids. A row is its task id; a date target is prefixed so one drop
// handler can tell "put this on Thursday" apart from "put this above that".
// =========================================================

export const DATE_DROP_PREFIX = "date:";

/**
 * One date often has several doors on screen at once — the rail's Tomorrow,
 * the same day in the rail's month (which a drag forces open), Upcoming's day
 * header, and Today and This weekend are the same day every Sunday. dnd-kit
 * keys droppables by id, so a second door with the same id silently replaced
 * the first: the door under the pointer had no rect, and the drop went to a
 * neighbour. `slot` gives every door its own id; the date is still the part
 * before the bar, so a drop on any of them means the same thing.
 */
export const dateDropId = (iso: string | null, slot?: string) =>
  `${DATE_DROP_PREFIX}${iso ?? "none"}${slot ? `|${slot}` : ""}`;

function isoFromDropId(id: string): string | null | undefined {
  if (!id.startsWith(DATE_DROP_PREFIX)) return undefined;
  const rest = id.slice(DATE_DROP_PREFIX.length).split("|")[0];
  return rest === "none" ? null : rest;
}

/** Anything that should accept a dropped task and give it a date. */
export function DateDropZone({
  iso, slot, children, className, activeClassName,
}: {
  iso: string | null;
  /** which door this is, when the same date has more than one on screen */
  slot?: string;
  children: (state: { isOver: boolean; active: boolean }) => React.ReactNode;
  className?: string;
  activeClassName?: string;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: dateDropId(iso, slot) });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && activeClassName)}>
      {children({ isOver, active: !!active })}
    </div>
  );
}

// =========================================================
// Rows
// =========================================================

export function TriageRow({
  task, order, showDate, trailing, dense, disabled,
}: {
  task: Task;
  order: string[];
  showDate?: boolean;
  trailing?: React.ReactNode;
  dense?: boolean;
  disabled?: boolean;
}) {
  const { isSelected, dragIds, selecting } = useTriage();
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id: task.id, disabled });
  const body = useDragBody(listeners, !disabled);

  // In select mode the whole row is one <button>, and useDragBody — rightly,
  // everywhere else — never lets a press on a button start a drag. The mouse
  // keeps its gutter grip there, as before; a finger has no grip, so without
  // this a selection could not be carried at all. The row's subtree is inert,
  // so there is no nested control for the raw activator to steal a press from.
  const touchLift = listeners?.onTouchStart as React.TouchEventHandler<HTMLElement> | undefined;
  const selectBody = touchLift ? { ...body, onTouchStart: touchLift } : body;

  const ghosted = dragIds.length > 1 && dragIds.includes(task.id) && !isDragging;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/row relative",
        isDragging && "relative z-10 opacity-40",
        ghosted && "opacity-50",
      )}
    >
      <SelectableRow
        task={task}
        order={order}
        showDate={showDate}
        trailing={trailing}
        dense={dense}
        // The row body is the drag surface in both modes, but only for the
        // pointer: the keyboard belongs to selection here, and the gutter
        // handle still carries the full keyboard drag.
        dragProps={disabled ? undefined : selecting ? selectBody : body}
        dragHandle={
          disabled ? undefined : (
            <button
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              data-no-drag
              aria-label={`Drag ${task.title || "Untitled"}${
                isSelected(task.id) ? " and the rest of the selection" : ""
              } — space to lift, arrows to move`}
              // The grip only ever appears on hover. A finger lifts the row by
              // holding it (useAppSensors), so on touch there is no grip at all
              // rather than an invisible one in the page gutter.
              className="grid size-4 cursor-grab place-items-center rounded text-ink-4 hover:text-ink-2 active:cursor-grabbing touch:hidden"
            >
              <GripVertical className="size-3.5" />
            </button>
          )
        }
      />
    </div>
  );
}

// =========================================================
// The context itself
// =========================================================

export function TriageDnd({ children }: { children: React.ReactNode }) {
  const tasks = useStore((s) => s.tasks);
  const { rows, dragIds, setDragIds, ids, isSelected, onRowDrop } = useTriage();
  const actions = useTriageActions();

  // Mouse by 5px as before; a finger by a short hold, so a swipe down the
  // list is always a scroll; the keyboard walks the sortable list.
  const sensors = useAppSensors({ distance: 5, coordinateGetter: sortableKeyboardCoordinates });

  // dnd-kit's default announcements would read out raw uuids.
  const describeDropTarget = React.useCallback(
    (id: string | number | null | undefined): string => {
      if (id == null) return "nothing";
      const key = String(id);
      const iso = isoFromDropId(key);
      if (iso !== undefined) return iso ? friendlyDate(iso) : "the Inbox";
      return tasks.find((t) => t.id === key)?.title || "Untitled";
    },
    [tasks],
  );

  const dragged = React.useMemo(
    () => dragIds.map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => !!t),
    [dragIds, tasks],
  );

  // What a drop lands on. The mouse keeps closestCenter — the carried card's
  // centre — exactly as before. A finger is the target instead: the card hangs
  // off to one side of a thumb, and on a phone the date doors sit under the
  // list as wide as its rows, so the card's centre could be nearer a row than
  // the door the thumb is resting on. A door under the finger wins outright;
  // anything else falls back to the same reckoning the mouse uses.
  const fingerDrag = React.useRef(false);
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    if (fingerDrag.current) {
      const doors = pointerWithin(args).filter((c) => String(c.id).startsWith(DATE_DROP_PREFIX));
      if (doors.length) return doors;
    }
    return closestCenter(args);
  }, []);

  function onDragStart(event: DragStartEvent) {
    fingerDrag.current = typeof TouchEvent !== "undefined" && event.activatorEvent instanceof TouchEvent;
    const id = String(event.active.id);
    // Dragging one row of a selection carries the whole selection with it.
    setDragIds(isSelected(id) && ids.length > 1 ? ids : [id]);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeId = String(active.id);
    const payload = dragIds.length ? dragIds : [activeId];
    setDragIds([]);
    if (!over) return;

    const overId = String(over.id);
    const iso = isoFromDropId(overId);
    if (iso !== undefined) {
      actions.moveToDate(payload, iso);
      return;
    }
    if (overId === activeId) return;
    onRowDrop?.(overId, payload);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragIds([])}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${describeDropTarget(active.id)}`,
          onDragOver: ({ over }) => (over ? `Over ${describeDropTarget(over.id)}` : "Over nothing"),
          onDragEnd: ({ over }) =>
            over ? `Dropped on ${describeDropTarget(over.id)}` : "Dropped, nothing changed",
          onDragCancel: () => "Drag cancelled",
        },
      }}
    >
      <SortableContext items={rows} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {dragged.length > 0 && (
          <div className="pointer-events-none w-[min(360px,80vw)] rotate-[-1deg] rounded-lg border border-line bg-raised px-2 py-1 shadow-pop">
            <TaskGlance task={dragged[0]} showDate dense />
            {dragged.length > 1 && (
              <p className="px-1 pb-1 text-[11.5px] text-ink-3 tnum">
                + {dragged.length - 1} more
              </p>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
