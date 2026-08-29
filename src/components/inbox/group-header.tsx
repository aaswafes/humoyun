"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { dayName, dayNumber, isToday, monthName } from "@/lib/date";

/**
 * Group header. Bleeds past the page gutter so the blurred material covers the
 * rows sliding under it. Inside a virtualised list the sticky trick cannot
 * work — the rows are absolutely positioned — so it can be turned off.
 */
export function StickyHeader({
  children, className, sticky = true,
}: {
  children: React.ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        "-mx-3 mb-1.5 flex items-center gap-2.5 px-3 py-2",
        sticky ? "sticky top-0 z-10 material hairline-b" : "bg-canvas",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Big serif day numeral + weekday — the calendar's voice, reused in a list. */
export function DayHeader({
  iso, done, total, action, collapsed, onToggle, dropActive,
}: {
  iso: string;
  done: number;
  total: number;
  action?: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  dropActive?: boolean;
}) {
  const today = isToday(iso);
  const label = today ? "Today" : dayName(iso, "long");

  return (
    <StickyHeader className={cn(dropActive && "ring-2 ring-accent-line rounded-md")}>
      {onToggle ? (
        <button
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="-my-1 flex min-w-0 items-center gap-2.5 rounded-md py-1 pr-1 text-left cursor-pointer hover:bg-hover transition-colors"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-ink-4 transition-transform duration-200",
              !collapsed && "rotate-90",
            )}
          />
          <DayLabel iso={iso} label={label} today={today} />
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-2.5">
          <DayLabel iso={iso} label={label} today={today} />
        </div>
      )}

      <div className="flex-1" />
      {total > 0 && (
        <span className="shrink-0 text-[11px] text-ink-4 tnum">
          {done}/{total}
        </span>
      )}
      {action}
    </StickyHeader>
  );
}

function DayLabel({ iso, label, today }: { iso: string; label: string; today: boolean }) {
  return (
    <>
      <span
        className={cn(
          "display-serif w-[26px] shrink-0 text-right text-[22px] leading-none tnum",
          today ? "text-accent" : "text-ink",
        )}
      >
        {dayNumber(iso)}
      </span>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className={cn("text-[13px] font-semibold", today ? "text-accent" : "text-ink")}>
          {label}
        </span>
        <span className="truncate text-[11.5px] text-ink-3">{monthName(iso, true)}</span>
      </span>
    </>
  );
}

/**
 * Plain label header — the overdue pin and the grouped lists.
 *
 * It used to shout in uppercase. A list grouped by date can carry ten of these
 * at once, and ten shouts is a wall; sentence case at 12px reads as structure
 * without competing with the rows underneath it.
 */
export function LabelHeader({
  title, count, tone = "default", action, sticky = true, meta,
}: {
  title: string;
  count?: number;
  tone?: "default" | "danger";
  action?: React.ReactNode;
  sticky?: boolean;
  meta?: React.ReactNode;
}) {
  return (
    <StickyHeader sticky={sticky}>
      <span
        className={cn(
          "truncate text-[12px] font-semibold",
          tone === "danger" ? "text-danger" : "text-ink-2",
        )}
      >
        {title}
      </span>
      {count !== undefined && <span className="shrink-0 text-[11px] text-ink-4 tnum">{count}</span>}
      {meta}
      <div className="flex-1" />
      {action}
    </StickyHeader>
  );
}

/** Collapsible section header — the archive's weeks and the upcoming days. */
export function CollapsibleHeader({
  title, count, open, onToggle, meta, action, tone = "default", sticky = true,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "danger";
  sticky?: boolean;
}) {
  return (
    <StickyHeader sticky={sticky}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="-my-1 -ml-1 flex min-w-0 items-center gap-1.5 rounded-md py-1 pl-1 pr-1.5 text-left cursor-pointer hover:bg-hover transition-colors"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-ink-4 transition-transform duration-200",
            open && "rotate-90",
          )}
        />
        <span
          className={cn(
            "truncate text-[12px] font-semibold",
            tone === "danger" ? "text-danger" : "text-ink-2",
          )}
        >
          {title}
        </span>
        {count !== undefined && <span className="shrink-0 text-[11px] text-ink-4 tnum">{count}</span>}
      </button>
      {meta}
      <div className="flex-1" />
      {action}
    </StickyHeader>
  );
}
