"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { dayName, dayNumber, isToday, monthName } from "@/lib/date";

/**
 * Sticky group header. Bleeds past the page gutter so the blurred material
 * covers the rows sliding under it.
 */
export function StickyHeader({
  children, className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 -mx-3 mb-1 flex items-center gap-2.5 px-3 py-2 material hairline-b",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Big serif day numeral + weekday — the calendar's voice, reused in a list. */
export function DayHeader({
  iso, done, total,
}: {
  iso: string;
  done: number;
  total: number;
}) {
  const today = isToday(iso);
  return (
    <StickyHeader>
      <span
        className={cn(
          "display-serif w-[26px] shrink-0 text-right text-[22px] leading-none tnum",
          today ? "text-accent" : "text-ink",
        )}
      >
        {dayNumber(iso)}
      </span>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={cn("text-[13px] font-semibold", today ? "text-accent" : "text-ink")}>
          {today ? "Today" : dayName(iso, "long")}
        </span>
        <span className="truncate text-[11.5px] text-ink-3">{monthName(iso, true)}</span>
      </div>
      <div className="flex-1" />
      {total > 0 && (
        <span className="shrink-0 text-[11px] text-ink-4 tnum">
          {done}/{total}
        </span>
      )}
    </StickyHeader>
  );
}

/** Uppercase label header for the overdue pin and the done weeks. */
export function LabelHeader({
  title, count, tone = "default", action,
}: {
  title: string;
  count?: number;
  tone?: "default" | "danger";
  action?: React.ReactNode;
}) {
  return (
    <StickyHeader>
      <span
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.06em]",
          tone === "danger" ? "text-danger" : "text-ink-3",
        )}
      >
        {title}
      </span>
      {count !== undefined && <span className="text-[11px] text-ink-4 tnum">{count}</span>}
      <div className="flex-1" />
      {action}
    </StickyHeader>
  );
}
