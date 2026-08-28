"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addMonths, dayNumber, isSameMonth, monthGrid, monthName,
  todayISO, weekdayHeaders, yearOf,
} from "@/lib/date";
import { IconButton } from "./primitives";

/**
 * Compact month picker. Used by the sidebar, the date field on a task,
 * and anywhere a day needs choosing.
 */
export function MiniCalendar({
  value,
  onChange,
  weekStart = 1,
  markers,
  className,
  showHeader = true,
  footer,
}: {
  value: string;
  onChange: (iso: string) => void;
  weekStart?: number;
  /** dates that should show a dot, e.g. days with tasks */
  markers?: Set<string> | Map<string, number>;
  className?: string;
  showHeader?: boolean;
  footer?: React.ReactNode;
}) {
  const [cursor, setCursor] = React.useState(value);
  React.useEffect(() => { setCursor(value); }, [value]);

  const grid = React.useMemo(() => monthGrid(cursor, weekStart), [cursor, weekStart]);
  const headers = React.useMemo(() => weekdayHeaders(weekStart, "min"), [weekStart]);
  const today = todayISO();

  const markCount = (iso: string) => {
    if (!markers) return 0;
    if (markers instanceof Map) return markers.get(iso) ?? 0;
    return markers.has(iso) ? 1 : 0;
  };

  return (
    <div className={cn("select-none", className)}>
      {showHeader && (
        <div className="mb-2 flex items-center justify-between px-0.5">
          <div className="text-[13px] font-semibold text-ink">
            {monthName(cursor)} <span className="text-ink-3 tnum">{yearOf(cursor)}</span>
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
      )}

      <div className="grid grid-cols-7 gap-y-0.5">
        {headers.map((h, i) => (
          <div key={i} className="grid h-6 place-items-center text-[10.5px] font-semibold uppercase text-ink-4">
            {h}
          </div>
        ))}

        {grid.map((iso) => {
          const inMonth = isSameMonth(iso, cursor);
          const selected = iso === value;
          const isToday = iso === today;
          const marks = markCount(iso);
          return (
            <button
              key={iso}
              onClick={() => onChange(iso)}
              aria-label={iso}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "relative grid h-7 place-items-center rounded-md text-[12.5px] tnum cursor-pointer",
                "transition-[background-color,color] duration-120",
                !inMonth && "text-ink-4",
                inMonth && !selected && "text-ink-2 hover:bg-hover hover:text-ink",
                selected && "bg-accent text-accent-ink font-semibold",
                !selected && isToday && "font-semibold text-accent",
              )}
            >
              {dayNumber(iso)}
              {marks > 0 && !selected && (
                <span
                  className="absolute bottom-[3px] left-1/2 h-[3px] -translate-x-1/2 rounded-full bg-ink-4"
                  style={{ width: Math.min(3 + marks, 10) }}
                />
              )}
            </button>
          );
        })}
      </div>

      {footer && <div className="mt-2 border-t border-line pt-2">{footer}</div>}
    </div>
  );
}
