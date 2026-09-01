"use client";

import * as React from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter,
  useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDragBody } from "@/components/ui/drag";
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
export const dateDropId = (iso: string | null) => `${DATE_DROP_PREFIX}${iso ?? "none"}`;

function isoFromDropId(id: string): string | null | undefined {
  if (!id.startsWith(DATE_DROP_PREFIX)) return undefined;
  const rest = id.slice(DATE_DROP_PREFIX.length);
  return rest === "none" ? null : rest;
}

/** Anything that should accept a dropped task and give it a date. */
export function DateDropZone({
  iso, children, className, activeClassName,
}: {
  iso: string | null;
  children: (state: { isOver: boolean; active: boolean }) => React.ReactNode;
  className?: string;
  activeClassName?: string;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: dateDropId(iso) });
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
  const { isSelected, dragIds } = useTriage();
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id: task.id, disabled });
  const body = useDragBody(listeners, !disabled);

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
        dragProps={disabled ? undefined : body}
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
              className="grid size-4 cursor-grab place-items-center rounded text-ink-4 hover:text-ink-2 active:cursor-grabbing"
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  function onDragStart(event: DragStartEvent) {
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
      collisionDetection={closestCenter}
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
