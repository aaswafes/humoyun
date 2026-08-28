"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/date";
import { useStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { isTimed } from "./calendar-utils";

/**
 * The visual half of a chip, kept separate so the DragOverlay can render an
 * identical copy without registering a second draggable.
 */
export function ChipBody({
  task, hour12, floating, className,
}: {
  task: Task;
  hour12: boolean;
  floating?: boolean;
  className?: string;
}) {
  const done = task.status === "done";
  const timed = isTimed(task);

  return (
    <span
      className={cn(
        `tint-${task.color ?? "slate"}`,
        "flex h-[19px] w-full items-center gap-1 rounded-[5px] pl-1 pr-1.5 text-[11.5px] leading-none",
        floating
          ? "bg-raised shadow-md ring-1 ring-line"
          : "hover:bg-[var(--tint-soft)]",
        className,
      )}
    >
      <span
        className="h-[12px] w-[2.5px] shrink-0 rounded-full"
        style={{ background: "var(--tint)", opacity: done ? 0.45 : 1 }}
      />
      {timed && (
        <span className={cn("shrink-0 tnum", done ? "text-ink-4" : "text-ink-3")}>
          {formatTime(task.start_min, hour12)}
        </span>
      )}
      <span
        className={cn(
          "truncate",
          done ? "text-ink-4 line-through decoration-ink-4/60" : "text-ink",
        )}
      >
        {task.title || "Untitled"}
      </span>
    </span>
  );
}

/**
 * A day-cell / agenda chip. Draggable onto any other day, click opens the
 * inspector. Activation distance keeps the click intact.
 */
export function TaskChip({ task, hour12 }: { task: Task; hour12: boolean }) {
  const openInspector = useStore((s) => s.openInspector);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { type: "task", taskId: task.id },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={task.title}
      onClick={(e) => {
        e.stopPropagation();
        openInspector(task.id);
      }}
      className={cn(
        "block w-full cursor-pointer rounded-[5px] text-left transition-opacity duration-150",
        isDragging && "opacity-30",
      )}
    >
      <ChipBody task={task} hour12={hour12} />
    </button>
  );
}
