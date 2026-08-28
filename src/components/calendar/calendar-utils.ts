"use client";

import { addDays, formatDate } from "@/lib/date";
import { useStore } from "@/lib/store";
import type { Book, Task, Template } from "@/lib/types";

// =========================================================
// Geometry — one hour is 48px everywhere the timeline appears.
// =========================================================
export const HOUR_H = 48;
export const GRID_H = HOUR_H * 24;
export const DAY_MIN = 1440;
export const SNAP_MIN = 15;
export const MIN_EVENT_MIN = 15;
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const clampMin = (m: number) => Math.max(0, Math.min(DAY_MIN, m));
export const snapMin = (m: number, step = SNAP_MIN) => Math.round(m / step) * step;

/** y offset in px for a minute-of-day. */
export const yFor = (min: number) => (min / DAY_MIN) * GRID_H;

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
}

/**
 * Side-by-side layout for overlapping events: events are grouped into clusters
 * of transitively-overlapping items, then packed into the fewest columns that
 * keep every pair apart. Everything in a cluster shares a column count so the
 * blocks line up rather than stair-stepping.
 */
export function layoutTimed(tasks: Task[]): Placed[] {
  const items: Placed[] = tasks
    .map((task) => ({ task, ...spanOf(task), col: 0, cols: 1 }))
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
    for (const item of cluster) item.cols = colEnds.length;
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
// Drop actions — both reachable from the rail buttons too, so the
// feature is not locked behind a mouse drag.
// =========================================================
export function scheduleBookOnDay(bookId: string, date: string) {
  const store = useStore.getState();
  const book = store.books.find((b) => b.id === bookId);
  if (!book) return;

  const created = store.scheduleBook(bookId, { startDate: date });
  if (!created) {
    store.toast({
      title: `${book.title} needs no blocks`,
      description: `Page ${book.current_page} of ${book.total_pages} — nothing left to schedule.`,
    });
    return;
  }
  store.toast({
    title: `${book.title} scheduled`,
    description: `${created} reading ${created === 1 ? "block" : "blocks"} from ${formatDate(date)}.`,
    tone: "success",
    action: { label: "Undo", run: () => useStore.getState().unscheduleBook(bookId, date) },
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

  store.toast({
    title: `${template.name} applied`,
    description: `${count} ${count === 1 ? "task" : "tasks"} added from ${formatDate(date)}.`,
    tone: "success",
    action: {
      label: "Undo",
      run: () => {
        const s = useStore.getState();
        added.forEach((id) => s.remove("tasks", id));
      },
    },
  });
}
