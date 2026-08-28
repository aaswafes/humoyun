"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  dayNumber, formatDate, isSameMonth, monthGrid, todayISO, weekdayHeaders,
} from "@/lib/date";
import { parseTask } from "@/lib/parse";
import { useStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { bucketByDate, type DropPreview } from "./calendar-utils";
import { TaskChip } from "./task-chip";

const MAX_CHIPS = 3;

// ---------------------------------------------------------
// In-cell composer — the hover "+" opens this rather than
// dropping an unnamed task on the day.
// ---------------------------------------------------------
function ChipComposer({ date, onClose }: { date: string; onClose: () => void }) {
  const addTask = useStore((s) => s.addTask);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const [value, setValue] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { ref.current?.focus(); }, []);

  function commit(keepOpen: boolean) {
    const text = value.trim();
    if (!text) { onClose(); return; }
    const parsed = parseTask(text, weekStart);
    addTask({
      title: parsed.title,
      date: parsed.date ?? date,
      start_min: parsed.start_min,
      end_min: parsed.end_min,
      all_day: parsed.start_min == null,
      duration_min: parsed.duration_min,
      priority: parsed.priority,
      tags: parsed.tags,
      color: parsed.color,
    });
    setValue("");
    if (!keepOpen) onClose();
  }

  return (
    <input
      ref={ref}
      aria-label="New task on this day"
      data-no-cell-click
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => commit(false)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); commit(true); }
        if (e.key === "Escape") { setValue(""); onClose(); }
      }}
      placeholder="Task — try “9am #deep”"
      className="h-[19px] w-full rounded-[5px] bg-hover px-1.5 text-[11.5px] text-ink outline-none placeholder:text-ink-4"
    />
  );
}

// ---------------------------------------------------------
// Day cell
// ---------------------------------------------------------
function DayCell({
  date, inMonth, tasks, selected, isToday, hour12, previewed,
  composing, onCompose, onCloseCompose, onSelect, onOpenDay, onMore,
}: {
  date: string;
  inMonth: boolean;
  tasks: Task[];
  selected: boolean;
  isToday: boolean;
  hour12: boolean;
  previewed: boolean;
  composing: boolean;
  onCompose: (date: string) => void;
  onCloseCompose: () => void;
  onSelect: (date: string) => void;
  onOpenDay: (date: string) => void;
  onMore: (date: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${date}`,
    data: { type: "day", date },
  });
  const clickTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dayButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current); }, []);

  // Roving tabindex: arrow keys move the selection, so focus follows it —
  // but only when the grid already had focus, never stealing it from elsewhere.
  React.useEffect(() => {
    if (!selected) return;
    const el = dayButtonRef.current;
    const focused = document.activeElement as HTMLElement | null;
    if (el && focused && focused !== el && focused.dataset.dayButton !== undefined) el.focus();
  }, [selected]);

  const visible = tasks.slice(0, MAX_CHIPS);
  const overflow = tasks.length - visible.length;

  /** One click peeks, two open the day — the peek waits a beat to lose that race. */
  function activate(detail: number) {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    if (detail > 1) { onOpenDay(date); return; }
    clickTimer.current = setTimeout(() => onSelect(date), 170);
  }

  return (
    <div
      ref={setNodeRef}
      data-day-cell={date}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-cell-click]")) return;
        activate(e.detail);
      }}
      className={cn(
        "group/cell relative flex min-h-0 min-w-0 flex-col gap-[3px] p-1.5 pt-1",
        "border-b border-l border-line transition-colors duration-150",
        !inMonth && "bg-sunken/60",
        selected && "bg-selected",
        previewed && !isOver && "bg-accent-soft",
        isOver && "bg-accent-soft ring-1 ring-inset ring-accent-line",
      )}
    >
      <div className="flex items-center justify-between">
        <button
          ref={dayButtonRef}
          data-no-cell-click
          data-day-button=""
          tabIndex={selected ? 0 : -1}
          aria-label={formatDate(date, { year: true })}
          aria-current={isToday ? "date" : undefined}
          onClick={(e) => { e.stopPropagation(); activate(e.detail); }}
          className={cn(
            "grid h-[22px] min-w-[22px] cursor-pointer place-items-center rounded-full px-1 text-[13px] leading-none display-serif tnum",
            "transition-colors duration-150",
            isToday
              ? "bg-accent text-accent-ink"
              : inMonth
                ? "text-ink hover:bg-hover"
                : "text-ink-4 hover:bg-hover",
          )}
        >
          {dayNumber(date)}
        </button>

        <button
          data-no-cell-click
          aria-label={`Add a task on ${formatDate(date, { year: true })}`}
          onClick={(e) => { e.stopPropagation(); onCompose(date); }}
          className={cn(
            "grid size-[18px] cursor-pointer place-items-center rounded-[5px] text-ink-4",
            "opacity-0 transition-[opacity,color,background-color] duration-150",
            "hover:bg-hover hover:text-ink-2 focus-visible:opacity-100 group-hover/cell:opacity-100",
          )}
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[2px] overflow-hidden">
        {visible.map((task) => (
          <TaskChip key={task.id} task={task} hour12={hour12} />
        ))}

        {composing && (
          <ChipComposer date={date} onClose={onCloseCompose} />
        )}

        {overflow > 0 && !composing && (
          <button
            data-no-cell-click
            onClick={(e) => { e.stopPropagation(); onMore(date); }}
            className="cursor-pointer px-1 text-left text-[11px] font-medium text-ink-3 hover:text-ink transition-colors tnum"
          >
            +{overflow} more
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Month
// ---------------------------------------------------------
export function MonthView({
  anchor, weekStart, hour12, preview, onPeek, onOpenDay,
}: {
  anchor: string;
  weekStart: number;
  hour12: boolean;
  preview: DropPreview | null;
  onPeek: (date: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const selectedDate = useStore((s) => s.selectedDate);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const [composing, setComposing] = React.useState<string | null>(null);

  const grid = React.useMemo(() => monthGrid(anchor, weekStart), [anchor, weekStart]);
  const headers = React.useMemo(() => weekdayHeaders(weekStart, "short"), [weekStart]);
  const byDate = React.useMemo(() => bucketByDate(tasks), [tasks]);
  const previewSet = React.useMemo(
    () => new Set(preview?.dates ?? []),
    [preview],
  );
  const today = todayISO();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-r border-t border-line">
        {headers.map((label, i) => (
          <div
            key={label + i}
            className="border-l border-line px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 border-r border-line">
        {grid.map((date) => (
          <DayCell
            key={date}
            date={date}
            inMonth={isSameMonth(date, anchor)}
            tasks={byDate.get(date) ?? []}
            selected={date === selectedDate}
            isToday={date === today}
            hour12={hour12}
            previewed={previewSet.has(date)}
            composing={composing === date}
            onCompose={setComposing}
            onCloseCompose={() => setComposing(null)}
            onSelect={(d) => { setSelectedDate(d); onPeek(d); }}
            onOpenDay={onOpenDay}
            onMore={(d) => { setSelectedDate(d); onPeek(d); }}
          />
        ))}
      </div>
    </div>
  );
}
