"use client";

import * as React from "react";
import { Pause, Play, Square, Timer as TimerIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { useNow } from "@/hooks/use-hotkeys";
import { formatClock } from "@/lib/date";
import { cn } from "@/lib/cn";
import { Ring } from "@/components/ui/primitives";

/** Persistent floating pill showing the running focus session. */
export function TimerBar() {
  const timer = useStore((s) => s.timer);
  const tasks = useStore((s) => s.tasks);
  const pauseTimer = useStore((s) => s.pauseTimer);
  const resumeTimer = useStore((s) => s.resumeTimer);
  const stopTimer = useStore((s) => s.stopTimer);
  useNow(1000);

  const active = timer.running || timer.accumulated > 0;
  const seconds = timer.accumulated + (timer.running && timer.startedAt ? Math.floor((Date.now() - timer.startedAt) / 1000) : 0);
  const target = timer.targetMinutes * 60;
  const task = timer.taskId ? tasks.find((t) => t.id === timer.taskId) : null;
  const label = task?.title || timer.label || "Focus";
  const overrun = timer.mode === "pomodoro" && seconds >= target;

  // Chime once when a pomodoro completes.
  const chimed = React.useRef(false);
  React.useEffect(() => {
    if (timer.mode !== "pomodoro") { chimed.current = false; return; }
    if (overrun && !chimed.current) {
      chimed.current = true;
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
        osc.start(); osc.stop(ctx.currentTime + 0.95);
      } catch { /* audio blocked before a gesture */ }
    }
  }, [overrun, timer.mode]);

  if (!active) return null;

  return (
    <div
      className={cn(
        "fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full px-2 py-1.5 pr-3",
        "material border border-line shadow-lg anim-slide",
      )}
    >
      <Ring
        value={timer.mode === "pomodoro" ? Math.min(seconds, target) : seconds % 3600}
        max={timer.mode === "pomodoro" ? target : 3600}
        size={28}
        stroke={2.5}
      >
        <TimerIcon className="size-3 text-ink-3" />
      </Ring>

      <div className="min-w-0">
        <p className="max-w-[180px] truncate text-[12.5px] font-medium leading-tight text-ink">{label}</p>
        <p className={cn("text-[11px] leading-tight tnum", overrun ? "text-success" : "text-ink-3")}>
          {formatClock(seconds)}
          {timer.mode === "pomodoro" && ` / ${timer.targetMinutes}:00`}
        </p>
      </div>

      <div className="ml-1 flex items-center gap-0.5">
        <button
          onClick={() => (timer.running ? pauseTimer() : resumeTimer())}
          aria-label={timer.running ? "Pause" : "Resume"}
          className="grid size-7 place-items-center rounded-full text-ink-2 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
        >
          {timer.running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <button
          onClick={() => stopTimer(true)}
          aria-label="Stop and log"
          className="grid size-7 place-items-center rounded-full text-ink-2 hover:bg-danger-soft hover:text-danger cursor-pointer transition-colors"
        >
          <Square className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
