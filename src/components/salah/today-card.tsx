"use client";

import * as React from "react";
import { MoonStar, Sunrise } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { currentPrayer, type DayPrayerTimes } from "@/lib/prayer";
import { dayName, dayNumber, formatTime, monthName } from "@/lib/date";
import { PRAYER_LABELS, PRAYER_NAMES, type PrayerName, type PrayerStatus } from "@/lib/types";
import { HANDLED_STATUSES, PRAYER_STATE, StateMark } from "./prayer-state";
import { Countdown } from "./countdown";
import { LocationLine } from "./location-line";

type Row =
  | { kind: "prayer"; key: string; min: number; name: PrayerName }
  | {
      kind: "marker";
      key: string;
      min: number;
      label: string;
      note: string;
      icon: React.ComponentType<{ className?: string }>;
    };

export function TodayCard({
  date, times, nowMin,
}: {
  date: string;
  times: DayPrayerTimes;
  nowMin: number;
}) {
  const prayers = useStore((s) => s.prayers);
  const cyclePrayer = useStore((s) => s.cyclePrayer);
  const hour12 = useStore((s) => s.hour12);

  const statuses = React.useMemo(() => {
    const map = new Map<PrayerName, PrayerStatus>();
    prayers.forEach((p) => { if (p.date === date) map.set(p.name, p.status); });
    return map;
  }, [prayers, date]);

  // Sunrise and the last third sit in the same timeline as the prayers, so the
  // list is built once and sorted by clock time rather than hard-coded in order.
  const rows = React.useMemo<Row[]>(() => {
    const list: Row[] = [
      ...PRAYER_NAMES.map((name) => ({ kind: "prayer" as const, key: name, name, min: times[name] })),
      { kind: "marker", key: "sunrise", min: times.sunrise, label: "Sunrise", note: "Fajr window closes", icon: Sunrise },
      { kind: "marker", key: "lastThird", min: times.lastThird, label: "Last third", note: "Tahajjud", icon: MoonStar },
    ];
    return list.sort((a, b) => a.min - b.min);
  }, [times]);

  const { current, next, nextAt } = currentPrayer(times, nowMin);
  const recorded = PRAYER_NAMES.filter((n) => HANDLED_STATUSES.includes(statuses.get(n) ?? "none")).length;
  const inLastThird = nowMin >= times.lastThird && nowMin < times.fajr;

  return (
    <section className="surface p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Today · {dayName(date)}
          </p>
          <p className="display-serif mt-1.5 text-[32px] leading-none text-ink">
            <span className="tnum">{dayNumber(date)}</span> {monthName(date)}
          </p>
        </div>

        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            {PRAYER_LABELS[next]} in
          </p>
          <Countdown at={nextAt} className="mt-1.5 block text-[21px] font-semibold leading-none text-accent" />
          <p className="mt-2 text-[11.5px] text-ink-3">
            <span className="tnum">{recorded}</span> of <span className="tnum">5</span> recorded
          </p>
        </div>
      </header>

      <div className="-mx-2.5 mt-4">
        {rows.map((row) => {
          if (row.kind === "marker") {
            const Icon = row.icon;
            const active = row.key === "sunrise" ? current === "sunrise" : inLastThird;
            return (
              <div
                key={row.key}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-1.5",
                  active && "bg-hover",
                )}
              >
                <span className="grid size-[22px] shrink-0 place-items-center text-ink-4">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
                  {row.label}
                  <span className="text-ink-4"> · {row.note}</span>
                </span>
                <span className="tnum shrink-0 text-[12px] text-ink-3">{formatTime(row.min, hour12)}</span>
              </div>
            );
          }

          const status = statuses.get(row.name) ?? "none";
          const state = PRAYER_STATE[status];
          const isNow = current === row.name;

          return (
            <button
              key={row.key}
              onClick={() => cyclePrayer(date, row.name)}
              aria-label={`${PRAYER_LABELS[row.name]} at ${formatTime(row.min, hour12)}, ${state.label}. Activate to change.`}
              className={cn(
                "relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                "transition-[background-color,transform] duration-200 ease-[var(--ease-out-apple)] active:scale-[0.985]",
                isNow ? "bg-selected" : "hover:bg-hover",
              )}
            >
              {isNow && (
                <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-accent" />
              )}

              <StateMark status={status} />

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13.5px] font-medium text-ink">{PRAYER_LABELS[row.name]}</span>
                  {isNow && (
                    <span className="rounded-full bg-accent-soft px-1.5 text-[10.5px] font-semibold uppercase leading-[15px] tracking-[0.06em] text-accent">
                      Now
                    </span>
                  )}
                </span>
                <span className={cn("mt-px block text-[11.5px]", state.text)}>{state.label}</span>
              </span>

              <span className={cn("tnum shrink-0 text-[13.5px]", isNow ? "font-medium text-ink" : "text-ink-2")}>
                {formatTime(row.min, hour12)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
        Tap a prayer to cycle it: not marked, prayed, jamaah, qadha.
      </p>

      <div className="hairline-t mt-4 pt-3">
        <LocationLine />
      </div>
    </section>
  );
}
