"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addMonths, dayNumber, formatDate, isSameMonth, monthGrid, monthName,
  todayISO, weekdayHeaders, yearOf,
} from "@/lib/date";
import { IconButton } from "@/components/ui/primitives";
import { DateDropZone } from "./triage-dnd";

/**
 * The shared MiniCalendar cannot be a drop target — its day cells are plain
 * buttons — so triage has its own month grid where every day both clicks and
 * catches. Same geometry, same type sizes, so the two read as one component.
 */
export function RailCalendar({
  value, onPick, weekStart = 1, counts, className,
}: {
  value: string;
  onPick: (iso: string) => void;
  weekStart?: number;
  counts?: Map<string, number>;
  className?: string;
}) {
  const [cursor, setCursor] = React.useState(value);
  // Follow the anchor date when it changes (midnight rollover), without an
  // effect: adjusting state during render is the cheaper, flicker-free path.
  const [anchor, setAnchor] = React.useState(value);
  if (anchor !== value) { setAnchor(value); setCursor(value); }

  const grid = React.useMemo(() => monthGrid(cursor, weekStart), [cursor, weekStart]);
  const headers = React.useMemo(() => weekdayHeaders(weekStart, "min"), [weekStart]);
  const today = todayISO();

  return (
    <div className={cn("select-none", className)}>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[12.5px] font-semibold text-ink">
          {monthName(cursor, true)} <span className="text-ink-3 tnum">{yearOf(cursor)}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="Previous month" size="sm" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft />
          </IconButton>
          <IconButton label="Next month" size="sm" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {headers.map((h, i) => (
          <div key={i} className="grid h-5 place-items-center text-[10.5px] font-semibold uppercase text-ink-4">
            {h}
          </div>
        ))}

        {grid.map((iso) => {
          const inMonth = isSameMonth(iso, cursor);
          const isToday = iso === today;
          const n = counts?.get(iso) ?? 0;
          return (
            <DateDropZone key={iso} iso={iso} className="grid place-items-center">
              {({ isOver, active }) => (
                <button
                  type="button"
                  onClick={() => onPick(iso)}
                  aria-label={`Move to ${formatDate(iso, { year: true })}${n ? `, ${n} open` : ""}`}
                  title={formatDate(iso)}
                  className={cn(
                    "relative grid size-7 place-items-center rounded-md text-[12.5px] tnum cursor-pointer",
                    "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)]",
                    "active:scale-[0.92]",
                    !inMonth && "text-ink-4",
                    inMonth && "text-ink-2 hover:bg-hover hover:text-ink",
                    isToday && "font-semibold text-accent",
                    isOver && "bg-accent text-accent-ink scale-[1.06]",
                    active && !isOver && "ring-1 ring-line",
                  )}
                >
                  {dayNumber(iso)}
                  {n > 0 && !isOver && (
                    <span
                      aria-hidden
                      className="absolute bottom-[3px] left-1/2 h-[3px] -translate-x-1/2 rounded-full bg-ink-4"
                      style={{ width: Math.min(3 + n, 10) }}
                    />
                  )}
                </button>
              )}
            </DateDropZone>
          );
        })}
      </div>
    </div>
  );
}
