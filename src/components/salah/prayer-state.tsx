"use client";

import * as React from "react";
import { Check, Clock, Minus, RotateCcw, UsersRound } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PrayerStatus } from "@/lib/types";
import { HANDLED } from "./salah-stats";

/** The states `cyclePrayer` walks through, in the order it walks them. */
export const PRAYER_CYCLE: PrayerStatus[] = ["none", "prayed", "jamaah", "qadha"];

/** Everything that can be set by hand, including the two the cycle skips. */
export const ALL_STATUSES: PrayerStatus[] = ["none", "jamaah", "prayed", "late", "qadha", "missed"];

/** Statuses that count as dealt with. Qadha is handled, not a failure. */
export const HANDLED_STATUSES: PrayerStatus[] = HANDLED;

interface StateStyle {
  label: string;
  meaning: string;
  icon: React.ComponentType<{ className?: string }> | null;
  /** the round marker in the today card */
  chip: string;
  /** the word beneath the prayer name */
  text: string;
  /** the fill in a stacked composition bar */
  bar: string;
}

export const PRAYER_STATE: Record<PrayerStatus, StateStyle> = {
  none: {
    label: "Not marked",
    meaning: "Nothing recorded yet",
    icon: null,
    chip: "border border-dashed border-line-strong text-ink-4",
    text: "text-ink-4",
    bar: "bg-line",
  },
  prayed: {
    label: "Prayed",
    meaning: "Prayed on time, alone",
    icon: Check,
    chip: "bg-accent-soft text-accent",
    // The mark carries the state; the word under the name is only support.
    text: "text-ink-3",
    bar: "bg-accent",
  },
  jamaah: {
    label: "Jamaah",
    meaning: "Prayed in congregation",
    icon: UsersRound,
    chip: "bg-success-soft text-success",
    text: "text-success",
    bar: "bg-success",
  },
  qadha: {
    // Made up afterwards is handled, not a failure — so it is not amber
    // anywhere the user reads their own day. The chart keeps its own fill.
    label: "Qadha",
    meaning: "Made up afterwards",
    icon: RotateCcw,
    chip: "bg-hover text-ink-2",
    text: "text-ink-3",
    bar: "bg-warn",
  },
  late: {
    label: "Late",
    meaning: "Prayed near the end of its window",
    icon: Clock,
    chip: "bg-hover text-ink-2",
    text: "text-ink-3",
    bar: "bg-accent-soft",
  },
  missed: {
    label: "Missed",
    meaning: "Not prayed and not yet made up",
    icon: Minus,
    chip: "bg-hover text-ink-3",
    text: "text-ink-3",
    // Firmly darker than `none`'s hairline fill — two greys side by side in a
    // stacked bar is exactly the trap that makes one unreadable.
    bar: "bg-ink-3",
  },
};

/** 22px round marker — icon carries the state, colour only reinforces it. */
export function StateMark({
  status, className, size = 22,
}: {
  status: PrayerStatus;
  className?: string;
  size?: number;
}) {
  const state = PRAYER_STATE[status];
  const Icon = state.icon;
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        "transition-[background-color,color,border-color] duration-200 ease-[var(--ease-out-apple)]",
        state.chip,
        className,
      )}
    >
      {Icon && <Icon className={cn(size >= 22 ? "size-3" : "size-2.5", "stroke-[2.75]")} />}
    </span>
  );
}

/**
 * Month-grid dot. Each state gets its own silhouette — ring, disc, ringed disc,
 * diamond — so the grid still reads without colour.
 */
export function StateDot({ status, dim }: { status: PrayerStatus; dim?: boolean }) {
  const base = cn("block shrink-0", dim && "opacity-35");

  switch (status) {
    case "prayed":
      return <span aria-hidden className={cn(base, "size-[7px] rounded-full bg-accent")} />;
    case "jamaah":
      return (
        <span aria-hidden className={cn(base, "grid size-[11px] place-items-center rounded-full border border-success")}>
          <span className="size-[4px] rounded-full bg-success" />
        </span>
      );
    case "qadha":
      return <span aria-hidden className={cn(base, "size-[7px] rotate-45 rounded-[1.5px] bg-warn")} />;
    case "late":
      return <span aria-hidden className={cn(base, "size-[7px] rounded-full bg-warn")} />;
    case "missed":
      return <span aria-hidden className={cn(base, "size-[7px] rounded-full border border-dashed border-ink-3")} />;
    default:
      return <span aria-hidden className={cn(base, "size-[7px] rounded-full border border-line-strong")} />;
  }
}

export function StateLegend({
  className, statuses = PRAYER_CYCLE,
}: {
  className?: string;
  statuses?: PrayerStatus[];
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1.5", className)}>
      {statuses.map((status) => (
        <li key={status} className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <StateDot status={status} />
          <span title={PRAYER_STATE[status].meaning}>{PRAYER_STATE[status].label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Every state, set directly. The tap-to-cycle shortcut only walks four of
 * them; Late and Missed need somewhere honest to live.
 */
export function StatusPicker({
  status, onPick, label, className,
}: {
  status: PrayerStatus;
  onPick: (next: PrayerStatus) => void;
  /** Prayer name, so each button reads as a full sentence to a screen reader. */
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={`${label} status`} className={cn("flex flex-wrap gap-1", className)}>
      {ALL_STATUSES.map((option) => {
        const state = PRAYER_STATE[option];
        const active = option === status;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(option)}
            title={state.meaning}
            className={cn(
              "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2 text-[11.5px] font-medium",
              "transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out-apple)]",
              "active:scale-[0.97]",
              active
                ? "border-transparent bg-selected text-ink"
                : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
            )}
          >
            <StateMark status={option} size={16} />
            {state.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A 100% stacked bar of statuses. The bar is decoration — the numbers it
 * stands for are always spelled out beside it by `CompositionLegend`.
 */
export function CompositionBar({
  counts, order, className, height = 8,
}: {
  counts: Record<PrayerStatus, number>;
  order: PrayerStatus[];
  className?: string;
  height?: number;
}) {
  const total = order.reduce((sum, key) => sum + counts[key], 0);
  if (!total) {
    return <div className={cn("w-full rounded-full bg-hover", className)} style={{ height }} aria-hidden />;
  }
  return (
    <div
      aria-hidden
      className={cn("flex w-full gap-px overflow-hidden rounded-full bg-hover", className)}
      style={{ height }}
    >
      {order.map((key) => {
        const value = counts[key];
        if (!value) return null;
        return (
          <div
            key={key}
            title={`${PRAYER_STATE[key].label}: ${value}`}
            className={PRAYER_STATE[key].bar}
            style={{ width: `${(value / total) * 100}%` }}
          />
        );
      })}
    </div>
  );
}

/** The bar in words: silhouette, name, count. Never colour on its own. */
export function CompositionLegend({
  counts, order, className,
}: {
  counts: Record<PrayerStatus, number>;
  order: PrayerStatus[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {order.map((key) => (
        <li key={key} className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
          <StateDot status={key} />
          <span>{PRAYER_STATE[key].label}</span>
          <span className="tnum font-medium text-ink-2">{counts[key]}</span>
        </li>
      ))}
    </ul>
  );
}
