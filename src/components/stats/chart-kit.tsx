"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// =========================================================
// Chart kit — the only drawing primitives the Stats page uses.
// Everything is hand-drawn SVG on semantic tokens, so both
// themes come for free.
// =========================================================

/** Charts are drawn in real pixels, so they need the container width first. */
export function useMeasure<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width);
      setWidth((prev) => (prev === next ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

// ---------------------------------------------------------
// Tooltip
// ---------------------------------------------------------
export interface TipRow {
  label: string;
  value: string;
  /** A css colour expression — always a token, e.g. "var(--accent)". */
  color?: string;
}

export interface TipState {
  x: number;
  y: number;
  title: string;
  rows: TipRow[];
}

/**
 * What the cursor is on. `x`/`y` are captured in chart space at hover time
 * so the tooltip can be positioned outside the render-prop closure.
 */
export interface HoverPoint { i: number; x: number; y: number }

const TIP_W = 132;

function ChartTooltip({ tip, width }: { tip: TipState; width: number }) {
  const half = TIP_W / 2;
  const left = width > TIP_W ? Math.max(half, Math.min(tip.x, width - half)) : tip.x;

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg",
        "border border-line bg-raised px-2.5 py-1.5 shadow-md anim-fade",
      )}
      style={{ left, top: tip.y - 10, width: TIP_W }}
    >
      <p className="truncate text-[11.5px] font-semibold leading-tight text-ink">{tip.title}</p>
      <div className="mt-1 flex flex-col gap-0.5">
        {tip.rows.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5">
            {r.color && (
              <span className="size-1.5 shrink-0 rounded-[2px]" style={{ background: r.color }} />
            )}
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">{r.label}</span>
            <span className="shrink-0 text-[11px] font-medium text-ink tnum">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Measured SVG canvas. The child render-prop only runs once a real
 * width exists, so no chart ever draws against a zero-width box.
 */
export function Chart({
  height, label, tip, children, className,
}: {
  /** A function when the drawing's height depends on how wide it ends up. */
  height: number | ((w: number) => number);
  label: string;
  tip?: TipState | null;
  children: (d: { w: number; h: number }) => React.ReactNode;
  className?: string;
}) {
  const [ref, w] = useMeasure<HTMLDivElement>();
  const h = typeof height === "function" ? (w > 0 ? height(w) : 0) : height;

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height: h || undefined }}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} role="img" aria-label={label} className="block">
          {children({ w, h })}
        </svg>
      )}
      {tip && w > 0 && <ChartTooltip tip={tip} width={w} />}
    </div>
  );
}

// ---------------------------------------------------------
// Panels
// ---------------------------------------------------------
export function Panel({
  title, subtitle, actions, children, className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface p-4 md:p-5", className)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {subtitle && (
            <p className="mt-1 max-w-[62ch] text-[12px] leading-[1.5] text-ink-3">{subtitle}</p>
          )}
        </div>
        {actions && <div className="ml-auto shrink-0">{actions}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Legend({
  items, className,
}: {
  items: { label: string; color: string; opacity?: number }[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1", className)}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <span
            className="size-2 rounded-[3px]"
            style={{ background: it.color, opacity: it.opacity }}
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">{children}</p>;
}

// ---------------------------------------------------------
// Scales & paths
// ---------------------------------------------------------
export interface Pad { l: number; r: number; t: number; b: number }

/** Rounds an axis maximum up to something a human would have chosen. */
export function niceMax(v: number): number {
  if (!isFinite(v) || v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

export function axisTicks(max: number, steps = 3): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => (max / steps) * i);
}

export function linePath(pts: [number, number][]): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
}

export function areaPath(pts: [number, number][], baseY: number): string {
  if (!pts.length) return "";
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${linePath(pts)} L${last[0].toFixed(2)} ${baseY.toFixed(2)} L${first[0].toFixed(2)} ${baseY.toFixed(2)} Z`;
}

/** Horizontal grid + left-hand value labels. */
export function GridY({
  x0, x1, ticks, y, format,
}: {
  x0: number;
  x1: number;
  ticks: number[];
  y: (v: number) => number;
  format: (v: number) => string;
}) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={x0} x2={x1} y1={y(t)} y2={y(t)}
            stroke={t === 0 ? "var(--line-strong)" : "var(--line)"}
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          <text
            x={x0 - 6} y={y(t) + 3.5} textAnchor="end"
            className="text-[10.5px] tnum" fill="var(--ink-4)"
          >
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

export function AxisText({
  x, y, children, anchor = "middle", strong,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  anchor?: "start" | "middle" | "end";
  strong?: boolean;
}) {
  return (
    <text
      x={x} y={y} textAnchor={anchor}
      className="text-[10.5px] tnum"
      fill={strong ? "var(--ink-2)" : "var(--ink-4)"}
    >
      {children}
    </text>
  );
}

/** Small uppercase unit caption that sits above a plot. */
export function UnitLabel({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <text
      x={x} y={y}
      className="text-[9.5px] font-semibold uppercase tracking-[0.08em]"
      fill="var(--ink-4)"
    >
      {children}
    </text>
  );
}

// ---------------------------------------------------------
// Pointer helpers — one overlay rect beats a rect per datum
// ---------------------------------------------------------
export function pointIndexFromEvent(
  e: React.MouseEvent<SVGRectElement>, plotW: number, n: number,
): number {
  if (n <= 1) return 0;
  const rel = e.clientX - e.currentTarget.getBoundingClientRect().left;
  return Math.max(0, Math.min(n - 1, Math.round((rel / Math.max(1, plotW)) * (n - 1))));
}

export function bandIndexFromEvent(
  e: React.MouseEvent<SVGRectElement>, plotW: number, n: number,
): number {
  if (n <= 1) return 0;
  const rel = e.clientX - e.currentTarget.getBoundingClientRect().left;
  return Math.max(0, Math.min(n - 1, Math.floor((rel / Math.max(1, plotW)) * n)));
}

/** Full-plot invisible surface that reports which datum the cursor is over. */
export function HoverSurface({
  x, y, w, h, n, mode = "point", onIndex, onLeave,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  n: number;
  mode?: "point" | "band";
  onIndex: (i: number) => void;
  onLeave: () => void;
}) {
  return (
    <rect
      x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)}
      fill="transparent"
      onMouseMove={(e) =>
        onIndex(mode === "point" ? pointIndexFromEvent(e, w, n) : bandIndexFromEvent(e, w, n))
      }
      onMouseLeave={onLeave}
    />
  );
}

// ---------------------------------------------------------
// Number formatting — locale-free so nothing can drift
// ---------------------------------------------------------
export function fmt(n: number, decimals = 0): string {
  const fixed = n.toFixed(decimals);
  return decimals > 0 && fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

export function fmtHours(minutes: number): string {
  return `${fmt(minutes / 60, 1)}h`;
}

export function pctOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
