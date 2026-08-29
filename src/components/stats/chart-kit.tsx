"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { VisuallyHidden } from "@/components/ui/form";
import { isSectionOpen, toggleSection, useSectionState } from "./sections";

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
// Motion
// ---------------------------------------------------------
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * The global stylesheet already shortens every transition under reduced motion,
 * but a chart should not start an entrance at all — so each one asks here before
 * attaching an animation class.
 */
export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCE_QUERY).matches,
    () => false, // no window on the server; the CSS guard still covers that frame
  );
}

// ---------------------------------------------------------
// Patterns — a second channel so no series is colour-only
// ---------------------------------------------------------
export type PatternKey = "solid" | "hatch" | "back-hatch" | "dots" | "grid";

export interface SeriesStyle {
  key: string;
  label: string;
  color: string;
  pattern: PatternKey;
  /** Colour of the marks drawn on top of the fill. */
  mark?: string;
  opacity?: number;
}

/** SVG defs for every patterned series in one chart. */
export function SeriesPatterns({ prefix, series }: { prefix: string; series: readonly SeriesStyle[] }) {
  return (
    <defs>
      {series.map((s) => {
        if (s.pattern === "solid") return null;
        const mark = s.mark ?? "var(--canvas)";
        const rotate = s.pattern === "hatch" ? 45 : s.pattern === "back-hatch" ? -45 : 0;
        return (
          <pattern
            key={s.key}
            id={`${prefix}-${s.key}`}
            width={5}
            height={5}
            patternUnits="userSpaceOnUse"
            patternTransform={rotate ? `rotate(${rotate})` : undefined}
          >
            <rect x={0} y={0} width={5} height={5} fill={s.color} />
            {(s.pattern === "hatch" || s.pattern === "back-hatch") && (
              <line x1={0} y1={0} x2={0} y2={5} stroke={mark} strokeWidth={1.7} />
            )}
            {s.pattern === "dots" && <circle cx={2.5} cy={2.5} r={1.15} fill={mark} />}
            {s.pattern === "grid" && (
              <>
                <line x1={0} y1={0} x2={0} y2={5} stroke={mark} strokeWidth={1.1} />
                <line x1={0} y1={0} x2={5} y2={0} stroke={mark} strokeWidth={1.1} />
              </>
            )}
          </pattern>
        );
      })}
    </defs>
  );
}

/** The fill for one series — a flat token, or the pattern registered above. */
export function fillOf(prefix: string, s: SeriesStyle): string {
  return s.pattern === "solid" ? s.color : `url(#${prefix}-${s.key})`;
}

/** The same fill, for an HTML swatch in a legend or tooltip. */
export function swatchStyle(
  color: string,
  pattern: PatternKey = "solid",
  mark = "var(--canvas)",
): React.CSSProperties {
  if (pattern === "solid") return { background: color };
  if (pattern === "dots") {
    return {
      background: color,
      backgroundImage: `radial-gradient(${mark} 0.9px, transparent 1px)`,
      backgroundSize: "3px 3px",
    };
  }
  if (pattern === "grid") {
    return {
      background: color,
      backgroundImage:
        `repeating-linear-gradient(0deg, ${mark} 0 1px, transparent 1px 4px),` +
        `repeating-linear-gradient(90deg, ${mark} 0 1px, transparent 1px 4px)`,
    };
  }
  const angle = pattern === "back-hatch" ? "-45deg" : "45deg";
  return {
    background: color,
    backgroundImage: `repeating-linear-gradient(${angle}, ${mark} 0 1.4px, transparent 1.4px 4px)`,
  };
}

// ---------------------------------------------------------
// Tooltip
// ---------------------------------------------------------
export interface TipRow {
  label: string;
  value: string;
  /** A css colour expression — always a token, e.g. "var(--accent)". */
  color?: string;
  /** Redundant shape channel, so a row is never colour-only. */
  pattern?: PatternKey;
  mark?: string;
  muted?: boolean;
}

export interface TipState {
  x: number;
  y: number;
  title: string;
  rows: TipRow[];
  /** Widens the card when the rows carry long labels. */
  wide?: boolean;
}

const TIP_W = 132;
const TIP_W_WIDE = 178;

function ChartTooltip({ tip, width, animate }: { tip: TipState; width: number; animate: boolean }) {
  const cardW = tip.wide ? TIP_W_WIDE : TIP_W;
  const half = cardW / 2;
  const left = width > cardW ? Math.max(half, Math.min(tip.x, width - half)) : tip.x;

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg",
        "border border-line bg-raised px-2.5 py-1.5 shadow-md",
        animate && "anim-fade",
      )}
      style={{ left, top: tip.y - 10, width: cardW }}
    >
      <p className="truncate text-[11.5px] font-semibold leading-tight text-ink">{tip.title}</p>
      <div className="mt-1 flex flex-col gap-0.5">
        {tip.rows.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5">
            {r.color && (
              <span
                className="size-1.5 shrink-0 rounded-[2px]"
                style={swatchStyle(r.color, r.pattern ?? "solid", r.mark)}
              />
            )}
            <span className={cn("min-w-0 flex-1 truncate text-[11px]", r.muted ? "text-ink-4" : "text-ink-3")}>
              {r.label}
            </span>
            <span className={cn("shrink-0 text-[11px] font-medium tnum", r.muted ? "text-ink-3" : "text-ink")}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Chart canvas
// ---------------------------------------------------------

/**
 * Keyboard access for a plot. One tab stop moves a cursor through the data with
 * the arrow keys and mirrors each stop into a polite live region — a tab stop
 * per data point would bury the rest of the page.
 */
export interface ChartNav {
  /** Number of addressable data points. */
  n: number;
  index: number | null;
  onIndex: (i: number | null) => void;
  /** The sentence announced when the cursor lands on a point. */
  describe: (i: number) => string;
  /** Enter / Space on the current point. */
  onActivate?: (i: number) => void;
  /** Shown in the focus hint, e.g. "open this day". */
  activateLabel?: string;
  /** Arrow-key deltas. `vertical: 0` leaves Up and Down alone. */
  step?: { horizontal: number; vertical: number };
  /** Replaces the generic "Arrow keys step through the data" hint. */
  hint?: string;
}

type TipInput = TipState | null | ((d: { w: number; h: number }) => TipState | null);

/**
 * Measured SVG canvas. The child render-prop only runs once a real
 * width exists, so no chart ever draws against a zero-width box.
 */
export function Chart({
  height, label, description, tip, nav, animateKey, children, className,
}: {
  /** A function when the drawing's height depends on how wide it ends up. */
  height: number | ((w: number) => number);
  label: string;
  /** Longer prose read after the label. Charts with a lot to say use it. */
  description?: React.ReactNode;
  tip?: TipInput;
  nav?: ChartNav;
  /** Changing this replays the entrance fade — only when motion is allowed. */
  animateKey?: string | number;
  children: (d: { w: number; h: number }) => React.ReactNode;
  className?: string;
}) {
  const [ref, w] = useMeasure<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [focused, setFocused] = React.useState(false);
  const descId = React.useId();
  const h = typeof height === "function" ? (w > 0 ? height(w) : 0) : height;

  const resolved = typeof tip === "function" ? (w > 0 && h > 0 ? tip({ w, h }) : null) : tip ?? null;

  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (!nav || nav.n <= 0) return;
    const minor = nav.step?.horizontal ?? 1;
    const major = nav.step?.vertical ?? 0;
    const cur = nav.index ?? nav.n - 1;
    const move = (delta: number) => {
      e.preventDefault();
      nav.onIndex(Math.max(0, Math.min(nav.n - 1, cur + delta)));
    };

    if (e.key === "ArrowRight") return move(minor);
    if (e.key === "ArrowLeft") return move(-minor);
    if (e.key === "ArrowDown" && major) return move(major);
    if (e.key === "ArrowUp" && major) return move(-major);
    if (e.key === "Home") { e.preventDefault(); nav.onIndex(0); return; }
    if (e.key === "End") { e.preventDefault(); nav.onIndex(nav.n - 1); return; }
    if (e.key === "Escape" && nav.index != null) { e.preventDefault(); nav.onIndex(null); return; }
    if ((e.key === "Enter" || e.key === " ") && nav.onActivate && nav.index != null) {
      e.preventDefault();
      nav.onActivate(nav.index);
    }
  }

  return (
    <div className={cn("relative w-full", className)}>
      <div ref={ref} className="relative w-full" style={{ height: h || undefined }}>
        {w > 0 && h > 0 && (
          <svg
            key={animateKey}
            width={w}
            height={h}
            // role="img" keeps the prose summary readable in browse mode; the
            // cursor below — and the Panel data table — carry the values.
            role="img"
            aria-label={label}
            aria-describedby={description ? descId : undefined}
            tabIndex={nav ? 0 : undefined}
            onKeyDown={nav ? onKeyDown : undefined}
            onFocus={nav ? () => { setFocused(true); if (nav.index == null && nav.n > 0) nav.onIndex(nav.n - 1); } : undefined}
            onBlur={nav ? () => { setFocused(false); nav.onIndex(null); } : undefined}
            className={cn("block rounded-md", !reduced && animateKey != null && "anim-fade")}
          >
            {children({ w, h })}
          </svg>
        )}
        {resolved && w > 0 && <ChartTooltip tip={resolved} width={w} animate={!reduced} />}
      </div>

      {description && <VisuallyHidden id={descId}>{description}</VisuallyHidden>}

      <VisuallyHidden>
        <span role="status" aria-live="polite">
          {nav && nav.index != null ? nav.describe(nav.index) : ""}
        </span>
      </VisuallyHidden>

      {nav && focused && (
        <p className="mt-1.5 text-[11px] leading-snug text-ink-4">
          {nav.hint ??
            `Arrow keys step through the data${nav.step?.vertical ? " · up and down move a row" : ""}`}
          {" · Home and End jump to the ends"}
          {nav.onActivate && nav.activateLabel ? ` · Enter to ${nav.activateLabel}` : ""}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Panels
// ---------------------------------------------------------
export interface TableSpec {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}

const TABLE_LIMIT = 400;

function DataTable({ spec }: { spec: TableSpec }) {
  const rows = spec.rows.slice(0, TABLE_LIMIT);
  return (
    <div className="mt-4 max-h-[320px] overflow-auto rounded-md border border-line">
      <table className="w-full border-collapse text-left">
        <caption className="px-2.5 py-1.5 text-left text-[11.5px] text-ink-4">{spec.caption}</caption>
        <thead>
          <tr>
            {spec.columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={cn(
                  "sticky top-0 z-10 whitespace-nowrap bg-raised px-2.5 py-1.5 text-[11px]",
                  "font-semibold uppercase tracking-[0.06em] text-ink-3 hairline-b",
                  i > 0 && "text-right",
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="hairline-b">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "whitespace-nowrap px-2.5 py-1 text-[12px]",
                    ci === 0 ? "text-ink-2" : "text-right text-ink tnum",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {spec.rows.length > rows.length && (
        <p className="px-2.5 py-1.5 text-[11px] text-ink-4">
          Showing the first <span className="tnum">{rows.length}</span> of{" "}
          <span className="tnum">{spec.rows.length}</span> rows — the CSV export carries all of them.
        </p>
      )}
    </div>
  );
}

export function Panel({
  id, title, subtitle, actions, table, children, className,
}: {
  /** Also the fold key this panel is remembered under. */
  id: string;
  title: string;
  /** The one sentence that says what the chart says, readable while folded. */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Renders a "Data table" disclosure holding every value the chart draws. */
  table?: TableSpec | null;
  children: React.ReactNode;
  className?: string;
}) {
  const sections = useSectionState();
  const open = isSectionOpen(sections, id);
  const [showTable, setShowTable] = React.useState(false);
  const reduced = useReducedMotion();
  const hasTable = !!table && table.rows.length > 0;

  return (
    <section id={id} aria-label={title} className={cn("scroll-mt-[64px] py-5", className)}>
      <h2>
        <button
          type="button"
          data-panel-toggle
          aria-expanded={open}
          onClick={() => toggleSection(id)}
          className={cn(
            "group -mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5",
            "text-left transition-colors duration-150 hover:bg-hover",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
              {title}
            </span>
            {subtitle && (
              <span className="mt-1.5 block max-w-[76ch] text-[12.5px] leading-[1.6] text-ink-3">
                {subtitle}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "mt-0.5 size-4 shrink-0 text-ink-4 transition-transform duration-200",
              "ease-[var(--ease-out-apple)] group-hover:text-ink-3",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </h2>

      {open && (
        <div
          className="pt-4"
          style={reduced ? undefined : { animation: "hm-pop-in 200ms var(--ease-out-apple) both" }}
        >
          {(actions || hasTable) && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {actions}
              {hasTable && (
                <button
                  type="button"
                  onClick={() => setShowTable((v) => !v)}
                  aria-expanded={showTable}
                  className={cn(
                    "ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px]",
                    "cursor-pointer transition-colors duration-150",
                    showTable ? "bg-hover text-ink" : "text-ink-4 hover:bg-hover hover:text-ink-2",
                  )}
                >
                  <ChevronDown
                    className={cn("size-3 transition-transform duration-200", showTable && "rotate-180")}
                    aria-hidden
                  />
                  Data table
                </button>
              )}
            </div>
          )}

          {children}
          {table && hasTable && showTable && <DataTable spec={table} />}
        </div>
      )}
    </section>
  );
}

export function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">{children}</p>;
}

// ---------------------------------------------------------
// Legend
// ---------------------------------------------------------
export interface LegendItem {
  key: string;
  label: string;
  color: string;
  pattern?: PatternKey;
  mark?: string;
  opacity?: number;
  value?: string;
}

/**
 * Static list, or — when `onToggle` is given — a row of real buttons that
 * isolate a series. An empty `active` set means everything is showing.
 */
export function Legend({
  items, active, onToggle, label, className,
}: {
  items: LegendItem[];
  active?: ReadonlySet<string>;
  onToggle?: (key: string) => void;
  label?: string;
  className?: string;
}) {
  if (!onToggle) {
    return (
      <ul className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1", className)}>
        {items.map((it) => (
          <li key={it.key} className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <span
              className="size-2 shrink-0 rounded-[3px]"
              style={{ ...swatchStyle(it.color, it.pattern, it.mark), opacity: it.opacity }}
            />
            {it.label}
            {it.value && <span className="text-ink-4 tnum">{it.value}</span>}
          </li>
        ))}
      </ul>
    );
  }

  const isolating = !!active && active.size > 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} role="group" aria-label={label}>
      {items.map((it) => {
        const picked = isolating && active!.has(it.key);
        const showing = !isolating || picked;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={picked}
            onClick={() => onToggle(it.key)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] cursor-pointer",
              "transition-[background-color,color,opacity] duration-150",
              picked && "bg-hover text-ink font-medium",
              !picked && showing && "text-ink-2 hover:bg-hover",
              !showing && "text-ink-4 opacity-55 hover:bg-hover hover:opacity-100",
            )}
          >
            <span
              className="size-2 shrink-0 rounded-[3px]"
              style={{ ...swatchStyle(it.color, it.pattern, it.mark), opacity: it.opacity }}
              aria-hidden
            />
            {it.label}
            {it.value && <span className="text-ink-4 tnum">{it.value}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------
// Scales & paths
// ---------------------------------------------------------
/** Rounds an axis maximum up to something a human would have chosen. */
export function niceMax(v: number): number {
  if (!isFinite(v) || v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

export function axisTicks(max: number, steps = 2): number[] {
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
    <g aria-hidden>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={x0} x2={x1} y1={y(t)} y2={y(t)}
            stroke="var(--line)"
            strokeWidth={1}
            opacity={t === 0 ? 1 : 0.7}
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
      aria-hidden
    >
      {children}
    </text>
  );
}

/**
 * Small unit caption. Axis captions and in-plot annotations both come through
 * here, so they stay on the type scale and stay quiet.
 */
export function UnitLabel({
  x, y, children, anchor = "start", fill = "var(--ink-4)",
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  anchor?: "start" | "middle" | "end";
  fill?: string;
}) {
  return (
    <text
      x={x} y={y} textAnchor={anchor}
      className="text-[10.5px]"
      fill={fill}
      aria-hidden
    >
      {children}
    </text>
  );
}

/** The vertical rule and dot that mark the cursor on a line or bar chart. */
export function Crosshair({
  x, y, top, bottom, color = "var(--accent)",
}: {
  x: number;
  y?: number | null;
  top: number;
  bottom: number;
  color?: string;
}) {
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={top} y2={bottom} stroke="var(--line-strong)" strokeWidth={1} />
      {y != null && <circle cx={x} cy={y} r={3.5} fill={color} />}
    </g>
  );
}

/**
 * A React id that is safe inside `url(#…)` and an SVG `id` attribute — useId
 * puts characters in there that neither one accepts.
 */
export function useSvgId(prefix: string): string {
  const raw = React.useId();
  return `${prefix}${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
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
  x, y, w, h, n, mode = "point", onIndex, onLeave, onActivate,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  n: number;
  mode?: "point" | "band";
  onIndex: (i: number) => void;
  onLeave: () => void;
  onActivate?: (i: number) => void;
}) {
  const indexAt = (e: React.MouseEvent<SVGRectElement>) =>
    mode === "point" ? pointIndexFromEvent(e, w, n) : bandIndexFromEvent(e, w, n);

  return (
    <rect
      x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)}
      fill="transparent"
      className={onActivate ? "cursor-pointer" : undefined}
      onMouseMove={(e) => onIndex(indexAt(e))}
      onMouseLeave={onLeave}
      onClick={onActivate ? (e) => onActivate(indexAt(e)) : undefined}
    />
  );
}

// ---------------------------------------------------------
// Sparkline — the tiny series under a headline tile
// ---------------------------------------------------------
export function Sparkline({
  values, width = 92, height = 22, color = "var(--accent)", className,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 1.5 - (v / max) * (height - 3);
  const pts = values.map((v, i) => [x(i), y(v)] as [number, number]);

  return (
    <svg
      width={width} height={height}
      className={cn("block", className)}
      aria-hidden
      focusable="false"
    >
      <path d={areaPath(pts, height)} fill={color} opacity={0.12} />
      <path
        d={linePath(pts)} fill="none" stroke={color}
        strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round"
      />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={1.75} fill={color} />
    </svg>
  );
}

// ---------------------------------------------------------
// Number formatting — locale-free so nothing can drift
// ---------------------------------------------------------
export function fmt(n: number, decimals = 0): string {
  const fixed = n.toFixed(decimals);
  return decimals > 0 && fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

export function pctOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** "+12%" / "−7%" / "flat" — always signed, never bare. */
export function signedPct(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) < 1) return "flat";
  return `${v > 0 ? "+" : "−"}${Math.abs(Math.round(v))}%`;
}
