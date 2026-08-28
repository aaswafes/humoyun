"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { addMonths, monthName, todayISO, yearOf } from "@/lib/date";
import type { Book, Task } from "@/lib/types";
import { VisuallyHidden } from "@/components/ui/form";
import { finishedInYear } from "./metrics";
import { monthTotals, paceStats, streaks, type ReadDay } from "./pace";

function Stat({
  label, display, positive, unit, footnote, delta, className,
}: {
  label: string;
  display: string;
  /** greys the numeral out when there is nothing to show */
  positive: boolean;
  unit: string;
  footnote: string;
  delta?: { value: number; suffix: string } | null;
  className?: string;
}) {
  return (
    <div className={cn("px-4 first:pl-0 last:pr-0", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className={cn("display-serif text-[32px] leading-none tnum", positive ? "text-ink" : "text-ink-4")}>
          {display}
        </span>
        <span className="text-[12px] text-ink-3">{unit}</span>
      </p>
      <p className="mt-1 flex items-baseline gap-1.5 text-[11.5px] text-ink-4 tnum">
        <span className="truncate">{footnote}</span>
        {delta && delta.value !== 0 && (
          <span className={cn("shrink-0 font-medium", delta.value > 0 ? "text-success" : "text-warn")}>
            {delta.value > 0 ? "+" : ""}{delta.value}{delta.suffix}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * Four numbers that answer four different questions: is the year going
 * anywhere, is this month, how fast am I actually reading, and am I keeping
 * the habit alive.
 */
export function ReadingStats({
  books, tasks, days, className,
}: {
  books: Book[];
  tasks: Task[];
  /** merged read history for the whole library */
  days: ReadDay[];
  className?: string;
}) {
  const today = todayISO();
  const month = today.slice(0, 7);
  const prevMonth = addMonths(today, -1).slice(0, 7);

  const thisMonth = React.useMemo(() => monthTotals(days, month), [days, month]);
  const lastMonth = React.useMemo(() => monthTotals(days, prevMonth), [days, prevMonth]);
  const pace = React.useMemo(() => paceStats(days, 28, today), [days, today]);
  const streak = React.useMemo(() => streaks(days, today), [days, today]);

  const finished = finishedInYear(books, tasks).length;
  const rate = pace.perDay >= 10 ? Math.round(pace.perDay) : Math.round(pace.perDay * 10) / 10;

  const pctChange = lastMonth.pages > 0
    ? Math.round(((thisMonth.pages - lastMonth.pages) / lastMonth.pages) * 100)
    : null;

  const hours = Math.round(thisMonth.minutes / 60 * 10) / 10;

  return (
    <div className={cn("grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:gap-y-0 sm:divide-x sm:divide-line", className)}>
      <VisuallyHidden>
        {`${finished} books finished in ${yearOf(today)}. `}
        {`${thisMonth.pages} pages this month. `}
        {`${rate} pages a day over the last 28 days. `}
        {`Current reading streak ${streak.current} days, best ${streak.best}.`}
      </VisuallyHidden>

      <Stat
        label="Finished"
        display={finished.toLocaleString()}
        positive={finished > 0}
        unit={finished === 1 ? "book" : "books"}
        footnote={`In ${yearOf(today)}`}
      />
      <Stat
        label="Pages read"
        display={thisMonth.pages.toLocaleString()}
        positive={thisMonth.pages > 0}
        unit="pages"
        footnote={hours > 0 ? `${monthName(today)} · ${hours}h logged` : monthName(today)}
        delta={pctChange == null ? null : { value: pctChange, suffix: "%" }}
      />
      <Stat
        label="Pace"
        display={rate > 0 ? String(rate) : "0"}
        positive={rate > 0}
        unit="pp/day"
        footnote={pace.activeDays > 0
          ? `${pace.activeDays} of the last ${pace.spanDays} days`
          : "Nothing read yet"}
      />
      <Stat
        label="Streak"
        display={streak.current.toLocaleString()}
        positive={streak.current > 0}
        unit={streak.current === 1 ? "day" : "days"}
        footnote={streak.best > 0 ? `Best run ${streak.best} days` : "Days read in a row"}
      />
    </div>
  );
}
