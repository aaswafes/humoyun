import { addDays, toISO, todayISO, weekDates } from "@/lib/date";
import type { FocusSession } from "@/lib/types";

/** A session placed on a day: local date plus start/end as minutes from midnight. */
export interface SessionView {
  session: FocusSession;
  date: string;
  startMin: number;
  endMin: number;
  minutes: number;
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
  };
}

export interface DayGroup {
  date: string;
  items: SessionView[];
  minutes: number;
  seconds: number;
}

/** Newest day first, sessions within a day in the order they happened. */
export function groupSessions(sessions: FocusSession[]): DayGroup[] {
  const byDate = new Map<string, SessionView[]>();
  for (const session of sessions) {
    if (session.mode === "break") continue;
    const view = toView(session);
    const list = byDate.get(view.date);
    if (list) list.push(view);
    else byDate.set(view.date, [view]);
  }

  return [...byDate.entries()]
    .map(([date, items]) => {
      const seconds = items.reduce((sum, i) => sum + i.session.seconds, 0);
      return {
        date,
        items: items.sort((a, b) => a.startMin - b.startMin),
        seconds,
        minutes: Math.round(seconds / 60),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface FocusStatsData {
  todayMinutes: number;
  todaySessions: number;
  weekMinutes: number;
  weekDays: number;
  longestMinutes: number;
  longestDate: string | null;
  averageMinutes: number;
  totalSessions: number;
  streak: number;
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

  for (const group of groups) {
    totalSeconds += group.seconds;
    totalSessions += group.items.length;
    for (const item of group.items) {
      if (item.session.seconds > longestSeconds) {
        longestSeconds = item.session.seconds;
        longestDate = group.date;
      }
    }
  }

  // Today is still open, so an empty today does not break yesterday's streak.
  let streak = 0;
  let cursor = today;
  if (!byDate.has(cursor)) cursor = addDays(cursor, -1);
  while (byDate.has(cursor) && streak < 3650) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  return {
    todayMinutes: todayGroup?.minutes ?? 0,
    todaySessions: todayGroup?.items.length ?? 0,
    weekMinutes: Math.round(weekGroups.reduce((sum, g) => sum + g.seconds, 0) / 60),
    weekDays: weekGroups.length,
    longestMinutes: Math.round(longestSeconds / 60),
    longestDate,
    averageMinutes: totalSessions ? Math.round(totalSeconds / totalSessions / 60) : 0,
    totalSessions,
    streak,
  };
}
