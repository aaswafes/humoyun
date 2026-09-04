"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { formatDuration, formatTime } from "@/lib/date";
import type { Task } from "@/lib/types";
import type { Range } from "./day-math";

// =========================================================
// A timed block on the hour ribbon, and its two edges.
//
// Grab an edge and the block changes shape under the cursor: the left edge
// moves the start and leaves the end where it is, the right edge does the
// opposite. Nothing is written until the pointer comes up, so a resize is one
// undo step and one round trip rather than forty.
//
// The edges are also the reason the block stopped being `aria-hidden`. A thing
// you can change has to be reachable: each handle is a real slider with the
// arrow keys wired to the same five minutes the pointer snaps to.
// =========================================================

/** Nothing on a day plan is usefully shorter than this. */
export const MIN_BLOCK = 15;
/** What a drag lands on. Alt drags to the minute. */
export const SNAP = 5;
/** The arrow keys move by the snap; with Shift, by a proper chunk. */
const KEY_STEP = SNAP;
const KEY_STEP_BIG = 30;

/** How wide the grab strip at each end is, in pixels. */
const HANDLE_W = 9;

const DAY = 24 * 60;

type Side = "start" | "end";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function RibbonBlock({
  task, range, lane, laneH, laneGap, rangeStart, rangeEnd, hour12,
  trackRef, onCommit, onOpen,
}: {
  task: Task;
  range: Range;
  lane: number;
  laneH: number;
  laneGap: number;
  rangeStart: number;
  rangeEnd: number;
  hour12: boolean;
  /** the ribbon itself — a resize needs its width to turn pixels into minutes */
  trackRef: React.RefObject<HTMLDivElement | null>;
  onCommit: (task: Task, start: number, end: number) => void;
  onOpen: (task: Task) => void;
}) {
  const [draft, setDraft] = React.useState<Range | null>(null);
  const [grabbing, setGrabbing] = React.useState<Side | null>(null);
  // The pointer moves faster than React commits, so the value that gets written
  // on pointerup is read from here rather than from state.
  const latest = React.useRef<Range | null>(null);

  const span = rangeEnd - rangeStart;
  const live = draft ?? range;
  const pct = (m: number) => ((m - rangeStart) / span) * 100;
  const left = Math.max(0, pct(live.start));
  const width = Math.min(Math.max(1.2, pct(live.end) - pct(live.start)), 100 - left);
  const done = task.status === "done";
  const title = task.title || "Untitled";

  const nudge = (side: Side, deltaMin: number) => {
    const next: Range = side === "start"
      ? { start: clamp(range.start + deltaMin, 0, range.end - MIN_BLOCK), end: range.end }
      : { start: range.start, end: clamp(range.end + deltaMin, range.start + MIN_BLOCK, DAY) };
    if (next.start !== range.start || next.end !== range.end) onCommit(task, next.start, next.end);
  };

  const beginResize = (e: React.PointerEvent, side: Side) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;

    const width = track.getBoundingClientRect().width;
    if (!width) return;
    const startX = e.clientX;
    const base: Range = { start: range.start, end: range.end };
    latest.current = base;
    setGrabbing(side);

    const move = (ev: PointerEvent) => {
      const minutes = ((ev.clientX - startX) / width) * span;
      const step = ev.altKey ? 1 : SNAP;
      const delta = Math.round(minutes / step) * step;
      const next: Range = side === "start"
        ? { start: clamp(base.start + delta, 0, base.end - MIN_BLOCK), end: base.end }
        : { start: base.start, end: clamp(base.end + delta, base.start + MIN_BLOCK, DAY) };
      latest.current = next;
      setDraft(next);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const next = latest.current;
      setDraft(null);
      setGrabbing(null);
      if (next && (next.start !== base.start || next.end !== base.end)) {
        onCommit(task, next.start, next.end);
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const clock = `${formatTime(live.start, hour12)}–${formatTime(live.end, hour12)}`;
  const length = live.end - live.start;

  const handle = (side: Side) => (
    <span
      role="slider"
      tabIndex={0}
      aria-label={side === "start" ? `${title} — start time` : `${title} — end time`}
      aria-valuemin={side === "start" ? 0 : range.start + MIN_BLOCK}
      aria-valuemax={side === "start" ? range.end - MIN_BLOCK : DAY}
      aria-valuenow={side === "start" ? live.start : live.end}
      aria-valuetext={formatTime(side === "start" ? live.start : live.end, hour12)}
      onPointerDown={(e) => beginResize(e, side)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
        if (e.key === "ArrowLeft") { e.preventDefault(); nudge(side, -step); }
        else if (e.key === "ArrowRight") { e.preventDefault(); nudge(side, step); }
      }}
      className={cn(
        "absolute inset-y-0 z-10 cursor-ew-resize touch-none",
        // The visible mark is thin; the grab strip around it is not.
        "before:absolute before:inset-y-[2px] before:w-[3px] before:rounded-full",
        "before:bg-[var(--tint-ink)] before:opacity-0 before:transition-opacity before:duration-150",
        "hover:before:opacity-80 focus-visible:before:opacity-100 focus-visible:outline-none",
        grabbing === side && "before:opacity-100",
        side === "start"
          ? "left-0 before:left-[1px]"
          : "right-0 before:right-[1px]",
      )}
      style={{ width: HANDLE_W }}
    />
  );

  return (
    <span
      title={`${title} · ${clock} · ${formatDuration(length)}`}
      className={cn(
        "group/block absolute rounded-[4px] text-[10.5px] font-medium leading-[14px]",
        task.color ? `tint-${task.color}` : "tint-slate",
        done && "opacity-55",
        grabbing && "z-20",
      )}
      style={{
        left: `${left}%`,
        width: `calc(${width}% - 2px)`,
        top: 2 + lane * (laneH + laneGap),
        height: laneH,
        background: "var(--tint-soft)",
        color: "var(--tint-ink)",
        boxShadow: "inset 2px 0 0 0 var(--tint)",
      }}
    >
      <button
        type="button"
        onClick={() => onOpen(task)}
        aria-label={`${title}, ${clock}, ${formatDuration(length)} — open it`}
        className="block size-full cursor-pointer overflow-hidden whitespace-nowrap px-1 text-left"
      >
        {laneH >= 16 ? title : ""}
      </button>

      {handle("start")}
      {handle("end")}

      {/* While an edge is moving, the block says what it has become. Reading it
          off the hour labels underneath is guesswork at this scale. */}
      {grabbing && (
        <span
          className={cn(
            "pointer-events-none absolute -top-6 z-30 whitespace-nowrap rounded-md border border-line",
            "bg-raised px-1.5 py-0.5 text-[11px] text-ink shadow-md tnum",
            grabbing === "start" ? "left-0" : "right-0",
          )}
        >
          {clock} · {formatDuration(length)}
        </span>
      )}
    </span>
  );
}
