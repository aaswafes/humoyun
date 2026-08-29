"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { BookOpen, CalendarClock, Flag, MoonStar, Repeat, Target } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRange, formatTime } from "@/lib/date";
import { useStore } from "@/lib/store";
import { PRIORITY_LABELS, type Task, type TaskKind } from "@/lib/types";
import { isTimed } from "./calendar-utils";

// =========================================================
// Density
//
// The month grid, the all-day strip and the "+N more" popover all draw the same
// chip at different sizes. One table so they never drift apart.
//
// `hit` is the button's full box; `body` is the painted pill inside it. The
// difference is transparent padding, which is what lets a 20px-looking chip
// still own a comfortable target without overlapping its neighbour — the boxes
// tile edge to edge instead of stacking on top of each other.
// =========================================================
export type ChipDensity = "compact" | "comfortable" | "spacious";

export interface ChipMetrics {
  /** painted height of the pill */
  body: number;
  /** height of the button, padding included */
  hit: number;
  /** type-scale class for the chip label */
  text: string;
  /** height of the tint bar down the left edge */
  bar: number;
}

export const CHIP_METRICS: Record<ChipDensity, ChipMetrics> = {
  compact: { body: 18, hit: 22, text: "text-[11px]", bar: 10 },
  comfortable: { body: 20, hit: 26, text: "text-[11.5px]", bar: 12 },
  spacious: { body: 24, hit: 30, text: "text-[12.5px]", bar: 14 },
};

export const DENSITIES: readonly ChipDensity[] = ["compact", "comfortable", "spacious"];

// ---------------------------------------------------------
// Kind glyphs — a task's kind is otherwise invisible on a chip, and colour
// alone can't carry it (a red chip is a red task, not an event).
// ---------------------------------------------------------
type Glyph = React.ComponentType<{ className?: string }>;

const KIND_ICON: Partial<Record<TaskKind, Glyph>> = {
  reading: BookOpen,
  event: CalendarClock,
  habit: Repeat,
  prayer: MoonStar,
  milestone: Target,
};

const KIND_LABEL: Partial<Record<TaskKind, string>> = {
  reading: "Reading block",
  event: "Event",
  habit: "Habit",
  prayer: "Prayer",
  milestone: "Milestone",
};

/** Spoken description of a chip. The visual carries the same four facts. */
export function chipLabel(task: Task, hour12: boolean): string {
  const parts: string[] = [task.title || "Untitled"];
  const kind = KIND_LABEL[task.kind];
  if (kind) parts.push(kind);
  if (isTimed(task)) parts.push(formatRange(task.start_min, task.end_min, hour12));
  if (task.priority >= 2) parts.push(`${PRIORITY_LABELS[task.priority]} priority`);
  parts.push(task.status === "done" ? "done" : "not done");
  return parts.join(" — ");
}

/**
 * The visual half of a chip, kept separate so the DragOverlay can render an
 * identical copy without registering a second draggable.
 */
export function ChipBody({
  task, hour12, floating, className, density = "comfortable",
}: {
  task: Task;
  hour12: boolean;
  floating?: boolean;
  className?: string;
  density?: ChipDensity;
}) {
  const done = task.status === "done";
  const timed = isTimed(task);
  const metrics = CHIP_METRICS[density];
  const KindIcon = KIND_ICON[task.kind];
  // Low priority is noise at this size; medium and high earn the glyph.
  const flagged = task.priority >= 2 && !done;
  /**
   * Four marks — bar, kind, time, flag — cannot all be loud in an 18px chip.
   * At Compact the tint bar and the title carry it alone; the rest come back
   * at Comfortable and Spacious. Every one of them is in the aria-label at
   * every density, so nothing is hidden from a reader who cannot see the bar.
   */
  const detailed = density !== "compact";

  return (
    <span
      className={cn(
        `tint-${task.color ?? "slate"}`,
        "flex w-full items-center gap-1 rounded-[5px] pl-1 pr-1.5 leading-none",
        metrics.text,
        floating
          ? "bg-raised shadow-md ring-1 ring-line"
          : "transition-colors duration-150 hover:bg-[var(--tint-soft)]",
        className,
      )}
      style={{ height: metrics.body }}
    >
      <span
        aria-hidden
        className="shrink-0 rounded-full"
        style={{ width: 2.5, height: metrics.bar, background: "var(--tint)", opacity: done ? 0.4 : 1 }}
      />

      {detailed && KindIcon && (
        <KindIcon aria-hidden className="size-3 shrink-0 text-ink-4" />
      )}

      {detailed && timed && (
        <span className={cn("shrink-0 tnum", done ? "text-ink-4" : "text-ink-3")}>
          {formatTime(task.start_min, hour12)}
        </span>
      )}

      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          done ? "text-ink-4 line-through decoration-ink-4/60" : "text-ink",
        )}
      >
        {task.title || "Untitled"}
      </span>

      {detailed && flagged && (
        // Filled for high, hollow for medium — the two levels differ in shape,
        // not in colour. A priority is a fact about a task, not an alarm, so it
        // is drawn in ink rather than in warn or danger.
        <Flag
          aria-hidden
          className="size-[11px] shrink-0 text-ink-3"
          fill={task.priority === 3 ? "currentColor" : "none"}
        />
      )}
    </span>
  );
}

/**
 * A day-cell / agenda chip. Draggable onto any other day, click opens the
 * inspector. Activation distance keeps the click intact.
 *
 * `tabIndex` lets a grid own its tab order: the month view hands `-1` to every
 * chip outside the focused day so Tab doesn't walk 200 chips to leave the grid.
 */
export function TaskChip({
  task, hour12, density = "comfortable", tabIndex, className,
}: {
  task: Task;
  hour12: boolean;
  density?: ChipDensity;
  tabIndex?: number;
  className?: string;
}) {
  const openInspector = useStore((s) => s.openInspector);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { type: "task", taskId: task.id },
  });

  // Space/Enter belong to the button, not to a keyboard drag: dnd-kit's
  // activator preventDefaults them, which swallowed every chip activation.
  // Rescheduling by keyboard is available from the row menu's date picker.
  const { onKeyDown: _dragKeyDown, ...pointerListeners } = listeners ?? {};
  void _dragKeyDown;

  const metrics = CHIP_METRICS[density];
  const pad = (metrics.hit - metrics.body) / 2;

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...pointerListeners}
      type="button"
      tabIndex={tabIndex ?? attributes.tabIndex}
      aria-label={chipLabel(task, hour12)}
      title={task.title || "Untitled"}
      onClick={(e) => {
        e.stopPropagation();
        openInspector(task.id);
      }}
      style={{ paddingTop: pad, paddingBottom: pad }}
      className={cn(
        "block w-full cursor-pointer rounded-[7px] text-left transition-opacity duration-150",
        isDragging && "opacity-30",
        className,
      )}
    >
      <ChipBody task={task} hour12={hour12} density={density} />
    </button>
  );
}
