"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// =========================================================
// A range input, dressed in the app's tokens.
//
// It is a real <input type="range">, so the keyboard, the screen reader and
// the touch target all come free — only the paint is ours. The filled part
// of the track is a gradient driven by the value, which is why there is no
// second element behind the thumb.
// =========================================================

export function Slider({
  value, min, max, step = 1, onChange, label, id,
  minLabel, maxLabel, format, className,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  id?: string;
  /** words at each end, e.g. Sharp … Round */
  minLabel?: string;
  maxLabel?: string;
  /** how the current value reads, e.g. "110%" */
  format?: (v: number) => string;
  className?: string;
}) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-ink-2">{minLabel}</span>
        {format && (
          <span className="text-[12px] tnum text-ink-3">{format(value)}</span>
        )}
        <span className="text-[12.5px] text-ink-2">{maxLabel}</span>
      </div>

      <input
        id={id}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="hm-range w-full cursor-pointer"
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
      />

    </div>
  );
}
