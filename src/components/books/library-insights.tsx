"use client";

import * as React from "react";
import { todayISO } from "@/lib/date";
import { Disclosure } from "./disclosure";
import { paceStats, streaks, type ReadDay } from "./pace";
import { ReadingGoal } from "./reading-goal";
import { ReadingPaceChart } from "./reading-pace-chart";
import { ReadingStats } from "./reading-stats";

/**
 * The whole analysis layer of the library — year stats, the goal, the weekly
 * pace chart — behind one line that already answers "how is my reading
 * going?". The shelf is what the page is for; this supports it.
 */
export function LibraryInsights({
  days, weekStart, goal, finished, className,
}: {
  days: ReadDay[];
  weekStart: number;
  goal: number;
  finished: number;
  className?: string;
}) {
  const today = todayISO();
  const pace = React.useMemo(() => paceStats(days, 28, today), [days, today]);
  const streak = React.useMemo(() => streaks(days, today), [days, today]);

  const rate = pace.perDay >= 10 ? Math.round(pace.perDay) : Math.round(pace.perDay * 10) / 10;

  const bits = [
    goal > 0
      ? `${finished} of ${goal} books this year`
      : `${finished} ${finished === 1 ? "book" : "books"} this year`,
  ];
  if (rate > 0) bits.push(`${rate} pp/day`);
  if (streak.current > 0) bits.push(`${streak.current}-day streak`);

  const summary = finished > 0 || rate > 0 || streak.current > 0
    ? bits.join(" · ")
    : "Goal, pace and streak — nothing read yet";

  return (
    <Disclosure
      storageKey="humoyun.books.insightsOpen"
      variant="caps"
      label="Insights"
      summary={summary}
      className={className}
      bodyClassName="pb-6 pt-1"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="min-w-0 space-y-6">
          <ReadingStats days={days} finished={finished} pace={pace} streak={streak} />
          <ReadingGoal goal={goal} finished={finished} />
        </div>
        <ReadingPaceChart days={days} weekStart={weekStart} />
      </div>
    </Disclosure>
  );
}
