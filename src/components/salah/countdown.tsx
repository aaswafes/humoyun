"use client";

import { useNow } from "@/hooks/use-hotkeys";
import { formatClock, formatDuration } from "@/lib/date";
import { PRAYER_LABELS, type PrayerName } from "@/lib/types";
import { cn } from "@/lib/cn";
import type { NextPrayer, OpenWindow } from "./windows";

function secondsOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/** Seconds from now until a minute-of-day, rolling over midnight. */
export function useSecondsUntil(minuteOfDay: number): number {
  const nowSec = secondsOfDay(useNow(1000));
  const target = minuteOfDay * 60;
  return target > nowSec ? target - nowSec : target + 86400 - nowSec;
}

/**
 * Seconds until a minute already anchored to today's midnight — so tomorrow's
 * Fajr (1440+) and last night's Isha (negative) both work. Never rolls over:
 * a window that has closed reads zero rather than jumping a whole day.
 */
export function useSecondsUntilAnchored(anchoredMinute: number): number {
  const nowSec = secondsOfDay(useNow(1000));
  return Math.max(0, Math.round(anchoredMinute * 60 - nowSec));
}

/** Inside an hour the seconds matter; beyond it they are only noise. */
export function formatCountdown(seconds: number): string {
  return seconds >= 3600 ? formatDuration(Math.ceil(seconds / 60)) : formatClock(seconds);
}

export function Countdown({ at, className }: { at: number; className?: string }) {
  const seconds = useSecondsUntil(at);
  return <span className={cn("tnum", className)}>{formatCountdown(seconds)}</span>;
}

/** The number that actually matters: how much of the open window is left. */
export function WindowCountdown({ end, className }: { end: number; className?: string }) {
  const seconds = useSecondsUntilAnchored(end);
  return <span className={cn("tnum", className)}>{formatCountdown(seconds)}</span>;
}

/** True once the open window has less than `minutes` left. */
export function useWindowUrgent(end: number, minutes = 20): boolean {
  return useSecondsUntilAnchored(end) <= minutes * 60;
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

/**
 * The sticky header carries the number the card is not already showing.
 * The card's hero is the open window, so this is what comes next — until the
 * window is nearly out, when the closing time is the thing worth following
 * down the page.
 */
export function HeaderStatus({ open, next }: { open: OpenWindow | null; next: NextPrayer }) {
  // Between Isha closing and Fajr there is no open window, so the hook still has
  // to run — it just has nothing to be urgent about.
  const windowUrgent = useWindowUrgent(open?.window.end ?? -1, 20);
  const urgent = open ? windowUrgent : false;
  return (
    <span className="tnum">
      {urgent && open ? (
        <>
          {PRAYER_LABELS[open.name]} closes in <WindowCountdown end={open.window.end} />
        </>
      ) : (
        <>
          {PRAYER_LABELS[next.name]} in <Countdown at={next.at % 1440} />
        </>
      )}
    </span>
  );
}
