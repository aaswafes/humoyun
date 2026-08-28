"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/types";
import { TaskRow } from "@/components/tasks/task-row";
import { Checkbox } from "@/components/ui/primitives";
import { useSelection } from "./selection";

/**
 * Wraps a TaskRow so bulk mode can own the click without the row losing its
 * normal behaviour the rest of the time. In select mode the row is inert
 * (`pointer-events-none`) and the whole strip becomes one big hit target,
 * which is what makes shift-click ranges feel right.
 */
export function SelectableRow({
  task, order, showDate, trailing, dragHandle,
}: {
  task: Task;
  /** flat visible order of the current view, for shift-range selection */
  order: string[];
  showDate?: boolean;
  trailing?: React.ReactNode;
  dragHandle?: React.ReactNode;
}) {
  const { selecting, isSelected, toggle } = useSelection();
  const selected = isSelected(task.id);
  // TaskRow falls back to a decorative grip when no handle is given; in views
  // without drag-to-reorder that would promise something the list cannot do.
  const handle = dragHandle ?? <span aria-hidden className="block size-4" />;

  if (!selecting) {
    return (
      <div className="group/inbox flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <TaskRow task={task} showDate={showDate} dragHandle={handle} />
        </div>
        {trailing && (
          <div className="shrink-0 opacity-0 transition-opacity duration-150 ease-[var(--ease-out-apple)] focus-within:opacity-100 group-hover/inbox:opacity-100">
            {trailing}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      // shift-click would otherwise paint a text selection across the list
      onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
      onClick={(e) => toggle(task.id, { shift: e.shiftKey, order })}
      className={cn(
        "flex select-none items-center gap-2 rounded-md pl-2 cursor-pointer",
        "transition-colors duration-150 ease-[var(--ease-out-apple)]",
        selected ? "bg-selected" : "hover:bg-hover",
      )}
    >
      <Checkbox
        checked={selected}
        onChange={() => toggle(task.id)}
        label={`${selected ? "Deselect" : "Select"} ${task.title || "Untitled"}`}
      />
      <div className="pointer-events-none min-w-0 flex-1">
        <TaskRow task={task} showDate={showDate} showSubtasks={false} dragHandle={handle} />
      </div>
    </div>
  );
}
