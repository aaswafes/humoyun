"use client";

import * as React from "react";
import { formatDuration, friendlyDate } from "@/lib/date";
import { SectionLabel } from "@/components/ui/primitives";
import { computeStats, type DayGroup } from "./focus-data";

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0">
      <SectionLabel>{label}</SectionLabel>
      <p className="display-serif tnum mt-2 text-[22px] leading-none text-ink">{value}</p>
      <p className="mt-1.5 truncate text-[11.5px] text-ink-4">{hint}</p>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const FocusStats = React.memo(function FocusStats({
  groups, weekStart,
}: {
  groups: DayGroup[];
  weekStart: number;
}) {
  const s = React.useMemo(() => computeStats(groups, weekStart), [groups, weekStart]);
  const started = s.completed + s.abandoned;

  return (
    <section className="grid grid-cols-2 gap-x-4 gap-y-7 border-y border-line py-6 sm:grid-cols-3 lg:grid-cols-6">
      <Stat
        label="Today"
        value={formatDuration(s.todayMinutes)}
        hint={
          s.todaySessions
            ? `${plural(s.todaySessions, "session", "sessions")}${s.breakMinutesToday ? ` · ${formatDuration(s.breakMinutesToday)} rest` : ""}`
            : "Nothing logged yet"
        }
      />
      <Stat
        label="This week"
        value={formatDuration(s.weekMinutes)}
        hint={s.weekDays ? `${plural(s.weekDays, "day", "days")} with focus` : "No days yet"}
      />
      <Stat
        label="Streak"
        value={String(s.streak)}
        hint={
          s.streak
            ? `${s.streak === 1 ? "day" : "days"} in a row · best ${s.bestStreak}`
            : "Focus today to start one"
        }
      />
      <Stat
        label="Average"
        value={formatDuration(s.averageMinutes)}
        hint={`over ${plural(s.totalSessions, "session", "sessions")}`}
      />
      <Stat
        label="Finished"
        value={started ? `${Math.round((s.completed / started) * 100)}%` : "—"}
        hint={
          started
            ? `${s.completed} of ${started} pomodoros run full`
            : "No pomodoros yet"
        }
      />
      <Stat
        label="Distractions"
        value={String(s.interruptionsTotal)}
        hint={
          s.minutesPerInterruption != null
            ? `one every ${formatDuration(s.minutesPerInterruption)} of focus`
            : s.longestDate
              ? `longest block ${formatDuration(s.longestMinutes)}, ${friendlyDate(s.longestDate)}`
              : "none logged"
        }
      />
    </section>
  );
});
