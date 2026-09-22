import {
  addDays, dayNameOf, daysBetween, formatDate, formatTime, startOfWeek, toISO, todayISO,
  weekday, yearOf,
} from "@/lib/date";
import {
  buildLogIndex, habitScheduledOn as sharedScheduledOn, habitStreakOn, isHabitComplete,
  NO_COUNTS, type HabitCounts,
} from "@/lib/habits";
import { PRAYER_NAMES } from "@/lib/types";
import type {
  Book, DayLog, FocusSession, Goal, Habit, HabitLog, Media, Prayer, PrayerName,
  Project, Task, Tint,
} from "@/lib/types";
import { PACE_WINDOW, paceStats, type ReadDay } from "@/components/books/pace";
import type { ReadingHistory } from "@/components/books/reading-history";

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
// Small numeric helpers
// ---------------------------------------------------------
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Percentage change of `now` against `before`. Null when there is no baseline. */
export function changePct(now: number, before: number): number | null {
  if (before <= 0) return null;
  return ((now - before) / before) * 100;
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
// Cross-filtering by tag
// ---------------------------------------------------------
export interface TagUsage {
  name: string;
  tint: Tint | null;
  tasks: number;
  minutes: number;
}

/** Every tag that shows up on a task or a session inside the window. */
export function tagUsage(
  days: string[], tasks: Task[], sessions: FocusSession[], tagColors: Map<string, Tint>,
): TagUsage[] {
  const dates = new Set(days);
  const rows = new Map<string, TagUsage>();
  const touch = (name: string) => {
    const row = rows.get(name) ?? { name, tint: tagColors.get(name) ?? null, tasks: 0, minutes: 0 };
    rows.set(name, row);
    return row;
  };

  for (const t of tasks) {
    if (!t.date || !dates.has(t.date) || !isCountable(t)) continue;
    for (const name of t.tags) touch(name).tasks += 1;
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  for (const s of sessions) {
    if (!isFocus(s) || !dates.has(sessionDate(s))) continue;
    const inherited = s.tags.length ? s.tags : (s.task_id ? taskById.get(s.task_id)?.tags ?? [] : []);
    for (const name of inherited) touch(name).minutes += s.seconds / 60;
  }

  return [...rows.values()].sort(
    (a, b) => b.minutes - a.minutes || b.tasks - a.tasks || a.name.localeCompare(b.name),
  );
}

/**
 * Narrows tasks and sessions to a set of tags. A subtask inherits its parent's
 * tags, and a session inherits its task's, so neither is dropped for lacking a
 * tag of its own.
 */
export function applyTagFilter(
  tasks: Task[], sessions: FocusSession[], tags: string[],
): { tasks: Task[]; sessions: FocusSession[] } {
  if (!tags.length) return { tasks, sessions };
  const wanted = new Set(tags);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const hit = (list: string[]) => list.some((name) => wanted.has(name));

  const keptTasks = tasks.filter((t) => {
    if (hit(t.tags)) return true;
    const parent = t.parent_id ? byId.get(t.parent_id) : undefined;
    return parent ? hit(parent.tags) : false;
  });

  const keptIds = new Set(keptTasks.map((t) => t.id));
  const keptSessions = sessions.filter(
    (s) => hit(s.tags) || (s.task_id != null && keptIds.has(s.task_id)),
  );

  return { tasks: keptTasks, sessions: keptSessions };
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
  /** Set when the slice is a tag, so clicking it can cross-filter. */
  tag?: string;
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
      tag: label === "Untagged" ? undefined : label,
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
// Estimate accuracy — how wrong the durations you book are
// ---------------------------------------------------------

/** Minutes of focus attributed to each task, from the sessions themselves. */
export function actualMinutesByTask(sessions: FocusSession[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    if (!isFocus(s) || !s.task_id) continue;
    m.set(s.task_id, (m.get(s.task_id) ?? 0) + s.seconds / 60);
  }
  return m;
}

export interface EstimateSample {
  date: string;
  taskId: string;
  title: string;
  planned: number;
  actual: number;
  /** actual / planned. 1 is a perfect call. */
  ratio: number;
}

/**
 * One row per finished task that carries both an estimate and a measured time.
 * `actual_min` is what the timer wrote back; a session that was never attached
 * to the task would be invisible there, so the larger of the two wins.
 */
export function estimateSamples(
  days: string[], tasks: Task[], sessions: FocusSession[],
): EstimateSample[] {
  const dates = new Set(days);
  const measured = actualMinutesByTask(sessions);
  const out: EstimateSample[] = [];

  for (const t of tasks) {
    if (!t.date || !dates.has(t.date) || t.parent_id || t.status !== "done") continue;
    const planned = plannedMinutes(t);
    if (planned <= 0) continue;
    const actual = Math.max(t.actual_min ?? 0, measured.get(t.id) ?? 0);
    if (actual <= 0) continue;
    out.push({ date: t.date, taskId: t.id, title: t.title, planned, actual, ratio: actual / planned });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface EstimatePoint {
  key: string;
  label: string;
  title: string;
  n: number;
  /** Median actual/planned inside the bucket. Null when nothing comparable. */
  ratio: number | null;
  plannedMin: number;
  actualMin: number;
}

export function bucketEstimates(
  days: string[], samples: EstimateSample[], mode: "day" | "week", weekStart: number,
): EstimatePoint[] {
  const keyOf = (date: string) => (mode === "day" ? date : startOfWeek(date, weekStart));
  const order: string[] = [];
  const seen = new Set<string>();
  for (const d of days) {
    const key = keyOf(d);
    if (!seen.has(key)) { seen.add(key); order.push(key); }
  }

  const grouped = new Map<string, EstimateSample[]>();
  for (const s of samples) {
    const key = keyOf(s.date);
    const list = grouped.get(key) ?? [];
    list.push(s);
    grouped.set(key, list);
  }

  return order.map((key) => {
    const list = grouped.get(key) ?? [];
    return {
      key,
      label: formatDate(key, { weekday: false }),
      title: mode === "day" ? formatDate(key) : `Week of ${formatDate(key)}`,
      n: list.length,
      ratio: median(list.map((s) => s.ratio)),
      plannedMin: list.reduce((sum, s) => sum + s.planned, 0),
      actualMin: list.reduce((sum, s) => sum + s.actual, 0),
    };
  });
}

export interface EstimateSummary {
  n: number;
  /** Median actual/planned across the window. */
  ratio: number | null;
  over: number;
  under: number;
  close: number;
  /** Median ratio of the second half minus the first — negative is improving. */
  drift: number | null;
  worst: EstimateSample | null;
}

/** Anything inside ±15% counts as a fair call, not a miss. */
const CLOSE = 0.15;

export function summariseEstimates(samples: EstimateSample[]): EstimateSummary {
  const ratios = samples.map((s) => s.ratio);
  const half = Math.floor(samples.length / 2);
  const firstHalf = median(ratios.slice(0, half));
  const lastHalf = median(ratios.slice(half));

  let worst: EstimateSample | null = null;
  for (const s of samples) {
    if (!worst || Math.abs(s.ratio - 1) > Math.abs(worst.ratio - 1)) worst = s;
  }

  return {
    n: samples.length,
    ratio: median(ratios),
    over: samples.filter((s) => s.ratio > 1 + CLOSE).length,
    under: samples.filter((s) => s.ratio < 1 - CLOSE).length,
    close: samples.filter((s) => Math.abs(s.ratio - 1) <= CLOSE).length,
    drift:
      samples.length >= 6 && firstHalf != null && lastHalf != null
        ? Math.abs(lastHalf - 1) - Math.abs(firstHalf - 1)
        : null,
    worst,
  };
}

// ---------------------------------------------------------
// Day-of-week performance
// ---------------------------------------------------------
export interface WeekdayStat {
  /** 0 = Sunday, matching lib/date. */
  index: number;
  label: string;
  days: number;
  done: number;
  planned: number;
  focusMin: number;
  /** done / planned, null when nothing was ever planned on that weekday. */
  rate: number | null;
}

export function buildWeekdayStats(stats: DayStat[], weekStart: number): WeekdayStat[] {
  const rows = new Map<number, WeekdayStat>();
  for (let i = 0; i < 7; i++) {
    const index = (weekStart + i) % 7;
    rows.set(index, {
      index,
      label: dayNameOf(index, "short"),
      days: 0, done: 0, planned: 0, focusMin: 0, rate: null,
    });
  }

  for (const d of stats) {
    const row = rows.get(weekday(d.date));
    if (!row) continue;
    row.days += 1;
    row.done += d.done;
    row.planned += d.planned;
    row.focusMin += d.focusMin;
  }

  const ordered = Array.from({ length: 7 }, (_, i) => rows.get((weekStart + i) % 7)!);
  for (const row of ordered) row.rate = row.planned > 0 ? row.done / row.planned : null;
  return ordered;
}

// ---------------------------------------------------------
// Time-of-day performance
// ---------------------------------------------------------
export interface HourStat {
  hour: number;
  focusMin: number;
  sessions: number;
  completed: number;
}

/** A session that runs past the hour is split across the hours it covers. */
function spreadSession(s: FocusSession, into: HourStat[]): void {
  const start = new Date(s.started_at);
  if (Number.isNaN(start.getTime())) return;
  let minute = start.getHours() * 60 + start.getMinutes();
  let left = s.seconds / 60;
  into[start.getHours()].sessions += 1;
  // 24 hops covers a full day; nothing legitimate runs longer.
  for (let guard = 0; guard < 24 && left > 0.01; guard++) {
    const hour = Math.floor(minute / 60) % 24;
    const room = 60 - (minute % 60);
    const used = Math.min(left, room);
    into[hour].focusMin += used;
    left -= used;
    minute += used;
  }
}

export function buildHourStats(
  days: string[], tasks: Task[], sessions: FocusSession[],
): HourStat[] {
  const dates = new Set(days);
  const hours: HourStat[] = Array.from({ length: 24 }, (_, hour) => ({
    hour, focusMin: 0, sessions: 0, completed: 0,
  }));

  for (const s of sessions) {
    if (!isFocus(s) || !dates.has(sessionDate(s))) continue;
    spreadSession(s, hours);
  }

  for (const t of tasks) {
    if (t.status !== "done" || t.parent_id || !t.completed_at) continue;
    const at = new Date(t.completed_at);
    if (Number.isNaN(at.getTime()) || !dates.has(toISO(at))) continue;
    hours[at.getHours()].completed += 1;
  }

  return hours;
}

export interface HourWindow { from: number; to: number; minutes: number; share: number }

/** The best contiguous `span`-hour block of focus, and what share of it lands there. */
export function peakWindow(hours: HourStat[], span = 3): HourWindow | null {
  const total = hours.reduce((sum, h) => sum + h.focusMin, 0);
  if (total <= 0) return null;
  let best = { from: 0, minutes: -1 };
  for (let start = 0; start <= 24 - span; start++) {
    let sum = 0;
    for (let k = 0; k < span; k++) sum += hours[start + k].focusMin;
    if (sum > best.minutes) best = { from: start, minutes: sum };
  }
  return { from: best.from, to: best.from + span, minutes: best.minutes, share: best.minutes / total };
}

export function hourLabel(hour: number, hour12: boolean): string {
  return formatTime((hour % 24) * 60, hour12);
}

// ---------------------------------------------------------
// Tag drift — what moved between this window and the last
// ---------------------------------------------------------
export interface TagDriftRow {
  name: string;
  tint: Tint | null;
  minutes: number;
  minutesBefore: number;
  tasks: number;
  tasksBefore: number;
}

export type DriftMetric = "minutes" | "tasks";

export function driftValue(row: TagDriftRow, metric: DriftMetric): number {
  return metric === "minutes" ? row.minutes : row.tasks;
}

export function driftValueBefore(row: TagDriftRow, metric: DriftMetric): number {
  return metric === "minutes" ? row.minutesBefore : row.tasksBefore;
}

export function buildTagDrift(
  days: string[], prevDays: string[], tasks: Task[], sessions: FocusSession[],
  tagColors: Map<string, Tint>,
): TagDriftRow[] {
  const now = tagUsage(days, tasks, sessions, tagColors);
  const before = tagUsage(prevDays, tasks, sessions, tagColors);
  const beforeByName = new Map(before.map((r) => [r.name, r]));
  const names = new Set([...now.map((r) => r.name), ...before.map((r) => r.name)]);
  const nowByName = new Map(now.map((r) => [r.name, r]));

  return [...names]
    .map<TagDriftRow>((name) => {
      const a = nowByName.get(name);
      const b = beforeByName.get(name);
      return {
        name,
        tint: a?.tint ?? b?.tint ?? null,
        minutes: a?.minutes ?? 0,
        minutesBefore: b?.minutes ?? 0,
        tasks: a?.tasks ?? 0,
        tasksBefore: b?.tasks ?? 0,
      };
    })
    .sort((x, y) => {
      const dx = Math.abs(x.minutes - x.minutesBefore) + Math.abs(x.tasks - x.tasksBefore) * 15;
      const dy = Math.abs(y.minutes - y.minutesBefore) + Math.abs(y.tasks - y.tasksBefore) * 15;
      return dy - dx || x.name.localeCompare(y.name);
    });
}

// ---------------------------------------------------------
// Consistency
// ---------------------------------------------------------
export interface Part { label: string; done: number; total: number }

export interface DayScore {
  date: string;
  score: number | null;
  parts: Part[];
}

const PRAYED: ReadonlySet<string> = new Set(["prayed", "jamaah", "late"]);

export function buildDayScores(
  days: string[], tasks: Task[], habits: Habit[], habitLogs: HabitLog[], prayers: Prayer[],
  weekStart = 1,
): DayScore[] {
  const taskDone = new Map<string, number>();
  const taskTotal = new Map<string, number>();
  for (const t of tasks) {
    if (!t.date || !isCountable(t)) continue;
    taskTotal.set(t.date, (taskTotal.get(t.date) ?? 0) + 1);
    if (t.status === "done") taskDone.set(t.date, (taskDone.get(t.date) ?? 0) + 1);
  }

  const prayedByDate = new Map<string, number>();
  for (const p of prayers) {
    if (PRAYED.has(p.status)) prayedByDate.set(p.date, (prayedByDate.get(p.date) ?? 0) + 1);
  }

  const logIndex = buildLogIndex(habitLogs);
  const live = habits.filter((h) => !h.archived);
  const tracksPrayer = prayers.length > 0;

  return days.map((date) => {
    const parts: Part[] = [];

    const total = taskTotal.get(date) ?? 0;
    if (total > 0) parts.push({ label: "Tasks", done: taskDone.get(date) ?? 0, total });

    // Hits and schedule have to come from the same population: counting every
    // log on the day would credit archived habits and off-schedule logs against
    // a total that only holds live, due ones.
    let scheduled = 0;
    let kept = 0;
    for (const h of live) {
      const counts = logIndex.get(h.id) ?? NO_COUNTS;
      if (!sharedScheduledOn(h, date, counts, weekStart)) continue;
      scheduled++;
      if (isHabitComplete(h, counts.get(date))) kept++;
    }
    if (scheduled > 0) parts.push({ label: "Habits", done: kept, total: scheduled });

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
  days: string[], habits: Habit[], logs: HabitLog[], weekStart = 1, upTo = todayISO(),
): HabitSeries[] {
  const logIndex = buildLogIndex(logs);

  return habits
    .filter((h) => !h.archived)
    .sort((a, b) => a.order_index - b.order_index)
    .map((habit) => {
      const target = Math.max(1, habit.target_count);
      const counts = logIndex.get(habit.id) ?? NO_COUNTS;
      const dayCounts: number[] = [];
      const values: (number | null)[] = [];
      let hit = 0;
      let due = 0;

      for (const d of days) {
        const count = counts.get(d) ?? 0;
        dayCounts.push(count);
        if (sharedScheduledOn(habit, d, counts, weekStart)) {
          due++;
          if (count >= target) hit++;
          values.push(Math.min(1, count / target));
        } else {
          values.push(count > 0 ? Math.min(1, count / target) : null);
        }
      }

      return {
        habit,
        values,
        counts: dayCounts,
        hit,
        due,
        // The shared streak honours cadence and per-day target; a bare
        // "was there a log" count would flatter every partial day.
        streak: habitStreakOn(habit, counts, upTo, weekStart),
      };
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

/** Dates on which one named prayer was kept — the basis of the Fajr insight. */
export function prayerKeptDates(prayers: Prayer[], name: PrayerName): Set<string> {
  const out = new Set<string>();
  for (const p of prayers) if (p.name === name && PRAYED.has(p.status)) out.add(p.date);
  return out;
}

// ---------------------------------------------------------
// Reading
//
// Every figure here comes from `buildReadingHistory`, the same model the shelf
// and the review read. Pages used to be totalled from ticked reading blocks
// alone, so a book read off-plan — or finished by dragging the bookmark —
// contributed nothing and the panel reported an honest-looking nought.
// ---------------------------------------------------------
export interface WeekPages {
  key: string;
  label: string;
  title: string;
  pages: number;
  quranPages: number;
  minutes: number;
}

export function pagesPerWeek(history: ReadingHistory, weekStart: number): WeekPages[] {
  const map = new Map<string, WeekPages>();
  for (const day of history.days) {
    const key = startOfWeek(day.date, weekStart);
    const row = map.get(key) ?? {
      key,
      label: formatDate(key, { weekday: false }),
      title: `Week of ${formatDate(key)}`,
      pages: 0,
      quranPages: 0,
      minutes: 0,
    };
    row.pages += day.pages;
    row.quranPages += day.quranPages;
    row.minutes += day.minutes;
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

/**
 * When a book actually lands, measured from its own dated history rather than
 * from the rate the plan wishes for. `paceStats` already averages that history
 * over a sensible window, so this only has to turn a rate into a date.
 */
export function projectBooks(
  books: Book[], index: Map<string, ReadDay[]>, days: string[],
): Projection[] {
  const today = days[days.length - 1] ?? todayISO();
  const active = books.filter((b) => b.status === "reading" && b.current_page < b.total_pages);

  return active
    .map<Projection>((book) => {
      const measured = paceStats(index.get(book.id) ?? [], PACE_WINDOW, today).perDay;
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

// ---------------------------------------------------------
// Insights — sentences the data actually supports
// ---------------------------------------------------------
export interface Insight {
  key: string;
  /** The sentence. Only trustworthy when `ok`. */
  text: string;
  /** Observations behind it, and how many it would take to be honest. */
  sample: number;
  need: number;
  ok: boolean;
  /** What the sample actually counts, printed beside the sentence. */
  evidence: string;
  /** Shown instead of the sentence when the sample is too thin. */
  shortfall: string;
  tone: "up" | "down" | "flat";
}

interface Split { rate: number; days: number; planned: number }

function splitRate(list: DayStat[]): Split {
  const use = list.filter((d) => d.planned > 0);
  const planned = use.reduce((sum, d) => sum + d.planned, 0);
  const done = use.reduce((sum, d) => sum + d.done, 0);
  return { rate: planned > 0 ? done / planned : 0, days: use.length, planned };
}

const asPct = (v: number) => Math.round(v * 100);

export interface InsightInput {
  stats: DayStat[];
  prayers: Prayer[];
  habits: Habit[];
  habitLogs: HabitLog[];
  weekdays: WeekdayStat[];
  hours: HourStat[];
  estimate: EstimateSummary;
  weekStart: number;
  hour12: boolean;
}

/**
 * Each entry knows its own sample size, so the page can show the honest ones and
 * say plainly how many it is holding back rather than dressing up three days of
 * data as a finding.
 */
export function buildInsights(input: InsightInput): Insight[] {
  const { stats, prayers, habits, habitLogs, weekdays, hours, estimate, weekStart, hour12 } = input;
  const out: Insight[] = [];

  // --- Fajr ---
  if (prayers.length > 0) {
    const kept = prayerKeptDates(prayers, "fajr");
    const withFajr = splitRate(stats.filter((d) => kept.has(d.date)));
    const without = splitRate(stats.filter((d) => !kept.has(d.date)));
    const sample = Math.min(withFajr.days, without.days);
    const need = 5;
    const ok = sample >= need && without.rate > 0;
    const lift = without.rate > 0 ? ((withFajr.rate - without.rate) / without.rate) * 100 : 0;
    out.push({
      key: "fajr",
      ok,
      sample,
      need,
      tone: lift > 3 ? "up" : lift < -3 ? "down" : "flat",
      text:
        Math.abs(lift) < 3
          ? `Fajr makes no measurable difference to what you finish — ${asPct(withFajr.rate)}% against ${asPct(without.rate)}%.`
          : `You finish ${Math.abs(Math.round(lift))}% ${lift > 0 ? "more" : "less"} of what you plan on days you keep Fajr — ` +
            `${asPct(withFajr.rate)}% against ${asPct(without.rate)}%.`,
      evidence: `${sample} planned days on the thinner side`,
      shortfall: `Fajr vs the rest needs 5 planned days on each side; there ${sample === 1 ? "is" : "are"} ${sample}.`,
    });
  }

  // --- Weekday spread ---
  const ranked = weekdays.filter((d) => d.rate != null && d.days >= 3);
  if (ranked.length >= 2) {
    const best = ranked.reduce((a, b) => ((b.rate ?? 0) > (a.rate ?? 0) ? b : a));
    const worst = ranked.reduce((a, b) => ((b.rate ?? 1) < (a.rate ?? 1) ? b : a));
    const sample = Math.min(best.days, worst.days);
    const need = 3;
    out.push({
      key: "weekday",
      ok: sample >= need && best.index !== worst.index && (best.rate ?? 0) - (worst.rate ?? 0) > 0.05,
      sample,
      need,
      tone: "flat",
      text:
        `${dayNameOf(best.index, "long")} is your strongest day — you close ${asPct(best.rate ?? 0)}% of what you plan, ` +
        `against ${asPct(worst.rate ?? 0)}% on ${dayNameOf(worst.index, "long")}.`,
      evidence: `${sample} appearances of the thinner weekday`,
      shortfall: `Each weekday needs 3 appearances in the window before a best and worst day mean anything.`,
    });
  }

  // --- Estimates ---
  if (estimate.n > 0 && estimate.ratio != null) {
    const off = Math.round(Math.abs(estimate.ratio - 1) * 100);
    const over = estimate.ratio > 1;
    out.push({
      key: "estimate",
      ok: estimate.n >= 8 && off >= 5,
      sample: estimate.n,
      need: 8,
      tone: over ? "down" : "up",
      text:
        off < 5
          ? `Your estimates are honest — the middle task lands within ${off}% of the time you booked for it.`
          : `Your estimates run ${off}% ${over ? "short" : "long"} — an hour you book usually takes ` +
            `${Math.round(60 * estimate.ratio)} minutes.`,
      evidence: `${estimate.n} measured ${estimate.n === 1 ? "task" : "tasks"}`,
      shortfall: `Only ${estimate.n} finished ${estimate.n === 1 ? "task carries" : "tasks carry"} both an estimate and a measured time; 8 is the floor.`,
    });
  }

  // --- Focus ---
  const withFocus = splitRate(stats.filter((d) => d.focusMin > 0));
  const noFocus = splitRate(stats.filter((d) => d.focusMin <= 0));
  if (withFocus.days > 0) {
    const sample = Math.min(withFocus.days, noFocus.days);
    const lift = noFocus.rate > 0 ? ((withFocus.rate - noFocus.rate) / noFocus.rate) * 100 : 0;
    out.push({
      key: "focus",
      ok: sample >= 5 && noFocus.rate > 0 && Math.abs(lift) >= 5,
      sample,
      need: 5,
      tone: lift > 0 ? "up" : "down",
      text:
        `Days you run the timer close ${asPct(withFocus.rate)}% of the plan, against ${asPct(noFocus.rate)}% on days you don't — ` +
        `${Math.abs(Math.round(lift))}% ${lift > 0 ? "better" : "worse"}.`,
      evidence: `${sample} planned days on the thinner side`,
      shortfall: `Timed and untimed days both need 5 planned days; the thinner side has ${sample}.`,
    });
  }

  // --- Peak window ---
  const peak = peakWindow(hours, 3);
  const totalFocus = hours.reduce((sum, h) => sum + h.focusMin, 0);
  if (peak) {
    out.push({
      key: "peak",
      ok: totalFocus >= 240,
      sample: Math.round(totalFocus),
      need: 240,
      tone: "flat",
      text:
        `${asPct(peak.share)}% of your focus lands between ${hourLabel(peak.from, hour12)} and ` +
        `${hourLabel(peak.to, hour12)} — that is the block worth defending.`,
      evidence: `${Math.round(totalFocus)} minutes of logged focus`,
      shortfall: `A time-of-day pattern needs 4 hours of logged focus; there ${totalFocus === 1 ? "is" : "are"} ${Math.round(totalFocus)} minutes.`,
    });
  }

  // --- Habit lift ---
  const logIndex = buildLogIndex(habitLogs);
  const live = habits.filter((h) => !h.archived);
  let anchor: { habit: Habit; kept: Set<string>; scheduled: number } | null = null;
  for (const h of live) {
    const counts = logIndex.get(h.id) ?? NO_COUNTS;
    const kept = new Set<string>();
    let scheduled = 0;
    for (const d of stats) {
      if (!sharedScheduledOn(h, d.date, counts, weekStart)) continue;
      scheduled++;
      if (isHabitComplete(h, counts.get(d.date))) kept.add(d.date);
    }
    if (!anchor || kept.size > anchor.kept.size) anchor = { habit: h, kept, scheduled };
  }
  if (anchor && anchor.scheduled > 0) {
    const on = splitRate(stats.filter((d) => anchor!.kept.has(d.date)));
    const off = splitRate(stats.filter((d) => !anchor!.kept.has(d.date)));
    const sample = Math.min(on.days, off.days);
    const lift = off.rate > 0 ? ((on.rate - off.rate) / off.rate) * 100 : 0;
    out.push({
      key: "habit",
      ok: sample >= 5 && off.rate > 0 && Math.abs(lift) >= 5,
      sample,
      need: 5,
      tone: lift > 0 ? "up" : "down",
      text:
        `On days you keep ${anchor.habit.name} you close ${asPct(on.rate)}% of the plan, against ${asPct(off.rate)}% ` +
        `on the days you skip it.`,
      evidence: `${sample} planned days on the thinner side`,
      shortfall: `${anchor.habit.name} needs 5 kept and 5 skipped planned days to compare; the thinner side has ${sample}.`,
    });
  }

  // --- Weekend dip ---
  const weekendDays = stats.filter((d) => weekday(d.date) === 0 || weekday(d.date) === 6);
  const weekDays = stats.filter((d) => weekday(d.date) !== 0 && weekday(d.date) !== 6);
  const wknd = splitRate(weekendDays);
  const wkdy = splitRate(weekDays);
  if (wknd.days > 0 && wkdy.days > 0) {
    const gap = wkdy.rate > 0 ? ((wknd.rate - wkdy.rate) / wkdy.rate) * 100 : 0;
    out.push({
      key: "weekend",
      ok: wknd.days >= 4 && wkdy.days >= 8 && Math.abs(gap) >= 8,
      sample: Math.min(wknd.days, wkdy.days),
      need: 4,
      tone: gap > 0 ? "up" : "down",
      text:
        `Weekends run ${Math.abs(Math.round(gap))}% ${gap > 0 ? "ahead of" : "behind"} your weekdays — ` +
        `${asPct(wknd.rate)}% against ${asPct(wkdy.rate)}%.`,
      evidence: `${wknd.days} weekend and ${wkdy.days} weekday days`,
      shortfall: `A weekend pattern needs 4 planned weekend days and 8 planned weekdays.`,
    });
  }

  return out;
}

// ---------------------------------------------------------
// Wellbeing
//
// Mood, energy, sleep, water and steps have been written to the day log since
// it existed, and nothing has ever read them back. A number you are asked for
// daily and never shown is a chore, not a measure.
// ---------------------------------------------------------
export interface WellbeingDay {
  date: string;
  mood: number | null;
  energy: number | null;
  focus: number | null;
  sleep: number | null;
  water: number;
  steps: number | null;
  logged: boolean;
}

export interface WellbeingSummary {
  days: WellbeingDay[];
  loggedDays: number;
  mood: number | null;
  energy: number | null;
  focus: number | null;
  sleep: number | null;
  water: number | null;
  steps: number | null;
  /** How mood moves with sleep, -1..1, or null below a usable sample. */
  sleepMoodCorrelation: number | null;
  best: WellbeingDay | null;
  worst: WellbeingDay | null;
}

/** Pearson's r. Null under eight pairs — below that it is noise with a decimal point. */
function correlate(pairs: [number, number][]): number | null {
  if (pairs.length < 8) return null;
  const n = pairs.length;
  const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
  const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
}

export function buildWellbeing(days: string[], dayLogs: DayLog[]): WellbeingSummary {
  const byDate = new Map(dayLogs.map((d) => [d.date, d]));

  const rows: WellbeingDay[] = days.map((date) => {
    const log = byDate.get(date);
    return {
      date,
      mood: log?.mood ?? null,
      energy: log?.energy ?? null,
      focus: log?.focus_score ?? null,
      sleep: log?.sleep_hours ?? null,
      water: log?.water ?? 0,
      steps: log?.steps ?? null,
      // An empty row is not a logged day — it is a day the question went unanswered.
      logged: !!log && (log.mood != null || log.energy != null || log.sleep_hours != null
        || log.focus_score != null || log.water > 0 || log.steps != null),
    };
  });

  const mean = (pick: (d: WellbeingDay) => number | null): number | null => {
    const values = rows.map(pick).filter((v): v is number => v != null);
    if (!values.length) return null;
    return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
  };

  const rated = rows.filter((r) => r.mood != null);

  return {
    days: rows,
    loggedDays: rows.filter((r) => r.logged).length,
    mood: mean((d) => d.mood),
    energy: mean((d) => d.energy),
    focus: mean((d) => d.focus),
    sleep: mean((d) => d.sleep),
    water: mean((d) => (d.water > 0 ? d.water : null)),
    steps: mean((d) => d.steps),
    sleepMoodCorrelation: correlate(
      rows.filter((r) => r.sleep != null && r.mood != null).map((r) => [r.sleep as number, r.mood as number]),
    ),
    best: rated.reduce<WellbeingDay | null>((a, r) => (!a || (r.mood as number) > (a.mood as number) ? r : a), null),
    worst: rated.reduce<WellbeingDay | null>((a, r) => (!a || (r.mood as number) < (a.mood as number) ? r : a), null),
  };
}

// ---------------------------------------------------------
// Goals and projects
// ---------------------------------------------------------
export interface GoalRow {
  goal: Goal;
  closed: number;
  /** Progress against its own target, 0..100, null when it carries no target. */
  pct: number | null;
  overdue: boolean;
}

export interface GoalSummary {
  rows: GoalRow[];
  active: number;
  done: number;
  advanced: number;
  untouched: number;
  projectsActive: number;
  projectsDone: number;
  /** Tasks closed in the window that served no goal and no project. */
  unattached: number;
}

export function buildGoalStats(
  days: string[], goals: Goal[], projects: Project[], tasks: Task[],
): GoalSummary {
  const inRange = new Set(days);
  const today = days[days.length - 1] ?? todayISO();
  const closedHere = tasks.filter(
    (t) => t.status === "done" && !!t.date && inRange.has(t.date) && !t.parent_id,
  );

  const byGoal = new Map<string, number>();
  for (const t of closedHere) {
    if (t.goal_id) byGoal.set(t.goal_id, (byGoal.get(t.goal_id) ?? 0) + 1);
  }

  const live = goals.filter((g) => g.status === "active" || g.status === "done");
  const rows: GoalRow[] = live
    .map((goal) => ({
      goal,
      closed: byGoal.get(goal.id) ?? 0,
      pct: goal.target && goal.target > 0
        ? Math.min(100, Math.round((goal.current / goal.target) * 100))
        : null,
      overdue: goal.status === "active" && !!goal.end_date && goal.end_date < today,
    }))
    .sort((a, b) => b.closed - a.closed || a.goal.title.localeCompare(b.goal.title));

  return {
    rows,
    active: goals.filter((g) => g.status === "active").length,
    done: goals.filter((g) => g.status === "done").length,
    advanced: byGoal.size,
    untouched: goals.filter((g) => g.status === "active" && !byGoal.has(g.id)).length,
    projectsActive: projects.filter((p) => p.status === "active").length,
    projectsDone: projects.filter((p) => p.status === "done").length,
    unattached: closedHere.filter((t) => !t.goal_id && !t.project_id).length,
  };
}

// ---------------------------------------------------------
// The shelves
// ---------------------------------------------------------
export interface ShelfSummary {
  booksFinished: number;
  booksReading: number;
  booksPlanned: number;
  mediaFinished: number;
  mediaWatching: number;
  episodes: number;
  /** Watching minutes from finished episodes, where a runtime is known. */
  watchMinutes: number;
}

export function buildShelfStats(
  days: string[], books: Book[], media: Media[], tasks: Task[],
): ShelfSummary {
  const inRange = new Set(days);
  let episodes = 0;
  let watchMinutes = 0;

  const runtime = new Map(media.map((m) => [m.id, m.runtime_min ?? 0]));
  for (const t of tasks) {
    if (t.status !== "done" || !t.date || !inRange.has(t.date) || !t.media_id) continue;
    if (t.episode_from == null || t.episode_to == null) continue;
    const n = Math.max(0, t.episode_to - t.episode_from + 1);
    episodes += n;
    watchMinutes += n * (runtime.get(t.media_id) ?? 0);
  }

  return {
    booksFinished: books.filter((b) => b.status === "finished").length,
    booksReading: books.filter((b) => b.status === "reading").length,
    booksPlanned: books.filter((b) => b.status === "planned").length,
    mediaFinished: media.filter((m) => m.status === "finished").length,
    mediaWatching: media.filter((m) => m.status === "watching").length,
    episodes,
    watchMinutes,
  };
}
