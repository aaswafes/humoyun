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
import { HANDLED_STATUSES, PRAYER_STATE, StateDot, StateLegend } from "./prayer-state";

const COLUMNS = "grid-cols-[24px_repeat(5,minmax(0,1fr))]";

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
  const rate = elapsed.length ? Math.round((handled / (elapsed.length * 5)) * 100) : null;
  const streak = React.useMemo(() => prayerStreak(prayers, today), [prayers, today]);
  const isCurrentMonth = month === startOfMonth(today);

  return (
    <section className="surface p-4">
      <header className="flex items-center gap-1">
        <h2 className="flex-1 text-[13px] font-semibold text-ink">
          {monthName(month)} <span className="tnum text-ink-3">{yearOf(month)}</span>
        </h2>
        {!isCurrentMonth && (
          <Button size="xs" variant="ghost" onClick={() => setMonth(startOfMonth(today))}>
            Today
          </Button>
        )}
        <IconButton label="Previous month" size="sm" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft />
        </IconButton>
        <IconButton label="Next month" size="sm" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight />
        </IconButton>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="display-serif tnum text-[32px] leading-none text-ink">
            {rate === null ? "—" : `${rate}%`}
          </p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Recorded</p>
        </div>
        <div>
          <p className="display-serif tnum text-[32px] leading-none text-ink">{streak}</p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Day streak</p>
        </div>
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-3">
        {elapsed.length
          ? <><span className="tnum">{handled}</span> of <span className="tnum">{elapsed.length * 5}</span> prayers so far this month. The streak counts days where all five were prayed.</>
          : <>Nothing has happened this month yet — come back and the grid fills itself in.</>}
      </p>

      <div className="mx-auto mt-4 w-full max-w-[208px]">
        <div className={cn("grid pb-1.5", COLUMNS)}>
          <span />
          {PRAYER_NAMES.map((name) => (
            <span
              key={name}
              title={PRAYER_LABELS[name]}
              className="text-center text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3"
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
                  isToday ? "font-semibold text-accent" : friday ? "font-medium text-ink-2" : "text-ink-4",
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
                      "grid h-6 cursor-pointer place-items-center rounded-md",
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

      <p className="mt-3.5 text-[11.5px] leading-relaxed text-ink-3">
        Tap any square to record a past prayer. Qadha counts as handled.
      </p>
      <StateLegend className="hairline-t mt-3 pt-3" />
    </section>
  );
}
