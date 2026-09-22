import { addDays, startOfWeek, toISO, todayISO, weekDates } from "@/lib/date";
import type { FocusSession, Task, UmrCategory } from "@/lib/types";
import { UMR_CATEGORIES } from "@/lib/types";

// =========================================================
// Session metadata carried in the `tags` column
//
// A focus session has no column for "how many times did you get pulled away",
// and the schema is not mine to change. `tags` is a text array nothing else
// writes to, so the count rides along under a reserved `sys:` namespace that
// every reader here strips before showing a tag to anyone.
// =========================================================

export const SYS_PREFIX = "sys:";
const INT_TAG = "sys:int=";

export function interruptionsOf(session: FocusSession): number {
  const tag = (session.tags ?? []).find((t) => t.startsWith(INT_TAG));
  const n = tag ? Number(tag.slice(INT_TAG.length)) : 0;
  return Number.isFinite(n) && n > 0 ? Math.min(999, Math.floor(n)) : 0;
}

export function withInterruptions(tags: string[] | null | undefined, count: number): string[] {
  const rest = (tags ?? []).filter((t) => !t.startsWith(INT_TAG));
  return count > 0 ? [...rest, `${INT_TAG}${Math.min(999, Math.round(count))}`] : rest;
}

/** Tags a person actually typed — never the bookkeeping ones. */
export function visibleTags(tags: string[] | null | undefined): string[] {
  return (tags ?? []).filter((t) => !t.startsWith(SYS_PREFIX));
}

export function normalizeTag(input: string): string {
  return input.trim().replace(/^#/, "").replace(/\s+/g, " ").slice(0, 24).toLowerCase();
}

// =========================================================
// Placing sessions on a day
// =========================================================

/** A session placed on a day: local date plus start/end as minutes from midnight. */
export interface SessionView {
  session: FocusSession;
  date: string;
  startMin: number;
  endMin: number;
  minutes: number;
  interruptions: number;
  isBreak: boolean;
}

export function toView(session: FocusSession): SessionView {
  const started = new Date(session.started_at);
  const startMin = started.getHours() * 60 + started.getMinutes();
  // Round up to a whole minute so a short session still draws a visible block.
  const minutes = Math.max(1, Math.round(session.seconds / 60));
  return {
    session,
    date: toISO(started),
    startMin,
    endMin: Math.min(1440, startMin + minutes),
    minutes,
    interruptions: interruptionsOf(session),
    isBreak: session.mode === "break",
  };
}

export interface DayGroup {
  date: string;
  /** Focus sessions, in the order they happened. */
  items: SessionView[];
  /** Rest logged between them — never counted as focus. */
  breaks: SessionView[];
  minutes: number;
  seconds: number;
  breakMinutes: number;
  interruptions: number;
  /** Pomodoros that ran their full length. */
  completed: number;
  /** Pomodoros that were stopped early. */
  abandoned: number;
}

/** Newest day first, sessions within a day in the order they happened. */
export function groupSessions(sessions: FocusSession[]): DayGroup[] {
  const byDate = new Map<string, SessionView[]>();
  for (const session of sessions) {
    const view = toView(session);
    const list = byDate.get(view.date);
    if (list) list.push(view);
    else byDate.set(view.date, [view]);
  }

  return [...byDate.entries()]
    .map(([date, all]) => {
      const sorted = all.sort((a, b) => a.startMin - b.startMin);
      const items = sorted.filter((v) => !v.isBreak);
      const breaks = sorted.filter((v) => v.isBreak);
      const seconds = items.reduce((sum, i) => sum + i.session.seconds, 0);
      return {
        date,
        items,
        breaks,
        seconds,
        minutes: Math.round(seconds / 60),
        breakMinutes: Math.round(breaks.reduce((sum, i) => sum + i.session.seconds, 0) / 60),
        interruptions: items.reduce((sum, i) => sum + i.interruptions, 0),
        completed: items.filter((i) => i.session.mode === "pomodoro" && i.session.completed).length,
        abandoned: items.filter((i) => i.session.mode === "pomodoro" && !i.session.completed).length,
      };
    })
    .filter((g) => g.items.length > 0 || g.breaks.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// =========================================================
// Headline stats
// =========================================================

export interface FocusStatsData {
  todayMinutes: number;
  todaySessions: number;
  weekMinutes: number;
  weekDays: number;
  longestMinutes: number;
  longestDate: string | null;
  averageMinutes: number;
  totalSessions: number;
  totalMinutes: number;
  streak: number;
  bestStreak: number;
  completed: number;
  abandoned: number;
  interruptionsToday: number;
  interruptionsTotal: number;
  /** Focus minutes per interruption — a session that never breaks reads Infinity. */
  minutesPerInterruption: number | null;
  breakMinutesToday: number;
}

export function computeStats(groups: DayGroup[], weekStart: number): FocusStatsData {
  const today = todayISO();
  const byDate = new Map(groups.map((g) => [g.date, g]));

  const todayGroup = byDate.get(today);
  const week = weekDates(today, weekStart);
  const weekGroups = week.map((d) => byDate.get(d)).filter((g): g is DayGroup => !!g);

  let longestSeconds = 0;
  let longestDate: string | null = null;
  let totalSeconds = 0;
  let totalSessions = 0;
  let completed = 0;
  let abandoned = 0;
  let interruptionsTotal = 0;

  for (const group of groups) {
    totalSeconds += group.seconds;
    totalSessions += group.items.length;
    completed += group.completed;
    abandoned += group.abandoned;
    interruptionsTotal += group.interruptions;
    for (const item of group.items) {
      if (item.session.seconds > longestSeconds) {
        longestSeconds = item.session.seconds;
        longestDate = group.date;
      }
    }
  }

  // A day that only holds a break is not a day of focus, so streaks ignore it.
  const focusDays = new Set(groups.filter((g) => g.items.length > 0).map((g) => g.date));

  // Today is still open, so an empty today does not break yesterday's streak.
  let streak = 0;
  let cursor = today;
  if (!focusDays.has(cursor)) cursor = addDays(cursor, -1);
  while (focusDays.has(cursor) && streak < 3650) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  // Longest run of consecutive days ever — walked over the sorted dates.
  let bestStreak = 0;
  let run = 0;
  let previous: string | null = null;
  const ascending = [...focusDays].sort();
  for (const date of ascending) {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    previous = date;
    if (run > bestStreak) bestStreak = run;
  }

  const totalMinutes = Math.round(totalSeconds / 60);

  return {
    todayMinutes: todayGroup?.minutes ?? 0,
    todaySessions: todayGroup?.items.length ?? 0,
    weekMinutes: Math.round(weekGroups.reduce((sum, g) => sum + g.seconds, 0) / 60),
    weekDays: weekGroups.filter((g) => g.items.length > 0).length,
    longestMinutes: Math.round(longestSeconds / 60),
    longestDate,
    averageMinutes: totalSessions ? Math.round(totalSeconds / totalSessions / 60) : 0,
    totalSessions,
    totalMinutes,
    streak,
    bestStreak: Math.max(bestStreak, streak),
    completed,
    abandoned,
    interruptionsToday: todayGroup?.interruptions ?? 0,
    interruptionsTotal,
    minutesPerInterruption: interruptionsTotal ? Math.round(totalMinutes / interruptionsTotal) : null,
    breakMinutesToday: todayGroup?.breakMinutes ?? 0,
  };
}

// =========================================================
// Goals
// =========================================================

export interface GoalProgress {
  todayMinutes: number;
  dailyGoal: number;
  dailyPct: number;
  weekMinutes: number;
  weeklyGoal: number;
  weeklyPct: number;
  /** The seven days of the current week, oldest first. */
  days: { date: string; minutes: number; hit: boolean; future: boolean }[];
  daysHit: number;
  /** Minutes per remaining day needed to still land the weekly goal. */
  pacePerDay: number | null;
}

export function goalProgress(
  groups: DayGroup[],
  weekStart: number,
  dailyGoal: number,
  weeklyGoal: number,
): GoalProgress {
  const today = todayISO();
  const byDate = new Map(groups.map((g) => [g.date, g]));
  const days = weekDates(today, weekStart).map((date) => {
    const minutes = byDate.get(date)?.minutes ?? 0;
    return { date, minutes, hit: minutes >= dailyGoal, future: date > today };
  });

  const todayMinutes = byDate.get(today)?.minutes ?? 0;
  const weekMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
  const remainingDays = days.filter((d) => d.future).length + 1; // today still counts
  const shortfall = Math.max(0, weeklyGoal - weekMinutes);

  return {
    todayMinutes,
    dailyGoal,
    dailyPct: dailyGoal > 0 ? Math.min(1, todayMinutes / dailyGoal) : 0,
    weekMinutes,
    weeklyGoal,
    weeklyPct: weeklyGoal > 0 ? Math.min(1, weekMinutes / weeklyGoal) : 0,
    days,
    daysHit: days.filter((d) => d.hit).length,
    pacePerDay: shortfall > 0 ? Math.ceil(shortfall / Math.max(1, remainingDays)) : null,
  };
}

// =========================================================
// Calendar heatmap
// =========================================================

export interface HeatCell {
  date: string;
  minutes: number;
  sessions: number;
  /** 0 = nothing, 4 = at or over the daily goal. */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

export function heatLevel(minutes: number, goal: number): HeatCell["level"] {
  if (minutes <= 0) return 0;
  const pct = goal > 0 ? minutes / goal : minutes / 120;
  if (pct >= 1) return 4;
  if (pct >= 0.6) return 3;
  if (pct >= 0.3) return 2;
  return 1;
}

/** Columns of seven days, oldest week first, ending with the current week. */
export function heatmapWeeks(
  groups: DayGroup[],
  weeks: number,
  weekStart: number,
  goal: number,
): HeatCell[][] {
  const today = todayISO();
  const byDate = new Map(groups.map((g) => [g.date, g]));
  const firstColumn = addDays(startOfWeek(today, weekStart), -7 * (weeks - 1));

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(firstColumn, w * 7 + d);
      const group = byDate.get(date);
      const minutes = group?.minutes ?? 0;
      return {
        date,
        minutes,
        sessions: group?.items.length ?? 0,
        level: heatLevel(minutes, goal),
        future: date > today,
      };
    }),
  );
}

// =========================================================
// Time of day
// =========================================================

export interface HourStats {
  /** Minutes of focus logged in each hour of the day, 0..23. */
  minutes: number[];
  interruptions: number[];
  peakHour: number | null;
  /** Best three-hour stretch, as [startHour, endHourExclusive]. */
  peakWindow: [number, number] | null;
  peakMinutes: number;
  /** Hour with the most distractions, when there are any. */
  worstHour: number | null;
  totalMinutes: number;
}

export function hourStats(groups: DayGroup[]): HourStats {
  const minutes = new Array(24).fill(0) as number[];
  const interruptions = new Array(24).fill(0) as number[];

  for (const group of groups) {
    for (const view of group.items) {
      const start = view.startMin;
      const end = view.startMin + view.minutes;
      for (let h = Math.floor(start / 60); h < Math.min(24, Math.ceil(end / 60)); h++) {
        const overlap = Math.min(end, (h + 1) * 60) - Math.max(start, h * 60);
        if (overlap > 0) minutes[h] += overlap;
      }
      if (view.interruptions) interruptions[Math.min(23, Math.floor(start / 60))] += view.interruptions;
    }
  }

  const total = minutes.reduce((a, b) => a + b, 0);
  if (!total) {
    return {
      minutes, interruptions, peakHour: null, peakWindow: null,
      peakMinutes: 0, worstHour: null, totalMinutes: 0,
    };
  }

  let peakHour = 0;
  minutes.forEach((m, h) => { if (m > minutes[peakHour]) peakHour = h; });

  let windowStart = 0;
  let best = -1;
  for (let h = 0; h <= 21; h++) {
    const sum = minutes[h] + minutes[h + 1] + minutes[h + 2];
    if (sum > best) { best = sum; windowStart = h; }
  }

  const anyInterruptions = interruptions.some((n) => n > 0);
  let worstHour = 0;
  interruptions.forEach((n, h) => { if (n > interruptions[worstHour]) worstHour = h; });

  return {
    minutes,
    interruptions,
    peakHour,
    peakWindow: [windowStart, windowStart + 3],
    peakMinutes: best,
    worstHour: anyInterruptions ? worstHour : null,
    totalMinutes: total,
  };
}

/** "9 AM" style label for an hour bucket, honouring the 12/24h preference. */
export function hourLabel(hour: number, hour12: boolean): string {
  const h = ((hour % 24) + 24) % 24;
  if (!hour12) return `${String(h).padStart(2, "0")}:00`;
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

// =========================================================
// Tags
// =========================================================

export interface TagTotal {
  tag: string;
  minutes: number;
  sessions: number;
}

export interface TagBreakdown {
  totals: TagTotal[];
  untaggedMinutes: number;
  taggedMinutes: number;
}

/**
 * A session inherits the tags of the task it was spent on, plus any typed onto
 * the session itself. Minutes are counted once per tag, so the totals overlap
 * on purpose — a session tagged "deep" and "writing" belongs to both.
 */
export function tagTotals(groups: DayGroup[], tasks: Task[]): TagBreakdown {
  const taskTags = new Map(tasks.map((t) => [t.id, t.tags]));
  const totals = new Map<string, TagTotal>();
  let untaggedMinutes = 0;
  let taggedMinutes = 0;

  for (const group of groups) {
    for (const view of group.items) {
      const own = visibleTags(view.session.tags);
      const inherited = view.session.task_id ? taskTags.get(view.session.task_id) ?? [] : [];
      const tags = [...new Set([...own, ...inherited].map(normalizeTag).filter(Boolean))];
      if (!tags.length) { untaggedMinutes += view.minutes; continue; }
      taggedMinutes += view.minutes;
      for (const tag of tags) {
        const entry = totals.get(tag) ?? { tag, minutes: 0, sessions: 0 };
        entry.minutes += view.minutes;
        entry.sessions += 1;
        totals.set(tag, entry);
      }
    }
  }

  return {
    totals: [...totals.values()].sort((a, b) => b.minutes - a.minutes || a.tag.localeCompare(b.tag)),
    untaggedMinutes,
    taggedMinutes,
  };
}

// ---------------------------------------------------------
// Where the hours went, by kind of living
// ---------------------------------------------------------

export interface KindTotal {
  category: UmrCategory;
  minutes: number;
  sessions: number;
}

export interface KindBreakdown {
  totals: KindTotal[];
  /** Sittings that never said which kind they were. */
  unsetMinutes: number;
  setMinutes: number;
}

/**
 * The five-way split of focus time.
 *
 * Unlike tags, a session answers this itself — the dial asks before the clock
 * starts — so the only sittings that fall out are ones timed from a task row
 * whose task has no kind either. Those are counted separately rather than
 * guessed at, the same rule the Umr page follows.
 */
export function kindTotals(groups: DayGroup[], resolve: (s: FocusSession) => UmrCategory | null): KindBreakdown {
  const totals = new Map<UmrCategory, KindTotal>();
  let unsetMinutes = 0;
  let setMinutes = 0;

  for (const group of groups) {
    for (const view of group.items) {
      const category = resolve(view.session);
      if (!category) { unsetMinutes += view.minutes; continue; }
      setMinutes += view.minutes;
      const entry = totals.get(category) ?? { category, minutes: 0, sessions: 0 };
      entry.minutes += view.minutes;
      entry.sessions += 1;
      totals.set(category, entry);
    }
  }

  return {
    totals: UMR_CATEGORIES
      .map((c) => totals.get(c))
      .filter((t): t is KindTotal => !!t)
      .sort((a, b) => b.minutes - a.minutes),
    unsetMinutes,
    setMinutes,
  };
}
