"use client";

import * as React from "react";
import { Check, Clock, Minus, RotateCcw, UsersRound } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PrayerStatus } from "@/lib/types";

/** The states `cyclePrayer` walks through, in the order it walks them. */
export const PRAYER_CYCLE: PrayerStatus[] = ["none", "prayed", "jamaah", "qadha"];

/** Statuses that count as dealt with. Qadha is handled, not a failure. */
export const HANDLED_STATUSES: PrayerStatus[] = ["prayed", "jamaah", "late", "qadha"];

interface StateStyle {
  label: string;
  meaning: string;
  icon: React.ComponentType<{ className?: string }> | null;
  /** the round marker in the today card */
  chip: string;
  /** the word beneath the prayer name */
  text: string;
}

export const PRAYER_STATE: Record<PrayerStatus, StateStyle> = {
  none: {
    label: "Not marked",
    meaning: "Nothing recorded yet",
    icon: null,
    chip: "border border-dashed border-line-strong text-ink-4",
    text: "text-ink-4",
  },
  prayed: {
    label: "Prayed",
    meaning: "Prayed on time",
    icon: Check,
    chip: "bg-accent-soft text-accent",
    text: "text-accent",
  },
  jamaah: {
    label: "Jamaah",
    meaning: "Prayed in congregation",
    icon: UsersRound,
    chip: "bg-success-soft text-success",
    text: "text-success",
  },
  qadha: {
    label: "Qadha",
    meaning: "Made up afterwards",
    icon: RotateCcw,
    chip: "bg-warn-soft text-warn",
    text: "text-warn",
  },
  late: {
    label: "Late",
    meaning: "Prayed near the end of its window",
    icon: Clock,
    chip: "bg-warn-soft text-warn",
    text: "text-warn",
  },
  missed: {
    label: "Missed",
    meaning: "Not prayed and not yet made up",
    icon: Minus,
    chip: "bg-hover text-ink-3",
    text: "text-ink-3",
  },
};

/** 22px round marker — icon carries the state, colour only reinforces it. */
export function StateMark({ status, className }: { status: PrayerStatus; className?: string }) {
  const state = PRAYER_STATE[status];
  const Icon = state.icon;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[22px] shrink-0 place-items-center rounded-full",
        "transition-[background-color,color,border-color] duration-200 ease-[var(--ease-out-apple)]",
        state.chip,
        className,
      )}
    >
      {Icon && <Icon className="size-3 stroke-[2.75]" />}
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

export function StateLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1.5", className)}>
      {PRAYER_CYCLE.map((status) => (
        <li key={status} className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <StateDot status={status} />
          <span title={PRAYER_STATE[status].meaning}>{PRAYER_STATE[status].label}</span>
        </li>
      ))}
    </ul>
  );
}
