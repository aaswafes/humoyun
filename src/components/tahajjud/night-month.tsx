"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addMonths, daysBetween, dayNumber, endOfMonth, formatDate, monthName,
  startOfMonth, startOfWeek, weekdayHeaders, yearOf, diffDays,
} from "@/lib/date";
import { Button, IconButton } from "@/components/ui/primitives";
import { currentStreak, longestStreak, type TahajjudNight } from "./night-data";

/**
 * The month of nights, one square each, named by the morning it ends in.
 * A tap opens that night in the card rather than flipping it: a kept night
 * also carries a count and a time, and a stray tap should never erase them.
 */
export function NightMonth({
  current, picked, index, weekStart, onPick,
}: {
  /** The night in play — nothing after it can have happened yet. */
  current: string;
  picked: string;
  index: Map<string, TahajjudNight>;
  weekStart: number;
  onPick: (date: string) => void;
}) {
  const [month, setMonth] = React.useState(() => startOfMonth(current));

  const days = React.useMemo(() => daysBetween(month, endOfMonth(month)), [month]);
  const lead = diffDays(month, startOfWeek(month, weekStart));
  const headers = React.useMemo(() => weekdayHeaders(weekStart, "min"), [weekStart]);

  const kept = days.filter((d) => index.has(d)).length;
  const streak = React.useMemo(() => currentStreak(index, current), [index, current]);
  const best = React.useMemo(() => longestStreak([...index.keys()]), [index]);
  const isCurrentMonth = month === startOfMonth(current);
  const isFuture = month > startOfMonth(current);

  return (
    <div>
      <header className="flex items-center gap-1">
        <p className="flex-1 text-[12.5px] font-medium text-ink-2">
          {monthName(month)} <span className="tnum text-ink-3">{yearOf(month)}</span>
        </p>
        {!isCurrentMonth && (
          <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(current))}>
            This month
          </Button>
        )}
        <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft />
        </IconButton>
        <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight />
        </IconButton>
      </header>

      <div className="mt-3 grid grid-cols-7 gap-y-0.5">
        {headers.map((h, i) => (
          <span key={i} aria-hidden className="pb-1 text-center text-[10.5px] font-medium text-ink-4">
            {h}
          </span>
        ))}

        {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}

        {days.map((day) => {
          const night = index.get(day);
          const future = day > current;
          const isPicked = day === picked;
          return (
            <button
              key={day}
              type="button"
              disabled={future}
              aria-pressed={isPicked}
              onClick={() => onPick(day)}
              aria-label={`The night into ${formatDate(day)}, ${night ? `kept${night.rakat ? `, ${night.rakat} rakat` : ""}` : "not kept"}`}
              title={night?.rakat ? `${night.rakat} rakat` : undefined}
              className={cn(
                // Rows sit flush, so the square itself grows on touch instead
                // of borrowing a hit area that would land on the next week.
                "grid h-9 cursor-pointer place-items-center rounded-md touch:h-11",
                "transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
                "hover:bg-hover active:scale-90 disabled:pointer-events-none",
                isPicked && "bg-selected",
              )}
            >
              <span
                className={cn(
                  "tnum grid size-7 place-items-center rounded-full text-[12px]",
                  night
                    ? "bg-accent-soft font-semibold text-accent"
                    : future ? "text-ink-4" : "text-ink-3",
                  day === current && !night && "ring-1 ring-line-strong",
                )}
              >
                {dayNumber(day)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="hairline-t mt-4 pt-4">
        <p className="display-serif tnum text-[32px] leading-none text-ink">{kept}</p>
        <p className="mt-2 text-[12px] text-ink-3">
          {kept === 1 ? "night" : "nights"} kept in {monthName(month)}
        </p>
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
          {isFuture ? (
            <>This month has not started yet.</>
          ) : (
            <>
              <span className="tnum">{streak}</span> in a row now · longest run{" "}
              <span className="tnum">{best}</span>.
            </>
          )}
        </p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-4">
          Each square is the night that ends that morning. Tap one to open it in the card.
        </p>
      </div>
    </div>
  );
}
