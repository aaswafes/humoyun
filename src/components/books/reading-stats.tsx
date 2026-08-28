"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { monthName, todayISO, yearOf } from "@/lib/date";
import type { Book, Task } from "@/lib/types";
import { finishedInYear, pagesInMonth, readingStreak } from "./metrics";

function Stat({
  label, value, unit, footnote, className,
}: {
  label: string;
  value: number;
  unit: string;
  footnote: string;
  className?: string;
}) {
  return (
    <div className={cn("px-4 first:pl-0 last:pr-0", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className={cn("display-serif text-[32px] leading-none tnum", value > 0 ? "text-ink" : "text-ink-4")}>
          {value.toLocaleString()}
        </span>
        <span className="text-[12px] text-ink-3">{unit}</span>
      </p>
      <p className="mt-1 text-[11.5px] text-ink-4">{footnote}</p>
    </div>
  );
}

export function ReadingStats({
  books, tasks, className,
}: {
  books: Book[];
  tasks: Task[];
  className?: string;
}) {
  const today = todayISO();
  const finished = finishedInYear(books, tasks).length;
  const pages = pagesInMonth(tasks, today.slice(0, 7));
  const streak = readingStreak(tasks, today);

  return (
    <div className={cn("grid grid-cols-3 divide-x divide-line", className)}>
      <Stat label="Finished" value={finished} unit={finished === 1 ? "book" : "books"} footnote={`In ${yearOf(today)}`} />
      <Stat label="Pages read" value={pages} unit="pages" footnote={monthName(today)} />
      <Stat label="Streak" value={streak} unit={streak === 1 ? "day" : "days"} footnote="Days read in a row" />
    </div>
  );
}
