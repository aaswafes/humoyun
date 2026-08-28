"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  ArrowDown, ArrowUp, BookOpen, ChevronRight, ChevronsDownUp, ChevronsUpDown,
  Copy, Flag, Repeat, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  dayName, dayNumber, formatDate, formatDuration, formatRange, formatTime, todayISO,
} from "@/lib/date";
import { useNow } from "@/hooks/use-hotkeys";
import { parseTask } from "@/lib/parse";
import { useStore } from "@/lib/store";
import { PRAYER_LABELS, type PrayerName, type PrayerStatus, type Task } from "@/lib/types";
import { prayerTimesFor } from "@/lib/prayer";
import { IconButton } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import { VisuallyHidden } from "@/components/ui/form";
import { PRAYER_STATE } from "@/components/salah/prayer-state";
import {
  DAY_MIN, FINE_SNAP_MIN, MIN_EVENT_MIN, SNAP_MIN, clampMin, clampToOpen, isTimed,
  layoutTimed, makeScale, openWindowFor, snapMin, spanOf, workHoursOf,
  type DropPreview, type GridScale, type Placed,
} from "./calendar-utils";
import { TaskChip } from "./task-chip";

const GUTTER = 56;      // width of the hour-label column
const EMPTY_IDS: string[] = [];

/** One block captured at the moment a drag starts. */
interface Grabbed { id: string; idx: number; start: number; dur: number }

type Edge = "start" | "end";

type Live =
  | { kind: "create"; idx: number; anchor: number; start: number; end: number; moved: boolean }
  | {
      kind: "move"; idx: number; start: number; grab: number; moved: boolean;
      copy: boolean; lead: Grabbed; group: Grabbed[];
    }
  | { kind: "resize"; taskId: string; idx: number; start: number; end: number; edge: Edge; moved: boolean };

interface Pending { date: string; start: number; end: number }
interface Ghost { key: string; idx: number; start: number; end: number }
interface LiveLabel { idx: number; start: number; end: number; copy: boolean }

type AddTask = ReturnType<typeof useStore.getState>["addTask"];

/** What the pointer is doing decides the snap; a held modifier makes it finer. */
const stepFor = (e: { metaKey: boolean; ctrlKey: boolean }) =>
  e.metaKey || e.ctrlKey ? FINE_SNAP_MIN : SNAP_MIN;

/**
 * Take the key for good.
 *
 * The App Router hydrates the whole document, so React's listener and the
 * page's `useHotkeys` listener are siblings on the same node: `stopPropagation`
 * never reaches the second one, and an arrow key meant to nudge a block would
 * also page the calendar to the next day. Only the immediate form stops that.
 */
function consume(e: React.KeyboardEvent) {
  e.preventDefault();
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
}

// ---------------------------------------------------------
// Salah bands — each prayer window, behind the events
// ---------------------------------------------------------
interface PrayerWindow { name: PrayerName; start: number; end: number }

function SalahBands({
  date, hour12, windows, scale,
}: {
  date: string;
  hour12: boolean;
  windows: PrayerWindow[];
  scale: GridScale;
}) {
  const prayers = useStore((s) => s.prayers);
  const cyclePrayer = useStore((s) => s.cyclePrayer);

  const statusOf = (name: PrayerName): PrayerStatus =>
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
              top: scale.yFor(w.start),
              height: Math.max(2, scale.yFor(Math.min(DAY_MIN, w.end)) - scale.yFor(w.start)),
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
          const state = PRAYER_STATE[status];
          const Icon = state.icon;
          return (
            <button
              key={w.name}
              type="button"
              data-no-create
              onClick={() => cyclePrayer(date, w.name)}
              aria-label={
                `${PRAYER_LABELS[w.name]} at ${formatTime(w.start, hour12)} — ${state.label}. ` +
                "Activate to change."
              }
              style={{ top: scale.yFor(w.start) + 2 }}
              className={cn(
                "pointer-events-auto absolute right-1.5 flex h-7 cursor-pointer items-center gap-1 rounded-full",
                "border border-line px-2 material text-[11px] font-semibold",
                "transition-[color,background-color,transform] duration-150 active:scale-[0.96]",
                state.text,
              )}
            >
              {/* The icon carries the state; colour only reinforces it. */}
              {Icon
                ? <Icon className="size-3" />
                : <span className="size-1.5 rounded-full border border-current" />}
              <span className="uppercase tracking-[0.06em]">{PRAYER_LABELS[w.name]}</span>
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
  task, start, end, col, cols, span, hour12, lifted, selected, scale,
  onPointerDown, onKeyDown,
}: {
  task: Task;
  start: number;
  end: number;
  col: number;
  cols: number;
  span: number;
  hour12: boolean;
  lifted: boolean;
  selected: boolean;
  scale: GridScale;
  onPointerDown: (e: React.PointerEvent, task: Task, mode: "move" | "resize", edge?: Edge) => void;
  onKeyDown: (e: React.KeyboardEvent, task: Task) => void;
}) {
  const done = task.status === "done";
  const height = Math.max(15, scale.yFor(end) - scale.yFor(start));
  const gripH = height >= 40 ? 7 : height >= 26 ? 5 : 0;
  const duration = end - start;
  const range = formatRange(start, end, hour12);
  const label =
    `${task.title || "Untitled"} — ${range}, ${formatDuration(duration)}` +
    (selected ? ". Selected" : "");

  return (
    <div
      data-event-block
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-keyshortcuts="ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown"
      title={`${label}\nDrag to move · Alt-drag to copy · Shift-click to multi-select\nArrows move, Shift+Arrows resize`}
      onPointerDown={(e) => onPointerDown(e, task, "move")}
      onKeyDown={(e) => onKeyDown(e, task)}
      style={{
        top: scale.yFor(start),
        height,
        left: `calc(${(col / cols) * 100}% + 2px)`,
        width: `calc(${(Math.min(span, cols - col) / cols) * 100}% - 4px)`,
        background: "var(--tint-soft)",
        boxShadow: selected
          ? "inset 2.5px 0 0 0 var(--tint), 0 0 0 2px var(--accent)"
          : "inset 2.5px 0 0 0 var(--tint)",
      }}
      className={cn(
        `tint-${task.color ?? "slate"}`,
        "absolute select-none overflow-hidden rounded-md py-[2px] pl-2 pr-1 touch-none",
        "cursor-grab transition-shadow duration-150 active:cursor-grabbing",
        lifted ? "z-30 shadow-md" : "z-10",
        done && "opacity-65",
      )}
    >
      <div className="flex items-start gap-1">
        <p
          className={cn(
            "min-w-0 flex-1 truncate text-[11.5px] font-medium leading-[1.25]",
            done ? "text-ink-4 line-through decoration-ink-4/60" : "text-[var(--tint-ink)]",
          )}
        >
          {task.title || "Untitled"}
        </p>
        {height >= 30 && task.priority > 0 && !done && (
          <Flag className="mt-[2px] size-2.5 shrink-0 text-danger" fill="currentColor" aria-hidden />
        )}
        {height >= 30 && task.recurrence && (
          <Repeat className="mt-[2px] size-2.5 shrink-0 text-ink-4" aria-hidden />
        )}
        {height >= 30 && task.book_id && (
          <BookOpen className="mt-[2px] size-2.5 shrink-0 text-ink-4" aria-hidden />
        )}
      </div>

      {height >= 30 && (
        <p className="truncate text-[10.5px] leading-[1.3] text-ink-3 tnum">
          {range}
          <span className="mx-1 text-ink-4">·</span>
          {formatDuration(duration)}
        </p>
      )}

      {height >= 52 && task.tags.length > 0 && (
        <div className="mt-[3px] flex flex-wrap gap-1 overflow-hidden">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-[4px] bg-hover px-1 text-[10.5px] leading-[15px] text-ink-3"
            >
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-[10.5px] leading-[15px] text-ink-4 tnum">+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {/*
        Grips are pointer sugar, not controls: the keyboard route is the block
        itself — Shift+Arrow resizes the end, Alt+Arrow the start. They shrink
        with the block and vanish on a 15-minute one, because a grip that covers
        half a block steals the gesture that matters more: moving it.
      */}
      {gripH > 0 && height >= 40 && (
        <div
          aria-hidden
          onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, task, "resize", "start"); }}
          style={{ height: gripH }}
          className="absolute inset-x-0 top-0 cursor-ns-resize touch-none"
        />
      )}
      {gripH > 0 && (
        <div
          aria-hidden
          onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, task, "resize", "end"); }}
          style={{ height: gripH }}
          className="absolute inset-x-0 bottom-0 cursor-ns-resize touch-none"
        />
      )}
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
  const profile = useStore((s) => s.profile);
  const selectedDate = useStore((s) => s.selectedDate);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const moveTask = useStore((s) => s.moveTask);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const addTask = useStore((s) => s.addTask);
  const duplicateTask = useStore((s) => s.duplicateTask);
  const openInspector = useStore((s) => s.openInspector);
  const toast = useStore((s) => s.toast);
  const weekStart = profile?.week_start ?? 1;

  const gridRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const scrolledOnce = React.useRef(false);
  const keepMinute = React.useRef<number | null>(null);
  const liveRef = React.useRef<Live | null>(null);
  const [live, setLive] = React.useState<Live | null>(null);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<string[] | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  /** Every verb below is also driven from the keyboard, so it says what it did. */
  const say = React.useCallback((message: string) => setAnnouncement(message), []);

  const now = useNow(30_000);
  const nowMin = React.useMemo(() => {
    const d = new Date(now);
    return d.getHours() * 60 + d.getMinutes();
  }, [now]);
  const today = todayISO();
  const todayIdx = dates.indexOf(today);
  const previewSet = React.useMemo(() => new Set(preview?.dates ?? []), [preview]);

  // ---- selection ----
  // Keyed by the dates on screen, so paging the week clears the selection
  // without an effect having to chase it.
  const dateKey = dates.join("|");
  const [sel, setSel] = React.useState<{ key: string; ids: string[] }>({ key: dateKey, ids: EMPTY_IDS });
  const taskIds = React.useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  const selected = React.useMemo(
    () => (sel.key === dateKey ? sel.ids.filter((id) => taskIds.has(id)) : EMPTY_IDS),
    [sel, dateKey, taskIds],
  );
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const setSelected = React.useCallback(
    (ids: string[]) => setSel({ key: dateKey, ids }),
    [dateKey],
  );

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

  // ---- salah windows (day view only) ----
  const prayerWindows = React.useMemo<PrayerWindow[]>(() => {
    if (!salah || dates.length !== 1 || !profile) return [];
    const t = prayerTimesFor(dates[0], {
      latitude: profile.latitude,
      longitude: profile.longitude,
      method: profile.calc_method,
      madhab: profile.madhab,
    });
    return [
      { name: "fajr", start: t.fajr, end: t.sunrise },
      { name: "dhuhr", start: t.dhuhr, end: t.asr },
      { name: "asr", start: t.asr, end: t.maghrib },
      { name: "maghrib", start: t.maghrib, end: t.isha },
      { name: "isha", start: t.isha, end: DAY_MIN },
    ];
  }, [salah, dates, profile]);

  // ---- the vertical scale ----
  const work = React.useMemo(() => workHoursOf(profile), [profile]);

  const openWin = React.useMemo(() => {
    const marks: number[] = [];
    for (const list of timedByDate.values()) {
      for (const t of list) {
        const { start, end } = spanOf(t);
        marks.push(start, end);
      }
    }
    if (todayIdx >= 0) marks.push(nowMin);
    for (const w of prayerWindows) marks.push(w.start);
    return openWindowFor(work, marks);
  }, [timedByDate, todayIdx, nowMin, prayerWindows, work]);

  const scale = React.useMemo(
    () => (expanded ? makeScale(0, DAY_MIN) : makeScale(openWin.from, openWin.to)),
    [expanded, openWin],
  );

  // Land on the working day rather than midnight.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || scrolledOnce.current) return;
    scrolledOnce.current = true;
    const focus = dates.includes(today) ? Math.max(work.start, nowMin - 90) : work.start;
    el.scrollTop = Math.max(0, scale.yFor(focus) - 24);
  }, [dates, today, nowMin, work.start, scale]);

  // Expanding the quiet hours must not throw the reader out of the day they
  // were looking at, so the minute under the fold is pinned across the swap.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || keepMinute.current == null) return;
    el.scrollTop = Math.max(0, scale.yFor(keepMinute.current));
    keepMinute.current = null;
  }, [scale]);

  function setScaleExpanded(next: boolean) {
    const el = scrollRef.current;
    keepMinute.current = el ? scale.minAt(el.scrollTop) : null;
    setExpanded(next);
  }

  const setLiveState = (next: Live | null) => { liveRef.current = next; setLive(next); };

  function pointToSlot(clientX: number, clientY: number) {
    const el = gridRef.current;
    if (!el) return { idx: 0, minutes: scale.from };
    const r = el.getBoundingClientRect();
    const colW = r.width / dates.length;
    const idx = Math.max(0, Math.min(dates.length - 1, Math.floor((clientX - r.left) / colW)));
    // Pointer work stays inside the open window; the collapsed strips are
    // expanders, and a 9-hour strip 30px tall is no place to aim at a minute.
    const minutes = clampToOpen(scale, scale.minAt(clientY - r.top));
    return { idx, minutes };
  }

  // ---- pointer: create ----
  function onGridPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-event-block]") || target.closest("[data-no-create]")) return;

    if (!e.shiftKey && selected.length) setSelected(EMPTY_IDS);
    const { idx, minutes } = pointToSlot(e.clientX, e.clientY);
    const anchor = clampToOpen(scale, snapMin(minutes, stepFor(e)));
    setSelectedDate(dates[idx]);
    setLiveState({
      kind: "create", idx, anchor, start: anchor,
      end: Math.min(scale.to, anchor + 30), moved: false,
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  // ---- pointer: move / resize ----
  function onBlockPointerDown(e: React.PointerEvent, task: Task, mode: "move" | "resize", edge: Edge = "end") {
    if (e.button !== 0) return;
    e.stopPropagation();

    // Shift-click builds the selection; it never starts a drag — and it works
    // on the grips too, so a small block is not half unselectable.
    if (e.shiftKey) {
      toggleSelected(task.id);
      return;
    }

    const { minutes } = pointToSlot(e.clientX, e.clientY);
    const { start, end } = spanOf(task);

    if (mode === "resize") {
      setLiveState({ kind: "resize", taskId: task.id, idx: dates.indexOf(task.date ?? ""), start, end, edge, moved: false });
      gridRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    const ids = selectedSet.has(task.id) && selected.length > 1 ? selected : [task.id];
    const group: Grabbed[] = [];
    for (const id of ids) {
      const t = id === task.id ? task : tasks.find((x) => x.id === id);
      if (!t || !t.date) continue;
      const idx = dates.indexOf(t.date);
      if (idx < 0) continue;
      const s = spanOf(t);
      group.push({ id: t.id, idx, start: s.start, dur: s.end - s.start });
    }
    const lead = group.find((g) => g.id === task.id);
    if (!lead) return;

    setLiveState({
      kind: "move", idx: lead.idx, start: lead.start, grab: minutes - lead.start,
      moved: false, copy: e.altKey, lead, group,
    });
    gridRef.current?.setPointerCapture(e.pointerId);
  }

  function onGridPointerMove(e: React.PointerEvent) {
    const current = liveRef.current;
    if (!current) return;
    const step = stepFor(e);
    const { idx, minutes } = pointToSlot(e.clientX, e.clientY);

    // Snapping means a click never becomes a drag by accident — only a real
    // change in the snapped value flips `moved`.
    if (current.kind === "create") {
      const edge = clampToOpen(scale, snapMin(minutes, step));
      const start = Math.min(current.anchor, edge);
      const end = Math.min(scale.to, Math.max(start + MIN_EVENT_MIN, Math.max(current.anchor, edge)));
      if (start === current.start && end === current.end) return;
      setLiveState({ ...current, start, end, moved: true });
      return;
    }

    if (current.kind === "move") {
      const { lead, group } = current;
      // The whole selection travels together, so the clamp is the tightest one
      // any member needs — nothing slides off the end of the day or the week.
      let delta = snapMin(minutes - current.grab, step) - lead.start;
      for (const g of group) {
        delta = Math.max(delta, -g.start);
        delta = Math.min(delta, DAY_MIN - g.dur - g.start);
      }
      let dayDelta = idx - lead.idx;
      for (const g of group) {
        dayDelta = Math.max(dayDelta, -g.idx);
        dayDelta = Math.min(dayDelta, dates.length - 1 - g.idx);
      }
      const start = lead.start + delta;
      const nextIdx = lead.idx + dayDelta;
      if (start === current.start && nextIdx === current.idx) return;
      setLiveState({ ...current, idx: nextIdx, start, moved: true });
      return;
    }

    if (current.edge === "end") {
      const end = Math.max(current.start + MIN_EVENT_MIN, Math.min(DAY_MIN, snapMin(minutes, step)));
      if (end === current.end) return;
      setLiveState({ ...current, end, moved: true });
      return;
    }
    const start = Math.min(current.end - MIN_EVENT_MIN, Math.max(0, snapMin(minutes, step)));
    if (start === current.start) return;
    setLiveState({ ...current, start, moved: true });
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
      if (!current.moved) { openInspector(current.lead.id); return; }
      commitMove(current);
      return;
    }

    if (current.moved) {
      patch("tasks", current.taskId, {
        start_min: current.start,
        end_min: current.end,
        duration_min: current.end - current.start,
      });
      say(`Resized to ${formatRange(current.start, current.end, hour12)}`);
    }
  }

  // A touch that turns into a scroll must not leave a half-made event behind.
  function onGridPointerCancel() { setLiveState(null); }

  // ---- mutations shared by pointer and keyboard ----
  function toggleSelected(id: string) {
    const next = selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    say(next.length ? `${next.length} selected` : "Selection cleared");
  }

  function commitMove(current: Extract<Live, { kind: "move" }>) {
    const dayDelta = current.idx - current.lead.idx;
    const minDelta = current.start - current.lead.start;
    if (!dayDelta && !minDelta && !current.copy) return;

    if (current.copy) {
      const madeIds: string[] = [];
      for (const g of current.group) {
        const copy = duplicateTask(g.id);
        if (!copy) continue;
        const start = clampMin(g.start + minDelta);
        patch("tasks", copy.id, {
          date: dates[g.idx + dayDelta],
          start_min: start,
          end_min: Math.min(DAY_MIN, start + g.dur),
          all_day: false,
          duration_min: g.dur,
        });
        madeIds.push(copy.id);
      }
      setSelected(madeIds.length > 1 ? madeIds : EMPTY_IDS);
      say(`${madeIds.length} ${madeIds.length === 1 ? "copy" : "copies"} created`);
      toast({
        title: madeIds.length === 1 ? "Block duplicated" : `${madeIds.length} blocks duplicated`,
        description: `On ${formatDate(dates[current.lead.idx + dayDelta])}.`,
        tone: "success",
        action: {
          label: "Undo",
          run: () => { const s = useStore.getState(); madeIds.forEach((id) => s.remove("tasks", id)); },
        },
      });
      return;
    }

    const snapshot = current.group
      .map((g) => tasks.find((t) => t.id === g.id))
      .filter((t): t is Task => !!t)
      .map((t) => ({ id: t.id, date: t.date, start_min: t.start_min, end_min: t.end_min, all_day: t.all_day }));

    for (const g of current.group) {
      moveTask(g.id, dates[g.idx + dayDelta], clampMin(g.start + minDelta));
    }

    const where = `${formatDate(dates[current.lead.idx + dayDelta])}, ${formatTime(current.start, hour12)}`;
    say(current.group.length === 1 ? `Moved to ${where}` : `${current.group.length} blocks moved to ${where}`);
    if (current.group.length > 1) {
      toast({
        title: `${current.group.length} blocks moved`,
        description: `To ${where}.`,
        tone: "success",
        action: {
          label: "Undo",
          run: () => {
            const s = useStore.getState();
            snapshot.forEach((prev) => s.patch("tasks", prev.id, prev));
          },
        },
      });
    }
  }

  /** The blocks a keyboard verb applies to: the selection, or just this one. */
  function targetsFor(task: Task): Task[] {
    if (selectedSet.has(task.id) && selected.length > 1) {
      return selected
        .map((id) => tasks.find((t) => t.id === id))
        .filter((t): t is Task => !!t && !!t.date && isTimed(t));
    }
    return [task];
  }

  function nudge(task: Task, minutes: number) {
    const list = targetsFor(task);
    let blocked = false;
    for (const t of list) {
      const { start, end } = spanOf(t);
      if (start + minutes < 0 || end + minutes > DAY_MIN) blocked = true;
    }
    if (blocked) { say("Edge of the day"); return; }
    for (const t of list) {
      const { start, end } = spanOf(t);
      patch("tasks", t.id, { start_min: start + minutes, end_min: end + minutes });
    }
    const lead = spanOf(list[0]);
    say(list.length === 1
      ? `${list[0].title || "Block"} at ${formatRange(lead.start, lead.end, hour12)}`
      : `${list.length} blocks moved ${Math.abs(minutes)} minutes ${minutes > 0 ? "later" : "earlier"}`);
  }

  function resizeBy(task: Task, minutes: number, edge: Edge) {
    const list = targetsFor(task);
    let shown = { start: 0, end: 0 };
    list.forEach((t, i) => {
      const { start, end } = spanOf(t);
      const next = edge === "end"
        ? { start, end: Math.max(start + MIN_EVENT_MIN, Math.min(DAY_MIN, end + minutes)) }
        : { start: Math.min(end - MIN_EVENT_MIN, Math.max(0, start + minutes)), end };
      patch("tasks", t.id, {
        start_min: next.start,
        end_min: next.end,
        duration_min: next.end - next.start,
      });
      if (i === 0) shown = next;
    });
    say(`${formatRange(shown.start, shown.end, hour12)} · ${formatDuration(shown.end - shown.start)}`);
  }

  function shiftDay(task: Task, days: number) {
    const list = targetsFor(task);
    // Resolve every landing date first: a partial move is worse than none.
    const moves = list.map((t) => {
      const idx = dates.indexOf(t.date ?? "");
      const next = idx + days;
      return next >= 0 && next < dates.length && idx >= 0 ? { task: t, date: dates[next] } : null;
    });
    if (moves.some((m) => !m)) { say("Edge of the week"); return; }
    for (const m of moves) {
      if (m) moveTask(m.task.id, m.date, spanOf(m.task).start);
    }
    say(`${list.length === 1 ? list[0].title || "Block" : `${list.length} blocks`} moved to ${formatDate(moves[0]!.date)}`);
  }

  function duplicateAt(task: Task) {
    const list = targetsFor(task);
    const made: string[] = [];
    for (const t of list) {
      const copy = duplicateTask(t.id);
      if (copy) made.push(copy.id);
    }
    if (made.length > 1) setSelected(made);
    say(`${made.length} ${made.length === 1 ? "copy" : "copies"} created`);
    toast({
      title: made.length === 1 ? "Block duplicated" : `${made.length} blocks duplicated`,
      description: "The copy sits on the same slot — drag or arrow it where it belongs.",
      tone: "success",
      action: {
        label: "Undo",
        run: () => { const s = useStore.getState(); made.forEach((id) => s.remove("tasks", id)); },
      },
    });
  }

  function runDelete(ids: string[]) {
    const victims = ids
      .map((id) => tasks.find((t) => t.id === id))
      .filter((t): t is Task => !!t);
    victims.forEach((t) => remove("tasks", t.id));
    setSelected(EMPTY_IDS);
    say(`${victims.length} ${victims.length === 1 ? "block" : "blocks"} deleted`);
    toast({
      title: victims.length === 1 ? "Block deleted" : `${victims.length} blocks deleted`,
      tone: "danger",
      action: {
        label: "Undo",
        run: () => { const s = useStore.getState(); victims.forEach((t) => s.insert("tasks", t)); },
      },
    });
  }

  function onBlockKeyDown(e: React.KeyboardEvent, task: Task) {
    const key = e.key;
    const step = e.metaKey || e.ctrlKey ? FINE_SNAP_MIN : SNAP_MIN;

    if (key === "Enter" || key === " ") {
      consume(e);
      openInspector(task.id);
      return;
    }
    if (key === "ArrowUp" || key === "ArrowDown") {
      consume(e);
      const delta = key === "ArrowUp" ? -step : step;
      if (e.shiftKey) resizeBy(task, delta, "end");
      else if (e.altKey) resizeBy(task, delta, "start");
      else nudge(task, delta);
      return;
    }
    if ((key === "ArrowLeft" || key === "ArrowRight") && dates.length > 1) {
      consume(e);
      shiftDay(task, key === "ArrowLeft" ? -1 : 1);
      return;
    }
    // Bare letters only — Ctrl/Cmd+X still means cut to the browser.
    if (!e.metaKey && !e.ctrlKey && key.toLowerCase() === "x") {
      consume(e);
      toggleSelected(task.id);
      return;
    }
    if (!e.metaKey && !e.ctrlKey && key.toLowerCase() === "d") {
      consume(e);
      duplicateAt(task);
      return;
    }
    if (key === "Delete" || key === "Backspace") {
      consume(e);
      setConfirmDelete(targetsFor(task).map((t) => t.id));
      return;
    }
    if (key === "Escape" && selected.length) {
      consume(e);
      setSelected(EMPTY_IDS);
      say("Selection cleared");
    }
  }

  /** Enter on a focused column opens the composer at the current hour. */
  function onColumnKeyDown(e: React.KeyboardEvent, date: string) {
    if (e.target !== e.currentTarget) return;
    if (e.key !== "Enter") return;
    consume(e);
    const hourStart = clampToOpen(scale, Math.floor(nowMin / 60) * 60);
    setSelectedDate(date);
    setPending({ date, start: hourStart, end: Math.min(DAY_MIN, hourStart + 60) });
    say(`New event on ${formatDate(date)} at ${formatTime(hourStart, hour12)}`);
  }

  // ---- what the grid shows while a drag is in flight ----
  const displayed = React.useMemo(() => {
    const map = new Map<string, Task[]>();
    dates.forEach((d) => map.set(d, [...(timedByDate.get(d) ?? [])]));
    if (!live || live.kind === "create") return map;

    if (live.kind === "resize") {
      for (const list of map.values()) {
        const i = list.findIndex((t) => t.id === live.taskId);
        if (i < 0) continue;
        list[i] = { ...list[i], start_min: live.start, end_min: live.end };
        break;
      }
      return map;
    }

    // An Alt-drag leaves the originals alone — the ghosts show where the copies land.
    if (live.copy) return map;

    const dayDelta = live.idx - live.lead.idx;
    const minDelta = live.start - live.lead.start;
    for (const g of live.group) {
      const from = map.get(dates[g.idx]);
      if (!from) continue;
      const i = from.findIndex((t) => t.id === g.id);
      if (i < 0) continue;
      const [task] = from.splice(i, 1);
      const target = dates[g.idx + dayDelta];
      const start = clampMin(g.start + minDelta);
      map.get(target)?.push({
        ...task, date: target, start_min: start, end_min: Math.min(DAY_MIN, start + g.dur),
      });
    }
    return map;
  }, [dates, timedByDate, live]);

  const ghosts = React.useMemo<Ghost[]>(() => {
    if (!live || live.kind !== "move" || !live.copy || !live.moved) return [];
    const dayDelta = live.idx - live.lead.idx;
    const minDelta = live.start - live.lead.start;
    return live.group.map((g) => {
      const start = clampMin(g.start + minDelta);
      return { key: g.id, idx: g.idx + dayDelta, start, end: Math.min(DAY_MIN, start + g.dur) };
    });
  }, [live]);

  /** The floating pill that follows whatever is being dragged. */
  const liveLabel = React.useMemo<LiveLabel | null>(() => {
    if (!live) return null;
    if (live.kind === "create") {
      return { idx: live.idx, start: live.start, end: live.end, copy: false };
    }
    if (live.kind === "resize") {
      return { idx: live.idx, start: live.start, end: live.end, copy: false };
    }
    if (!live.moved) return null;
    return {
      idx: live.idx, start: live.start, end: live.start + live.lead.dur, copy: live.copy,
    };
  }, [live]);

  const hasAllDay = dates.some((d) => (allDayByDate.get(d) ?? []).length > 0);
  const hiddenBands = scale.bands.filter((b) => b.collapsed);

  // One control, placed in whichever gutter cell already sits above the grid —
  // floating it over the hour column would cover the labels it lives next to.
  const scaleToggle = (
    <IconButton
      label={expanded ? "Collapse the quiet hours" : "Show the whole 24 hours"}
      onClick={() => setScaleExpanded(!expanded)}
    >
      {expanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
    </IconButton>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {header && (
        <div className="flex shrink-0 border-t border-line">
          <div style={{ width: GUTTER }} className="flex shrink-0 items-center justify-center">
            {scaleToggle}
          </div>
          {dates.map((date) => {
            const isToday = date === today;
            const load = (timedByDate.get(date) ?? []).length + (allDayByDate.get(date) ?? []).length;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                aria-current={date === selectedDate ? "date" : undefined}
                title={`${formatDate(date, { year: true })} — ${load} ${load === 1 ? "item" : "items"}`}
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
                {load > 0 && (
                  <span className="text-[10.5px] text-ink-4 tnum">{load}</span>
                )}
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

      {/* Day view has neither of the rows above, so the control gets its own. */}
      {!header && (
        <div className="flex shrink-0 items-center border-t border-line">
          <div style={{ width: GUTTER }} className="flex shrink-0 items-center justify-center py-0.5">
            {scaleToggle}
          </div>
          <p className="pl-2 text-[11px] text-ink-4 tnum">
            {expanded ? "Whole day" : `${formatTime(scale.from, hour12)} – ${formatTime(scale.to === DAY_MIN ? 0 : scale.to, hour12)}`}
            <span className="mx-1.5">·</span>
            work {formatTime(work.start, hour12)} – {formatTime(work.end, hour12)}
          </p>
        </div>
      )}

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto border-t border-line">
        <div className="flex" style={{ height: scale.height }}>
          <div style={{ width: GUTTER }} className="relative shrink-0">
            {scale.hours.map((h) => {
              const y = scale.yFor(h * 60);
              if (y <= 0) return null;
              return (
                <span
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[10.5px] text-ink-4 tnum"
                  style={{ top: y }}
                >
                  {formatTime((h % 24) * 60, hour12)}
                </span>
              );
            })}
          </div>

          <div
            ref={gridRef}
            onPointerDown={onGridPointerDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={onGridPointerCancel}
            className="relative flex flex-1"
          >
            {prayerWindows.length > 0 && (
              <SalahBands date={dates[0]} hour12={hour12} windows={prayerWindows} scale={scale} />
            )}

            {/* Working hours read as the lit part of the day. */}
            <WorkShading scale={scale} work={work} />

            {scale.hours.map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute inset-x-0 h-px bg-line"
                style={{ top: scale.yFor(h * 60) }}
              />
            ))}

            {/* Hours already spent are dimmed, so "what is left" reads at a glance. */}
            <PastShading dates={dates} today={today} nowMin={nowMin} scale={scale} />

            {dates.map((date, idx) => (
              <DayColumn
                key={date}
                date={date}
                idx={idx}
                selected={date === selectedDate && dates.length > 1}
                previewed={previewSet.has(date)}
                placed={layoutTimed(displayed.get(date) ?? [])}
                hour12={hour12}
                scale={scale}
                live={live}
                selectedIds={selectedSet}
                ghosts={ghosts.filter((g) => g.idx === idx)}
                label={liveLabel && liveLabel.idx === idx ? liveLabel : null}
                pending={pending?.date === date ? pending : null}
                onBlockPointerDown={onBlockPointerDown}
                onBlockKeyDown={onBlockKeyDown}
                onKeyDown={onColumnKeyDown}
                onPendingDone={() => setPending(null)}
                weekStart={weekStart}
                addTask={addTask}
              />
            ))}

            {todayIdx >= 0 && scale.from <= nowMin && nowMin <= scale.to && (
              <div
                className="pointer-events-none absolute z-20"
                style={{
                  top: scale.yFor(nowMin),
                  left: `${(todayIdx / dates.length) * 100}%`,
                  width: `${(1 / dates.length) * 100}%`,
                }}
              >
                <div className="h-px w-full bg-accent" />
                <div className="absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-accent" />
                <span className="absolute right-1 -top-[8px] rounded-full material px-1 text-[10.5px] font-medium text-accent tnum">
                  {formatTime(nowMin, hour12)}
                </span>
              </div>
            )}

            {/* The collapsed strips are their own expander — no hidden gesture. */}
            {hiddenBands.map((band) => (
              <button
                key={`${band.from}-${band.to}`}
                type="button"
                data-no-create
                onClick={() => setScaleExpanded(true)}
                style={{ top: band.top, height: band.height }}
                className={cn(
                  "absolute inset-x-0 z-30 flex cursor-pointer items-center justify-center gap-1.5",
                  "bg-sunken text-[11px] font-medium text-ink-3 transition-colors duration-150",
                  "hover:text-accent [&:hover_svg]:text-accent",
                  band.from === 0 ? "hairline-b" : "hairline-t",
                )}
              >
                <ChevronsUpDown className="size-3" aria-hidden />
                {formatTime(band.from, hour12)} – {formatTime(band.to === DAY_MIN ? 0 : band.to, hour12)}
                <span className="text-ink-4">
                  · {formatDuration(band.to - band.from)} hidden
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected.length > 0 && (
        <SelectionBar
          count={selected.length}
          onNudge={(m) => {
            const first = tasks.find((t) => t.id === selected[0]);
            if (first) nudge(first, m);
          }}
          onShiftDay={dates.length > 1 ? () => {
            const first = tasks.find((t) => t.id === selected[0]);
            if (first) shiftDay(first, 1);
          } : undefined}
          onDuplicate={() => {
            const first = tasks.find((t) => t.id === selected[0]);
            if (first) duplicateAt(first);
          }}
          onDelete={() => setConfirmDelete(selected)}
          onClear={() => { setSelected(EMPTY_IDS); say("Selection cleared"); }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && runDelete(confirmDelete)}
        title={
          confirmDelete && confirmDelete.length > 1
            ? `Delete ${confirmDelete.length} blocks?`
            : "Delete this block?"
        }
        description="They leave the calendar entirely. Undo is offered for a few seconds afterwards."
        confirmLabel="Delete"
      />

      <div aria-live="polite" aria-atomic="true">
        <VisuallyHidden>{announcement}</VisuallyHidden>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Shading layers
// ---------------------------------------------------------
function WorkShading({ scale, work }: { scale: GridScale; work: { start: number; end: number } }) {
  const before = { from: scale.from, to: Math.min(work.start, scale.to) };
  const after = { from: Math.max(work.end, scale.from), to: scale.to };
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {before.to > before.from && (
        <div
          className="absolute inset-x-0 bg-hover"
          style={{ top: scale.yFor(before.from), height: scale.yFor(before.to) - scale.yFor(before.from) }}
        />
      )}
      {after.to > after.from && (
        <div
          className="absolute inset-x-0 bg-hover"
          style={{ top: scale.yFor(after.from), height: scale.yFor(after.to) - scale.yFor(after.from) }}
        />
      )}
      {[work.start, work.end].map((m) =>
        m > scale.from && m < scale.to ? (
          <div
            key={m}
            className="absolute inset-x-0 h-px bg-line-strong opacity-60"
            style={{ top: scale.yFor(m) }}
          />
        ) : null,
      )}
    </div>
  );
}

function PastShading({
  dates, today, nowMin, scale,
}: {
  dates: string[];
  today: string;
  nowMin: number;
  scale: GridScale;
}) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {dates.map((date, idx) => {
        const past = date < today;
        const isToday = date === today;
        if (!past && !isToday) return null;
        const until = past ? scale.to : Math.min(nowMin, scale.to);
        const top = scale.yFor(scale.from);
        const height = scale.yFor(until) - top;
        if (height <= 0) return null;
        return (
          <div
            key={date}
            className={cn("absolute bg-hover", past ? "opacity-50" : "opacity-80")}
            style={{
              top,
              height,
              left: `${(idx / dates.length) * 100}%`,
              width: `${(1 / dates.length) * 100}%`,
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------
// Selection bar — every multi-select verb, with a visible button
// ---------------------------------------------------------
function SelectionBar({
  count, onNudge, onShiftDay, onDuplicate, onDelete, onClear,
}: {
  count: number;
  onNudge: (minutes: number) => void;
  onShiftDay?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-3">
      <div
        role="group"
        aria-label={`${count} blocks selected`}
        className={cn(
          "pointer-events-auto flex items-center gap-1 rounded-full border border-line px-1.5 py-1",
          "material shadow-lg anim-slide",
        )}
      >
        <span className="px-1.5 text-[12.5px] font-medium text-ink tnum">
          {count} selected
        </span>
        <span className="mx-0.5 h-4 w-px bg-line" />
        <IconButton label="Move 15 minutes earlier" size="md" onClick={() => onNudge(-SNAP_MIN)}>
          <ArrowUp />
        </IconButton>
        <IconButton label="Move 15 minutes later" size="md" onClick={() => onNudge(SNAP_MIN)}>
          <ArrowDown />
        </IconButton>
        {onShiftDay && (
          <IconButton label="Push a day later" size="md" onClick={onShiftDay}>
            <ChevronRight />
          </IconButton>
        )}
        <IconButton label="Duplicate the selection" size="md" onClick={onDuplicate}>
          <Copy />
        </IconButton>
        <IconButton label="Delete the selection" size="md" tone="danger" onClick={onDelete}>
          <Trash2 />
        </IconButton>
        <span className="mx-0.5 h-4 w-px bg-line" />
        <IconButton label="Clear the selection" size="md" onClick={onClear}>
          <X />
        </IconButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// One day column
// ---------------------------------------------------------
function DayColumn({
  date, idx, selected, previewed, placed, hour12, scale, live, selectedIds, ghosts, label,
  pending, onBlockPointerDown, onBlockKeyDown, onKeyDown, onPendingDone, weekStart, addTask,
}: {
  date: string;
  idx: number;
  selected: boolean;
  previewed: boolean;
  placed: Placed[];
  hour12: boolean;
  scale: GridScale;
  live: Live | null;
  selectedIds: Set<string>;
  ghosts: Ghost[];
  label: LiveLabel | null;
  pending: Pending | null;
  onBlockPointerDown: (e: React.PointerEvent, task: Task, mode: "move" | "resize", edge?: Edge) => void;
  onBlockKeyDown: (e: React.KeyboardEvent, task: Task) => void;
  onKeyDown: (e: React.KeyboardEvent, date: string) => void;
  onPendingDone: () => void;
  weekStart: number;
  addTask: AddTask;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day:${date}`,
    data: { type: "day", date },
  });

  const creating = live?.kind === "create" && live.idx === idx ? live : null;
  const draggingIds = live && live.kind === "move" ? new Set(live.group.map((g) => g.id)) : null;
  const resizingId = live && live.kind === "resize" ? live.taskId : null;
  const labelY = label ? scale.yFor(label.start) : 0;

  return (
    // A focusable region, not a button: it holds buttons, so it must not be one.
    // Enter is its own documented verb, announced in the label.
    <div
      ref={setNodeRef}
      data-day-cell={date}
      tabIndex={0}
      role="group"
      aria-label={`${formatDate(date, { year: true })}. Press Enter to add an event at the current hour.`}
      aria-keyshortcuts="Enter"
      onKeyDown={(e) => onKeyDown(e, date)}
      className={cn(
        "relative min-w-0 flex-1 border-l border-line transition-colors duration-150",
        "focus-visible:z-30",
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
          span={p.span}
          hour12={hour12}
          scale={scale}
          lifted={!!draggingIds?.has(p.task.id) || resizingId === p.task.id}
          selected={selectedIds.has(p.task.id)}
          onPointerDown={onBlockPointerDown}
          onKeyDown={onBlockKeyDown}
        />
      ))}

      {/* Alt-drag copies: the original stays put, these show where the copy lands. */}
      {ghosts.map((g) => (
        <div
          key={g.key}
          className="pointer-events-none absolute inset-x-1 z-30 rounded-md border border-dashed border-accent-line bg-accent-soft"
          style={{ top: scale.yFor(g.start), height: Math.max(15, scale.yFor(g.end) - scale.yFor(g.start)) }}
        />
      ))}

      {creating && (
        <div
          className="pointer-events-none absolute inset-x-1 z-20 rounded-md border border-accent-line bg-accent-soft px-2 py-[2px]"
          style={{
            top: scale.yFor(creating.start),
            height: Math.max(15, scale.yFor(creating.end) - scale.yFor(creating.start)),
          }}
        />
      )}

      {/* The snapped time, riding along with whatever is moving. */}
      {label && (
        <div
          className="pointer-events-none absolute left-1 z-40"
          style={{ top: labelY >= 22 ? labelY - 22 : labelY + 4 }}
        >
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-line px-2 py-[3px]",
              "material text-[11px] font-medium text-ink shadow-sm tnum",
            )}
          >
            {label.copy && <Copy className="size-3 text-accent" aria-hidden />}
            {formatRange(label.start, label.end, hour12)}
            <span className="text-ink-3">· {formatDuration(label.end - label.start)}</span>
          </span>
        </div>
      )}

      {pending && (
        <PendingComposer
          date={date}
          start={pending.start}
          end={pending.end}
          hour12={hour12}
          scale={scale}
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
  date, start, end, hour12, scale, weekStart, addTask, onDone,
}: {
  date: string;
  start: number;
  end: number;
  hour12: boolean;
  scale: GridScale;
  weekStart: number;
  addTask: AddTask;
  onDone: () => void;
}) {
  const [value, setValue] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);
  const range = formatRange(start, end, hour12);

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
      className="absolute inset-x-1 z-40 overflow-hidden rounded-md border border-accent-line bg-raised shadow-md anim-pop"
      style={{
        top: scale.yFor(start),
        minHeight: Math.max(30, scale.yFor(end) - scale.yFor(start)),
      }}
    >
      <input
        ref={ref}
        aria-label={`New event, ${range}`}
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
      <p className="px-1.5 pb-1 text-[10.5px] text-ink-3 tnum">
        {range}
        <span className="mx-1 text-ink-4">·</span>
        {formatDuration(end - start)}
      </p>
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
      role="group"
      aria-label={`All-day on ${formatDate(date)} — ${tasks.length} ${tasks.length === 1 ? "item" : "items"}`}
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
