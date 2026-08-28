"use client";

import { useNow } from "@/hooks/use-hotkeys";
import { formatClock, formatDuration } from "@/lib/date";
import { PRAYER_LABELS, type PrayerName } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Seconds from now until a minute-of-day, rolling over midnight. */
export function useSecondsUntil(minuteOfDay: number): number {
  const now = useNow(1000);
  const d = new Date(now);
  const nowSec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  const target = minuteOfDay * 60;
  return target > nowSec ? target - nowSec : target + 86400 - nowSec;
}

/** Inside an hour the seconds matter; beyond it they are only noise. */
export function formatCountdown(seconds: number): string {
  return seconds >= 3600 ? formatDuration(Math.ceil(seconds / 60)) : formatClock(seconds);
}

export function Countdown({ at, className }: { at: number; className?: string }) {
  const seconds = useSecondsUntil(at);
  return <span className={cn("tnum", className)}>{formatCountdown(seconds)}</span>;
}

/** Lives in the sticky page header so the next prayer stays visible while scrolling. */
export function NextPrayerSubtitle({ name, at }: { name: PrayerName; at: number }) {
  const seconds = useSecondsUntil(at);
  return (
    <span className="tnum">
      {PRAYER_LABELS[name]} in {formatCountdown(seconds)}
    </span>
  );
}
