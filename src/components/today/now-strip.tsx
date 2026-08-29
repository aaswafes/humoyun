"use client";

import * as React from "react";
import { CalendarClock, Moon, Timer as TimerIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, focusMinutesOn, tasksOn } from "@/lib/store";
import { useNow } from "@/hooks/use-hotkeys";
import { formatClock, formatDuration, formatRange, formatTime } from "@/lib/date";
import { currentPrayer, prayerTimesFor } from "@/lib/prayer";
import { VisuallyHidden } from "@/components/ui/form";
import { PRAYER_LABELS, type PrayerName } from "@/lib/types";

/**
 * One cell of the status line. The uppercase label is gone from the surface —
 * the content names itself — but it stays for screen readers, which cannot see
 * that a moon means prayer.
 */
function Cell({
  icon: Icon, label, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 py-2.5 sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <Icon className="mt-[3px] size-3.5 shrink-0 text-ink-4" />
      <div className="min-w-0 flex-1">
        <VisuallyHidden>{label}</VisuallyHidden>
        {children}
      </div>
    </div>
  );
}

const countdown = (minutes: number) => (minutes < 1 ? "now" : `in ${formatDuration(minutes)}`);

// ---------------------------------------------------------
// Prayer
// ---------------------------------------------------------
function PrayerCell({ date, minutesNow }: { date: string; minutesNow: number }) {
  const profile = useStore((s) => s.profile);
  const hour12 = useStore((s) => s.hour12);

  const times = React.useMemo(
    () => prayerTimesFor(date, {
      latitude: profile?.latitude ?? 41.2995,
      longitude: profile?.longitude ?? 69.2401,
      method: profile?.calc_method ?? "MuslimWorldLeague",
      madhab: profile?.madhab ?? "hanafi",
    }),
    [date, profile?.latitude, profile?.longitude, profile?.calc_method, profile?.madhab],
  );

  const { current, next, nextAt, minutesUntil } = currentPrayer(times, minutesNow);
  const currentLabel =
    current === "sunrise" ? "Sunrise" : current === "night" ? null : PRAYER_LABELS[current as PrayerName];

  return (
    <Cell icon={Moon} label="Next prayer">
      <p className="text-[13px] leading-tight text-ink">
        {PRAYER_LABELS[next]}
        <span className="ml-1.5 text-ink-3 tnum">{formatTime(nextAt, hour12)}</span>
      </p>
      <p className="mt-0.5 text-[12px] leading-tight text-ink-3 tnum">
        {countdown(minutesUntil)}
        {currentLabel && <span> · {currentLabel} now</span>}
      </p>
    </Cell>
  );
}

// ---------------------------------------------------------
// Focus — its own second-resolution clock so the digits move
// ---------------------------------------------------------
function FocusCell({ date }: { date: string }) {
  const timer = useStore((s) => s.timer);
  const tasks = useStore((s) => s.tasks);
  const focusSessions = useStore((s) => s.focusSessions);
  const startTimer = useStore((s) => s.startTimer);
  const tick = useNow(1000);

  const active = timer.running || timer.accumulated > 0;
  const seconds =
    timer.accumulated + (timer.running && timer.startedAt ? Math.floor((tick - timer.startedAt) / 1000) : 0);
  const task = timer.taskId ? tasks.find((t) => t.id === timer.taskId) : null;
  const todayMinutes = focusMinutesOn(focusSessions, date);

  if (!active) {
    return (
      <Cell icon={TimerIcon} label="Focus">
        <p className="text-[13px] leading-tight text-ink-2">
          {todayMinutes ? `${formatDuration(todayMinutes)} logged today` : "Nothing running"}
        </p>
        <button
          type="button"
          onClick={() => startTimer({ mode: "pomodoro", targetMinutes: 25, label: "Focus" })}
          className={cn(
            "mt-0.5 text-[12px] text-ink-3 cursor-pointer rounded-sm",
            "transition-[color,transform] duration-150 ease-[var(--ease-out-apple)] hover:text-ink active:scale-[0.97]",
          )}
        >
          Start 25 minutes
        </button>
      </Cell>
    );
  }

  return (
    <Cell icon={TimerIcon} label="Focus">
      <p className="truncate text-[13px] leading-tight text-ink">
        {task?.title || timer.label || "Focus session"}
      </p>
      <p className="mt-0.5 text-[12px] leading-tight text-ink-3 tnum">
        {/* A running clock is the one live thing here, so it keeps the accent. */}
        <span className={cn("font-medium", timer.running ? "text-accent" : "text-ink-2")}>
          {formatClock(seconds)}
        </span>
        <span> · {timer.running ? "running" : "paused"}</span>
        {todayMinutes > 0 && <span> · {formatDuration(todayMinutes)} today</span>}
      </p>
    </Cell>
  );
}

// ---------------------------------------------------------
// Next timed task
// ---------------------------------------------------------
function NextTaskCell({ date, minutesNow }: { date: string; minutesNow: number }) {
  const tasks = useStore((s) => s.tasks);
  const hour12 = useStore((s) => s.hour12);
  const openInspector = useStore((s) => s.openInspector);

  const today = tasksOn(tasks, date).filter((t) => t.status !== "done" && t.status !== "dropped");
  const timed = today.filter((t) => t.start_min != null);

  // A block you are inside right now beats one that has not started.
  const running = timed.find((t) => t.start_min! <= minutesNow && (t.end_min ?? t.start_min!) > minutesNow);
  const upcoming = timed.find((t) => t.start_min! > minutesNow);
  const task = running ?? upcoming;

  if (!task) {
    const open = today.length;
    const first = today[0];
    return (
      <Cell icon={CalendarClock} label="Next up">
        <p className="truncate text-[13px] leading-tight text-ink-2">
          {first ? first.title || "Untitled" : "Nothing timed left"}
        </p>
        <p className="mt-0.5 text-[12px] leading-tight text-ink-3 tnum">
          {open ? `${open} anytime task${open === 1 ? "" : "s"} open · no time set` : "The rest of the day is clear"}
        </p>
      </Cell>
    );
  }

  const endsIn = (task.end_min ?? task.start_min!) - minutesNow;
  // What the running block hands over to — the reason to look at this cell twice.
  const then = timed.find((t) => t.id !== task.id && t.start_min! > minutesNow);

  return (
    <Cell icon={CalendarClock} label="Next up">
      <button
        type="button"
        onClick={() => openInspector(task.id)}
        className={cn(
          "block w-full truncate text-left text-[13px] leading-tight text-ink rounded-sm",
          "cursor-pointer transition-opacity duration-150 hover:opacity-70",
        )}
      >
        {task.title || "Untitled"}
      </button>
      <p className="mt-0.5 truncate text-[12px] leading-tight text-ink-3 tnum">
        {running ? `ends ${countdown(endsIn)}` : countdown(task.start_min! - minutesNow)}
        <span> · {formatRange(task.start_min, task.end_min, hour12)}</span>
      </p>
      {then && (
        <p className="mt-0.5 truncate text-[11.5px] leading-tight text-ink-4 tnum">
          then {formatTime(then.start_min, hour12)} · {then.title || "Untitled"}
        </p>
      )}
    </Cell>
  );
}

// ---------------------------------------------------------
/**
 * Three facts on one line: what is next in prayer, in focus, and on the clock.
 * It used to be three bordered cards; hairlines say the same thing with none
 * of the weight.
 */
export function NowStrip({ date, now }: { date: string; now: number }) {
  const clock = new Date(now);
  const minutesNow = clock.getHours() * 60 + clock.getMinutes();

  return (
    <div className="grid grid-cols-1 divide-y divide-line border-y border-line py-1 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <PrayerCell date={date} minutesNow={minutesNow} />
      <FocusCell date={date} />
      <NextTaskCell date={date} minutesNow={minutesNow} />
    </div>
  );
}
