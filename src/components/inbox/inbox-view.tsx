"use client";

import * as React from "react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Inbox as InboxIcon, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, inboxTasks, orderBetween } from "@/lib/store";
import type { Task } from "@/lib/types";
import { InlineComposer } from "@/components/tasks/task-list";
import { Button, EmptyState } from "@/components/ui/primitives";
import { openQuickAdd } from "@/components/shell/quick-add";
import { SelectableRow } from "./selectable-row";
import { QuickSchedule } from "./quick-schedule";
import { useSelection, useSelectionHotkeys } from "./selection";

function SortableRow({ task, order }: { task: Task; order: string[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 opacity-90")}
    >
      <SelectableRow
        task={task}
        order={order}
        trailing={<QuickSchedule task={task} />}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${task.title || "Untitled"}`}
            className="grid size-4 cursor-grab place-items-center rounded text-ink-4 hover:text-ink-2 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        }
      />
    </div>
  );
}

export function InboxView() {
  const tasks = useStore((s) => s.tasks);
  const patch = useStore((s) => s.patch);
  const { selecting } = useSelection();

  const items = React.useMemo(() => inboxTasks(tasks), [tasks]);
  const order = React.useMemo(() => items.map((t) => t.id), [items]);
  useSelectionHotkeys();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((t) => t.id === active.id);
    const newIndex = items.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    patch("tasks", String(active.id), {
      order_index: orderBetween(reordered[newIndex - 1]?.order_index, reordered[newIndex + 1]?.order_index),
    });
  }

  return (
    <div>
      {items.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Inbox zero"
          description="Anything captured without a date waits here. Write one below, then send it to Today, Tomorrow or the weekend straight from the row."
          action={
            <Button variant="primary" size="sm" onClick={openQuickAdd}>
              <Plus className="size-3.5" />
              Capture something
            </Button>
          }
        />
      ) : selecting ? (
        <div>
          {items.map((task) => (
            <SelectableRow key={task.id} task={task} order={order} />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {items.map((task) => (
              <SortableRow key={task.id} task={task} order={order} />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {!selecting && (
        <div className={cn("mt-1", items.length > 0 && "border-t border-line pt-1")}>
          <InlineComposer autoFocus date={null} placeholder="Capture a task" />
        </div>
      )}
    </div>
  );
}
