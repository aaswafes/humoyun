"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { addDays, diffDays, startOfWeek, todayISO } from "@/lib/date";
import { cn } from "@/lib/cn";
import { Section } from "./section";
import { Delta, Sparkline } from "./sparkline";
import { formatHours, plural, weekMetrics, type MetricSource, type WeekMetrics } from "./metrics";

const HISTORY = 8; // weeks of context behind each sparkline

interface StatDef {
  key: string;
  label: string;
  /** the comparable number — drives the value, the sparkline and the delta */
  read: (m: WeekMetrics) => number;
  format: (n: number) => string;
  detail: (m: WeekMetrics) => string;
}

const STATS: StatDef[] = [
  {
    key: "tasks",
    label: "Tasks done",
    read: (m) => m.tasksDone,
    format: (n) => String(n),
    detail: (m) => (m.tasksPlanned ? `of ${m.tasksPlanned} planned` : "nothing was planned"),
  },
  {
    key: "focus",
    label: "Focus",
    read: (m) => m.focusMinutes,
    format: formatHours,
    detail: (m) =>
      m.sessionCount ? `${m.sessionCount} ${plural(m.sessionCount, "session")}` : "no timer runs",
  },
  {
    key: "habits",
    label: "Habits hit",
    read: (m) => m.habitsHit,
    format: (n) => String(n),
    detail: (m) => (m.habitsDue ? `of ${m.habitsDue} due` : "no habits tracked"),
  },
  {
    key: "salah",
    label: "Salah",
    read: (m) => m.salahDone,
    format: (n) => String(n),
    detail: (m) => `of ${m.salahDue} prayers`,
  },
  {
    key: "pages",
    label: "Pages read",
    read: (m) => m.pagesRead,
    format: (n) => String(n),
    detail: (m) =>
      m.booksRead ? `across ${m.booksRead} ${plural(m.booksRead, "book")}` : "from reading blocks",
  },
  {
    key: "goals",
    label: "Goals advanced",
    read: (m) => m.goalsAdvanced,
    format: (n) => String(n),
    detail: (m) => (m.goalsActive ? `of ${m.goalsActive} active` : "no active goals"),
  },
];

export function Recap({ weekStart, weekStartDay }: { weekStart: string; weekStartDay: number }) {
  const tasks = useStore((s) => s.tasks);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const prayers = useStore((s) => s.prayers);
  const focusSessions = useStore((s) => s.focusSessions);
  const goals = useStore((s) => s.goals);

  const currentWeek = startOfWeek(todayISO(), weekStartDay);
  const inProgress = weekStart >= currentWeek;
  const dayCount = inProgress ? Math.min(7, diffDays(todayISO(), weekStart) + 1) : 7;

  const { current, previous, series } = React.useMemo(() => {
    const src: MetricSource = { tasks, habits, habitLogs, prayers, focusSessions, goals };
    const weeks = Array.from({ length: HISTORY }, (_, i) => addDays(weekStart, (i - (HISTORY - 1)) * 7));
    const history = weeks.map((w) => weekMetrics(w, src, dayCount));
    return {
      current: history[history.length - 1],
      previous: history[history.length - 2],
      series: history,
    };
  }, [weekStart, dayCount, tasks, habits, habitLogs, prayers, focusSessions, goals]);

  const note = inProgress
    ? `First ${dayCount} ${plural(dayCount, "day")} — measured against the same days of past weeks`
    : "Measured against the week before";

  return (
    <Section label="Recap" note={note} action={<span className="text-[11px] text-ink-4">Auto-generated</span>}>
      <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
        {STATS.map((stat) => {
          const value = stat.read(current);
          const delta = value - stat.read(previous);
          return (
            <div key={stat.key} className="bg-canvas px-4 py-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                {stat.label}
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("display-serif text-[32px] leading-none tnum", value ? "text-ink" : "text-ink-4")}>
                      {stat.format(value)}
                    </span>
                    <Delta value={delta} format={stat.format} />
                  </div>
                  <p className="mt-1.5 truncate text-[12px] text-ink-3 tnum">{stat.detail(current)}</p>
                </div>
                <Sparkline values={series.map(stat.read)} className="mb-1" />
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
