"use client";

import * as React from "react";
import { Play, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, focusMinutesOn } from "@/lib/store";
import { addDays, formatDuration, formatTime, toISO } from "@/lib/date";
import { Button } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import { RailCard, RailMeta } from "./rail-card";
import { hourLabel } from "./day-math";

/** Minutes of focus per hour, across the hours the day actually used. */
function bucketsFor(
  sessions: { started_at: string; seconds: number }[],
  nowHour: number,
): { from: number; to: number; values: number[] } {
  let from = nowHour;
  let to = nowHour;
  const byHour = new Map<number, number>();

  for (const s of sessions) {
    const h = new Date(s.started_at).getHours();
    byHour.set(h, (byHour.get(h) ?? 0) + s.seconds / 60);
    from = Math.min(from, h);
    to = Math.max(to, h);
  }
  if (to - from < 5) to = Math.min(23, from + 5);
  if (to - from < 5) from = Math.max(0, to - 5);

  return {
    from,
    to,
    values: Array.from({ length: to - from + 1 }, (_, i) => Math.round(byHour.get(from + i) ?? 0)),
  };
}

export function FocusCard({ date, now }: { date: string; now: number }) {
  const focusSessions = useStore((s) => s.focusSessions);
  const timer = useStore((s) => s.timer);
  const hour12 = useStore((s) => s.hour12);
  const startTimer = useStore((s) => s.startTimer);
  const chartId = React.useId();

  const today = React.useMemo(
    () => focusSessions.filter((s) => toISO(new Date(s.started_at)) === date),
    [focusSessions, date],
  );
  const minutes = focusMinutesOn(focusSessions, date);
  const longest = today.reduce((max, s) => Math.max(max, s.seconds), 0);
  const active = timer.running || timer.accumulated > 0;

  // The seven days before today, so the comparison is a real baseline.
  const average = React.useMemo(() => {
    const total = Array.from({ length: 7 }, (_, i) => focusMinutesOn(focusSessions, addDays(date, -(i + 1))))
      .reduce((sum, m) => sum + m, 0);
    return Math.round(total / 7);
  }, [focusSessions, date]);
  const delta = minutes - average;

  const chart = React.useMemo(() => bucketsFor(today, new Date(now).getHours()), [today, now]);
  const peak = Math.max(...chart.values, 25);

  const chartSummary = today.length
    ? `${today.length} session${today.length === 1 ? "" : "s"}, ${formatDuration(minutes)} in total. ` +
      chart.values
        .map((v, i) => (v ? `${formatTime((chart.from + i) * 60, hour12)}: ${formatDuration(v)}` : null))
        .filter(Boolean)
        .join(", ") + "."
    : "No focus sessions logged today yet.";

  return (
    <RailCard
      icon={Timer}
      title="Focus today"
      href="/focus"
      hrefLabel="Open Focus"
      accessory={
        longest > 0 ? (
          <span className="text-[11.5px] text-ink-3 tnum">best {formatDuration(Math.round(longest / 60))}</span>
        ) : undefined
      }
      footer={
        average > 0 ? (
          <RailMeta value={`avg ${formatDuration(average)}`}>
            {delta === 0
              ? "Exactly your 7-day average"
              : delta > 0
                ? `${formatDuration(delta)} above your 7-day average`
                : `${formatDuration(-delta)} below your 7-day average`}
          </RailMeta>
        ) : undefined
      }
    >
      <div className="flex items-end gap-3 px-2 pb-2 pt-1.5">
        <span className="display-serif tnum select-none text-[32px] leading-[0.8] text-ink">{minutes}</span>
        <div className="pb-0.5">
          <p className="text-[12.5px] leading-tight text-ink-2">minutes focused</p>
          <p className="text-[11.5px] leading-tight text-ink-3 tnum">
            {today.length ? `${today.length} session${today.length === 1 ? "" : "s"}` : "no sessions yet"}
          </p>
        </div>
      </div>

      <div className="px-2 pb-1.5">
        <div role="img" aria-describedby={chartId} className="flex h-8 items-end gap-0.5">
          {chart.values.map((value, i) => {
            const hour = chart.from + i;
            const height = value ? Math.max(4, Math.round((value / peak) * 32)) : 3;
            return (
              <span
                key={hour}
                title={`${hourLabel(hour, hour12)} — ${value ? formatDuration(value) : "nothing"}`}
                className={cn(
                  "min-w-0 flex-1 rounded-[2px] transition-[height] duration-500 ease-[var(--ease-out-apple)]",
                  value ? "bg-accent" : "bg-line-strong",
                )}
                style={{ height }}
              />
            );
          })}
        </div>
        <div aria-hidden className="mt-1 flex justify-between text-[10.5px] text-ink-4 tnum">
          <span>{hourLabel(chart.from, hour12)}</span>
          <span>{hourLabel(chart.to, hour12)}</span>
        </div>
        <VisuallyHidden id={chartId}>{chartSummary}</VisuallyHidden>
      </div>

      {active ? (
        <Button variant="subtle" className="w-full" disabled>
          Session in progress
        </Button>
      ) : (
        <div className="flex gap-1.5">
          <Button
            variant="subtle"
            className="flex-1"
            onClick={() => startTimer({ mode: "pomodoro", targetMinutes: 25, label: "Focus" })}
          >
            <Play className="size-3" />
            Start 25m
          </Button>
          <Button
            variant="subtle"
            aria-label="Start a 50 minute session"
            onClick={() => startTimer({ mode: "pomodoro", targetMinutes: 50, label: "Deep work" })}
          >
            50m
          </Button>
        </div>
      )}
    </RailCard>
  );
}
