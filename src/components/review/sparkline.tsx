"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Eight weeks of a single metric, drawn as a hairline. Monochrome on purpose —
 * the delta beside it carries the only colour the stat needs.
 */
export function Sparkline({
  values, width = 76, height = 24, className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const { line, last } = React.useMemo(() => {
    const pad = 3;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;

    const points = values.map((v, i) => {
      const x = pad + i * step;
      // A flat series sits on the centre line rather than pinned to the floor.
      const t = max === min ? 0.5 : (v - min) / span;
      const y = height - pad - t * (height - pad * 2);
      return [x, y] as const;
    });

    return {
      line: points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      last: points[points.length - 1],
    };
  }, [values, width, height]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <polyline
        points={line}
        fill="none"
        stroke="var(--ink-4)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && <circle cx={last[0]} cy={last[1]} r={2.25} fill="var(--ink-2)" />}
    </svg>
  );
}

/** Change against the previous week. Up is good for every metric on this page. */
export function Delta({
  value, format, className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const fmt = format ?? ((n: number) => String(Math.round(n)));

  if (value === 0) {
    return <span className={cn("text-[11.5px] font-medium text-ink-4", className)}>even</span>;
  }

  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11.5px] font-medium tnum",
        up ? "text-success" : "text-warn",
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} />
      {fmt(Math.abs(value))}
    </span>
  );
}
