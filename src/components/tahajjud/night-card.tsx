"use client";

import * as React from "react";
import { Check, Hourglass, Minus, Moon, MoonStar, Plus, Sparkles, Sunrise } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { dayName, dayNumber, formatDate, formatTime, monthName } from "@/lib/date";
import { Button, IconButton, Input } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { WindowCountdown } from "@/components/salah/countdown";
import { LocationLine } from "@/components/salah/location-line";
import {
  MAX_RAKAT, freshNight, tahajjudOf, withTahajjud,
  type NightClock, type TahajjudNight,
} from "./night-data";

const pad = (n: number) => String(n).padStart(2, "0");
const toClockValue = (min: number | null) => (min == null ? "" : `${pad(Math.floor(min / 60))}:${pad(min % 60)}`);

function fromClockValue(value: string): number | null {
  const m = value.match(/^(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * The night, and the one question it asks: did you rise? The countdown is
 * the only 44px numeral on the page; the record underneath is whichever night
 * is picked — the one in play by default, or one tapped on the month beside it.
 */
export function NightCard({
  clock, ahead, nowMin, picked, index, onBack,
}: {
  /** The night that can be recorded now: in the day, the one that just ended. */
  clock: NightClock;
  /** The night the top half plans for: in the day, the one still to come. */
  ahead: NightClock;
  nowMin: number;
  /** The night being recorded — the clock's own night unless one was tapped. */
  picked: string;
  index: Map<string, TahajjudNight>;
  onBack: () => void;
}) {
  const dayLogs = useStore((s) => s.dayLogs);
  const setDayLog = useStore((s) => s.setDayLog);
  const hour12 = useStore((s) => s.hour12);
  const rakatId = React.useId();
  const recordRef = React.useRef<HTMLDivElement>(null);

  const over = clock.phase === "over";
  const isCurrent = picked === clock.key;
  const log = React.useMemo(() => dayLogs.find((d) => d.date === picked), [dayLogs, picked]);
  const night = React.useMemo(() => tahajjudOf(log), [log]);

  // On a phone the month sits under this card, so a night tapped there would
  // open out of sight. "nearest" is a no-op wherever the record is on screen.
  React.useEffect(() => {
    if (!isCurrent) recordRef.current?.scrollIntoView({ block: "nearest" });
  }, [picked, isCurrent]);

  const inThird = ahead.phase === "lastThird";
  const heroEnd = inThird ? ahead.fajr : ahead.lastThird;

  const nightLength = Math.max(1, ahead.fajr - ahead.maghrib);
  const pctOf = (min: number) => Math.max(0, Math.min(100, ((min - ahead.maghrib) / nightLength) * 100));

  const rows = [
    { key: "isha", label: "Isha", note: "the night opens", min: ahead.isha, until: ahead.midnight, icon: Moon },
    { key: "midnight", label: "Midnight", note: "half the night gone", min: ahead.midnight, until: ahead.lastThird, icon: Hourglass },
    { key: "lastThird", label: "Last third", note: "the best of it", min: ahead.lastThird, until: ahead.fajr, icon: Sparkles },
    { key: "fajr", label: "Fajr", note: "tahajjud closes", min: ahead.fajr, until: ahead.fajr, icon: Sunrise },
  ];

  function write(next: TahajjudNight | null) {
    setDayLog(picked, { data: withTahajjud(log, next) });
  }

  function toggle() {
    write(night ? null : freshNight(index, clock, picked, nowMin));
  }

  const recordTitle = isCurrent
    ? over ? "Last night" : "Tonight"
    : `The night into ${formatDate(picked)}`;

  return (
    <section className="surface p-5">
      <header data-tour="salah.tahajjud.now" className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-ink">
            Tonight{" "}
            <span className="font-normal text-ink-3">
              · into {dayName(ahead.key)} <span className="tnum">{dayNumber(ahead.key)}</span> {monthName(ahead.key)}
            </span>
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            {inThird
              ? "The last third is open. This is the hour."
              : over
                ? "Last night is behind you — mark it below if you rose."
                : "Sleep first if you can, and rise for the last third."}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[11.5px] text-ink-3">{inThird ? "Left before Fajr" : "Last third in"}</p>
          <p className="display-serif mt-1 text-[44px] leading-none text-ink">
            <WindowCountdown end={heroEnd} />
          </p>
          <p className="tnum mt-1 text-[11.5px] text-ink-4">at {formatTime(heroEnd, hour12)}</p>
        </div>
      </header>

      {!over && (
        <div className="mt-5">
          {/* The whole night from Maghrib to Fajr, with its last third set apart. */}
          <div
            role="img"
            aria-label={`${Math.round(pctOf(nowMin))}% of the night has passed. The last third runs from ${formatTime(ahead.lastThird, hour12)} to ${formatTime(ahead.fajr, hour12)}.`}
            className="relative h-1 overflow-hidden rounded-full bg-hover"
          >
            <div className="absolute inset-y-0 right-0 bg-accent-soft" style={{ left: `${pctOf(ahead.lastThird)}%` }} />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease-out-apple)]"
              style={{ width: `${pctOf(nowMin)}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="tnum text-ink-4">Maghrib {formatTime(ahead.maghrib, hour12)}</span>
            <span className="tnum text-ink-4">Fajr {formatTime(ahead.fajr, hour12)}</span>
          </div>
        </div>
      )}

      <ul data-tour="salah.tahajjud.night" className="-mx-2.5 mt-4">
        {rows.map((row) => {
          const Icon = row.icon;
          const isNow = !over && nowMin >= row.min && nowMin < row.until;
          return (
            <li
              key={row.key}
              className={cn("flex items-center gap-3 rounded-lg px-2.5 py-1.5", isNow && "bg-selected")}
            >
              <span className={cn("grid size-[22px] shrink-0 place-items-center", isNow ? "text-ink-2" : "text-ink-4")}>
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">
                <span className={isNow ? "font-medium text-ink" : "text-ink-2"}>{row.label}</span>
                <span className="text-ink-4"> · {row.note}</span>
              </span>
              <span className={cn("tnum shrink-0 text-[12.5px]", isNow ? "font-medium text-ink" : "text-ink-3")}>
                {formatTime(row.min, hour12)}
              </span>
            </li>
          );
        })}
      </ul>

      <div ref={recordRef} data-tour="salah.tahajjud.record" className="hairline-t mt-4 scroll-mt-4 pt-4">
        <div className="flex min-h-7 items-center justify-between gap-3">
          <p className="text-[12px] text-ink-3">{recordTitle}</p>
          {!isCurrent && (
            <Button size="sm" variant="ghost" onClick={onBack}>
              Back to {over ? "last night" : "tonight"}
            </Button>
          )}
        </div>

        <button
          type="button"
          role="checkbox"
          aria-checked={!!night}
          onClick={toggle}
          className={cn(
            "-mx-2.5 mt-1 flex w-[calc(100%+1.25rem)] cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-left touch:min-h-11",
            "transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
            "hover:bg-hover active:scale-[0.99]",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full border",
              "transition-[background-color,border-color,color] duration-150",
              night
                ? "border-transparent bg-accent-soft text-accent"
                : "border-dashed border-line-strong text-ink-4",
            )}
          >
            {night ? <Check className="size-3.5 stroke-[2.75]" /> : <MoonStar className="size-3.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-ink">
              {night ? "Prayed tahajjud" : "Mark tahajjud prayed"}
            </span>
            <span className="mt-px block truncate text-[11.5px] text-ink-3 max-md:whitespace-normal">
              {night
                ? [
                    night.rakat != null ? `${night.rakat} rakat` : "count not written down",
                    night.at != null ? `at ${formatTime(night.at, hour12)}` : null,
                  ].filter(Boolean).join(" · ")
                : "Two rakat at a time, in the last third if you can"}
            </span>
          </span>
        </button>

        {night && (
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div role="group" aria-labelledby={rakatId} className="min-w-0">
              <p id={rakatId} className="mb-1 text-[12px] font-medium text-ink-2">Rakat</p>
              <div className="flex h-8 items-center gap-1 touch:h-10">
                <IconButton
                  label="Two fewer rakat"
                  disabled={(night.rakat ?? 0) <= 2}
                  onClick={() => write({ ...night, rakat: Math.max(2, (night.rakat ?? 2) - 2) })}
                >
                  <Minus />
                </IconButton>
                <span aria-live="polite" className="tnum w-9 text-center text-[13.5px] text-ink">
                  {night.rakat ?? "—"}
                </span>
                <IconButton
                  label="Two more rakat"
                  disabled={(night.rakat ?? 0) >= MAX_RAKAT}
                  onClick={() => write({ ...night, rakat: Math.min(MAX_RAKAT, (night.rakat ?? 0) + 2) })}
                >
                  <Plus />
                </IconButton>
              </div>
            </div>

            <Field label="Rose at" hint="optional">
              <Input
                type="time"
                value={toClockValue(night.at)}
                onChange={(e) => write({ ...night, at: fromClockValue(e.target.value) })}
              />
            </Field>
          </div>
        )}
      </div>

      <div className="hairline-t mt-5 pt-3">
        <LocationLine />
      </div>
    </section>
  );
}
