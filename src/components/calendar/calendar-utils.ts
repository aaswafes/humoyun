"use client";

import { addDays, formatDate, friendlyDate, weekNumber } from "@/lib/date";
import { useStore } from "@/lib/store";
import type { Book, Profile, Task, Template } from "@/lib/types";

// =========================================================
// Geometry — one hour is 48px everywhere the timeline appears.
// =========================================================
export const HOUR_H = 48;
export const GRID_H = HOUR_H * 24;
export const DAY_MIN = 1440;
export const SNAP_MIN = 15;
/** Held modifier drops the drag onto a finer lattice. */
export const FINE_SNAP_MIN = 5;
export const MIN_EVENT_MIN = 15;
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const clampMin = (m: number) => Math.max(0, Math.min(DAY_MIN, m));
export const snapMin = (m: number, step = SNAP_MIN) => Math.round(m / step) * step;

/** y offset in px for a minute-of-day on an uncollapsed 24-hour column. */
export const yFor = (min: number) => (min / DAY_MIN) * GRID_H;

// =========================================================
// Working hours — the profile owns them, settings writes them.
// =========================================================
export const DEFAULT_WORK_START = 9 * 60;
export const DEFAULT_WORK_END = 18 * 60;

/** Reads a minute count out of the loosely-typed prefs bag, same rule as Settings. */
function minutePref(prefs: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const raw = prefs?.[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= DAY_MIN ? n : fallback;
}

export function workHoursOf(profile: Profile | null | undefined): { start: number; end: number } {
  const start = minutePref(profile?.prefs, "work_start", DEFAULT_WORK_START);
  const end = minutePref(profile?.prefs, "work_end", DEFAULT_WORK_END);
  return end > start ? { start, end } : { start: DEFAULT_WORK_START, end: DEFAULT_WORK_END };
}

// =========================================================
// The vertical scale — a 24-hour column wastes most of its height on
// hours nothing ever happens in, so the quiet ends of the day collapse
// into a strip you can open. Nothing is ever hidden: the open window
// always stretches to cover every block that exists on screen.
// =========================================================
export const COLLAPSED_H = 30;

export interface ScaleBand {
  from: number;
  to: number;
  collapsed: boolean;
  top: number;
  height: number;
}

export interface GridScale {
  /** total pixel height of the column */
  height: number;
  bands: ScaleBand[];
  /** the open (uncompressed) window, in minutes */
  from: number;
  to: number;
  /** true when the whole 24 hours are open */
  full: boolean;
  yFor: (min: number) => number;
  minAt: (y: number) => number;
  /** hours that get a rule and a label */
  hours: number[];
}

/**
 * Widen `[from, to)` to whole hours and build the band model around it.
 * Everything outside becomes one fixed-height strip per side.
 */
export function makeScale(from: number, to: number): GridScale {
  const lo = Math.max(0, Math.min(DAY_MIN - 60, Math.floor(clampMin(from) / 60) * 60));
  const hi = Math.min(DAY_MIN, Math.max(lo + 60, Math.ceil(clampMin(to) / 60) * 60));

  const bands: ScaleBand[] = [];
  let top = 0;
  if (lo > 0) {
    bands.push({ from: 0, to: lo, collapsed: true, top, height: COLLAPSED_H });
    top += COLLAPSED_H;
  }
  const openH = ((hi - lo) / 60) * HOUR_H;
  bands.push({ from: lo, to: hi, collapsed: false, top, height: openH });
  top += openH;
  if (hi < DAY_MIN) {
    bands.push({ from: hi, to: DAY_MIN, collapsed: true, top, height: COLLAPSED_H });
    top += COLLAPSED_H;
  }

  const hours: number[] = [];
  for (let h = Math.ceil(lo / 60); h * 60 <= hi && h < 24; h++) hours.push(h);

  const height = top;

  const yAt = (min: number) => {
    const m = clampMin(min);
    for (const b of bands) {
      if (m <= b.to) return b.top + ((m - b.from) / (b.to - b.from)) * b.height;
    }
    return height;
  };

  const minAt = (y: number) => {
    const py = Math.max(0, Math.min(height, y));
    for (const b of bands) {
      if (py <= b.top + b.height) return b.from + ((py - b.top) / b.height) * (b.to - b.from);
    }
    return DAY_MIN;
  };

  return { height, bands, from: lo, to: hi, full: lo === 0 && hi === DAY_MIN, yFor: yAt, minAt, hours };
}

/** Pointer work stays inside the open window; the strips are expanders, not canvas. */
export const clampToOpen = (scale: GridScale, min: number) =>
  Math.max(scale.from, Math.min(scale.to, min));

/**
 * The window the grid opens on: working hours, widened to include every timed
 * block on screen (and the now-line, when today is in view) so collapsing can
 * never swallow something the user put there.
 */
export function openWindowFor(
  work: { start: number; end: number },
  marks: number[],
): { from: number; to: number } {
  let from = work.start;
  let to = work.end;
  for (const m of marks) {
    if (!Number.isFinite(m)) continue;
    const v = clampMin(m);
    if (v < from) from = v;
    if (v > to) to = v;
  }
  // No padding: makeScale rounds out to whole hours, and a spare hour at each
  // end is exactly the height this window exists to stop wasting.
  return { from: clampMin(from), to: clampMin(to) };
}

// =========================================================
// Task helpers
// =========================================================
export const isTimed = (t: Task) => !t.all_day && t.start_min != null;

/** Same ordering the rest of the app uses: timed first, then manual order. */
export function sortDayTasks(a: Task, b: Task): number {
  const at = isTimed(a);
  const bt = isTimed(b);
  if (at !== bt) return at ? -1 : 1;
  if (at && bt) return (a.start_min ?? 0) - (b.start_min ?? 0);
  return a.order_index - b.order_index;
}

/** Dated, top-level tasks bucketed by day and sorted. */
export function bucketByDate(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.date || t.parent_id) continue;
    const list = map.get(t.date);
    if (list) list.push(t);
    else map.set(t.date, [t]);
  }
  for (const list of map.values()) list.sort(sortDayTasks);
  return map;
}

/** A timed task always resolves to a real span, however sparse its fields are. */
export function spanOf(task: Task): { start: number; end: number } {
  const start = clampMin(task.start_min ?? 0);
  const raw = task.end_min ?? start + (task.duration_min ?? 60);
  return { start, end: Math.min(DAY_MIN, Math.max(start + MIN_EVENT_MIN, raw)) };
}

export interface Placed {
  task: Task;
  start: number;
  end: number;
  col: number;
  cols: number;
  /** how many columns wide the block may grow — 1 unless the space is free */
  span: number;
}

/** Touching edges are not a conflict: 9–10 and 10–11 share the day, not the space. */
const conflicts = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;

/**
 * Side-by-side layout for overlapping events. Events are grouped into clusters
 * of transitively-overlapping items and packed into the fewest columns that keep
 * every genuine conflict apart; then each block grows rightwards across every
 * column that is free for its whole span. A block that merely touches its
 * neighbour's edge therefore stays full width instead of being halved by a
 * conflict it is not part of.
 */
export function layoutTimed(tasks: Task[]): Placed[] {
  const items: Placed[] = tasks
    .map((task) => ({ task, ...spanOf(task), col: 0, cols: 1, span: 1 }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const colEnds: number[] = [];
    for (const item of cluster) {
      let col = colEnds.findIndex((end) => end <= item.start);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(item.end);
      } else {
        colEnds[col] = item.end;
      }
      item.col = col;
    }
    const cols = colEnds.length;
    for (const item of cluster) {
      item.cols = cols;
      let span = 1;
      for (let c = item.col + 1; c < cols; c++) {
        const blocked = cluster.some((other) => other !== item && other.col === c && conflicts(item, other));
        if (blocked) break;
        span++;
      }
      item.span = span;
    }
    out.push(...cluster);
    cluster = [];
    clusterEnd = -1;
  };

  for (const item of items) {
    if (cluster.length && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return out;
}

// =========================================================
// Drag payloads shared by the rail, the chips and the day cells
// =========================================================
export type DragPayload =
  | { type: "book"; id: string }
  | { type: "template"; id: string }
  | { type: "task"; taskId: string };

export function readPayload(data: Record<string, unknown> | null | undefined): DragPayload | null {
  if (!data) return null;
  const { type } = data;
  if (type === "book" || type === "template") {
    return typeof data.id === "string" ? { type, id: data.id } : null;
  }
  if (type === "task") {
    return typeof data.taskId === "string" ? { type: "task", taskId: data.taskId } : null;
  }
  return null;
}

export function readDropDate(data: Record<string, unknown> | null | undefined): string | null {
  if (!data || data.type !== "day") return null;
  return typeof data.date === "string" ? data.date : null;
}

// =========================================================
// Drop previews — what the drop is about to do, before it happens
// =========================================================
export interface DropPreview {
  dates: string[];
  headline: string;
  detail: string;
}

const PREVIEW_CAP = 120; // enough to paint the month; the scheduler itself is unbounded

export function bookPreview(book: Book, startDate: string): DropPreview {
  const remaining = Math.max(0, book.total_pages - book.current_page);
  if (!remaining) {
    return { dates: [], headline: "Already finished", detail: `${book.total_pages} pages read` };
  }
  const perDay = Math.max(1, book.pages_per_day ?? 30);
  const days = Math.max(1, Math.ceil(remaining / perDay));
  const end = addDays(startDate, days - 1);
  return {
    dates: Array.from({ length: Math.min(days, PREVIEW_CAP) }, (_, i) => addDays(startDate, i)),
    headline: `${perDay} pages/day → ${days} ${days === 1 ? "day" : "days"}`,
    detail: `finishes ${formatDate(end, { weekday: false })}`,
  };
}

export function templatePreview(template: Template, date: string): DropPreview {
  const count = template.items.length;
  if (!count) {
    return { dates: [date], headline: "No items yet", detail: "Add items on the Templates page" };
  }
  const offsets = template.items.map((i) => i.day_offset ?? 0);
  const min = Math.min(0, ...offsets);
  const max = Math.max(0, ...offsets);
  const span = max - min + 1;
  return {
    dates: Array.from({ length: Math.min(span, PREVIEW_CAP) }, (_, i) => addDays(date, min + i)),
    headline: `${count} ${count === 1 ? "item" : "items"}${span > 1 ? ` → ${span} days` : ""}`,
    detail: `from ${formatDate(date, { weekday: false })}`,
  };
}

// =========================================================
// Drop actions — every one is also reachable from a button, so no
// feature is locked behind a mouse gesture.
// =========================================================
export function scheduleBookOnDay(bookId: string, date: string) {
  const store = useStore.getState();
  const book = store.books.find((b) => b.id === bookId);
  if (!book) return;

  // `scheduleBook` clears the previous plan before writing the new one, so Undo
  // has to restore both halves: the blocks it deleted and the fields it rewrote.
  // Deleting only what was created would leave the shelf worse than before.
  const removed = store.tasks.filter(
    (t) => t.book_id === bookId && t.status !== "done" && (t.date ?? "") >= date,
  );
  const prevPlan = {
    pages_per_day: book.pages_per_day,
    start_date: book.start_date,
    end_date: book.end_date,
    status: book.status,
  };
  const before = new Set(store.tasks.map((t) => t.id));

  const created = store.scheduleBook(bookId, { startDate: date });
  if (!created) {
    store.toast({
      title: `${book.title} needs no blocks`,
      description: `Page ${book.current_page} of ${book.total_pages} — nothing left to schedule.`,
    });
    return;
  }
  const addedIds = useStore.getState().tasks.filter((t) => !before.has(t.id)).map((t) => t.id);
  const replaced = removed.length;

  store.toast({
    title: `${book.title} scheduled`,
    description:
      `${created} reading ${created === 1 ? "block" : "blocks"} from ${formatDate(date)}` +
      (replaced ? `, replacing ${replaced} older ${replaced === 1 ? "block" : "blocks"}.` : "."),
    tone: "success",
    action: {
      label: "Undo",
      run: () => {
        const s = useStore.getState();
        addedIds.forEach((id) => s.remove("tasks", id));
        removed.forEach((t) => s.insert("tasks", t));
        s.patch("books", bookId, prevPlan);
      },
    },
  });
}

export function applyTemplateOnDay(templateId: string, date: string) {
  const store = useStore.getState();
  const template = store.templates.find((t) => t.id === templateId);
  if (!template) return;

  // applyTemplate returns a count, not ids — diff the collection to know what to undo.
  const before = new Set(store.tasks.map((t) => t.id));
  const count = store.applyTemplate(templateId, date);
  if (!count) {
    store.toast({
      title: `${template.name} is empty`,
      description: "Add items to it before applying it to a day.",
    });
    return;
  }
  const added = useStore.getState().tasks.filter((t) => !before.has(t.id)).map((t) => t.id);
  const uses = template.use_count;

  store.toast({
    title: `${template.name} applied`,
    description: `${count} ${count === 1 ? "task" : "tasks"} added from ${formatDate(date)}.`,
    tone: "success",
    action: {
      label: "Undo",
      run: () => {
        const s = useStore.getState();
        added.forEach((id) => s.remove("tasks", id));
        s.patch("templates", templateId, { use_count: uses });
      },
    },
  });
}

/** Move one task to a day, with the undo the rail and the agenda both need. */
export function moveTaskToDay(taskId: string, date: string, startMin?: number | null) {
  const store = useStore.getState();
  const task = store.tasks.find((t) => t.id === taskId);
  if (!task || (task.date === date && startMin === undefined)) return;
  const prev = { date: task.date, start_min: task.start_min, end_min: task.end_min, all_day: task.all_day };

  store.moveTask(taskId, date, startMin);
  store.toast({
    title: task.title || "Task",
    description: `Moved to ${friendlyDate(date).toLowerCase()}.`,
    tone: "success",
    action: { label: "Undo", run: () => useStore.getState().patch("tasks", taskId, prev) },
  });
}

// =========================================================
// Agenda summaries
// =========================================================
export interface WeekSummary {
  start: string;
  end: string;
  week: number;
  total: number;
  done: number;
  minutes: number;
  perDay: { date: string; total: number; done: number }[];
  busiest: { date: string; total: number } | null;
}

/** A week's worth of load, read off the same buckets the agenda renders. */
export function weekSummary(byDate: Map<string, Task[]>, weekStartDate: string): WeekSummary {
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStartDate, i);
    const list = byDate.get(date) ?? [];
    return {
      date,
      total: list.filter((t) => t.status !== "dropped").length,
      done: list.filter((t) => t.status === "done").length,
    };
  });

  let minutes = 0;
  for (const day of perDay) {
    for (const t of byDate.get(day.date) ?? []) {
      if (t.status === "dropped") continue;
      if (isTimed(t)) {
        const { start, end } = spanOf(t);
        minutes += end - start;
      } else if (t.duration_min) {
        minutes += t.duration_min;
      }
    }
  }

  const busiest = perDay.reduce<{ date: string; total: number } | null>(
    (best, d) => (d.total > (best?.total ?? 0) ? { date: d.date, total: d.total } : best),
    null,
  );

  return {
    start: weekStartDate,
    end: addDays(weekStartDate, 6),
    week: weekNumber(weekStartDate),
    total: perDay.reduce((n, d) => n + d.total, 0),
    done: perDay.reduce((n, d) => n + d.done, 0),
    minutes,
    perDay,
    busiest,
  };
}
