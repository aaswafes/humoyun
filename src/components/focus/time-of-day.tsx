"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/date";
import { SectionLabel } from "@/components/ui/primitives";
import { MiniEmpty, VisuallyHidden } from "@/components/ui/form";
import { hourLabel, hourStats, type DayGroup } from "./focus-data";

const AXIS = [0, 6, 12, 18];

/**
 * When the focus actually happens. Minutes are spread across the hours a
 * session covers rather than dumped on the hour it started, so a 90-minute
 * block does not pretend to be a single spike.
 */
export const TimeOfDay = React.memo(function TimeOfDay({
  groups, hour12,
}: {
  groups: DayGroup[];
  hour12: boolean;
}) {
  const summaryId = React.useId();
  const stats = React.useMemo(() => hourStats(groups), [groups]);
  const peak = Math.max(1, ...stats.minutes);

  const windowLabel = stats.peakWindow
    ? `${hourLabel(stats.peakWindow[0], hour12)} – ${hourLabel(stats.peakWindow[1], hour12)}`
    : null;

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <SectionLabel>Time of day</SectionLabel>
        {stats.totalMinutes > 0 && (
          <p className="text-[11.5px] text-ink-3 tnum">{formatDuration(stats.totalMinutes)} placed</p>
        )}
      </div>

      {stats.totalMinutes === 0 ? (
        <MiniEmpty>Finish a session and your best hours start showing up here.</MiniEmpty>
      ) : (
        <>
          <p className="text-[13px] text-ink-2">
            Your best stretch is <span className="font-medium text-ink">{windowLabel}</span>
          </p>
          <p className="display-serif tnum mt-1 text-[22px] leading-none text-ink">
            {formatDuration(Math.round(stats.peakMinutes))}
          </p>

          <div className="mt-3.5 flex h-[68px] items-end gap-[2px]" aria-describedby={summaryId}>
            {stats.minutes.map((value, hour) => {
              const inWindow =
                !!stats.peakWindow && hour >= stats.peakWindow[0] && hour < stats.peakWindow[1];
              return (
                <div
                  key={hour}
                  title={`${hourLabel(hour, hour12)} · ${formatDuration(Math.round(value))}`}
                  className="flex min-w-0 flex-1 flex-col justify-end"
                  style={{ height: "100%" }}
                >
                  {stats.interruptions[hour] > 0 && (
                    <span
                      aria-hidden
                      className="mx-auto mb-[3px] block size-1 shrink-0 rounded-full bg-warn"
                      title={`${stats.interruptions[hour]} interruptions`}
                    />
                  )}
                  <span
                    className={cn(
                      "block w-full rounded-xs transition-[height] duration-500 ease-[var(--ease-out-apple)]",
                      inWindow ? "bg-accent" : value > 0 ? "bg-accent-line" : "bg-hover",
                    )}
                    style={{ height: `max(2px, ${(value / peak) * 100}%)` }}
                  />
                </div>
              );
            })}
          </div>

          <div className="relative mt-1.5 h-4" aria-hidden>
            {AXIS.map((hour) => (
              <span
                key={hour}
                className="absolute text-[10.5px] text-ink-4 tnum"
                style={{ left: `${(hour / 24) * 100}%` }}
              >
                {hourLabel(hour, hour12)}
              </span>
            ))}
          </div>

          <p className="mt-1 text-[11.5px] leading-snug text-ink-4">
            {stats.worstHour != null
              ? `Most interruptions land around ${hourLabel(stats.worstHour, hour12)}.`
              : "No interruptions logged yet — tap Distracted during a block to start."}
          </p>

          <VisuallyHidden id={summaryId}>
            {`Focus by hour. Best stretch ${windowLabel}, holding ${formatDuration(Math.round(stats.peakMinutes))}. ` +
              stats.minutes
                .map((v, h) => (v > 0 ? `${hourLabel(h, hour12)} ${formatDuration(Math.round(v))}` : null))
                .filter(Boolean)
                .join(", ")}
          </VisuallyHidden>
        </>
      )}
    </section>
  );
});
