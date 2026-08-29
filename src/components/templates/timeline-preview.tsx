"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { formatDuration, formatRange, formatTime } from "@/lib/date";
import type { TemplateItem, Tint } from "@/lib/types";
import { VisuallyHidden } from "@/components/ui/form";

type Timed = TemplateItem & { start_min: number };

const isTimed = (i: TemplateItem): i is Timed => i.start_min != null;

/** An item's end on the clock — falls back to its duration, then to 30 minutes. */
function endOf(item: Timed): number {
  if (item.end_min != null && item.end_min > item.start_min) return item.end_min;
  return Math.min(1440, item.start_min + (item.duration_min ?? 30));
}

interface Placed {
  item: Timed;
  start: number;
  end: number;
  lane: number;
}

/** Greedy lane packing so overlapping blocks sit side by side instead of on top. */
function pack(items: Timed[]): Placed[] {
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

interface Band {
  key: string;
  label: string;
  items: Timed[];
  muted?: boolean;
}

function ClockTimeline({
  bands, color, hour12,
}: {
  bands: Band[];
  color: Tint;
  hour12: boolean;
}) {
  const packed = React.useMemo(
    () => bands.map((band) => ({ band, placed: pack(band.items) })),
    [bands],
  );

  const all = packed.flatMap((b) => b.placed);
  if (!all.length) return null;

  const from = Math.floor(Math.min(...all.map((p) => p.start)) / 60) * 60;
  const rawTo = Math.ceil(Math.max(...all.map((p) => p.end)) / 60) * 60;
  const to = Math.min(1440, Math.max(rawTo, from + 240));
  const span = Math.max(60, to - from);
  const pct = (min: number) => ((min - from) / span) * 100;

  const stepHours = span <= 360 ? 1 : span <= 720 ? 2 : 3;
  const ticks: number[] = [];
  for (let m = from; m <= to; m += stepHours * 60) ticks.push(m);

  // A new block that lands on top of something already on the day gets flagged
  // rather than silently drawn in its own lane.
  const busy = packed.filter((p) => p.band.muted).flatMap((p) => p.placed);
  const clashing = new Set<Placed>();
  for (const p of all) {
    if (busy.includes(p)) continue;
    if (busy.some((b) => p.start < b.end && p.end > b.start)) clashing.add(p);
  }

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

      {packed.map(({ band, placed }, bandIndex) => {
        if (!placed.length) return null;
        const lanes = Math.max(1, ...placed.map((p) => p.lane + 1));
        return (
          <div key={band.key} className={cn(bandIndex > 0 && "mt-2")}>
            {bands.length > 1 && (
              <p className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-4">
                {band.label}
              </p>
            )}
            <div className="relative" style={{ height: lanes * LANE_H + (lanes - 1) * LANE_GAP }}>
              {ticks.map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-line" style={{ left: `${pct(t)}%` }} aria-hidden />
              ))}

              {placed.map((p, i) => {
                const { item, start, end, lane } = p;
                const clash = clashing.has(p);
                return (
                  <div
                    key={`${item.title}-${start}-${i}`}
                    title={
                      `${item.title} · ${formatRange(item.start_min, item.end_min ?? end, hour12)}` +
                      (clash ? " · clashes with something already on this day" : "")
                    }
                    className={cn(
                      band.muted ? "" : `tint-${item.color ?? color}`,
                      "absolute flex items-center overflow-hidden rounded-[5px] px-1.5",
                      band.muted
                        ? "bg-hover text-ink-3"
                        : "bg-[var(--tint-soft)] text-[var(--tint-ink)]",
                      clash && "ring-1 ring-warn",
                    )}
                    style={{
                      left: `${pct(start)}%`,
                      width: `max(4px, ${pct(end) - pct(start)}%)`,
                      top: lane * (LANE_H + LANE_GAP),
                      height: LANE_H,
                      boxShadow: band.muted
                        ? "inset 2px 0 0 0 var(--line-strong)"
                        : "inset 2px 0 0 0 var(--tint)",
                    }}
                  >
                    <span className="truncate text-[11px] font-medium leading-none">{item.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
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
        <span className="text-[12px] text-ink-3">In sequence</span>
        <span className="text-[11.5px] text-ink-3 tnum">{formatDuration(total)} total</span>
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

/** Plain-text reading of the same picture, for anyone not looking at it. */
function summarise(items: TemplateItem[], existing: TemplateItem[], hour12: boolean): string {
  const lines = items.map((item) =>
    item.start_min != null
      ? `${formatRange(item.start_min, item.end_min ?? null, hour12)} ${item.title}`
      : item.duration_min
        ? `${formatDuration(item.duration_min)} ${item.title}`
        : item.title,
  );
  const head = `${items.length} item${items.length === 1 ? "" : "s"}`;
  const tail = existing.length ? `, alongside ${existing.length} already on the day` : "";
  return `${head}${tail}: ${lines.join("; ")}.`;
}

/**
 * The shape of a day at a glance: clocked items on a proportional timeline,
 * untimed ones as a duration sequence beneath it. Pass `existing` and the
 * day's current tasks are drawn on the same axis in a muted band, so a clash
 * is visible before anything is written.
 */
export function TimelinePreview({
  items, color, hour12, existing, className, emptyHint,
}: {
  items: TemplateItem[];
  color: Tint;
  hour12: boolean;
  /** Tasks already on the day, drawn behind in a muted band. */
  existing?: TemplateItem[];
  className?: string;
  emptyHint?: string;
}) {
  const describedBy = React.useId();
  const before = existing ?? [];
  const timed = items.filter(isTimed);
  const untimed = items.filter((i) => i.start_min == null);
  const timedExisting = before.filter(isTimed);

  if (!items.length && !before.length) {
    return (
      <div className={cn("rounded-lg bg-sunken px-3 py-4 text-center", className)}>
        <p className="text-[12.5px] text-ink-4">
          {emptyHint ?? "Add an item and the shape of the day appears here."}
        </p>
      </div>
    );
  }

  const bands: Band[] = [];
  if (timedExisting.length) bands.push({ key: "existing", label: "Already on this day", items: timedExisting, muted: true });
  if (timed.length) bands.push({ key: "new", label: "This template", items: timed });

  return (
    <div
      className={cn("rounded-lg bg-sunken p-2.5", className)}
      aria-describedby={describedBy}
    >
      <VisuallyHidden id={describedBy}>{summarise(items, before, hour12)}</VisuallyHidden>
      {bands.length > 0 && <ClockTimeline bands={bands} color={color} hour12={hour12} />}
      {bands.length > 0 && untimed.length > 0 && <div className="my-2.5 h-px bg-line" />}
      {untimed.length > 0 && <SequenceBar items={untimed} color={color} />}
      {!bands.length && !untimed.length && (
        <p className="px-0.5 py-1 text-[12.5px] text-ink-4">Nothing lands on this day.</p>
      )}
    </div>
  );
}
