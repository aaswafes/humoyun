"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { formatDuration, formatTime } from "@/lib/date";
import { cn } from "@/lib/cn";
import { SectionLabel } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import type { SessionView } from "./focus-data";

export interface LiveBlock {
  startMin: number;
  minutes: number;
  label: string;
  onBreak: boolean;
}

/** Keep the window tight around the day's work, but never narrower than six hours. */
function windowFor(points: number[]) {
  let from = Math.max(0, Math.floor(Math.min(...points) / 60) - 1);
  let to = Math.min(24, Math.ceil(Math.max(...points) / 60) + 1);
  if (to - from < 6) {
    to = Math.min(24, from + 6);
    from = Math.max(0, to - 6);
  }
  return { from: from * 60, to: to * 60 };
}

/**
 * The shape of the day: focus above the line, rest below it, and the block
 * that is running right now drawn live at the end.
 */
export const DayTimeline = React.memo(function DayTimeline({
  items, breaks, minutes, nowMin, live, onOpen,
}: {
  items: SessionView[];
  breaks: SessionView[];
  minutes: number;
  nowMin: number;
  live: LiveBlock | null;
  onOpen: (sessionId: string) => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const hour12 = useStore((s) => s.hour12);
  const summaryId = React.useId();

  const { from, to } = windowFor([
    ...items.flatMap((i) => [i.startMin, i.endMin]),
    ...breaks.flatMap((i) => [i.startMin, i.endMin]),
    ...(live ? [live.startMin, live.startMin + live.minutes] : []),
    nowMin,
  ]);
  const span = to - from;
  const pct = (min: number) => ((min - from) / span) * 100;
  // A block is a button, so it never shrinks below something you can hit.
  const width = (mins: number) => `max(6px, ${(mins / span) * 100}%)`;

  const stepHours = span <= 8 * 60 ? 1 : span <= 14 * 60 ? 2 : 3;
  const ticks: number[] = [];
  for (let h = from / 60; h <= to / 60; h += stepHours) ticks.push(h * 60);

  const interrupted = items.reduce((sum, i) => sum + i.interruptions, 0);
  const restMinutes = breaks.reduce((sum, b) => sum + b.minutes, 0);

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <SectionLabel>Today</SectionLabel>
        <p className="text-[11.5px] text-ink-3 tnum">
          {items.length
            ? `${formatDuration(minutes)} across ${items.length} ${items.length === 1 ? "session" : "sessions"}` +
              (restMinutes ? ` · ${formatDuration(restMinutes)} rest` : "") +
              (interrupted ? ` · ${interrupted} interrupted` : "")
            : "Nothing logged yet"}
        </p>
      </div>

      <div
        className="relative h-12 rounded-md bg-hover"
        role="group"
        aria-label="Today's sessions"
        aria-describedby={summaryId}
      >
        {items.map((item) => {
          const task = item.session.task_id ? tasks.find((t) => t.id === item.session.task_id) : null;
          const color = task?.color ?? null;
          const title = task?.title || item.session.label || "Focus";
          const detail =
            `${title} · ${formatDuration(item.minutes)} · ${formatTime(item.startMin, hour12)}` +
            (item.interruptions ? ` · ${item.interruptions} interrupted` : "") +
            (item.session.note ? ` · ${item.session.note}` : "");
          return (
            <button
              key={item.session.id}
              type="button"
              onClick={() => onOpen(item.session.id)}
              aria-label={`${detail}. Edit this session.`}
              title={detail}
              className={cn(
                "absolute bottom-4 top-1.5 cursor-pointer rounded-xs transition-[filter,transform] duration-150",
                "hover:brightness-110 focus-visible:brightness-110",
                color && `tint-${color}`,
              )}
              style={{
                left: `${pct(item.startMin)}%`,
                width: width(item.minutes),
                background: color ? "var(--tint)" : "var(--accent)",
              }}
            >
              {item.interruptions > 0 && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[2px] rounded-t-xs bg-warn"
                />
              )}
            </button>
          );
        })}

        {breaks.map((item) => (
          <span
            key={item.session.id}
            aria-hidden
            title={`${item.session.label || "Break"} · ${formatDuration(item.minutes)} · ${formatTime(item.startMin, hour12)}`}
            className="absolute bottom-1.5 h-1.5 rounded-full bg-success-soft"
            style={{ left: `${pct(item.startMin)}%`, width: width(item.minutes) }}
          />
        ))}

        {live && (
          <span
            aria-hidden
            title={`${live.label} · running`}
            className={cn(
              "absolute rounded-xs border border-dashed",
              live.onBreak
                ? "bottom-1.5 h-1.5 border-success bg-success-soft"
                : "bottom-4 top-1.5 border-accent bg-accent-soft",
            )}
            style={{ left: `${pct(live.startMin)}%`, width: width(Math.max(1, live.minutes)) }}
          />
        )}

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

      <VisuallyHidden id={summaryId}>
        {items.length
          ? items
              .map((i) => {
                const task = i.session.task_id ? tasks.find((t) => t.id === i.session.task_id) : null;
                return `${task?.title || i.session.label || "Focus"}, ${formatDuration(i.minutes)} from ${formatTime(i.startMin, hour12)}`;
              })
              .join(". ")
          : "No sessions logged today."}
      </VisuallyHidden>
    </section>
  );
});
