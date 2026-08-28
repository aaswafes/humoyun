"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import { dayName, dayNumber, formatRange, formatTime, todayISO } from "@/lib/date";
import { useNow } from "@/hooks/use-hotkeys";
import { parseTask } from "@/lib/parse";
import { useStore } from "@/lib/store";
import { PRAYER_LABELS, type PrayerName, type Task } from "@/lib/types";
import { prayerTimesFor } from "@/lib/prayer";
import {
  DAY_MIN, GRID_H, HOUR_H, HOURS, MIN_EVENT_MIN, clampMin,
  isTimed, layoutTimed, snapMin, spanOf, yFor, type DropPreview, type Placed,
} from "./calendar-utils";
import { TaskChip } from "./task-chip";

const GUTTER = 56; // width of the hour-label column

type Live =
  | { kind: "create"; idx: number; anchor: number; start: number; end: number; moved: boolean }
  | { kind: "move"; taskId: string; idx: number; start: number; dur: number; grab: number; moved: boolean }
  | { kind: "resize"; taskId: string; idx: number; start: number; end: number; moved: boolean };

interface Pending { date: string; start: number; end: number }

type AddTask = ReturnType<typeof useStore.getState>["addTask"];

// ---------------------------------------------------------
// Salah bands — each prayer window, behind the events
// ---------------------------------------------------------
function SalahBands({ date, hour12 }: { date: string; hour12: boolean }) {
  const profile = useStore((s) => s.profile);
  const prayers = useStore((s) => s.prayers);
  const cyclePrayer = useStore((s) => s.cyclePrayer);

  const times = React.useMemo(() => {
    if (!profile) return null;
    return prayerTimesFor(date, {
      latitude: profile.latitude,
      longitude: profile.longitude,
      method: profile.calc_method,
      madhab: profile.madhab,
    });
  }, [date, profile]);

  if (!times) return null;

  const windows: { name: PrayerName; start: number; end: number }[] = [
    { name: "fajr", start: times.fajr, end: times.sunrise },
    { name: "dhuhr", start: times.dhuhr, end: times.asr },
    { name: "asr", start: times.asr, end: times.maghrib },
    { name: "maghrib", start: times.maghrib, end: times.isha },
    { name: "isha", start: times.isha, end: DAY_MIN },
  ];

  const statusOf = (name: PrayerName) =>
    prayers.find((p) => p.date === date && p.name === name)?.status ?? "none";

  return (
    <>
      {/* The bands sit under the columns so events always read on top. */}
      <div className="pointer-events-none absolute inset-0">
        {windows.map((w) => (
          <div
            key={w.name}
            className="tint-emerald absolute inset-x-0"
            style={{
              top: yFor(w.start),
              height: Math.max(2, yFor(Math.min(DAY_MIN, w.end)) - yFor(w.start)),
              background: "var(--tint-soft)",
              opacity: 0.55,
              boxShadow: "inset 0 1px 0 0 var(--tint)",
            }}
          />
        ))}
      </div>

      {/* Markers ride above, hugging the right edge where event titles are not. */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {windows.map((w) => {
          const status = statusOf(w.name);
          const logged = status === "prayed" || status === "jamaah";
          return (
            <button
              key={w.name}
              data-no-create
              onClick={() => cyclePrayer(date, w.name)}
              title={`${PRAYER_LABELS[w.name]} — ${status === "none" ? "not logged yet" : status}. Click to cycle.`}
              style={{ top: yFor(w.start) + 3 }}
              className={cn(
                "pointer-events-auto absolute right-2 flex cursor-pointer items-center gap-1 rounded-full border border-line px-1.5 py-[1px]",
                "material text-[10.5px] font-semibold uppercase tracking-[0.06em]",
                "transition-colors duration-150",
                logged ? "text-success" : "text-ink-3 hover:text-ink-2",
              )}
            >
              <span
                className="tint-emerald size-1.5 rounded-full"
                style={{ background: logged ? "var(--success)" : "var(--tint)" }}
              />
              {PRAYER_LABELS[w.name]}
              <span className="font-normal normal-case tracking-normal text-ink-4 tnum">
                {formatTime(w.start, hour12)}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------
// Event block
// ---------------------------------------------------------
function EventBlock({
  task, start, end, col, cols, hour12, lifted, onPointerDown, onOpen,
}: {
  task: Task;
  start: number;
  end: number;
  col: number;
  cols: number;
  hour12: boolean;
  lifted: boolean;
  onPointerDown: (e: React.PointerEvent, task: Task, mode: "move" | "resize") => void;
  onOpen: (taskId: string) => void;
}) {
  const done = task.status === "done";
  const height = Math.max(15, yFor(end) - yFor(start));
  const label = `${task.title || "Untitled"} — ${formatRange(start, end, hour12)}`;

  return (
    <div
      data-event-block
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      onPointerDown={(e) => onPointerDown(e, task, "move")}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        onOpen(task.id);
      }}
      style={{
        top: yFor(start),
        height,
        left: `calc(${(col / cols) * 100}% + 2px)`,
        width: `calc(${(1 / cols) * 100}% - 4px)`,
        background: "var(--tint-soft)",
        boxShadow: "inset 2.5px 0 0 0 var(--tint)",
      }}
      className={cn(
        `tint-${task.color ?? "slate"}`,
        "absolute select-none overflow-hidden rounded-md py-[2px] pl-2 pr-1 touch-none",
        "cursor-grab transition-shadow duration-150 active:cursor-grabbing",
        lifted ? "z-30 shadow-md" : "z-10",
        done && "opacity-65",
      )}
    >
      <p
        className={cn(
          "truncate text-[11.5px] font-medium leading-[1.25]",
          done ? "text-ink-4 line-through decoration-ink-4/60" : "text-[var(--tint-ink)]",
        )}
      >
        {task.title || "Untitled"}
      </p>
      {height >= 34 && (
        <p className="truncate text-[10.5px] leading-[1.3] text-ink-3 tnum">
          {formatRange(start, end, hour12)}
        </p>
      )}
      <div
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, task, "resize"); }}
        className="absolute inset-x-0 bottom-0 h-[7px] cursor-ns-resize touch-none"
      />
    </div>
  );
}

// ---------------------------------------------------------
// TimeGrid — shared by Week (7 columns) and Day (1 wide column)
// ---------------------------------------------------------
export function TimeGrid({
  dates, hour12, allDay = "row", header = true, salah = false, preview,
}: {
  dates: string[];
  hour12: boolean;
  allDay?: "row" | "none";
  header?: boolean;
  salah?: boolean;
  preview?: DropPreview | null;
}) {
  const tasks = useStore((s) => s.tasks);
  const selectedDate = useStore((s) => s.selectedDate);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const moveTask = useStore((s) => s.moveTask);
  const patch = useStore((s) => s.patch);
  const addTask = useStore((s) => s.addTask);
  const openInspector = useStore((s) => s.openInspector);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const gridRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const scrolledOnce = React.useRef(false);
  const liveRef = React.useRef<Live | null>(null);
  const [live, setLive] = React.useState<Live | null>(null);
  const [pending, setPending] = React.useState<Pending | null>(null);

  const now = useNow(30_000);
  const nowMin = React.useMemo(() => {
    const d = new Date(now);
    return d.getHours() * 60 + d.getMinutes();
  }, [now]);
  const today = todayISO();
  const todayIdx = dates.indexOf(today);
  const previewSet = React.useMemo(() => new Set(preview?.dates ?? []), [preview]);

  // Land on the working day rather than midnight.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || scrolledOnce.current) return;
    scrolledOnce.current = true;
    const focus = dates.includes(today) ? Math.max(360, nowMin - 120) : 420;
    el.scrollTop = yFor(focus);
  }, [dates, today, nowMin]);

  const setLiveState = (next: Live | null) => { liveRef.current = next; setLive(next); };

  function pointToSlot(clientX: number, clientY: number) {
    const el = gridRef.current;
    if (!el) return { idx: 0, minutes: 0 };
    const r = el.getBoundingClientRect();
    const colW = r.width / dates.length;
    const idx = Math.max(0, Math.min(dates.length - 1, Math.floor((clientX - r.left) / colW)));
    const minutes = clampMin(((clientY - r.top) / r.height) * DAY_MIN);
    return { idx, minutes };
  }

  function onGridPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-event-block]") || target.closest("[data-no-create]")) return;

    const { idx, minutes } = pointToSlot(e.clientX, e.clientY);
    const anchor = snapMin(minutes);
    setSelectedDate(dates[idx]);
    setLiveState({ kind: "create", idx, anchor, start: anchor, end: Math.min(DAY_MIN, anchor + 30), moved: false });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onBlockPointerDown(e: React.PointerEvent, task: Task, mode: "move" | "resize") {
    if (e.button !== 0) return;
    e.stopPropagation();
    const { idx, minutes } = pointToSlot(e.clientX, e.clientY);
    const { start, end } = spanOf(task);
    setLiveState(
      mode === "move"
        ? { kind: "move", taskId: task.id, idx, start, dur: end - start, grab: minutes - start, moved: false }
        : { kind: "resize", taskId: task.id, idx, start, end, moved: false },
    );
    gridRef.current?.setPointerCapture(e.pointerId);
  }

  function onGridPointerMove(e: React.PointerEvent) {
    const current = liveRef.current;
    if (!current) return;
    const { idx, minutes } = pointToSlot(e.clientX, e.clientY);

    // Snapping means a click never becomes a drag by accident — only a real
    // change in the snapped value flips `moved`.
    if (current.kind === "create") {
      const edge = snapMin(minutes);
      const start = Math.min(current.anchor, edge);
      const end = Math.min(DAY_MIN, Math.max(start + MIN_EVENT_MIN, Math.max(current.anchor, edge)));
      if (start === current.start && end === current.end) return;
      setLiveState({ ...current, start, end, moved: true });
      return;
    }
    if (current.kind === "move") {
      const start = Math.max(0, Math.min(DAY_MIN - current.dur, snapMin(minutes - current.grab)));
      if (start === current.start && idx === current.idx) return;
      setLiveState({ ...current, idx, start, moved: true });
      return;
    }
    const end = Math.max(current.start + MIN_EVENT_MIN, Math.min(DAY_MIN, snapMin(minutes)));
    if (end === current.end) return;
    setLiveState({ ...current, end, moved: true });
  }

  function onGridPointerUp() {
    const current = liveRef.current;
    setLiveState(null);
    if (!current) return;

    if (current.kind === "create") {
      // a plain click still opens a slot — an hour, snapped to where it landed
      const start = current.moved ? current.start : current.anchor;
      const end = current.moved ? current.end : Math.min(DAY_MIN, current.anchor + 60);
      setPending({ date: dates[current.idx], start, end });
      return;
    }
    if (current.kind === "move") {
      if (current.moved) moveTask(current.taskId, dates[current.idx], current.start);
      else openInspector(current.taskId);
      return;
    }
    if (current.moved) {
      patch("tasks", current.taskId, {
        end_min: current.end,
        duration_min: current.end - current.start,
      });
    }
  }

  // A touch that turns into a scroll must not leave a half-made event behind.
  function onGridPointerCancel() { setLiveState(null); }

  // ---- data ----
  const timedByDate = React.useMemo(() => {
    const map = new Map<string, Task[]>();
    dates.forEach((d) => map.set(d, []));
    for (const t of tasks) {
      if (!t.date || t.parent_id || !isTimed(t)) continue;
      map.get(t.date)?.push(t);
    }
    return map;
  }, [tasks, dates]);

  const allDayByDate = React.useMemo(() => {
    const map = new Map<string, Task[]>();
    dates.forEach((d) => map.set(d, []));
    for (const t of tasks) {
      if (!t.date || t.parent_id || isTimed(t)) continue;
      map.get(t.date)?.push(t);
    }
    for (const list of map.values()) list.sort((a, b) => a.order_index - b.order_index);
    return map;
  }, [tasks, dates]);

  /** Timed tasks with the in-flight drag applied, so the block follows the pointer. */
  const displayed = React.useMemo(() => {
    const map = new Map<string, Task[]>();
    dates.forEach((d) => map.set(d, [...(timedByDate.get(d) ?? [])]));
    if (!live || live.kind === "create") return map;

    for (const list of map.values()) {
      const i = list.findIndex((t) => t.id === live.taskId);
      if (i < 0) continue;
      const task = list[i];
      if (live.kind === "resize") {
        list[i] = { ...task, end_min: live.end };
      } else {
        list.splice(i, 1);
        const target = dates[live.idx];
        map.get(target)?.push({
          ...task,
          date: target,
          start_min: live.start,
          end_min: live.start + live.dur,
        });
      }
      break;
    }
    return map;
  }, [dates, timedByDate, live]);

  const hasAllDay = dates.some((d) => (allDayByDate.get(d) ?? []).length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header && (
        <div className="flex shrink-0 border-t border-line">
          <div style={{ width: GUTTER }} className="shrink-0" />
          {dates.map((date) => {
            const isToday = date === today;
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "flex flex-1 cursor-pointer items-baseline justify-center gap-1.5 border-l border-line py-2",
                  "transition-colors duration-150 hover:bg-hover",
                  date === selectedDate && "bg-selected",
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.06em]",
                    isToday ? "text-accent" : "text-ink-3",
                  )}
                >
                  {dayName(date, "short")}
                </span>
                <span
                  className={cn(
                    "grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-[13px] leading-none display-serif tnum",
                    isToday ? "bg-accent text-accent-ink" : "text-ink",
                  )}
                >
                  {dayNumber(date)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {allDay === "row" && (
        <div className={cn("flex shrink-0 border-t border-line", !hasAllDay && "h-[30px]")}>
          <div
            style={{ width: GUTTER }}
            className="shrink-0 pr-2 pt-1.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4"
          >
            All-day
          </div>
          {dates.map((date) => (
            <AllDayCell key={date} date={date} tasks={allDayByDate.get(date) ?? []} hour12={hour12} />
          ))}
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        <div className="flex" style={{ height: GRID_H }}>
          <div style={{ width: GUTTER }} className="relative shrink-0">
            {HOURS.filter((h) => h > 0).map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10.5px] text-ink-4 tnum"
                style={{ top: h * HOUR_H }}
              >
                {formatTime(h * 60, hour12)}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            onPointerDown={onGridPointerDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={onGridPointerCancel}
            className="relative flex flex-1"
          >
            {salah && dates.length === 1 && <SalahBands date={dates[0]} hour12={hour12} />}

            {HOURS.map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute inset-x-0 h-px bg-line"
                style={{ top: h * HOUR_H }}
              />
            ))}

            {dates.map((date, idx) => (
              <DayColumn
                key={date}
                date={date}
                idx={idx}
                selected={date === selectedDate && dates.length > 1}
                previewed={previewSet.has(date)}
                placed={layoutTimed(displayed.get(date) ?? [])}
                hour12={hour12}
                live={live}
                pending={pending?.date === date ? pending : null}
                onBlockPointerDown={onBlockPointerDown}
                onOpen={openInspector}
                onPendingDone={() => setPending(null)}
                weekStart={weekStart}
                addTask={addTask}
              />
            ))}

            {todayIdx >= 0 && (
              <div
                className="pointer-events-none absolute z-20"
                style={{
                  top: yFor(nowMin),
                  left: `${(todayIdx / dates.length) * 100}%`,
                  width: `${(1 / dates.length) * 100}%`,
                }}
              >
                <div className="h-px w-full bg-accent" />
                <div className="absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-accent" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// One day column
// ---------------------------------------------------------
function DayColumn({
  date, idx, selected, previewed, placed, hour12, live, pending,
  onBlockPointerDown, onOpen, onPendingDone, weekStart, addTask,
}: {
  date: string;
  idx: number;
  selected: boolean;
  previewed: boolean;
  placed: Placed[];
  hour12: boolean;
  live: Live | null;
  pending: Pending | null;
  onBlockPointerDown: (e: React.PointerEvent, task: Task, mode: "move" | "resize") => void;
  onOpen: (taskId: string) => void;
  onPendingDone: () => void;
  weekStart: number;
  addTask: AddTask;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${date}`,
    data: { type: "day", date },
  });

  const creating = live?.kind === "create" && live.idx === idx ? live : null;
  const draggingId = live && live.kind !== "create" ? live.taskId : null;

  return (
    <div
      ref={setNodeRef}
      data-day-cell={date}
      className={cn(
        "relative min-w-0 flex-1 border-l border-line transition-colors duration-150",
        selected && "bg-selected/50",
        previewed && !isOver && "bg-accent-soft",
        isOver && "bg-accent-soft ring-1 ring-inset ring-accent-line",
      )}
    >
      {placed.map((p) => (
        <EventBlock
          key={p.task.id}
          task={p.task}
          start={p.start}
          end={p.end}
          col={p.col}
          cols={p.cols}
          hour12={hour12}
          lifted={draggingId === p.task.id}
          onPointerDown={onBlockPointerDown}
          onOpen={onOpen}
        />
      ))}

      {creating && (
        <div
          className="pointer-events-none absolute inset-x-1 z-20 rounded-md border border-accent-line bg-accent-soft px-2 py-[2px]"
          style={{ top: yFor(creating.start), height: Math.max(15, yFor(creating.end) - yFor(creating.start)) }}
        >
          <p className="truncate text-[10.5px] font-medium text-accent tnum">
            {formatRange(creating.start, creating.end, hour12)}
          </p>
        </div>
      )}

      {pending && (
        <PendingComposer
          date={date}
          start={pending.start}
          end={pending.end}
          hour12={hour12}
          weekStart={weekStart}
          addTask={addTask}
          onDone={onPendingDone}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------
// The new-event field that appears where the drag ended
// ---------------------------------------------------------
function PendingComposer({
  date, start, end, hour12, weekStart, addTask, onDone,
}: {
  date: string;
  start: number;
  end: number;
  hour12: boolean;
  weekStart: number;
  addTask: AddTask;
  onDone: () => void;
}) {
  const [value, setValue] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { ref.current?.focus(); }, []);

  function commit() {
    const text = value.trim();
    if (!text) { onDone(); return; }
    const parsed = parseTask(text, weekStart);
    const from = parsed.start_min ?? start;
    const to = parsed.end_min ?? Math.max(from + MIN_EVENT_MIN, end);
    addTask({
      title: parsed.title,
      date: parsed.date ?? date,
      start_min: from,
      end_min: to,
      all_day: false,
      duration_min: to - from,
      priority: parsed.priority,
      tags: parsed.tags,
      color: parsed.color,
      kind: "event",
    });
    onDone();
  }

  return (
    <div
      data-no-create
      className="absolute inset-x-1 z-30 overflow-hidden rounded-md border border-accent-line bg-raised shadow-md anim-pop"
      style={{ top: yFor(start), minHeight: Math.max(30, yFor(end) - yFor(start)) }}
    >
      <input
        ref={ref}
        aria-label="New event title"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setValue(""); onDone(); }
        }}
        placeholder="New event"
        className="h-[22px] w-full bg-transparent px-1.5 text-[11.5px] font-medium text-ink outline-none placeholder:text-ink-4"
      />
      <p className="px-1.5 pb-1 text-[10.5px] text-ink-3 tnum">{formatRange(start, end, hour12)}</p>
    </div>
  );
}

// ---------------------------------------------------------
// All-day strip cell
// ---------------------------------------------------------
function AllDayCell({ date, tasks, hour12 }: { date: string; tasks: Task[]; hour12: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `allday:${date}`,
    data: { type: "day", date },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex max-h-[84px] min-w-0 flex-1 flex-col gap-[2px] overflow-y-auto border-l border-line p-1",
        "transition-colors duration-150",
        isOver && "bg-accent-soft ring-1 ring-inset ring-accent-line",
      )}
    >
      {tasks.map((task) => (
        <TaskChip key={task.id} task={task} hour12={hour12} />
      ))}
    </div>
  );
}
