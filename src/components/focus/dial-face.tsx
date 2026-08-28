"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "./use-reduced-motion";

export type DialTone = "accent" | "break" | "done" | "muted";

const TONE_COLOR: Record<DialTone, string> = {
  accent: "var(--accent)",
  break: "var(--tint)",
  done: "var(--success)",
  muted: "var(--line-strong)",
};

/**
 * The dial. A hairline track, one arc, and two kinds of mark:
 *  · ticks every five minutes of the block, so the sweep has a scale
 *  · a pip wherever the session was interrupted
 *
 * Everything is drawn in a single SVG so the arc, the ticks and the pips can
 * never drift apart at odd sizes.
 */
export function DialFace({
  size,
  stroke,
  progress,
  tone,
  ticks = 0,
  marks,
  breathing,
  dimmed,
  children,
  className,
  label,
}: {
  size: number;
  stroke: number;
  /** 0..1 */
  progress: number;
  tone: DialTone;
  /** Tick marks around the rim — usually one per five minutes. */
  ticks?: number;
  /** Fractions (0..1) of the block where an interruption was logged. */
  marks?: number[];
  breathing?: boolean;
  /** Paused: the arc holds its place but stops asking for attention. */
  dimmed?: boolean;
  children?: React.ReactNode;
  className?: string;
  /** Read out instead of the graphic. */
  label: string;
}) {
  const reduced = useReducedMotion();
  const rim = 9;
  const r = (size - stroke) / 2 - rim;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const pct = Math.max(0, Math.min(1, progress));
  const color = TONE_COLOR[tone];

  const tickAngles = React.useMemo(
    () => (ticks > 1 ? Array.from({ length: ticks }, (_, i) => i / ticks) : []),
    [ticks],
  );

  const point = (fraction: number, radius: number) => {
    const a = fraction * Math.PI * 2 - Math.PI / 2;
    return [cx + radius * Math.cos(a), cx + radius * Math.sin(a)] as const;
  };

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", tone === "break" && "tint-emerald", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
        shapeRendering="geometricPrecision"
      >
        {breathing && !reduced && (
          <>
            <style>{`
              @keyframes hm-breathe {
                0%   { transform: scale(0.965); opacity: 0.30 }
                50%  { transform: scale(1.035); opacity: 0.70 }
                100% { transform: scale(0.965); opacity: 0.30 }
              }
              .hm-breathe {
                transform-box: fill-box;
                transform-origin: center;
                animation: hm-breathe 11s cubic-bezier(0.45, 0, 0.55, 1) infinite;
              }
            `}</style>
            <circle
              className="hm-breathe"
              cx={cx}
              cy={cx}
              r={r + rim * 0.7}
              fill="none"
              stroke={color}
              strokeWidth={1}
              opacity={0.4}
            />
          </>
        )}

        {tickAngles.map((fraction) => {
          const [x1, y1] = point(fraction, r + rim * 0.45);
          const [x2, y2] = point(fraction, r + rim * 0.95);
          const passed = fraction <= pct + 0.0001;
          return (
            <line
              key={fraction}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={passed ? color : "var(--line)"}
              strokeWidth={1}
              strokeLinecap="round"
              opacity={passed ? (dimmed ? 0.35 : 0.55) : 1}
            />
          );
        })}

        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />

        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${cx} ${cx})`}
          opacity={dimmed ? 0.45 : 1}
          className="transition-[stroke-dashoffset,opacity] duration-500 ease-[var(--ease-out-apple)]"
        />

        {(marks ?? []).map((fraction, i) => {
          const [x, y] = point(Math.max(0, Math.min(1, fraction)), r);
          return (
            <circle
              key={`${fraction}-${i}`}
              cx={x}
              cy={y}
              r={Math.max(2.5, stroke * 0.52)}
              fill="var(--warn)"
              stroke="var(--canvas)"
              strokeWidth={1.5}
            />
          );
        })}
      </svg>

      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}
