"use client";

import * as React from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor,
  pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowRight, CalendarRange, Clock, GripVertical, PanelRight, Sparkles, Wand2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, tasksOn } from "@/lib/store";
import { addDays, formatDuration, formatTime } from "@/lib/date";
import { prayerTimesFor } from "@/lib/prayer";
import { PRAYER_LABELS, PRAYER_NAMES, type Task } from "@/lib/types";
import { Button } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
import { VisuallyHidden } from "@/components/ui/form";
import { Fold, useFold } from "./fold";
import { RibbonBlock } from "./ribbon-block";
import { TimeBudget } from "./time-budget";
import {
  SLOT_MIN, blockLength, budgetFor, busyRanges, estimateOf, hourLabel,
  isOpenTask, nextFreeSlot, overlaps, packLanes, type Range,
} from "./day-math";

const ESTIMATES = [15, 30, 45, 60, 90, 120];
const CHIP_LIMIT = 10;
/** Keyboard drag lives on M so the chip keeps Space and Enter for its own menu. */
const KEYBOARD_CODES = {
  start: ["KeyM"],
  cancel: ["Escape"],
  end: ["KeyM", "Space", "Enter"],
};

interface Snapshot { id: string; date: string | null; start: number | null; end: number | null; allDay: boolean }
const snapshotOf = (t: Task): Snapshot =>
  ({ id: t.id, date: t.date, start: t.start_min, end: t.end_min, allDay: t.all_day });

// ---------------------------------------------------------
// Half-hour drop target
// ---------------------------------------------------------
function Slot({ min }: { min: number }) {
  const { setNodeRef } = useDroppable({ id: `slot-${min}` });
  return <div ref={setNodeRef} className="h-full flex-1" />;
}

// ---------------------------------------------------------
// One unscheduled task: drag it, or open its menu and pick a time
// ---------------------------------------------------------
function Chip({
  task, blocked, listFrom, dayEnd, hour12, onSchedule, onEstimate, onPush,
}: {
  task: Task;
  blocked: Range[];
  listFrom: number;
  dayEnd: number;
  hour12: boolean;
  onSchedule: (task: Task, min: number) => void;
  onEstimate: (task: Task, minutes: number) => void;
  onPush: (task: Task) => void;
}) {
  const openInspector = useStore((s) => s.openInspector);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  const estimate = estimateOf(task);
  const length = blockLength(task);
  const suggestion = nextFreeSlot(listFrom, length, blocked, dayEnd);

  const slots: number[] = [];
  for (let m = Math.ceil(listFrom / SLOT_MIN) * SLOT_MIN; m + length <= dayEnd; m += SLOT_MIN) slots.push(m);

  return (
    <Popover
      align="start"
      className="w-[248px]"
      trigger={
        <button
          ref={setNodeRef}
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`${task.title || "Untitled"}${estimate ? `, ${formatDuration(estimate)}` : ", no estimate"} — schedule it`}
          className={cn(
            "group/chip inline-flex h-7 max-w-[240px] items-center gap-1.5 rounded-md border border-line bg-raised pl-1.5 pr-2",
            "text-[12.5px] text-ink cursor-grab touch-none active:cursor-grabbing",
            "transition-[background-color,border-color,transform,opacity] duration-150 ease-[var(--ease-out-apple)]",
            "hover:border-line-strong hover:bg-hover active:scale-[0.97]",
            task.color && `tint-${task.color}`,
            isDragging && "opacity-40",
          )}
        >
          <GripVertical className="size-3 shrink-0 text-ink-4 group-hover/chip:text-ink-3" />
          {task.color && (
            <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: "var(--tint)" }} />
          )}
          <span className="min-w-0 truncate">{task.title || "Untitled"}</span>
          <span className={cn("shrink-0 text-[11.5px] tnum", estimate ? "text-ink-3" : "text-ink-4")}>
            {estimate ? formatDuration(estimate) : "—"}
          </span>
        </button>
      }
    >
      {(close) => (
        <>
          <MenuLabel>Schedule</MenuLabel>
          {suggestion != null ? (
            <MenuItem icon={Sparkles} onClick={() => { onSchedule(task, suggestion); close(); }}>
              Next free slot · {formatTime(suggestion, hour12)}
            </MenuItem>
          ) : (
            <p className="px-2 pb-1 text-[11.5px] text-ink-4">No free slot left today.</p>
          )}

          {slots.length > 0 && (
            <div className="mt-1 max-h-[188px] overflow-y-auto">
              {slots.map((m) => {
                const busy = blocked.some((b) => overlaps({ start: m, end: m + length }, b));
                return (
                  <MenuItem key={m} onClick={() => { onSchedule(task, m); close(); }}>
                    <span className="tnum">{formatTime(m, hour12)}</span>
                    {busy && <span className="ml-1.5 text-[11.5px] text-ink-4">busy</span>}
                  </MenuItem>
                );
              })}
            </div>
          )}

          <MenuSeparator />
          <MenuLabel>Estimate</MenuLabel>
          <div className="flex flex-wrap gap-1 px-1 pb-1">
            {ESTIMATES.map((m) => {
              const active = estimate === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onEstimate(task, m)}
                  className={cn(
                    "h-7 cursor-pointer rounded-md px-2 text-[12px] font-medium tnum",
                    "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)] active:scale-[0.95]",
                    active ? "bg-accent-soft text-accent" : "bg-hover text-ink-2 hover:bg-active hover:text-ink",
                  )}
                >
                  {formatDuration(m)}
                </button>
              );
            })}
          </div>

          <MenuSeparator />
          <MenuItem icon={ArrowRight} onClick={() => { onPush(task); close(); }}>Push to tomorrow</MenuItem>
          <MenuItem icon={PanelRight} onClick={() => { openInspector(task.id); close(); }}>Open task</MenuItem>
        </>
      )}
    </Popover>
  );
}

// ---------------------------------------------------------
// The strip
// ---------------------------------------------------------
export function PlanStrip({ date, minutesNow }: { date: string; minutesNow: number }) {
  const tasks = useStore((s) => s.tasks);
  const profile = useStore((s) => s.profile);
  const hour12 = useStore((s) => s.hour12);
  const moveTask = useStore((s) => s.moveTask);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const openInspector = useStore((s) => s.openInspector);

  const [dragging, setDragging] = React.useState<Task | null>(null);
  const [overMin, setOverMin] = React.useState<number | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const ribbonId = React.useId();
  const budgetId = React.useId();
  // A resize turns pixels into minutes, so it needs the ribbon's own width.
  const trackRef = React.useRef<HTMLDivElement>(null);
  // The planner is a tool you reach for, not a thing you read. It rests folded.
  const { open, toggle } = useFold("planOpen", false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { keyboardCodes: KEYBOARD_CODES }),
  );

  const day = React.useMemo(() => tasksOn(tasks, date), [tasks, date]);
  const budget = React.useMemo(() => budgetFor(day, minutesNow), [day, minutesNow]);
  const unscheduled = React.useMemo(
    () => day
      .filter((t) => isOpenTask(t) && t.start_min == null)
      .sort((a, b) => b.priority - a.priority || a.order_index - b.order_index),
    [day],
  );

  const times = React.useMemo(
    () => prayerTimesFor(date, {
      latitude: profile?.latitude ?? 41.2995,
      longitude: profile?.longitude ?? 69.2401,
      method: profile?.calc_method ?? "MuslimWorldLeague",
      madhab: profile?.madhab ?? "hanafi",
    }),
    [date, profile?.latitude, profile?.longitude, profile?.calc_method, profile?.madhab],
  );

  const busy = React.useMemo(() => busyRanges(day), [day]);
  // Prayer keeps its own 15 minutes — auto-fill plans around it rather than over it.
  const prayerBlocks = React.useMemo<Range[]>(
    () => PRAYER_NAMES.map((n) => ({ start: times[n], end: times[n] + 15, label: PRAYER_LABELS[n] })),
    [times],
  );
  const blocked = React.useMemo(
    () => [...busy, ...prayerBlocks].sort((a, b) => a.start - b.start),
    [busy, prayerBlocks],
  );

  // ---- ribbon geometry ----
  const dayEnd = budget.dayEnd;
  let startHour = 7;
  let endHour = Math.ceil(dayEnd / 60);
  for (const r of busy) {
    startHour = Math.min(startHour, Math.floor(r.start / 60));
    endHour = Math.max(endHour, Math.ceil(r.end / 60));
  }
  startHour = Math.max(0, Math.min(startHour, Math.floor(minutesNow / 60)));
  endHour = Math.min(24, Math.max(endHour, Math.floor(minutesNow / 60) + 1, startHour + 4));
  const rangeStart = startHour * 60;
  const rangeEnd = endHour * 60;
  const span = rangeEnd - rangeStart;
  const pctOf = (min: number) => ((min - rangeStart) / span) * 100;

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const slots = Array.from({ length: (endHour - startHour) * 2 }, (_, i) => rangeStart + i * SLOT_MIN);

  // Sorted explicitly: lane packing assumes chronological input.
  const timed = React.useMemo(
    () => day
      .filter((t) => !t.parent_id && t.start_min != null)
      .sort((a, b) => (a.start_min as number) - (b.start_min as number)),
    [day],
  );
  const blocks = React.useMemo(() => {
    const ranges: Range[] = timed.map((t) => ({
      start: t.start_min as number,
      end: Math.max((t.start_min as number) + 15, t.end_min ?? (t.start_min as number) + blockLength(t)),
    }));
    const { lanes, count } = packLanes(ranges);
    return { items: timed.map((t, i) => ({ task: t, range: ranges[i], lane: lanes[i] })), laneCount: count };
  }, [timed]);

  const laneGap = 2;
  const trackH = 44;
  const laneH = (trackH - 4 - laneGap * (blocks.laneCount - 1)) / blocks.laneCount;
  const listFrom = Math.max(rangeStart, minutesNow);

  // ---- actions ----
  const schedule = React.useCallback((task: Task, min: number) => {
    const before = snapshotOf(task);
    moveTask(task.id, date, min);
    toast({
      title: `${task.title || "Task"} at ${formatTime(min, hour12)}`,
      description: formatDuration(blockLength(task)),
      action: {
        label: "Undo",
        run: () => patch("tasks", before.id, {
          date: before.date, start_min: before.start, end_min: before.end, all_day: before.allDay,
        }),
      },
    });
  }, [date, hour12, moveTask, patch, toast]);

  const estimate = React.useCallback((task: Task, minutes: number) => {
    patch("tasks", task.id, { duration_min: task.duration_min === minutes ? null : minutes });
  }, [patch]);

  /**
   * An edge was dragged. Only the two times are written: `estimateOf` already
   * prefers end minus start over the stored estimate, so the budget follows on
   * its own and there is no second number to keep in step.
   */
  const resize = React.useCallback((task: Task, start: number, end: number) => {
    const before = snapshotOf(task);
    patch("tasks", task.id, { start_min: start, end_min: end, all_day: false });
    toast({
      title: `${task.title || "Task"} · ${formatTime(start, hour12)}–${formatTime(end, hour12)}`,
      description: formatDuration(end - start),
      action: {
        label: "Undo",
        run: () => patch("tasks", before.id, {
          start_min: before.start, end_min: before.end, all_day: before.allDay,
        }),
      },
    });
  }, [hour12, patch, toast]);

  const push = React.useCallback((task: Task) => {
    const before = snapshotOf(task);
    patch("tasks", task.id, { date: addDays(date, 1) });
    toast({
      title: "Pushed to tomorrow",
      description: task.title,
      action: { label: "Undo", run: () => patch("tasks", before.id, { date: before.date }) },
    });
  }, [date, patch, toast]);

  function autoFill() {
    const planned: Range[] = blocked.map((b) => ({ ...b }));
    const before: Snapshot[] = [];
    let placed = 0;

    for (const task of unscheduled) {
      const length = blockLength(task);
      const at = nextFreeSlot(listFrom, length, planned, dayEnd);
      if (at == null) break;
      before.push(snapshotOf(task));
      moveTask(task.id, date, at);
      planned.push({ start: at, end: at + length });
      planned.sort((a, b) => a.start - b.start);
      placed++;
    }

    if (!placed) {
      toast({
        title: "No room left today",
        description: `Nothing fits before ${formatTime(dayEnd, hour12)}. Shorten an estimate or push a task.`,
        tone: "danger",
      });
      return;
    }

    const leftOver = unscheduled.length - placed;
    toast({
      title: `Placed ${placed} task${placed === 1 ? "" : "s"}`,
      description: leftOver
        ? `${leftOver} would not fit before ${formatTime(dayEnd, hour12)}.`
        : "Around your prayers and the blocks already there.",
      tone: "success",
      action: {
        label: "Undo",
        run: () => before.forEach((s) => patch("tasks", s.id, {
          date: s.date, start_min: s.start, end_min: s.end, all_day: s.allDay,
        })),
      },
    });
  }

  // ---- dnd ----
  const collision: CollisionDetection = React.useCallback((args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : rectIntersection(args);
  }, []);

  const minFromOver = (id: string | number | undefined) =>
    id != null && String(id).startsWith("slot-") ? Number(String(id).slice(5)) : null;

  function onDragStart(e: DragStartEvent) {
    setDragging(day.find((t) => t.id === e.active.id) ?? null);
  }
  function onDragOver(e: DragOverEvent) {
    setOverMin(minFromOver(e.over?.id));
  }
  function onDragEnd(e: DragEndEvent) {
    const task = dragging;
    const min = minFromOver(e.over?.id);
    setDragging(null);
    setOverMin(null);
    if (!task || min == null) return;
    schedule(task, min);
  }

  const ghostLength = dragging ? blockLength(dragging) : 0;
  const visibleChips = showAll ? unscheduled : unscheduled.slice(0, CHIP_LIMIT);

  const ribbonSummary = [
    `Hour ribbon from ${formatTime(rangeStart, hour12)} to ${formatTime(rangeEnd % 1440, hour12)}.`,
    timed.length
      ? `${timed.length} timed block${timed.length === 1 ? "" : "s"}: ${timed
          .map((t) => `${t.title || "Untitled"} at ${formatTime(t.start_min, hour12)}`)
          .join("; ")}.`
      : "Nothing on the clock yet.",
    `Prayer times: ${PRAYER_NAMES.map((n) => `${PRAYER_LABELS[n]} ${formatTime(times[n], hour12)}`).join(", ")}.`,
  ].join(" ");

  // What the folded row has to say for itself: the whole day in one line.
  const summary = [
    budget.planned > 0 ? `${formatDuration(budget.planned)} planned` : "nothing estimated",
    unscheduled.length ? `${unscheduled.length} unscheduled` : null,
    budget.over > 0 ? `over by ${formatDuration(budget.over)}` : `${formatDuration(budget.left)} left`,
  ].filter(Boolean).join(" · ");

  return (
    <Fold
      icon={CalendarRange}
      title="Plan the day"
      summary={summary}
      open={open}
      onToggle={toggle}
      accessory={
        open ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={autoFill}
            disabled={!unscheduled.length}
            title="Place every unscheduled task in the next free slots"
          >
            <Wand2 className="size-3" />
            Auto-fill
          </Button>
        ) : undefined
      }
    >
      <div className="pb-1 pt-3">
        <TimeBudget budget={budget} hour12={hour12} id={budgetId} />

        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => { setDragging(null); setOverMin(null); }}
        >
          {unscheduled.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {visibleChips.map((task) => (
                <Chip
                  key={task.id}
                  task={task}
                  blocked={blocked}
                  listFrom={listFrom}
                  dayEnd={dayEnd}
                  hour12={hour12}
                  onSchedule={schedule}
                  onEstimate={estimate}
                  onPush={push}
                />
              ))}
              {unscheduled.length > CHIP_LIMIT && (
                <Button size="xs" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show fewer" : `Show all ${unscheduled.length}`}
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-3 text-[12.5px] text-ink-3">
              {timed.length
                ? "Everything today has a time on it."
                : "Nothing to place — add a task and it lands here."}
            </p>
          )}

          {/* ---- ribbon ---- */}
          <div className="mt-3">
            <div aria-hidden className="flex text-[10.5px] text-ink-4 tnum">
              {hours.map((h) => (
                <span key={h} className="min-w-0 flex-1 truncate pl-0.5">{hourLabel(h, hour12)}</span>
              ))}
            </div>

            <div
              ref={trackRef}
              role="group"
              aria-label="Hour ribbon — drop a task on a half hour to schedule it"
              aria-describedby={ribbonId}
              className="relative mt-1 rounded-md bg-hover"
              style={{ height: trackH }}
            >
              {minutesNow > rangeStart && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-l-md bg-active"
                  style={{ width: `${Math.min(100, Math.max(0, pctOf(minutesNow)))}%` }}
                />
              )}

              <div aria-hidden className="absolute inset-0 flex">
                {hours.map((h, i) => (
                  <div key={h} className={cn("flex-1", i > 0 && "hairline-l")} />
                ))}
              </div>

              <div className="absolute inset-0 flex">
                {slots.map((m) => <Slot key={m} min={m} />)}
              </div>

              {blocks.items.map(({ task, range, lane }) => (
                <RibbonBlock
                  key={task.id}
                  task={task}
                  range={range}
                  lane={lane}
                  laneH={laneH}
                  laneGap={laneGap}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  hour12={hour12}
                  trackRef={trackRef}
                  onCommit={resize}
                  onOpen={(t) => openInspector(t.id)}
                />
              ))}

              {overMin != null && dragging && (
                <span
                  aria-hidden
                  className="absolute rounded-[4px] border border-dashed border-accent bg-accent-soft"
                  style={{
                    left: `${Math.max(0, pctOf(overMin))}%`,
                    width: `${Math.max(1.2, (ghostLength / span) * 100)}%`,
                    top: 2,
                    height: trackH - 4,
                  }}
                />
              )}

              {minutesNow >= rangeStart && minutesNow <= rangeEnd && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 bottom-[-2px] w-[1.5px] rounded-full bg-accent"
                  style={{ left: `${pctOf(minutesNow)}%` }}
                />
              )}
            </div>

            <div aria-hidden className="relative mt-1 h-3.5">
              {PRAYER_NAMES.map((name, i) => {
                const at = times[name];
                if (at < rangeStart || at > rangeEnd) return null;
                const prev = i > 0 ? times[PRAYER_NAMES[i - 1]] : -9999;
                const roomy = (at - prev) / span > 0.07;
                return (
                  <span
                    key={name}
                    title={`${PRAYER_LABELS[name]} ${formatTime(at, hour12)}`}
                    className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-px"
                    style={{ left: `${pctOf(at)}%` }}
                  >
                    <span className="h-1.5 w-px bg-line-strong" />
                    {roomy && <span className="text-[10.5px] leading-none text-ink-4">{PRAYER_LABELS[name]}</span>}
                  </span>
                );
              })}
            </div>

            <VisuallyHidden id={ribbonId}>{ribbonSummary}</VisuallyHidden>

            <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-snug text-ink-4">
              <Clock className="size-3 shrink-0" aria-hidden />
              Drag a task onto the ribbon, or press M to pick it up and place it with the arrow keys.
              Drag either edge of a block to change when it starts or ends — Alt for
              single minutes, or tab to an edge and use the arrow keys.
            </p>
          </div>

          <DragOverlay dropAnimation={null}>
            {dragging && (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-accent-line bg-raised px-2 text-[12.5px] text-ink shadow-md">
                {dragging.title || "Untitled"}
                <span className="text-[11.5px] text-ink-3 tnum">{formatDuration(blockLength(dragging))}</span>
              </span>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </Fold>
  );
}
