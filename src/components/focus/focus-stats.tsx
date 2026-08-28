"use client";

import * as React from "react";
import { formatDuration, friendlyDate } from "@/lib/date";
import { SectionLabel } from "@/components/ui/primitives";
import { computeStats, type DayGroup } from "./focus-data";

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p className="display-serif tnum mt-2 text-[22px] leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-[11.5px] text-ink-4">{hint}</p>
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

  return (
    <section className="grid grid-cols-2 gap-y-7 border-y border-line py-6 sm:grid-cols-3 lg:grid-cols-5">
      <Stat
        label="Today"
        value={formatDuration(s.todayMinutes)}
        hint={s.todaySessions ? plural(s.todaySessions, "session", "sessions") : "Nothing logged yet"}
      />
      <Stat
        label="This week"
        value={formatDuration(s.weekMinutes)}
        hint={s.weekDays ? plural(s.weekDays, "day", "days") + " with focus" : "No days yet"}
      />
      <Stat
        label="Longest"
        value={formatDuration(s.longestMinutes)}
        hint={s.longestDate ? friendlyDate(s.longestDate) : "No sessions yet"}
      />
      <Stat
        label="Average"
        value={formatDuration(s.averageMinutes)}
        hint={`across ${plural(s.totalSessions, "session", "sessions")}`}
      />
      <Stat
        label="Streak"
        value={String(s.streak)}
        hint={s.streak ? `${s.streak === 1 ? "day" : "days"} in a row` : "Focus today to start one"}
      />
    </section>
  );
});
