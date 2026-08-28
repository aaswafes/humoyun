"use client";

import * as React from "react";
import { Coffee, Pause, Play, Square, SkipForward } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatClock, formatDuration } from "@/lib/date";
import type { Tint } from "@/lib/types";
import { Button, Ring, Segmented } from "@/components/ui/primitives";
import { SubjectPicker } from "./subject-picker";
import { FOCUS_PRESETS, SET_LENGTH, type FocusEngine, type FocusMode } from "./focus-engine";

/** One line under the clock — the only thing on the dial that changes wording. */
function stateLine(engine: FocusEngine): string {
  const { phase, mode, minutes, paused, filled, longNext } = engine;
  if (phase === "prompt") return "Session logged";
  if (phase === "break") return longNext ? "Long break" : "Break";
  if (paused) return "Paused";
  if (mode === "stopwatch") return phase === "focus" ? "Counting up" : "Stopwatch";
  if (phase === "focus") return `Pomodoro ${Math.min(SET_LENGTH, filled + 1)} of ${SET_LENGTH}`;
  return `${minutes} min pomodoro`;
}

export function FocusDial({ engine, ambient }: { engine: FocusEngine; ambient?: boolean }) {
  const { phase, mode, active, paused, running, progress, clockSeconds, preset, longNext, filled } = engine;

  const clock = formatClock(clockSeconds);
  const long = clock.length > 5; // an hour or more needs a smaller face
  const size = ambient ? 312 : 264;
  const stroke = ambient ? 4 : 6;
  const tint: Tint | null = ambient ? "slate" : phase === "break" || phase === "prompt" ? "emerald" : null;
  const breakMinutes = longNext ? preset.long : preset.short;

  const controls = (
    <div
      className={cn(
        "flex flex-col items-center gap-3",
        ambient && "opacity-0 transition-opacity duration-300 focus-within:opacity-100 group-hover/dw:opacity-100",
      )}
    >
      {phase === "prompt" && (
        <p className="text-[13px] text-ink-2">
          {formatDuration(engine.loggedMinutes ?? 0)} logged
          {engine.subject.label ? ` on ${engine.subject.label}` : ""}.
        </p>
      )}

      <div className="flex items-center gap-2">
        {phase === "idle" && (
          <Button variant="primary" size="lg" onClick={() => engine.start()}>
            <Play className="size-4" />
            {mode === "pomodoro" ? `Start ${engine.minutes} minutes` : "Start stopwatch"}
          </Button>
        )}

        {phase === "prompt" && (
          <>
            <Button variant="primary" size="lg" onClick={engine.beginBreak}>
              <Coffee className="size-4" />
              {longNext ? "Long break" : "Break"} · {breakMinutes} min
            </Button>
            <Button variant="ghost" size="md" onClick={engine.skipBreak}>
              <SkipForward className="size-3.5" />
              Skip
            </Button>
          </>
        )}

        {active && (
          <>
            <Button
              variant={running ? "secondary" : "primary"}
              size="lg"
              onClick={() => (running ? engine.pause() : engine.resume())}
            >
              {running ? <Pause className="size-4" /> : <Play className="size-4" />}
              {running ? "Pause" : "Resume"}
            </Button>
            <Button variant="ghost" size="md" onClick={engine.endSession}>
              <Square className="size-3.5" />
              {phase === "break" ? "End break" : "End session"}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  const dots = mode === "pomodoro" && (
    <div className={cn("flex flex-col items-center gap-2", ambient && "opacity-45")}>
      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: SET_LENGTH }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 rounded-full transition-colors duration-200",
              i < filled ? "bg-accent" : "bg-line-strong",
            )}
          />
        ))}
      </div>
      <p className="text-[11.5px] text-ink-3 tnum">
        {longNext
          ? "Set complete — long break next"
          : `${filled} of ${SET_LENGTH} before a long break`}
      </p>
    </div>
  );

  return (
    <div className="flex flex-col items-center">
      {!ambient && (
        <div className="flex h-7 items-center justify-center gap-2">
          {active ? (
            <span className="text-[12px] text-ink-3">
              {mode === "pomodoro" ? `${engine.minutes} minute pomodoro` : "Stopwatch"}
            </span>
          ) : (
            <>
              <Segmented<FocusMode>
                size="sm"
                value={mode}
                onChange={engine.setMode}
                options={[
                  { value: "pomodoro", label: "Pomodoro" },
                  { value: "stopwatch", label: "Stopwatch" },
                ]}
              />
              {mode === "pomodoro" && (
                <Segmented<string>
                  size="sm"
                  value={String(engine.minutes)}
                  onChange={(v) => engine.setMinutes(Number(v))}
                  options={FOCUS_PRESETS.map((p) => ({
                    value: String(p.focus),
                    label: <span className="tnum">{p.focus}</span>,
                    title: `${p.focus} minute pomodoro`,
                  }))}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* The ring's sweep is a CSS transition, so reduced motion is handled globally. */}
      <Ring
        value={progress}
        max={1}
        size={size}
        stroke={stroke}
        tint={tint}
        className={cn(!ambient && "mt-8", phase === "prompt" && "anim-check")}
      >
        <div className="flex flex-col items-center gap-2">
          <span
            className={cn(
              "display-serif tnum leading-none",
              ambient
                ? long ? "text-[56px] text-ink-3" : "text-[72px] text-ink-3"
                : long ? "text-[46px]" : "text-[58px]",
              !ambient && (paused ? "text-ink-3" : "text-ink"),
            )}
          >
            {clock}
          </span>
          <span
            aria-live="polite"
            className={cn(
              "max-w-[190px] truncate text-[11px] font-semibold uppercase tracking-[0.06em]",
              ambient ? "text-ink-4" : "text-ink-3",
            )}
          >
            {stateLine(engine)}
          </span>
        </div>
      </Ring>

      <div className="mt-7 flex justify-center">
        {ambient ? (
          <span className="max-w-[280px] truncate text-[12.5px] text-ink-4">
            {engine.subject.label || "Open focus"}
          </span>
        ) : (
          <SubjectPicker
            value={engine.subject}
            onChange={engine.setSubject}
            locked={active}
          />
        )}
      </div>

      <div className="mt-6">{controls}</div>
      {dots && <div className="mt-7">{dots}</div>}
    </div>
  );
}
