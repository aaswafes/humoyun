"use client";

import * as React from "react";
import {
  ArrowRight, Coffee, NotebookPen, Pause, Play, Plus, SkipForward, Square, Undo2, Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatClock, formatDuration } from "@/lib/date";
import { Button, IconButton, Kbd } from "@/components/ui/primitives";
import { DialFace, type DialTone } from "./dial-face";
import { KindPicker } from "./kind-picker";
import { DamLine } from "./dam-line";
import { CyclePlan } from "./cycle-plan";
import { presetRhythm } from "./focus-prefs";
import type { FocusEngine, FocusSubject } from "./focus-engine";
import { UMR_META } from "@/lib/umr";

/** One line under the clock — the only thing on the dial that changes wording. */
function stateLine(engine: FocusEngine): string {
  const { phase, mode, paused, filled, setLength, longBreak, extra } = engine;
  if (phase === "wrap") return engine.last?.discarded ? "Too short to log" : "Block finished";
  if (phase === "return") return "Break over";
  if (phase === "break") return longBreak ? "Long break" : "Break";
  if (paused) return "Paused";
  if (phase === "focus") {
    if (mode === "stopwatch") return "Counting up";
    return `Block ${Math.min(setLength, filled + 1)} of ${setLength}${extra ? ` · +${extra} min` : ""}`;
  }
  return "Ready";
}

/** Ticks read as a scale, so they follow the block length rather than a constant. */
function tickCount(minutes: number, countdown: boolean): number {
  if (!countdown) return 12; // the stopwatch arc sweeps one hour
  if (minutes <= 12) return Math.max(2, Math.round(minutes));
  if (minutes <= 120) return Math.round(minutes / 5);
  return Math.round(minutes / 15);
}

export function FocusDial({
  engine, ambient, onEditLast,
}: {
  engine: FocusEngine;
  ambient?: boolean;
  onEditLast?: () => void;
}) {
  const {
    phase, mode, active, paused, running, progress, clockSeconds, preset,
    countdown, minutes, breakMinutes, interruptionCount, interruptions, last,
  } = engine;

  const clock = formatClock(clockSeconds);
  const size = ambient ? 340 : 268;
  const stroke = ambient ? 3 : 5;
  const long = clock.length > 5; // an hour or more needs a smaller face

  const tone: DialTone =
    phase === "break" || phase === "return" ? "break"
      : phase === "wrap" ? "done"
        : active ? "accent" : "muted";

  const targetSeconds = Math.max(1, minutes * 60);
  const marks = React.useMemo(
    () => (phase === "focus"
      ? interruptions.map((s) => (countdown ? s / targetSeconds : (s % 3600) / 3600))
      : []),
    [phase, interruptions, countdown, targetSeconds],
  );

  const dialLabel =
    phase === "idle"
      ? `Ready — ${mode === "stopwatch" ? "stopwatch" : `${minutes} minute block`}`
      : `${stateLine(engine)}, ${formatClock(clockSeconds)} ${countdown ? "remaining" : "elapsed"}`;

  // -------------------------------------------------------
  // What is set up, stated once in grey. The controls that change it — mode,
  // preset, automation — moved into the gear in the page header.
  const setupLine = mode === "stopwatch"
    ? "Stopwatch"
    : active
      ? `${minutes} min · ${preset.name}`
      : `${preset.name} · ${presetRhythm(preset)}`;

  const header = !ambient && (
    <div className="flex h-7 items-center justify-center gap-1.5">
      <span className="text-[12px] text-ink-4 tnum">{setupLine}</span>
      {active && countdown && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => engine.extend(5)}
          title="Add five minutes to this block"
        >
          <Plus className="size-3" />
          5 min
        </Button>
      )}
    </div>
  );

  // -------------------------------------------------------
  const controls = (
    <div
      className={cn(
        "flex flex-col items-center gap-3",
        ambient && "opacity-0 transition-opacity duration-300 focus-within:opacity-100 group-hover/dw:opacity-100",
      )}
    >
      {phase === "wrap" && last && (
        <p className="text-[13px] text-ink-3">
          {last.discarded
            ? "Under 20 seconds — nothing was logged."
            : `${formatDuration(last.minutes)} logged${kindLine(last.subject) ? ` on ${kindLine(last.subject)}` : ""}.`}
          {last.interruptions > 0 && (
            <span className="text-ink-4"> {last.interruptions} interruption{last.interruptions === 1 ? "" : "s"}.</span>
          )}
        </p>
      )}

      {phase === "return" && (
        <p className="text-[13px] text-ink-3">Rested. Pick the thread back up when you are ready.</p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {phase === "idle" && (
          <Button variant="primary" size="lg" onClick={() => engine.start()}>
            <Play className="size-4" />
            {mode === "pomodoro" ? `Start ${minutes} minutes` : "Start stopwatch"}
          </Button>
        )}

        {phase === "wrap" && (
          <>
            <Button variant="primary" size="lg" onClick={engine.beginBreak}>
              <Coffee className="size-4" />
              {engine.longNext ? "Long break" : "Break"} · {breakMinutes} min
            </Button>
            <Button variant="ghost" size="md" onClick={engine.skipBreak}>
              <SkipForward className="size-3.5" />
              Skip break
            </Button>
            {last?.sessionId && onEditLast && (
              <Button variant="ghost" size="md" onClick={onEditLast}>
                <NotebookPen className="size-3.5" />
                Add a note
              </Button>
            )}
          </>
        )}

        {phase === "return" && (
          <>
            <Button variant="primary" size="lg" onClick={() => engine.start()}>
              <ArrowRight className="size-4" />
              Back to focus
            </Button>
            <Button variant="ghost" size="md" onClick={engine.beginBreak}>
              <Coffee className="size-3.5" />
              A little longer
            </Button>
            <Button variant="ghost" size="md" onClick={engine.dismissWrap}>
              Done for now
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

            {phase === "break" ? (
              <>
                <Button variant="ghost" size="md" onClick={() => engine.start()}>
                  <ArrowRight className="size-3.5" />
                  Back to focus
                </Button>
                <Button variant="ghost" size="md" onClick={engine.endSession}>
                  <Square className="size-3.5" />
                  End break
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="md" onClick={engine.endSession}>
                <Square className="size-3.5" />
                Stop and log
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );

  // -------------------------------------------------------
  // A count of distractions is information, not an emergency, so it stays grey.
  const distraction = phase === "focus" && (
    <div
      className={cn(
        "flex items-center gap-1.5",
        ambient && "opacity-45 transition-opacity duration-300 focus-within:opacity-100 hover:opacity-100 group-hover/dw:opacity-100",
      )}
    >
      <button
        type="button"
        onClick={engine.logInterrupt}
        title="Log a distraction without stopping the clock"
        className={cn(
          "inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-[12.5px]",
          "transition-[background-color,color,border-color,transform] duration-150 ease-[var(--ease-out-apple)] active:scale-[0.97]",
          interruptionCount
            ? "border-transparent bg-hover text-ink-2"
            : "border-line text-ink-3 hover:border-line-strong hover:text-ink",
        )}
      >
        <Zap className="size-3.5" aria-hidden />
        <span>Distracted</span>
        <span className="tnum font-medium">{interruptionCount}</span>
        <Kbd className="ml-0.5">X</Kbd>
      </button>

      {interruptionCount > 0 && (
        <IconButton label="Undo the last distraction" size="md" onClick={engine.undoInterrupt}>
          <Undo2 />
        </IconButton>
      )}
    </div>
  );

  // -------------------------------------------------------
  return (
    <div className="flex flex-col items-center">
      {header}

      <DialFace
        size={size}
        stroke={stroke}
        progress={phase === "wrap" ? 1 : progress}
        tone={tone}
        ticks={tickCount(minutes, countdown)}
        marks={marks}
        dimmed={paused}
        breathing={ambient && engine.prefs.ambient}
        label={dialLabel}
        className={cn(!ambient && "mt-5", phase === "wrap" && "anim-check")}
      >
        <div className="flex flex-col items-center gap-2">
          <span
            className={cn(
              "display-serif tnum leading-none",
              ambient ? "text-[64px]" : "text-[44px]",
              long && "tracking-[-0.03em]",
              paused ? "text-ink-3" : ambient ? "text-ink-2" : "text-ink",
            )}
          >
            {clock}
          </span>
          <span
            aria-live="polite"
            className={cn("max-w-[200px] truncate text-[12px] tnum", ambient ? "text-ink-4" : "text-ink-3")}
          >
            {stateLine(engine)}
          </span>
        </div>
      </DialFace>

      <div className="mt-5 flex flex-col items-center gap-2">
        {ambient ? (
          <span className="max-w-[300px] truncate text-[13px] text-ink-3">
            {kindLine(engine.subject) || "Open focus"}
          </span>
        ) : (
          <>
            <KindPicker value={engine.subject} onChange={engine.setSubject} locked={active} />
            {/* The cap earns a line here, where it can still change the choice —
                not on a stats page read afterwards. */}
            {engine.subject.umr.includes("dam") && <DamLine />}
          </>
        )}
      </div>

      <div className="mt-5">{controls}</div>
      {distraction && <div className="mt-4">{distraction}</div>}

      {/* The set only earns its space once a set is under way. Until then the
          plan is stated in the gear, next to the preset it belongs to. */}
      {(mode === "pomodoro" || engine.onBreak) && (phase !== "idle" || engine.cycles > 0) && (
        <div className="mt-6">
          <CyclePlan engine={engine} muted={ambient} />
        </div>
      )}
    </div>
  );
}

/** "Taʼlim · Chemistry", or whichever half of that exists. */
function kindLine(subject: FocusSubject): string {
  const kinds = subject.umr.map((c) => UMR_META[c].label).join(" + ");
  const what = subject.label.trim();
  return [kinds, what].filter(Boolean).join(" · ");
}
