"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { formatDuration, formatRange, formatTime } from "@/lib/date";
import type { TemplateItem, Tint } from "@/lib/types";

type Timed = TemplateItem & { start_min: number };

const isTimed = (i: TemplateItem): i is Timed => i.start_min != null;

/** An item's end on the clock — falls back to its duration, then to 30 minutes. */
function endOf(item: Timed): number {
  if (item.end_min != null && item.end_min > item.start_min) return item.end_min;
  return Math.min(1440, item.start_min + (item.duration_min ?? 30));
}

/** Greedy lane packing so overlapping blocks sit side by side instead of on top. */
function pack(items: Timed[]) {
  const sorted = [...items].sort((a, b) => a.start_min - b.start_min);
  const laneEnds: number[] = [];
  return sorted.map((item) => {
    const start = item.start_min;
    const end = Math.max(start + 10, endOf(item));
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) { laneEnds.push(end); lane = laneEnds.length - 1; }
    else laneEnds[lane] = end;
    return { item, start, end, lane };
  });
}

const LANE_H = 22;
const LANE_GAP = 3;

function ClockTimeline({
  items, color, hour12,
}: {
  items: Timed[];
  color: Tint;
  hour12: boolean;
}) {
  const placed = React.useMemo(() => pack(items), [items]);
  const lanes = Math.max(1, ...placed.map((p) => p.lane + 1));

  const from = Math.floor(Math.min(...placed.map((p) => p.start)) / 60) * 60;
  const rawTo = Math.ceil(Math.max(...placed.map((p) => p.end)) / 60) * 60;
  const to = Math.min(1440, Math.max(rawTo, from + 240));
  const span = to - from;
  const pct = (min: number) => ((min - from) / span) * 100;

  const stepHours = span <= 360 ? 1 : span <= 720 ? 2 : 3;
  const ticks: number[] = [];
  for (let m = from; m <= to; m += stepHours * 60) ticks.push(m);

  return (
    <div>
      <div className="relative mb-1 h-3.5">
        {ticks.map((t, i) => (
          <span
            key={t}
            className="absolute top-0 text-[10.5px] leading-none text-ink-4 tnum"
            style={{
              left: `${pct(t)}%`,
              transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {formatTime(t, hour12)}
          </span>
        ))}
      </div>

      <div className="relative" style={{ height: lanes * LANE_H + (lanes - 1) * LANE_GAP }}>
        {ticks.map((t) => (
          <span key={t} className="absolute inset-y-0 w-px bg-line" style={{ left: `${pct(t)}%` }} aria-hidden />
        ))}

        {placed.map(({ item, start, end, lane }, i) => (
          <div
            key={`${item.title}-${start}-${i}`}
            title={`${item.title} · ${formatRange(item.start_min, item.end_min ?? end, hour12)}`}
            className={cn(
              `tint-${item.color ?? color}`,
              "absolute flex items-center overflow-hidden rounded-[5px] px-1.5",
              "bg-[var(--tint-soft)] text-[var(--tint-ink)]",
            )}
            style={{
              left: `${pct(start)}%`,
              width: `max(4px, ${pct(end) - pct(start)}%)`,
              top: lane * (LANE_H + LANE_GAP),
              height: LANE_H,
              boxShadow: "inset 2px 0 0 0 var(--tint)",
            }}
          >
            <span className="truncate text-[11px] font-medium leading-none">{item.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SequenceBar({
  items, color,
}: {
  items: TemplateItem[];
  color: Tint;
}) {
  const total = items.reduce((sum, i) => sum + (i.duration_min ?? 15), 0);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">In sequence</span>
        <span className="text-[11.5px] text-ink-2 tnum">{formatDuration(total)} total</span>
      </div>
      <div className="flex h-[22px] w-full gap-[2px] overflow-hidden rounded-[5px]">
        {items.map((item, i) => {
          const minutes = item.duration_min ?? 15;
          return (
            <div
              key={`${item.title}-${i}`}
              title={`${item.title} · ${formatDuration(minutes)}`}
              className={cn(
                `tint-${item.color ?? color}`,
                "flex min-w-[6px] items-center justify-center overflow-hidden px-1",
                "bg-[var(--tint-soft)] text-[var(--tint-ink)]",
              )}
              style={{ flex: `${minutes} 1 0%`, boxShadow: "inset 2px 0 0 0 var(--tint)" }}
            >
              <span className="truncate text-[10.5px] font-medium leading-none tnum">
                {formatDuration(minutes)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The shape of a day at a glance: clocked items on a proportional timeline,
 * untimed ones as a duration sequence beneath it.
 */
export function TimelinePreview({
  items, color, hour12, className,
}: {
  items: TemplateItem[];
  color: Tint;
  hour12: boolean;
  className?: string;
}) {
  const timed = items.filter(isTimed);
  const untimed = items.filter((i) => i.start_min == null);

  if (!items.length) {
    return (
      <div className={cn("rounded-lg border border-dashed border-line px-3 py-4 text-center", className)}>
        <p className="text-[12.5px] text-ink-4">Add an item and the shape of the day appears here.</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-line bg-sunken p-2.5", className)}>
      {timed.length > 0 && <ClockTimeline items={timed} color={color} hour12={hour12} />}
      {timed.length > 0 && untimed.length > 0 && <div className="my-2.5 h-px bg-line" />}
      {untimed.length > 0 && <SequenceBar items={untimed} color={color} />}
    </div>
  );
}
