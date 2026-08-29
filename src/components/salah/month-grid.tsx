"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { prayerStreak, useStore } from "@/lib/store";
import {
  addMonths, dayNumber, daysBetween, endOfMonth, formatDate,
  monthName, startOfMonth, weekday, yearOf,
} from "@/lib/date";
import { PRAYER_LABELS, PRAYER_NAMES, type PrayerStatus } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/primitives";
import { ALL_STATUSES, HANDLED_STATUSES, PRAYER_STATE, StateDot, StateLegend } from "./prayer-state";

const COLUMNS = "grid-cols-[24px_repeat(5,minmax(0,1fr))]";

/**
 * The month as a grid of squares, each one tappable. No border of its own —
 * it lives inside a folded section, and a card inside a card is noise.
 */
export function MonthGrid({ today }: { today: string }) {
  const prayers = useStore((s) => s.prayers);
  const cyclePrayer = useStore((s) => s.cyclePrayer);
  const [month, setMonth] = React.useState(() => startOfMonth(today));

  const days = React.useMemo(() => daysBetween(month, endOfMonth(month)), [month]);

  const statuses = React.useMemo(() => {
    const map = new Map<string, PrayerStatus>();
    prayers.forEach((p) => map.set(`${p.date}|${p.name}`, p.status));
    return map;
  }, [prayers]);

  const elapsed = days.filter((d) => d <= today);
  const handled = elapsed.reduce(
    (sum, d) => sum + PRAYER_NAMES.filter((n) => HANDLED_STATUSES.includes(statuses.get(`${d}|${n}`) ?? "none")).length,
    0,
  );
  const jamaah = elapsed.reduce(
    (sum, d) => sum + PRAYER_NAMES.filter((n) => statuses.get(`${d}|${n}`) === "jamaah").length,
    0,
  );
  const rate = elapsed.length ? Math.round((handled / (elapsed.length * 5)) * 100) : null;
  const streak = React.useMemo(() => prayerStreak(prayers, today), [prayers, today]);
  const isCurrentMonth = month === startOfMonth(today);
  const isFuture = month > startOfMonth(today);

  return (
    <div>
      <header className="flex items-center gap-1">
        <p className="flex-1 text-[12.5px] font-medium text-ink-2">
          {monthName(month)} <span className="tnum text-ink-3">{yearOf(month)}</span>
        </p>
        {!isCurrentMonth && (
          <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(today))}>
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

      <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-[208px_minmax(0,1fr)]">
        <div className="w-full max-w-[208px]">
          <div className={cn("grid pb-1.5", COLUMNS)}>
            <span />
            {PRAYER_NAMES.map((name) => (
              <span
                key={name}
                title={PRAYER_LABELS[name]}
                className="text-center text-[10.5px] font-medium text-ink-4"
              >
                {PRAYER_LABELS[name].charAt(0)}
              </span>
            ))}
          </div>

          {days.map((day) => {
            const isToday = day === today;
            const future = day > today;
            const friday = weekday(day) === 5;

            return (
              <div key={day} className={cn("grid items-center rounded-md", COLUMNS, isToday && "bg-selected")}>
                <span
                  title={friday ? "Jumu'ah" : undefined}
                  className={cn(
                    "tnum text-center text-[10.5px]",
                    isToday ? "font-semibold text-ink" : friday ? "font-medium text-ink-3" : "text-ink-4",
                  )}
                >
                  {dayNumber(day)}
                </span>

                {PRAYER_NAMES.map((name) => {
                  const status = statuses.get(`${day}|${name}`) ?? "none";
                  return (
                    <button
                      key={name}
                      disabled={future}
                      onClick={() => cyclePrayer(day, name)}
                      title={`${PRAYER_LABELS[name]} · ${formatDate(day)} · ${PRAYER_STATE[status].label}`}
                      aria-label={`${PRAYER_LABELS[name]} on ${formatDate(day)}, ${PRAYER_STATE[status].label}`}
                      className={cn(
                        "grid h-7 cursor-pointer place-items-center rounded-md",
                        "transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
                        "hover:bg-hover active:scale-90 disabled:pointer-events-none",
                      )}
                    >
                      <StateDot status={status} dim={future} />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* One number, then the same month in words. Never both twice over. */}
        <div className="min-w-0">
          <p className="display-serif tnum text-[32px] leading-none text-ink">
            {rate === null ? "—" : `${rate}%`}
          </p>
          <p className="mt-2 text-[12px] text-ink-3">recorded in {monthName(month)}</p>

          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
            {elapsed.length ? (
              <>
                <span className="tnum">{handled}</span> of <span className="tnum">{elapsed.length * 5}</span>{" "}
                prayers, <span className="tnum">{jamaah}</span> in jamaah ·{" "}
                <span className="tnum">{streak}</span>-day streak, counting days where all five were prayed.
              </>
            ) : isFuture ? (
              <>This month has not started yet. The grid fills itself in as the days arrive.</>
            ) : (
              <>Nothing recorded this month yet — tap any square and it starts filling in.</>
            )}
          </p>

          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-4">
            Tap any square to record a past prayer. Qadha counts as handled.
          </p>

          <StateLegend className="hairline-t mt-3.5 pt-3" statuses={ALL_STATUSES} />
        </div>
      </div>
    </div>
  );
}
