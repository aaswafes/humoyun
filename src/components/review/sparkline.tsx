"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Eight periods of a single metric, drawn as a hairline. Monochrome on purpose —
 * the chip beside it carries the only colour the stat needs. The line is a
 * picture of a sentence that is also written out for screen readers.
 */
export function Sparkline({
  values, labels, format, width = 80, height = 26, className,
}: {
  values: number[];
  /** One label per value — used for the spoken summary and the point titles. */
  labels?: string[];
  format?: (n: number) => string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const fmt = format ?? ((n: number) => String(Math.round(n)));

  const { line, points, max, min } = React.useMemo(() => {
    const pad = 3;
    // Scaled to the series itself, not to zero — the review is looking for the
    // shape of the change, and a floor at zero flattens every real movement.
    const hi = values.length ? Math.max(...values) : 0;
    const lo = values.length ? Math.min(...values) : 0;
    const span = hi - lo || 1;
    const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;

    const pts = values.map((v, i) => {
      const x = pad + i * step;
      // A flat series sits on the centre line rather than pinned to the floor.
      const y = hi === lo ? height / 2 : height - pad - ((v - lo) / span) * (height - pad * 2);
      return { x, y, v };
    });

    return {
      line: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      points: pts,
      max: hi,
      min: lo,
    };
  }, [values, width, height]);

  const last = points[points.length - 1];
  const peakIndex = values.indexOf(max);
  const summary = `Trend over ${values.length} periods, from ${fmt(values[0] ?? 0)} to ${fmt(last?.v ?? 0)}. High ${fmt(max)}, low ${fmt(min)}.`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 overflow-visible", className)}
      role="img"
      aria-label={summary}
    >
      <title>{summary}</title>
      <polyline
        points={line}
        fill="none"
        stroke="var(--ink-4)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.length > 1 && max > min && (
        <circle cx={points[peakIndex].x} cy={points[peakIndex].y} r={1.75} fill="var(--ink-4)">
          <title>{`Best: ${fmt(max)}${labels?.[peakIndex] ? ` · ${labels[peakIndex]}` : ""}`}</title>
        </circle>
      )}
      {last && (
        <circle cx={last.x} cy={last.y} r={2.25} fill="var(--ink-2)">
          <title>{`Now: ${fmt(last.v)}${labels?.[points.length - 1] ? ` · ${labels[points.length - 1]}` : ""}`}</title>
        </circle>
      )}
    </svg>
  );
}

/**
 * Change against the previous period. A quieter week is information, not a
 * failure, so the chip stays grey and the arrow carries the direction on its
 * own — no soft fill, no warning colour for a number that simply went down.
 */
export function Delta({
  value, previous, format, className,
}: {
  value: number;
  /** Previous value, only used to say the change as a percentage. */
  previous?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const fmt = format ?? ((n: number) => String(Math.round(n)));
  const share = previous && previous !== 0 ? Math.round((value / Math.abs(previous)) * 100) : null;

  if (value === 0) {
    return (
      <span
        title="No change from the period before"
        className={cn(
          "inline-flex items-center gap-0.5 text-[11px] font-medium text-ink-4",
          className,
        )}
      >
        <Minus className="size-2.5" strokeWidth={3} />
        even
      </span>
    );
  }

  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      title={
        share != null
          ? `${up ? "Up" : "Down"} ${fmt(Math.abs(value))} (${Math.abs(share)}%) on the period before`
          : `${up ? "Up" : "Down"} ${fmt(Math.abs(value))} on the period before`
      }
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-medium text-ink-3 tnum",
        className,
      )}
    >
      <Icon className="size-2.5" strokeWidth={2.5} />
      {fmt(Math.abs(value))}
    </span>
  );
}

/** A quiet horizontal bar for share-of-total lists. */
export function ShareBar({ share, className }: { share: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, share)) * 100;
  return (
    <span className={cn("block h-1 w-full overflow-hidden rounded-full bg-hover", className)} aria-hidden>
      <span
        className="block h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-apple)]"
        style={{ width: `${pct}%`, background: "var(--tint, var(--ink-3))" }}
      />
    </span>
  );
}
