"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import type { FocusEngine } from "./focus-engine";

/**
 * The set laid out end to end: one bar per focus block, a dot for each short
 * break, and the long break at the end. It answers "how much further" without
 * counting anything.
 */
export function CyclePlan({ engine, muted }: { engine: FocusEngine; muted?: boolean }) {
  const { filled, setLength, preset, onBreak, longBreak, active, longNext, cycles } = engine;
  const current = active && !onBreak ? filled : -1;

  const caption = longNext
    ? `Set complete — ${preset.long} minute break next`
    : onBreak
      ? longBreak
        ? `Long break · ${preset.long} min`
        : `Break ${filled} of ${setLength} · ${preset.short} min`
      : `${filled} of ${setLength} blocks before a long break`;

  return (
    <div className={cn("flex flex-col items-center gap-2", muted && "opacity-45")}>
      <div className="flex items-center gap-1" aria-hidden>
        {Array.from({ length: setLength }, (_, i) => (
          <React.Fragment key={i}>
            <span
              className={cn(
                "h-1.5 rounded-full transition-[background-color,width] duration-300 ease-[var(--ease-out-apple)]",
                i === current ? "w-9" : "w-6",
                i < filled ? "bg-accent" : i === current ? "bg-accent-line" : "bg-line-strong",
              )}
            />
            {i < setLength - 1 && (
              <span
                className={cn(
                  "size-1 rounded-full transition-colors duration-300",
                  i < filled ? "bg-accent-line" : "bg-line",
                )}
              />
            )}
          </React.Fragment>
        ))}
        <span
          className={cn(
            "ml-1 h-1.5 w-4 rounded-full transition-colors duration-300",
            longNext || (onBreak && longBreak) ? "bg-success" : "bg-line",
          )}
        />
      </div>

      <p className="text-[11.5px] text-ink-3 tnum">
        {caption}
        {cycles > setLength && <span className="text-ink-4"> · {cycles} today</span>}
      </p>
    </div>
  );
}
