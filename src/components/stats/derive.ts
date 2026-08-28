import {
  addDays, daysBetween, formatDate, startOfWeek, toISO, todayISO, weekday, yearOf,
} from "@/lib/date";
import { habitStreak } from "@/lib/store";
import {
  habitScheduledOn as sharedScheduledOn, NO_COUNTS, type HabitCounts,
} from "@/lib/habits";
import { PRAYER_NAMES } from "@/lib/types";
import type {
  Book, FocusSession, Habit, HabitLog, Prayer, PrayerName, Task, Tint,
} from "@/lib/types";

// =========================================================
// Every number on the Stats page is derived here, from the
// store arrays only. Pure functions, no React, no fetching.
// =========================================================

export type RangeKey = "7d" | "30d" | "90d" | "year";

export const RANGE_OPTIONS: { value: RangeKey; label: string; title: string }[] = [
  { value: "7d", label: "7 days", title: "The last 7 days" },
  { value: "30d", label: "30 days", title: "The last 30 days" },
  { value: "90d", label: "90 days", title: "The last 90 days" },
  { value: "year", label: "This year", title: "1 January to today" },
];

export function rangeDates(key: RangeKey, today = todayISO()): string[] {
  if (key === "year") return daysBetween(`${yearOf(today)}-01-01`, today);
  const n = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  return daysBetween(addDays(today, -(n - 1)), today);
}

/** The equally long window immediately before the current one, for deltas. */
export function previousDates(days: string[]): string[] {
  if (!days.length) return [];
  const end = addDays(days[0], -1);
  return daysBetween(addDays(end, -(days.length - 1)), end);
}

export function rangeLabel(days: string[]): string {
  if (!days.length) return "";
  const from = formatDate(days[0], { weekday: false });
  const to = formatDate(days[days.length - 1], { weekday: false });
  return `${from} – ${to} · ${days.length} days`;
}

// ---------------------------------------------------------
// Task + focus primitives
// ---------------------------------------------------------

/** Planned minutes: explicit duration, else the length of the booked slot. */
export function plannedMinutes(t: Task): number {
  if (t.duration_min != null) return Math.max(0, t.duration_min);
  if (t.start_min != null && t.end_min != null && t.end_min > t.start_min) {
    return t.end_min - t.start_min;
  }
  return 0;
}

export function isCountable(t: Task): boolean {
  return !t.parent_id && t.status !== "dropped";
}

export function doneByDate(tasks: Task[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tasks) {
    if (t.parent_id || t.status !== "done" || !t.date) continue;
    m.set(t.date, (m.get(t.date) ?? 0) + 1);
  }
  return m;
}

export function sessionDate(s: FocusSession): string {
  return toISO(new Date(s.started_at));
}

/** Breaks are not focus — they never count as time worked. */
export function isFocus(s: FocusSession): boolean {
  return s.mode !== "break";
}

export function focusMinutesByDate(sessions: FocusSession[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    if (!isFocus(s)) continue;
    const d = sessionDate(s);
    m.set(d, (m.get(d) ?? 0) + s.seconds / 60);
  }
  return m;
}

export interface DayStat {
  date: string;
  done: number;
  planned: number;
  plannedMin: number;
  focusMin: number;
}

export function buildDayStats(
  days: string[], tasks: Task[], sessions: FocusSession[],
): DayStat[] {
  const done = new Map<string, number>();
  const planned = new Map<string, number>();
  const plannedMin = new Map<string, number>();

  for (const t of tasks) {
    if (!t.date || !isCountable(t)) continue;
    planned.set(t.date, (planned.get(t.date) ?? 0) + 1);
    plannedMin.set(t.date, (plannedMin.get(t.date) ?? 0) + plannedMinutes(t));
    if (t.status === "done") done.set(t.date, (done.get(t.date) ?? 0) + 1);
  }

  const focus = focusMinutesByDate(sessions);

  return days.map((date) => ({
    date,
    done: done.get(date) ?? 0,
    planned: planned.get(date) ?? 0,
    plannedMin: plannedMin.get(date) ?? 0,
    focusMin: focus.get(date) ?? 0,
  }));
}

/**
 * Trailing mean over `window` days. It reads from a map of every day the
 * user has, not just the visible range, so the left edge is honest.
 */
export function trailingAverage(
  days: string[], source: Map<string, number>, window = 7,
): number[] {
  return days.map((d) => {
    let sum = 0;
    for (let k = 0; k < window; k++) sum += source.get(addDays(d, -k)) ?? 0;
    return sum / window;
  });
}

// ---------------------------------------------------------
// Buckets — daily bars stop being readable past a month
// ---------------------------------------------------------
export interface Bucket {
  key: string;
  label: string;
  title: string;
  plannedMin: number;
  focusMin: number;
  days: number;
}

export function bucketize(
  stats: DayStat[], mode: "day" | "week", weekStart: number,
): Bucket[] {
  if (mode === "day") {
    return stats.map((s) => ({
      key: s.date,
      label: formatDate(s.date, { weekday: false }),
      title: formatDate(s.date),
      plannedMin: s.plannedMin,
      focusMin: s.focusMin,
      days: 1,
    }));
  }

  const map = new Map<string, Bucket>();
  for (const s of stats) {
    const key = startOfWeek(s.date, weekStart);
    const bucket = map.get(key) ?? {
      key,
      label: formatDate(key, { weekday: false }),
      title: `Week of ${formatDate(key)}`,
      plannedMin: 0,
      focusMin: 0,
      days: 0,
    };
    bucket.plannedMin += s.plannedMin;
    bucket.focusMin += s.focusMin;
    bucket.days += 1;
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// ---------------------------------------------------------
// Where the time went
// ---------------------------------------------------------
export interface Slice {
  key: string;
  label: string;
  minutes: number;
  tint: Tint | null;
}

function topSlices(slices: Slice[], limit: number): Slice[] {
  const sorted = slices.filter((s) => s.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  head.push({
    key: "__other",
    label: `${rest.length} more`,
    minutes: rest.reduce((sum, s) => sum + s.minutes, 0),
    tint: null,
  });
  return head;
}

/** A session wearing several tags is counted once under each of them. */
export function focusByTag(
  sessions: FocusSession[], tasks: Task[], dates: Set<string>, tagColors: Map<string, Tint>,
): Slice[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const totals = new Map<string, number>();

  for (const s of sessions) {
    if (!isFocus(s) || !dates.has(sessionDate(s))) continue;
    const task = s.task_id ? taskById.get(s.task_id) : undefined;
    const tags = s.tags.length ? s.tags : (task?.tags ?? []);
    const minutes = s.seconds / 60;
    if (!tags.length) {
      totals.set("Untagged", (totals.get("Untagged") ?? 0) + minutes);
      continue;
    }
    for (const tag of tags) totals.set(tag, (totals.get(tag) ?? 0) + minutes);
  }

  return topSlices(
    [...totals].map(([label, minutes]) => ({
      key: label,
      label,
      minutes,
      tint: tagColors.get(label) ?? null,
    })),
    8,
  );
}

export function focusByTask(
  sessions: FocusSession[], tasks: Task[], dates: Set<string>,
): Slice[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const totals = new Map<string, { label: string; minutes: number; tint: Tint | null }>();

  for (const s of sessions) {
    if (!isFocus(s) || !dates.has(sessionDate(s))) continue;
    const task = s.task_id ? taskById.get(s.task_id) : undefined;
    const key = task?.id ?? (s.label || "__unlabelled");
    const label = task?.title || s.label || "Unlabelled focus";
    const entry = totals.get(key) ?? { label, minutes: 0, tint: task?.color ?? null };
    entry.minutes += s.seconds / 60;
    totals.set(key, entry);
  }

  return topSlices(
    [...totals].map(([key, v]) => ({ key, label: v.label, minutes: v.minutes, tint: v.tint })),
    8,
  );
}

// ---------------------------------------------------------
// Consistency
// ---------------------------------------------------------
export function habitScheduledOn(
  h: Habit, iso: string, counts: HabitCounts = NO_COUNTS, weekStart = 1,
): boolean {
  return sharedScheduledOn(h, iso, counts, weekStart);
}

export interface Part { label: string; done: number; total: number }

export interface DayScore {
  date: string;
  score: number | null;
  parts: Part[];
}

const PRAYED: ReadonlySet<string> = new Set(["prayed", "jamaah", "late"]);

export function buildDayScores(
  days: string[], tasks: Task[], habits: Habit[], habitLogs: HabitLog[], prayers: Prayer[],
): DayScore[] {
  const taskDone = new Map<string, number>();
  const taskTotal = new Map<string, number>();
  for (const t of tasks) {
    if (!t.date || !isCountable(t)) continue;
    taskTotal.set(t.date, (taskTotal.get(t.date) ?? 0) + 1);
    if (t.status === "done") taskDone.set(t.date, (taskDone.get(t.date) ?? 0) + 1);
  }

  const targetOf = new Map(habits.map((h) => [h.id, Math.max(1, h.target_count)]));
  const hitsByDate = new Map<string, number>();
  for (const l of habitLogs) {
    if (l.count >= (targetOf.get(l.habit_id) ?? 1)) {
      hitsByDate.set(l.date, (hitsByDate.get(l.date) ?? 0) + 1);
    }
  }

  const prayedByDate = new Map<string, number>();
  for (const p of prayers) {
    if (PRAYED.has(p.status)) prayedByDate.set(p.date, (prayedByDate.get(p.date) ?? 0) + 1);
  }

  const live = habits.filter((h) => !h.archived);
  const tracksPrayer = prayers.length > 0;

  return days.map((date) => {
    const parts: Part[] = [];

    const total = taskTotal.get(date) ?? 0;
    if (total > 0) parts.push({ label: "Tasks", done: taskDone.get(date) ?? 0, total });

    const scheduled = live.filter((h) => habitScheduledOn(h, date)).length;
    if (scheduled > 0) {
      parts.push({ label: "Habits", done: Math.min(scheduled, hitsByDate.get(date) ?? 0), total: scheduled });
    }

    if (tracksPrayer) {
      parts.push({ label: "Salah", done: Math.min(5, prayedByDate.get(date) ?? 0), total: 5 });
    }

    const score = parts.length
      ? parts.reduce((sum, p) => sum + p.done / p.total, 0) / parts.length
      : null;

    return { date, score, parts };
  });
}

export function perfectDays(scores: DayScore[]): number {
  return scores.filter((s) => s.score !== null && s.score > 0.9999).length;
}

// ---------------------------------------------------------
// Habits
// ---------------------------------------------------------
export interface HabitSeries {
  habit: Habit;
  /** One point per day: 0..1 of target, or null when the habit isn't due. */
  values: (number | null)[];
  counts: number[];
  hit: number;
  due: number;
  streak: number;
}

export function buildHabitSeries(
  days: string[], habits: Habit[], logs: HabitLog[],
): HabitSeries[] {
  const byHabit = new Map<string, Map<string, number>>();
  for (const l of logs) {
    const m = byHabit.get(l.habit_id) ?? new Map<string, number>();
    m.set(l.date, l.count);
    byHabit.set(l.habit_id, m);
  }

  return habits
    .filter((h) => !h.archived)
    .sort((a, b) => a.order_index - b.order_index)
    .map((habit) => {
      const target = Math.max(1, habit.target_count);
      const logMap = byHabit.get(habit.id);
      const counts: number[] = [];
      const values: (number | null)[] = [];
      let hit = 0;
      let due = 0;

      for (const d of days) {
        const count = logMap?.get(d) ?? 0;
        counts.push(count);
        if (habitScheduledOn(habit, d)) {
          due++;
          if (count >= target) hit++;
          values.push(Math.min(1, count / target));
        } else {
          values.push(count > 0 ? Math.min(1, count / target) : null);
        }
      }

      return { habit, values, counts, hit, due, streak: habitStreak(logs, habit.id) };
    });
}

// ---------------------------------------------------------
// Salah
// ---------------------------------------------------------
export interface PrayerStat {
  name: PrayerName;
  jamaah: number;
  prayed: number;
  late: number;
  qadha: number;
  missing: number;
  total: number;
}

export function buildPrayerStats(days: string[], prayers: Prayer[]): PrayerStat[] {
  const dates = new Set(days);
  const base = new Map<PrayerName, PrayerStat>(
    PRAYER_NAMES.map((name) => [
      name,
      { name, jamaah: 0, prayed: 0, late: 0, qadha: 0, missing: 0, total: days.length },
    ]),
  );

  for (const p of prayers) {
    if (!dates.has(p.date)) continue;
    const row = base.get(p.name);
    if (!row) continue;
    if (p.status === "jamaah") row.jamaah++;
    else if (p.status === "prayed") row.prayed++;
    else if (p.status === "late") row.late++;
    else if (p.status === "qadha") row.qadha++;
  }

  for (const row of base.values()) {
    row.missing = Math.max(0, row.total - row.jamaah - row.prayed - row.late - row.qadha);
  }

  return PRAYER_NAMES.map((n) => base.get(n)!);
}

export function onTime(p: PrayerStat): number {
  return p.jamaah + p.prayed + p.late;
}

// ---------------------------------------------------------
// Reading
// ---------------------------------------------------------
export interface WeekPages { key: string; label: string; title: string; pages: number }

function pagesOf(t: Task): number {
  if (t.page_from == null || t.page_to == null) return 0;
  return Math.max(0, t.page_to - t.page_from + 1);
}

/** Pages come from finished reading blocks — the only dated page history there is. */
export function readingPagesByDate(tasks: Task[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tasks) {
    if (t.kind !== "reading" || t.status !== "done" || !t.date) continue;
    const pages = pagesOf(t);
    if (pages) m.set(t.date, (m.get(t.date) ?? 0) + pages);
  }
  return m;
}

export function pagesPerWeek(days: string[], tasks: Task[], weekStart: number): WeekPages[] {
  const byDate = readingPagesByDate(tasks);
  const map = new Map<string, WeekPages>();
  for (const d of days) {
    const key = startOfWeek(d, weekStart);
    const row = map.get(key) ?? {
      key,
      label: formatDate(key, { weekday: false }),
      title: `Week of ${formatDate(key)}`,
      pages: 0,
    };
    row.pages += byDate.get(d) ?? 0;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface Projection {
  book: Book;
  remaining: number;
  perDay: number;
  finish: string | null;
  /** "pace" = measured, "plan" = the schedule you set, "none" = nothing to go on. */
  source: "pace" | "plan" | "none";
  farOut: boolean;
}

export function projectBooks(books: Book[], tasks: Task[], days: string[]): Projection[] {
  const today = days[days.length - 1] ?? todayISO();
  const active = books.filter((b) => b.status === "reading" && b.current_page < b.total_pages);
  const dates = new Set(days);

  return active
    .map<Projection>((book) => {
      let pages = 0;
      let firstRead: string | null = null;
      for (const t of tasks) {
        if (t.book_id !== book.id || t.kind !== "reading" || t.status !== "done" || !t.date) continue;
        if (!dates.has(t.date)) continue;
        pages += pagesOf(t);
        if (!firstRead || t.date < firstRead) firstRead = t.date;
      }

      const span = firstRead ? Math.max(1, daysBetween(firstRead, today).length) : days.length;
      const measured = pages / span;
      const perDay = measured > 0 ? measured : (book.pages_per_day ?? 0);
      const source: Projection["source"] = measured > 0 ? "pace" : perDay > 0 ? "plan" : "none";
      const remaining = book.total_pages - book.current_page;
      const daysLeft = perDay > 0 ? Math.ceil(remaining / perDay) : 0;

      return {
        book,
        remaining,
        perDay,
        finish: perDay > 0 && daysLeft <= 3650 ? addDays(today, daysLeft) : null,
        source,
        farOut: perDay > 0 && daysLeft > 365,
      };
    })
    .sort((a, b) => {
      if (!a.finish) return 1;
      if (!b.finish) return -1;
      return a.finish.localeCompare(b.finish);
    });
}
