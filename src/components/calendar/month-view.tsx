"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronsLeft, ChevronsRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addDays, dayNumber, daysBetween, formatDate, isSameMonth, monthGrid, monthName,
  todayISO, weekNumber, weekday, weekdayHeaders,
} from "@/lib/date";
import { parseTask } from "@/lib/parse";
import { useStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { Button, IconButton, Input } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/overlays";
import { VisuallyHidden } from "@/components/ui/form";
import { bucketByDate, type DropPreview } from "./calendar-utils";
import { CHIP_METRICS, TaskChip, type ChipDensity } from "./task-chip";

// =========================================================
// Density
//
// Three genuinely different readings of the same month: how many chips a day
// shows, how tall its row is, how big every target inside it is. The row height
// is the sum of its parts rather than a guess, so a cell never clips the chips
// it promised to show — at Spacious the month scrolls, which is the honest
// trade for seven tasks a day.
// =========================================================
interface DensitySpec {
  /** ceiling on chips drawn before the "+N more" button takes over */
  chips: number;
  /**
   * How far past one screenful the month may run before chips give way to
   * "+N more". Compact stays on one screen; Spacious is the mode you pick
   * precisely because you would rather scroll than summarise.
   */
  allowance: number;
}

/** The page owns the setting — see the View popover in the calendar header. */
const DENSITY: Record<ChipDensity, DensitySpec> = {
  compact: { chips: 3, allowance: 1.15 },
  comfortable: { chips: 5, allowance: 1.3 },
  spacious: { chips: 7, allowance: 1.8 },
};

const HEADER_H = 28;  // the day-number row
const FOOTER_H = 13;  // the completion meter
const CELL_PAD = 8;   // 4px top + 4px bottom

/**
 * The composer, the "+N more" button and the empty-day invite each replace one
 * chip slot, and each is a standalone control rather than one of a stack — so
 * they get the full 28px target regardless of density. The row budgets for the
 * taller of the two so neither layout ever clips.
 */
const SLOT_H = 28;
const slotHeight = (density: ChipDensity) => Math.max(CHIP_METRICS[density].hit, SLOT_H);

function rowHeight(density: ChipDensity, chips: number): number {
  const chipsH = (chips - 1) * CHIP_METRICS[density].hit + slotHeight(density);
  return HEADER_H + chipsH + FOOTER_H + CELL_PAD;
}

/**
 * How many chips a row of `avail` pixels can hold. Density sets the ceiling,
 * the window sets the floor, and each density decides how far past one
 * screenful it is willing to run before chips give way to "+N more".
 */
function chipsThatFit(density: ChipDensity, avail: number): number {
  const { chips: cap, allowance } = DENSITY[density];
  if (avail <= 0) return cap;
  const room = avail * allowance - HEADER_H - FOOTER_H - CELL_PAD;
  const fit = Math.floor((room - slotHeight(density)) / CHIP_METRICS[density].hit) + 1;
  return Math.max(1, Math.min(cap, fit));
}

// ---------------------------------------------------------
// In-cell composer — the hover "+" opens this rather than
// dropping an unnamed task on the day.
// ---------------------------------------------------------
function ChipComposer({
  date, density, onClose,
}: {
  date: string;
  density: ChipDensity;
  onClose: () => void;
}) {
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
      aria-label={`New task on ${formatDate(date, { year: true })}`}
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
      style={{ height: slotHeight(density) }}
      className={cn(
        "pointer-events-auto w-full rounded-[6px] bg-hover px-1.5 text-ink outline-none placeholder:text-ink-4",
        CHIP_METRICS[density].text,
      )}
    />
  );
}

// ---------------------------------------------------------
// "+N more" — a real popover over the rest of the day, not a label
// ---------------------------------------------------------
function MoreButton({
  date, tasks, hour12, density, tabIndex, onOpenDay,
}: {
  date: string;
  tasks: Task[];
  hour12: boolean;
  density: ChipDensity;
  tabIndex: number;
  onOpenDay: (date: string) => void;
}) {
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <Popover
      align="center"
      className="w-[260px] p-1.5"
      trigger={
        <button
          type="button"
          tabIndex={tabIndex}
          aria-label={`Show ${tasks.length} more on ${formatDate(date, { year: true })}`}
          style={{ height: slotHeight(density) }}
          className={cn(
            "pointer-events-auto flex w-full cursor-pointer items-center gap-1 rounded-[6px] px-1.5",
            "font-medium text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink",
            CHIP_METRICS[density].text,
          )}
        >
          <ChevronsRight className="size-3 shrink-0" aria-hidden />
          <span className="tnum">+{tasks.length} more</span>
        </button>
      }
    >
      {(close) => (
        <>
          <div className="flex items-baseline gap-2 px-1.5 pb-1.5 pt-1">
            <p className="text-[12px] font-medium text-ink-2">
              {formatDate(date)}
            </p>
            <p className="ml-auto text-[11px] text-ink-4 tnum">
              {done}/{tasks.length} done
            </p>
          </div>
          <div className="max-h-[248px] overflow-y-auto">
            {tasks.map((task) => (
              <TaskChip key={task.id} task={task} hour12={hour12} density="spacious" />
            ))}
          </div>
          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              onClick={() => { onOpenDay(date); close(); }}
              className={cn(
                "flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] text-ink",
                "transition-colors duration-150 hover:bg-hover",
              )}
            >
              <Plus className="size-3.5 text-ink-3" aria-hidden />
              Open this day
            </button>
          </div>
        </>
      )}
    </Popover>
  );
}

// ---------------------------------------------------------
// Day cell
//
// The whole cell is one button sitting behind the content, so the largest
// target in the grid is a real, focusable, keyboard-operable control. The
// content column above it is pointer-transparent apart from its own controls,
// which is what keeps the chips clickable without nesting them in a button.
// ---------------------------------------------------------
function DayCell({
  date, inMonth, tasks, selected, inRange, rangeEdge, isToday, hour12, density,
  maxChips, previewed, composing, tabIndex, onCompose, onCloseCompose, onSelect,
  onOpenDay, onPointerDownCell, onPointerEnterCell,
}: {
  date: string;
  inMonth: boolean;
  tasks: Task[];
  selected: boolean;
  inRange: boolean;
  /** first or last day of the selected span — the ends get the ring */
  rangeEdge: boolean;
  isToday: boolean;
  hour12: boolean;
  density: ChipDensity;
  /** chips this row has room for — density's ceiling, capped by the window */
  maxChips: number;
  previewed: boolean;
  composing: boolean;
  tabIndex: number;
  onCompose: (date: string) => void;
  onCloseCompose: () => void;
  onSelect: (date: string, shiftKey: boolean, detail: number) => void;
  onOpenDay: (date: string) => void;
  onPointerDownCell: (date: string, e: React.PointerEvent) => void;
  onPointerEnterCell: (date: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${date}`,
    data: { type: "day", date },
  });
  const cellButtonRef = React.useRef<HTMLButtonElement>(null);

  // Roving tabindex: arrow keys move the selection, so focus follows it —
  // but only when the grid already had focus, never stealing it from elsewhere.
  React.useEffect(() => {
    if (!selected) return;
    const el = cellButtonRef.current;
    const focused = document.activeElement as HTMLElement | null;
    if (el && focused && focused !== el && focused.dataset.dayCellButton !== undefined) el.focus();
  }, [selected]);

  // The composer and the "+N more" button each take the last slot rather than
  // sitting below a full stack — that is what `rowHeight` budgets for, so the
  // cell can never promise more chips than it has room to paint.
  const overflows = !composing && tasks.length > maxChips;
  const shown = composing || overflows ? Math.max(0, maxChips - 1) : maxChips;
  const visible = tasks.slice(0, shown);
  const overflow = tasks.slice(shown);
  const counted = tasks.filter((t) => t.status !== "dropped");
  const done = counted.filter((t) => t.status === "done").length;
  const total = counted.length;
  const unfinished = counted.filter((t) => t.status !== "done").length;
  const stale = date < todayISO() && unfinished > 0;
  const weekend = weekday(date) === 0 || weekday(date) === 6;
  const firstOfMonth = date.slice(8) === "01";

  const label = [
    formatDate(date, { year: true }),
    isToday ? "today" : null,
    total ? `${done} of ${total} done` : "nothing scheduled",
    stale ? `${unfinished} still open from a past day` : null,
    inRange ? "in the selected range" : null,
  ].filter(Boolean).join(", ");

  return (
    <div
      ref={setNodeRef}
      data-day-cell={date}
      onPointerEnter={() => onPointerEnterCell(date)}
      className={cn(
        "group/cell relative flex min-h-0 min-w-0 flex-col border-b border-l border-line",
        "transition-colors duration-150",
        // Weekends used to carry their own wash too, which made the month read
        // as a checkerboard before it read as a calendar. The day number and
        // the column header still mark them.
        !inMonth && "bg-sunken/60",
        selected && "bg-selected",
        inRange && "bg-accent-soft",
        previewed && !isOver && "bg-accent-soft",
        isOver && "bg-accent-soft ring-1 ring-inset ring-accent-line",
        rangeEdge && "ring-1 ring-inset ring-accent-line",
      )}
    >
      {/* The cell target. Everything else paints on top of it. */}
      <button
        ref={cellButtonRef}
        type="button"
        data-day-cell-button=""
        tabIndex={tabIndex}
        aria-label={label}
        aria-current={isToday ? "date" : undefined}
        onPointerDown={(e) => onPointerDownCell(date, e)}
        onClick={(e) => onSelect(date, e.shiftKey, e.detail)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          if (e.shiftKey) onOpenDay(date);
          else onSelect(date, false, 1);
        }}
        className="absolute inset-0 cursor-pointer rounded-none"
      />

      {/* Content column — transparent to the pointer except its own controls. */}
      <div className="pointer-events-none relative flex min-h-0 flex-1 flex-col p-1">
        <div className="flex items-center gap-1" style={{ height: HEADER_H }}>
          <span
            className={cn(
              "grid h-6 min-w-6 place-items-center rounded-full px-1 leading-none display-serif tnum",
              "text-[22px] transition-colors duration-150",
              isToday
                ? "bg-accent text-accent-ink"
                : inMonth
                  ? weekend ? "text-ink-2" : "text-ink"
                  : "text-ink-3",
            )}
          >
            {dayNumber(date)}
          </span>

          {firstOfMonth && !isToday && (
            <span className="text-[11px] font-medium text-ink-3">
              {monthName(date, true)}
            </span>
          )}

          {stale && (
            // A past day with loose ends is a fact, not an emergency: a quiet
            // dot, with the count in the cell's own label and its tooltip.
            <span
              aria-hidden
              title={`${unfinished} still open on a day that has passed`}
              className="size-1.5 shrink-0 rounded-full bg-ink-4"
            />
          )}

          {total > 0 && (
            <button
              type="button"
              tabIndex={tabIndex}
              aria-label={`Add a task on ${formatDate(date, { year: true })}`}
              onClick={(e) => { e.stopPropagation(); onCompose(date); }}
              className={cn(
                "pointer-events-auto ml-auto grid size-7 cursor-pointer place-items-center rounded-md text-ink-4",
                "opacity-0 transition-[opacity,color,background-color] duration-150",
                "hover:bg-hover hover:text-ink-2 focus-visible:opacity-100 group-hover/cell:opacity-100",
              )}
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {visible.map((task) => (
            <TaskChip
              key={task.id}
              task={task}
              hour12={hour12}
              density={density}
              tabIndex={tabIndex}
              className="pointer-events-auto"
            />
          ))}

          {composing && (
            <ChipComposer date={date} density={density} onClose={onCloseCompose} />
          )}

          {overflow.length > 0 && !composing && (
            <MoreButton
              date={date}
              tasks={overflow}
              hour12={hour12}
              density={density}
              tabIndex={tabIndex}
              onOpenDay={onOpenDay}
            />
          )}

          {/* An empty day should ask for something, not sit there. */}
          {total === 0 && !composing && (
            <button
              type="button"
              tabIndex={tabIndex}
              aria-label={`Add the first task on ${formatDate(date, { year: true })}`}
              onClick={(e) => { e.stopPropagation(); onCompose(date); }}
              style={{ height: slotHeight(density) }}
              className={cn(
                "pointer-events-auto flex w-full cursor-pointer items-center gap-1 rounded-[6px] px-1 text-left",
                "text-ink-4 opacity-0 transition-[opacity,color,background-color] duration-150",
                "hover:bg-hover hover:text-ink-3 focus-visible:opacity-100 group-hover/cell:opacity-100",
                CHIP_METRICS[density].text,
              )}
            >
              <Plus className="size-3 shrink-0" aria-hidden />
              Add
            </button>
          )}
        </div>

        {total > 0 && (
          // Under three items the meter is a fourth mark in a cell that already
          // shows everything it counts, so it waits for a hover or a focus.
          // The row still budgets its height, so nothing shifts when it appears.
          <div
            aria-hidden
            className={cn(
              "flex items-center gap-1.5 transition-opacity duration-150",
              total > 2
                ? "opacity-100"
                : "opacity-0 group-focus-within/cell:opacity-100 group-hover/cell:opacity-100",
            )}
            style={{ height: FOOTER_H }}
          >
            <div className="h-[2px] min-w-0 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-apple)]"
                style={{
                  width: `${(done / total) * 100}%`,
                  background: done === total ? "var(--success)" : "var(--accent)",
                }}
              />
            </div>
            <span className="shrink-0 text-[10.5px] text-ink-3 tnum">
              {done}<span className="text-ink-4">/{total}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Week number gutter — also the fastest way to select a whole week
// ---------------------------------------------------------
function WeekCell({
  week, selected, onSelectWeek,
}: {
  week: string[];
  selected: boolean;
  onSelectWeek: (week: string[]) => void;
}) {
  const n = weekNumber(week[0]);
  return (
    <div className="relative border-b border-l border-line bg-sunken/60">
      <button
        type="button"
        onClick={() => onSelectWeek(week)}
        aria-label={`Week ${n} — select ${formatDate(week[0], { weekday: false })} to ${formatDate(week[6], { weekday: false })}`}
        title={`Week ${n} — select all seven days`}
        className={cn(
          "absolute inset-0 grid cursor-pointer place-items-start justify-center pt-1.5",
          "text-[11px] transition-colors duration-150 hover:bg-hover",
          selected ? "font-semibold text-accent" : "text-ink-4 hover:text-ink-3",
        )}
      >
        <span className="tnum">{n}</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------
// Selection bar — what a multi-day selection is actually for
// ---------------------------------------------------------
function SelectionBar({
  dates, tasks, onClear, onShift, onAdd,
}: {
  dates: string[];
  tasks: Task[];
  onClear: () => void;
  onShift: (delta: number) => void;
  onAdd: (text: string) => void;
}) {
  const [value, setValue] = React.useState("");
  const open = tasks.filter((t) => t.status !== "done").length;

  return (
    <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-line bg-raised p-1.5 shadow-md anim-slide">
      <div className="flex items-baseline gap-2 pl-1">
        <span className="text-[12.5px] font-medium text-ink tnum">
          {dates.length} days
        </span>
        <span className="text-[11.5px] text-ink-4 tnum">
          {formatDate(dates[0], { weekday: false })} – {formatDate(dates[dates.length - 1], { weekday: false })}
        </span>
      </div>

      <form
        className="flex min-w-[220px] flex-1 items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const text = value.trim();
          if (!text) return;
          onAdd(text);
          setValue("");
        }}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          // The grid listens for Shift+arrows and Escape; typing here is not that.
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={`Add one task to each of the ${dates.length} selected days`}
          placeholder={`Add to all ${dates.length} days — try “7am #gym”`}
          className="h-7 min-w-0 flex-1 text-[12.5px]"
        />
        <Button type="submit" variant="primary" size="sm" disabled={!value.trim()}>
          Add
        </Button>
      </form>

      <div className="flex items-center gap-0.5">
        <IconButton
          label={`Pull ${open} unfinished tasks back one day`}
          disabled={!open}
          onClick={() => onShift(-1)}
        >
          <ChevronsLeft />
        </IconButton>
        <span className="px-0.5 text-[11px] text-ink-3 tnum">{open} open</span>
        <IconButton
          label={`Push ${open} unfinished tasks forward one day`}
          disabled={!open}
          onClick={() => onShift(1)}
        >
          <ChevronsRight />
        </IconButton>
      </div>

      <IconButton label="Clear the selection" onClick={onClear}>
        <X />
      </IconButton>
    </div>
  );
}

// =========================================================
// Month
// =========================================================
export function MonthView({
  anchor, weekStart, hour12, density, weekNums, preview, onPeek, onOpenDay,
}: {
  anchor: string;
  weekStart: number;
  hour12: boolean;
  /** Chips per day. Owned by the page's View popover, remembered there. */
  density: ChipDensity;
  weekNums: boolean;
  preview: DropPreview | null;
  onPeek: (date: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const selectedDate = useStore((s) => s.selectedDate);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const addTask = useStore((s) => s.addTask);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  const [composing, setComposing] = React.useState<string | null>(null);
  const [range, setRange] = React.useState<{ anchor: string; head: string } | null>(null);
  const [availPerRow, setAvailPerRow] = React.useState(0);

  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const headerRowRef = React.useRef<HTMLDivElement>(null);

  // How tall a week gets is a layout fact, not derivable state — the scroller's
  // own height drives it, never the content, so this can't feed back on itself.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const head = headerRowRef.current?.offsetHeight ?? 29;
      setAvailPerRow(Math.floor((el.clientHeight - head) / 6));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const grid = React.useMemo(() => monthGrid(anchor, weekStart), [anchor, weekStart]);
  const weeks = React.useMemo(
    () => Array.from({ length: 6 }, (_, i) => grid.slice(i * 7, i * 7 + 7)),
    [grid],
  );
  const headers = React.useMemo(() => weekdayHeaders(weekStart, "short"), [weekStart]);
  const byDate = React.useMemo(() => bucketByDate(tasks), [tasks]);
  const previewSet = React.useMemo(() => new Set(preview?.dates ?? []), [preview]);
  const today = todayISO();

  // ---- multi-day selection ----
  const rangeDates = React.useMemo(() => {
    if (!range) return [];
    const [from, to] = range.anchor <= range.head ? [range.anchor, range.head] : [range.head, range.anchor];
    return daysBetween(from, to);
  }, [range]);
  const rangeSet = React.useMemo(() => new Set(rangeDates), [rangeDates]);
  const rangeActive = rangeDates.length > 1;

  const rangeTasks = React.useMemo(
    () => (rangeActive ? tasks.filter((t) => t.date && rangeSet.has(t.date) && !t.parent_id && t.status !== "dropped") : []),
    [tasks, rangeSet, rangeActive],
  );

  // A drag that grew past its first cell must not also fire the cell's click.
  const dragging = React.useRef(false);
  const swallowClick = React.useRef(false);

  React.useEffect(() => {
    // A drag that ends on a different cell fires its click on the grid, not on
    // the cell button — so the flag has to expire on its own or it would eat
    // the next honest click.
    const end = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setTimeout(() => { swallowClick.current = false; }, 0);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const onPointerDownCell = React.useCallback((date: string, e: React.PointerEvent) => {
    if (e.button !== 0 || e.shiftKey) return;
    dragging.current = true;
    swallowClick.current = false;
    setRange({ anchor: date, head: date });
  }, []);

  const onPointerEnterCell = React.useCallback((date: string) => {
    if (!dragging.current) return;
    swallowClick.current = true;
    setRange((r) => (r && r.head !== date ? { ...r, head: date } : r));
  }, []);

  const onSelect = React.useCallback((date: string, shiftKey: boolean, detail: number) => {
    if (swallowClick.current) return;
    if (shiftKey) {
      setRange((r) => ({ anchor: r?.anchor ?? selectedDate, head: date }));
      setSelectedDate(date);
      return;
    }
    setRange(null);
    setSelectedDate(date);
    if (detail > 1) onOpenDay(date);
    else onPeek(date);
  }, [selectedDate, setSelectedDate, onOpenDay, onPeek]);

  const selectWeek = React.useCallback((week: string[]) => {
    setRange({ anchor: week[0], head: week[6] });
    setSelectedDate(week[0]);
  }, [setSelectedDate]);

  // ---- bulk actions ----
  const addAcross = React.useCallback((text: string) => {
    const parsed = parseTask(text, weekStart);
    const created = rangeDates.map((date) => addTask({
      title: parsed.title,
      date,
      start_min: parsed.start_min,
      end_min: parsed.end_min,
      all_day: parsed.start_min == null,
      duration_min: parsed.duration_min,
      priority: parsed.priority,
      tags: parsed.tags,
      color: parsed.color,
    }).id);

    toast({
      title: `Added to ${rangeDates.length} days`,
      description: parsed.title,
      tone: "success",
      action: {
        label: "Undo",
        run: () => created.forEach((id) => useStore.getState().remove("tasks", id)),
      },
    });
  }, [rangeDates, weekStart, addTask, toast]);

  const shiftRange = React.useCallback((delta: number) => {
    const moving = rangeTasks.filter((t) => t.status !== "done");
    if (!moving.length) return;
    const before = moving.map((t) => ({ id: t.id, date: t.date as string }));
    before.forEach(({ id, date }) => patch("tasks", id, { date: addDays(date, delta) }));
    setRange((r) => (r ? { anchor: addDays(r.anchor, delta), head: addDays(r.head, delta) } : r));

    toast({
      title: `${moving.length} ${moving.length === 1 ? "task" : "tasks"} moved ${delta > 0 ? "forward" : "back"} a day`,
      description: `Across ${rangeDates.length} selected days.`,
      tone: "success",
      action: {
        label: "Undo",
        run: () => {
          const s = useStore.getState();
          before.forEach(({ id, date }) => s.patch("tasks", id, { date }));
        },
      },
    });
  }, [rangeTasks, rangeDates.length, patch, toast]);

  // ---- keyboard ----
  function onGridKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && range) {
      e.preventDefault();
      setRange(null);
      return;
    }
    if (!e.shiftKey) return;
    const delta =
      e.key === "ArrowLeft" ? -1 :
        e.key === "ArrowRight" ? 1 :
          e.key === "ArrowUp" ? -7 :
            e.key === "ArrowDown" ? 7 : 0;
    if (!delta) return;
    e.preventDefault();
    const head = addDays(range?.head ?? selectedDate, delta);
    setRange({ anchor: range?.anchor ?? selectedDate, head });
    setSelectedDate(head);
  }

  const cols = weekNums
    ? "34px repeat(7, minmax(0, 1fr))"
    : "repeat(7, minmax(0, 1fr))";
  const maxChips = chipsThatFit(density, availPerRow);
  const rowH = rowHeight(density, maxChips);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Density, week numbers and the how-to now live in the header's View
          popover, so the month opens on the grid and nothing else. What the
          old status line said out loud is still announced here. */}
      <div aria-live="polite" aria-atomic="true">
        <VisuallyHidden>
          {rangeActive
            ? `${rangeDates.length} days selected. Shift and the arrow keys extend it, Escape clears it.`
            : ""}
        </VisuallyHidden>
      </div>

      {/* ---- the grid ---- */}
      <div
        ref={scrollerRef}
        onKeyDown={onGridKeyDown}
        role="group"
        aria-label={`${monthName(anchor)} calendar grid`}
        className="min-h-0 flex-1 select-none overflow-y-auto border-r border-t border-line"
      >
        <div className="flex min-h-full flex-col">
          <div
            ref={headerRowRef}
            className="sticky top-0 z-20 grid shrink-0 material"
            style={{ gridTemplateColumns: cols }}
          >
            {weekNums && (
              <div className="border-b border-l border-line px-1 py-1.5 text-center text-[10.5px] font-medium text-ink-4">
                Wk
              </div>
            )}
            {headers.map((label, i) => (
              <div
                key={label + i}
                className={cn(
                  "border-b border-l border-line px-2 py-1.5 text-[11px] font-medium",
                  (i + weekStart) % 7 === 0 || (i + weekStart) % 7 === 6 ? "text-ink-4" : "text-ink-3",
                )}
              >
                {label}
              </div>
            ))}
          </div>

          {weeks.map((week) => (
            <div
              key={week[0]}
              className="grid flex-1"
              style={{ gridTemplateColumns: cols, minHeight: rowH }}
            >
              {weekNums && (
                <WeekCell
                  week={week}
                  selected={week.every((d) => rangeSet.has(d)) && rangeActive}
                  onSelectWeek={selectWeek}
                />
              )}
              {week.map((date) => {
                const inRange = rangeActive && rangeSet.has(date);
                const edge = inRange &&
                  (date === rangeDates[0] || date === rangeDates[rangeDates.length - 1]);
                return (
                  <DayCell
                    key={date}
                    date={date}
                    inMonth={isSameMonth(date, anchor)}
                    tasks={byDate.get(date) ?? []}
                    selected={date === selectedDate}
                    inRange={inRange}
                    rangeEdge={edge}
                    isToday={date === today}
                    hour12={hour12}
                    density={density}
                    maxChips={maxChips}
                    previewed={previewSet.has(date)}
                    composing={composing === date}
                    tabIndex={date === selectedDate ? 0 : -1}
                    onCompose={setComposing}
                    onCloseCompose={() => setComposing(null)}
                    onSelect={onSelect}
                    onOpenDay={onOpenDay}
                    onPointerDownCell={onPointerDownCell}
                    onPointerEnterCell={onPointerEnterCell}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {rangeActive && (
        <SelectionBar
          dates={rangeDates}
          tasks={rangeTasks}
          onClear={() => setRange(null)}
          onShift={shiftRange}
          onAdd={addAcross}
        />
      )}
    </div>
  );
}
