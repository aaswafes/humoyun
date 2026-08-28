"use client";

import * as React from "react";
import { CalendarClock, Moon, Timer as TimerIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, focusMinutesOn, tasksOn } from "@/lib/store";
import { useNow } from "@/hooks/use-hotkeys";
import { formatClock, formatDuration, formatRange, formatTime } from "@/lib/date";
import { currentPrayer, prayerTimesFor } from "@/lib/prayer";
import { PRAYER_LABELS, type PrayerName } from "@/lib/types";

function Cell({
  icon: Icon, label, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 px-3.5 py-3">
      <Icon className="mt-[3px] size-4 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</p>
        <div className="mt-1.5">{children}</div>
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
      <p className="text-[13.5px] font-medium leading-tight text-ink">
        {PRAYER_LABELS[next]}
        <span className="ml-1.5 font-normal text-ink-3 tnum">{formatTime(nextAt, hour12)}</span>
      </p>
      <p className="mt-0.5 text-[12px] leading-tight text-ink-3 tnum">
        <span className="font-medium text-accent">{countdown(minutesUntil)}</span>
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
        <p className="text-[13.5px] font-medium leading-tight text-ink-3">
          {todayMinutes ? `${formatDuration(todayMinutes)} logged today` : "Nothing running"}
        </p>
        <button
          type="button"
          onClick={() => startTimer({ mode: "pomodoro", targetMinutes: 25, label: "Focus" })}
          className={cn(
            "mt-1 text-[12px] font-medium text-accent cursor-pointer rounded-sm",
            "transition-[opacity,transform] duration-150 ease-[var(--ease-out-apple)] hover:opacity-75 active:scale-[0.97]",
          )}
        >
          Start 25 minutes
        </button>
      </Cell>
    );
  }

  return (
    <Cell icon={TimerIcon} label="Focus">
      <p className="truncate text-[13.5px] font-medium leading-tight text-ink">
        {task?.title || timer.label || "Focus session"}
      </p>
      <p className="mt-0.5 text-[12px] leading-tight text-ink-3 tnum">
        <span className={cn("font-medium", timer.running ? "text-accent" : "text-warn")}>
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
        <p className="truncate text-[13.5px] font-medium leading-tight text-ink-3">
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
          "block w-full truncate text-left text-[13.5px] font-medium leading-tight text-ink rounded-sm",
          "cursor-pointer transition-opacity duration-150 hover:opacity-70",
        )}
      >
        {task.title || "Untitled"}
      </button>
      <p className="mt-0.5 truncate text-[12px] leading-tight text-ink-3 tnum">
        <span className="font-medium text-accent">
          {running ? `ends ${countdown(endsIn)}` : countdown(task.start_min! - minutesNow)}
        </span>
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
export function NowStrip({ date, now }: { date: string; now: number }) {
  const clock = new Date(now);
  const minutesNow = clock.getHours() * 60 + clock.getMinutes();

  return (
    <div className="surface grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <PrayerCell date={date} minutesNow={minutesNow} />
      <FocusCell date={date} />
      <NextTaskCell date={date} minutesNow={minutesNow} />
    </div>
  );
}
