"use client";

import { Play, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, focusMinutesOn } from "@/lib/store";
import { formatDuration, toISO } from "@/lib/date";
import { RailCard } from "./rail-card";

export function FocusCard({ date }: { date: string }) {
  const focusSessions = useStore((s) => s.focusSessions);
  const timer = useStore((s) => s.timer);
  const startTimer = useStore((s) => s.startTimer);

  const today = focusSessions.filter((s) => toISO(new Date(s.started_at)) === date);
  const minutes = focusMinutesOn(focusSessions, date);
  const longest = today.reduce((max, s) => Math.max(max, s.seconds), 0);
  const active = timer.running || timer.accumulated > 0;

  return (
    <RailCard
      icon={Timer}
      title="Focus today"
      href="/focus"
      hrefLabel="Open Focus"
      accessory={
        longest > 0 ? (
          <span className="text-[11.5px] text-ink-3 tnum">best {formatDuration(Math.round(longest / 60))}</span>
        ) : undefined
      }
    >
      <div className="flex items-end gap-3 px-2 pb-2 pt-1.5">
        <span className="display-serif tnum select-none text-[44px] leading-[0.78] text-ink">{minutes}</span>
        <div className="pb-[3px]">
          <p className="text-[12.5px] leading-tight text-ink-2">minutes focused</p>
          <p className="text-[11.5px] leading-tight text-ink-3 tnum">
            {today.length ? `${today.length} session${today.length === 1 ? "" : "s"}` : "no sessions yet"}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={active}
        onClick={() => startTimer({ mode: "pomodoro", targetMinutes: 25, label: "Focus" })}
        className={cn(
          "flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-hover text-[12.5px] font-medium text-ink",
          "cursor-pointer transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
          "hover:bg-active active:scale-[0.98]",
          "disabled:pointer-events-none disabled:bg-transparent disabled:text-ink-3",
        )}
      >
        {active ? (
          "Session in progress"
        ) : (
          <>
            <Play className="size-3" />
            Start 25 minutes
          </>
        )}
      </button>
    </RailCard>
  );
}
