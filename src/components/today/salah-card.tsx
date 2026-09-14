"use client";

import * as React from "react";
import { Check, Clock, Flame, History, Moon, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, prayerStreak } from "@/lib/store";
import { formatDuration, formatTime } from "@/lib/date";
import { prayerLabel, prayerTimesFor } from "@/lib/prayer";
import { PRAYER_NAMES, type PrayerName, type PrayerStatus } from "@/lib/types";
import { Progress } from "@/components/ui/primitives";
import { RailCard, RailRow } from "./rail-card";

const STATUS_LABEL: Record<PrayerStatus, string> = {
  none: "not logged",
  prayed: "prayed",
  jamaah: "prayed in jamaah",
  late: "prayed late",
  qadha: "qadha",
  missed: "missed",
};

// The mark alone cannot say which green is which, so every logged state also
// says its name. Short enough to sit in a rail row; STATUS_LABEL spells it out
// in full for the tooltip and the screen reader.
const STATUS_WORD: Record<PrayerStatus, string> = {
  none: "",
  prayed: "Prayed",
  jamaah: "Jamaah",
  late: "Late",
  qadha: "Qadha",
  missed: "Missed",
};

const STATUS_ICON: Record<PrayerStatus, React.ComponentType<{ className?: string }> | null> = {
  none: null,
  prayed: Check,
  jamaah: Users,
  late: Clock,
  qadha: History,
  missed: X,
};

// Jamaah reads as the filled state — the strongest mark on the card.
const STATUS_DOT: Record<PrayerStatus, string> = {
  none: "border border-line-strong",
  prayed: "bg-success-soft text-success",
  jamaah: "bg-success text-canvas",
  late: "bg-warn-soft text-warn",
  qadha: "bg-warn-soft text-warn",
  missed: "bg-danger-soft text-danger",
};

const COUNTED: PrayerStatus[] = ["prayed", "jamaah", "late"];

interface Window { name: PrayerName; start: number; end: number }

export function SalahCard({ date, minutesNow }: { date: string; minutesNow: number }) {
  const prayers = useStore((s) => s.prayers);
  const profile = useStore((s) => s.profile);
  const hour12 = useStore((s) => s.hour12);
  const cyclePrayer = useStore((s) => s.cyclePrayer);

  const times = React.useMemo(
    () => prayerTimesFor(date, {
      latitude: profile?.latitude ?? 41.2995,
      longitude: profile?.longitude ?? 69.2401,
      method: profile?.calc_method ?? "MuslimWorldLeague",
      madhab: profile?.madhab ?? "hanafi",
    }),
    [date, profile?.latitude, profile?.longitude, profile?.calc_method, profile?.madhab],
  );

  // Each prayer holds the ground until the next one starts; isha runs to fajr.
  const windows: Window[] = React.useMemo(() => [
    { name: "fajr", start: times.fajr, end: times.sunrise },
    { name: "dhuhr", start: times.dhuhr, end: times.asr },
    { name: "asr", start: times.asr, end: times.maghrib },
    { name: "maghrib", start: times.maghrib, end: times.isha },
    { name: "isha", start: times.isha, end: times.fajr + 1440 },
  ], [times]);

  const active = windows.find((w) => minutesNow >= w.start && minutesNow < w.end) ?? null;
  const upcoming = windows.find((w) => w.start > minutesNow) ?? null;

  const today = prayers.filter((p) => p.date === date);
  const statusOf = (name: PrayerName) => today.find((p) => p.name === name)?.status ?? "none";
  const logged = today.filter((p) => COUNTED.includes(p.status)).length;
  const streak = prayerStreak(prayers, date);

  const activeLeft = active ? active.end - minutesNow : 0;
  const activeElapsed = active ? minutesNow - active.start : 0;
  const activeSpan = active ? active.end - active.start : 1;
  const closing = active ? activeLeft <= Math.max(15, activeSpan * 0.2) : false;
  const activeDone = active ? COUNTED.includes(statusOf(active.name)) : false;

  // The one line the section shows when it is folded — and the day's shape in it.
  const summary = [
    `${logged}/5`,
    active
      ? `${prayerLabel(active.name, date)} window, ${formatDuration(activeLeft)} left`
      : upcoming
        ? `${prayerLabel(upcoming.name, date)} at ${formatTime(upcoming.start, hour12)}`
        : "all five behind you",
  ].join(" · ");

  return (
    <RailCard
      icon={Moon}
      title="Salah"
      foldKey="rail.salah"
      defaultOpen
      summary={summary}
      href="/salah"
      hrefLabel="Open Salah"
      accessory={
        <span className="flex items-center gap-2">
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 tnum">
              <Flame className="size-3 text-ink-4" />
              {streak}
            </span>
          )}
          <span className="text-[11.5px] font-medium text-ink-3 tnum">{logged}/5</span>
        </span>
      }
      footer={
        active ? (
          <div>
            <p className="flex items-baseline justify-between gap-2 text-[12px] tnum">
              <span className="min-w-0 truncate text-ink-3">
                <span className="font-medium text-ink-2">{prayerLabel(active.name, date)}</span> window
                {activeDone ? " · prayed" : ""}
              </span>
              <span className={cn("shrink-0 font-medium", closing && !activeDone ? "text-warn" : "text-ink-3")}>
                {formatDuration(activeLeft)} left
              </span>
            </p>
            {/* Grey, not accent: the window filling up is context, not the page's one action. */}
            <Progress value={activeElapsed} max={activeSpan} tint="slate" height={3} className="mt-1.5" />
            <p className="mt-1 text-[11px] text-ink-4 tnum">
              closes {formatTime(active.end % 1440, hour12)}
              {upcoming ? ` · ${prayerLabel(upcoming.name, date)} next at ${formatTime(upcoming.start, hour12)}` : ""}
            </p>
          </div>
        ) : upcoming ? (
          <p className="flex items-baseline justify-between gap-2 text-[12px] tnum">
            <span className="truncate text-ink-3">
              Next · <span className="font-medium text-ink-2">{prayerLabel(upcoming.name, date)}</span>{" "}
              {formatTime(upcoming.start, hour12)}
            </span>
            <span className="shrink-0 font-medium text-ink-3">in {formatDuration(upcoming.start - minutesNow)}</span>
          </p>
        ) : (
          <p className="text-[12px] text-ink-3 tnum">
            Fajr opens {formatTime(times.fajr, hour12)} — the day is done.
          </p>
        )
      }
    >
      {PRAYER_NAMES.map((name) => {
        const status = statusOf(name);
        const at = times[name];
        const Icon = STATUS_ICON[status];
        const isNow = active?.name === name;
        const pending = status === "none" && at > minutesNow;
        const label = prayerLabel(name, date);

        return (
          <RailRow
            key={name}
            onClick={() => cyclePrayer(date, name)}
            title={`${label} — ${STATUS_LABEL[status]}. Tap to change.`}
            ariaLabel={
              `${label} at ${formatTime(at, hour12)} — ${STATUS_LABEL[status]}` +
              (isNow ? `, in its window with ${formatDuration(activeLeft)} left` : "") +
              ". Change status."
            }
            ariaPressed={COUNTED.includes(status)}
            className={cn(isNow && "bg-hover")}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-[18px] shrink-0 place-items-center rounded-full",
                "transition-[background-color,border-color] duration-150 ease-[var(--ease-out-apple)]",
                STATUS_DOT[status],
              )}
            >
              {Icon && <Icon className="size-2.5 stroke-[3]" />}
            </span>

            <span className={cn("min-w-0 flex-1 truncate text-[13px]", pending ? "text-ink-3" : "text-ink")}>
              {label}
            </span>

            {/* Quiet, but present: two greens that mean different things cannot
                both go unnamed. */}
            {status !== "none" && (
              <span
                className={cn(
                  "shrink-0 text-[11px]",
                  status === "jamaah" ? "font-medium text-success" : "text-ink-4",
                )}
              >
                {STATUS_WORD[status]}
              </span>
            )}

            {isNow && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-px text-[11px] font-medium",
                  status === "none" ? "bg-accent-soft text-accent" : "bg-hover text-ink-3",
                )}
              >
                now
              </span>
            )}

            <span className={cn("shrink-0 text-[12px] tnum", pending ? "text-ink-4" : "text-ink-3")}>
              {formatTime(at, hour12)}
            </span>
          </RailRow>
        );
      })}
    </RailCard>
  );
}
