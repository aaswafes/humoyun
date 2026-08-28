"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { formatDuration, formatTime } from "@/lib/date";
import { cn } from "@/lib/cn";
import { SectionLabel } from "@/components/ui/primitives";
import type { SessionView } from "./focus-data";

/** Keep the window tight around the day's work, but never narrower than six hours. */
function windowFor(items: SessionView[], nowMin: number) {
  const points = [...items.flatMap((i) => [i.startMin, i.endMin]), nowMin];
  let from = Math.max(0, Math.floor(Math.min(...points) / 60) - 1);
  let to = Math.min(24, Math.ceil(Math.max(...points) / 60) + 1);
  if (to - from < 6) {
    to = Math.min(24, from + 6);
    from = Math.max(0, to - 6);
  }
  return { from: from * 60, to: to * 60 };
}

export const DayTimeline = React.memo(function DayTimeline({
  items, minutes, nowMin,
}: {
  items: SessionView[];
  minutes: number;
  nowMin: number;
}) {
  const tasks = useStore((s) => s.tasks);
  const hour12 = useStore((s) => s.hour12);

  const { from, to } = windowFor(items, nowMin);
  const span = to - from;
  const pct = (min: number) => ((min - from) / span) * 100;

  const stepHours = span <= 8 * 60 ? 1 : span <= 14 * 60 ? 2 : 3;
  const ticks: number[] = [];
  for (let h = from / 60; h <= to / 60; h += stepHours) ticks.push(h * 60);

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <SectionLabel>Today</SectionLabel>
        <p className="text-[11.5px] text-ink-3 tnum">
          {items.length
            ? `${formatDuration(minutes)} across ${items.length} ${items.length === 1 ? "session" : "sessions"}`
            : "Nothing logged yet"}
        </p>
      </div>

      <div className="relative h-11 rounded-md bg-hover" role="list">
        {items.map((item) => {
          const task = item.session.task_id ? tasks.find((t) => t.id === item.session.task_id) : null;
          const color = task?.color ?? null;
          const title = task?.title || item.session.label || "Focus";
          return (
            <div
              key={item.session.id}
              role="listitem"
              aria-label={`${title}, ${formatDuration(item.minutes)} from ${formatTime(item.startMin, hour12)}`}
              title={`${title} · ${formatDuration(item.minutes)} · ${formatTime(item.startMin, hour12)}`}
              className={cn(
                "absolute inset-y-1.5 rounded-[4px] transition-[filter] duration-150 hover:brightness-110",
                color && `tint-${color}`,
              )}
              style={{
                left: `${pct(item.startMin)}%`,
                width: `max(3px, ${(item.minutes / span) * 100}%)`,
                background: color ? "var(--tint)" : "var(--accent)",
              }}
            />
          );
        })}

        <div
          aria-hidden
          className="absolute inset-y-0 w-px bg-ink-3"
          style={{ left: `${Math.min(100, Math.max(0, pct(nowMin)))}%` }}
        >
          <span className="absolute -left-[2px] -top-[2px] size-[5px] rounded-full bg-ink-3" />
        </div>
      </div>

      <div className="relative mt-1.5 h-4" aria-hidden>
        {ticks.map((min) => {
          const at = pct(min);
          // Nudge the end labels inward so neither one hangs off the track.
          const shift = at < 4 ? "0" : at > 96 ? "-100%" : "-50%";
          return (
            <span
              key={min}
              className="absolute text-[10.5px] text-ink-4 tnum"
              style={{ left: `${at}%`, transform: `translateX(${shift})` }}
            >
              {formatTime(min, hour12)}
            </span>
          );
        })}
      </div>
    </section>
  );
});
