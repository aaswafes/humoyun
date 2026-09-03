"use client";

import * as React from "react";
import { BarChart3, ChevronDown, Rows3, Tags } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Note } from "@/lib/types";
import { EmptyState, Segmented } from "@/components/ui/primitives";
import { Chart, fmt, type TipState } from "@/components/stats/chart-kit";
import type { CategoryIndex } from "./category-model";
import { useStickyChoice } from "./note-fields";
import {
  METRIC_LABELS, type Metric, type TopicBy, type TopicRow,
  focusSummary, isUnfiled, measure, rankRows, topicRows, topicTotals,
} from "./topic-model";

/**
 * One measure across many topics: colour carries no information here, so the
 * bars are one hue and the ranking does the talking. Categories are the
 * exception — they already wear a tint on every chip and card, so a bar that
 * matches is recognisable rather than decorative.
 */
function fillFor(by: TopicBy, row: TopicRow): string {
  if (isUnfiled(row)) return "var(--line-strong)";
  return by === "category" ? "var(--tint)" : "var(--accent)";
}

/** Only a category bar needs the tint variables in scope. */
function tintClass(by: TopicBy, row: TopicRow): string | undefined {
  return by === "category" && !isUnfiled(row) ? "tint-" + row.tint : undefined;
}

// =========================================================
// What you are actually focused on.
//
// One measure across many topics, ranked — which is a bar chart and nothing
// else. Rows by default because topic names are words and words want
// horizontal room; columns when you would rather see the profile as a skyline.
//
// Every bar is also the filter for that topic, so the chart is not a report
// you read and then go elsewhere to act on. Clicking "Sirah" narrows the whole
// page to Sirah.
// =========================================================

const BY_OPTIONS = [
  { value: "tag" as const, label: "Tags", title: "Grouped by the tags on each note" },
  { value: "category" as const, label: "Categories", title: "Grouped by category" },
  { value: "kind" as const, label: "Kinds", title: "Grouped by what kind of note it is" },
];

const SHAPE_OPTIONS = [
  {
    value: "rows" as const,
    label: <span className="inline-flex items-center gap-1.5"><Rows3 className="size-3.5" />Rows</span>,
    title: "Ranked bars, longest at the top",
  },
  {
    value: "columns" as const,
    label: <span className="inline-flex items-center gap-1.5"><BarChart3 className="size-3.5" />Columns</span>,
    title: "The same bars stood up, as a skyline",
  },
];

const BYS: readonly TopicBy[] = ["tag", "category", "kind"];
const METRICS: readonly Metric[] = ["notes", "words"];
const SHAPES = ["rows", "columns"] as const;
type Shape = (typeof SHAPES)[number];

/** More rows than this and the tail is noise; it folds into the table instead. */
const ROW_LIMIT = 14;
const COL_LIMIT = 10;

/** Space kept above the tallest column for its value label. */
const HEADROOM = 22;

const ROW_H = 30;
const BAR_H = 13;
const LABEL_W = 126;
const VALUE_W = 62;

/** A bar is rounded only at the end the data reaches; the baseline stays square. */
function barRight(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.max(0, Math.min(r, w, h / 2));
  return `M${x},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr}`
    + ` V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x} Z`;
}

function barTop(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  return `M${x},${y + h} V${y + rr} A${rr},${rr} 0 0 1 ${x + rr},${y}`
    + ` H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} V${y + h} Z`;
}

export function TopicsView({
  notes, index, activeFor, onToggle, className,
}: {
  notes: Note[];
  index: CategoryIndex;
  /** the topics currently narrowing the page, for whichever grouping is live */
  activeFor: (by: TopicBy) => string[];
  onToggle: (by: TopicBy, row: TopicRow) => void;
  className?: string;
}) {
  const [by, setBy] = useStickyChoice<TopicBy>("humoyun.notes.topics.by", "tag", BYS);
  const [metric, setMetric] = useStickyChoice<Metric>("humoyun.notes.topics.metric", "notes", METRICS);
  const [shape, setShape] = useStickyChoice<Shape>("humoyun.notes.topics.shape", "rows", SHAPES);
  const [cursor, setCursor] = React.useState<number | null>(null);
  const [tableOpen, setTableOpen] = React.useState(false);

  const totals = React.useMemo(() => topicTotals(notes), [notes]);
  const rows = React.useMemo(
    () => rankRows(topicRows(notes, by, index), metric, totals[metric]),
    [notes, by, index, metric, totals]);

  const limit = shape === "rows" ? ROW_LIMIT : COL_LIMIT;
  const shown = rows.slice(0, limit);
  const hidden = rows.length - shown.length;
  // The longest bar fills the track. This is a ranking, not a time series — a
  // rounded-up axis just leaves the winner short of the end for no reason.
  const max = Math.max(1, ...shown.map((r) => measure(r, metric)));
  const activeSet = React.useMemo(
    () => new Set(activeFor(by).map((a) => a.toLowerCase())), [activeFor, by]);

  const summary = focusSummary(rows, metric, by);
  const unit = METRIC_LABELS[metric].toLowerCase();

  const describe = (i: number) => {
    const r = shown[i];
    if (!r) return "";
    return `${r.label}: ${fmt(measure(r, metric))} ${unit}, `
      + `${Math.round(r.share * 100)} percent`
      + (r.daysSince == null ? ", nothing written yet" : `, last written ${r.daysSince} days ago`);
  };

  const tipFor = (i: number | null, at: { x: number; y: number }): TipState | null => {
    const r = i == null ? null : shown[i];
    if (!r) return null;
    return {
      x: at.x,
      y: at.y,
      title: r.label,
      wide: true,
      rows: [
        { label: "Notes", value: fmt(r.notes), color: "var(--tint)" },
        { label: "Words", value: fmt(r.words) },
        { label: "Share", value: `${Math.round(r.share * 100)}%`, muted: true },
        {
          label: "Last written",
          value: r.daysSince == null ? "—" : r.daysSince === 0 ? "Today" : `${r.daysSince}d ago`,
          muted: true,
        },
      ],
    };
  };

  if (!rows.length || rows.every((r) => measure(r, metric) === 0)) {
    return (
      <EmptyState
        icon={Tags}
        title="Nothing to measure yet"
        description="Tag a few notes and this becomes a picture of what you have actually been thinking about — and what you have been quietly ignoring."
        className="py-20"
      />
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<TopicBy> size="sm" value={by} onChange={setBy} options={BY_OPTIONS} />
        <Segmented<Metric>
          size="sm"
          value={metric}
          onChange={setMetric}
          options={METRICS.map((m) => ({
            value: m,
            label: METRIC_LABELS[m],
            title: m === "notes" ? "How many notes carry it" : "How much you have written under it",
          }))}
        />
        <Segmented<Shape> size="sm" value={shape} onChange={setShape} options={SHAPE_OPTIONS} className="ml-auto" />
      </div>

      <p className="mt-4 max-w-[76ch] text-[12.5px] leading-[1.6] text-ink-3">{summary}</p>

      <div className="mt-5 min-h-0 max-w-[760px] flex-1 overflow-y-auto">
        {shape === "rows" ? (
          <Chart
            height={Math.max(shown.length * ROW_H, ROW_H)}
            label={`${METRIC_LABELS[metric]} by ${by}, ranked`}
            description={summary}
            animateKey={`${by}-${metric}-rows`}
            tip={({ w }) => {
              if (cursor == null) return null;
              const barX = LABEL_W;
              const barW = Math.max(40, w - LABEL_W - VALUE_W);
              const r = shown[cursor];
              if (!r) return null;
              const len = (measure(r, metric) / max) * barW;
              return tipFor(cursor, { x: barX + len, y: cursor * ROW_H + ROW_H / 2 });
            }}
            nav={{
              n: shown.length,
              index: cursor,
              onIndex: setCursor,
              describe,
              onActivate: (i) => shown[i] && onToggle(by, shown[i]),
              activateLabel: "filter by it",
            }}
          >
            {({ w }) => {
              const barX = LABEL_W;
              const barW = Math.max(40, w - LABEL_W - VALUE_W);
              return (
                <g>
                  {shown.map((r, i) => {
                    const value = measure(r, metric);
                    const len = Math.max(value > 0 ? 3 : 0, (value / max) * barW);
                    const y = i * ROW_H + (ROW_H - BAR_H) / 2;
                    const on = activeSet.has(r.key);
                    const dim = activeSet.size > 0 && !on;
                    return (
                      <g
                        key={r.key}
                        className={tintClass(by, r)}
                        opacity={dim ? 0.34 : 1}
                        style={{ cursor: "pointer", transition: "opacity 150ms" }}
                        onPointerEnter={() => setCursor(i)}
                        onPointerLeave={() => setCursor(null)}
                        onClick={() => onToggle(by, r)}
                      >
                        <title>{describe(i)}</title>

                        {/* A full-width hit area, so a two-pixel bar is still clickable. */}
                        <rect x={0} y={i * ROW_H} width={w} height={ROW_H} fill="transparent" />
                        {cursor === i && (
                          <rect x={0} y={i * ROW_H} width={w} height={ROW_H} rx={6} fill="var(--hover)" />
                        )}

                        <text
                          x={0}
                          y={i * ROW_H + ROW_H / 2}
                          dominantBaseline="middle"
                          style={{
                            fontSize: 12,
                            fill: on ? "var(--ink)" : "var(--ink-2)",
                            fontWeight: on ? 600 : 400,
                          }}
                        >
                          {clip(r.label, 17)}
                        </text>

                        {/* The track keeps a short bar findable across the row. */}
                        <rect x={barX} y={y} width={barW} height={BAR_H} rx={4} fill="var(--hover)" />
                        {len > 0 && <path d={barRight(barX, y, len, BAR_H)} fill={fillFor(by, r)} />}

                        <text
                          x={w}
                          y={i * ROW_H + ROW_H / 2}
                          textAnchor="end"
                          dominantBaseline="middle"
                          style={{ fontSize: 11.5, fill: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}
                        >
                          {fmt(value)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            }}
          </Chart>
        ) : (
          <Chart
            height={260}
            label={`${METRIC_LABELS[metric]} by ${by}, as columns`}
            description={summary}
            animateKey={`${by}-${metric}-cols`}
            tip={({ w, h }) => {
              if (cursor == null) return null;
              const plotH = h - 58;
              const step = w / Math.max(shown.length, 1);
              const r = shown[cursor];
              if (!r) return null;
              const len = (measure(r, metric) / max) * (plotH - HEADROOM);
              return tipFor(cursor, { x: step * (cursor + 0.5), y: plotH - len });
            }}
            nav={{
              n: shown.length,
              index: cursor,
              onIndex: setCursor,
              describe,
              onActivate: (i) => shown[i] && onToggle(by, shown[i]),
              activateLabel: "filter by it",
            }}
          >
            {({ w, h }) => {
              const plotH = h - 58;
              const step = w / Math.max(shown.length, 1);
              const barW = Math.min(44, Math.max(10, step - 16));
              // The tallest column stops short of the top so its value has
              // somewhere to sit; a label clipped by the frame is a bug.
              const usable = plotH - HEADROOM;
              return (
                <g>
                  <line x1={0} x2={w} y1={plotH} y2={plotH} stroke="var(--line)" strokeWidth={1} />

                  {shown.map((r, i) => {
                    const value = measure(r, metric);
                    const len = Math.max(value > 0 ? 3 : 0, (value / max) * usable);
                    const cx = step * (i + 0.5);
                    const on = activeSet.has(r.key);
                    const dim = activeSet.size > 0 && !on;
                    return (
                      <g
                        key={r.key}
                        className={tintClass(by, r)}
                        opacity={dim ? 0.34 : 1}
                        style={{ cursor: "pointer", transition: "opacity 150ms" }}
                        onPointerEnter={() => setCursor(i)}
                        onPointerLeave={() => setCursor(null)}
                        onClick={() => onToggle(by, r)}
                      >
                        <title>{describe(i)}</title>
                        <rect x={cx - step / 2} y={0} width={step} height={h} fill="transparent" />
                        {cursor === i && (
                          <rect x={cx - step / 2 + 2} y={0} width={step - 4} height={plotH} rx={6} fill="var(--hover)" />
                        )}

                        {len > 0 && (
                          <path d={barTop(cx - barW / 2, plotH - len, barW, len)} fill={fillFor(by, r)} />
                        )}

                        <text
                          x={cx}
                          y={plotH - len - 7}
                          textAnchor="middle"
                          style={{ fontSize: 11, fill: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}
                        >
                          {fmt(value)}
                        </text>

                        {/* Angled, because a topic is a word and words do not fit
                            under a 40px column at any font size worth reading. */}
                        <text
                          x={cx}
                          y={plotH + 14}
                          textAnchor="end"
                          transform={`rotate(-35 ${cx} ${plotH + 14})`}
                          style={{
                            fontSize: 11,
                            fill: on ? "var(--ink)" : "var(--ink-3)",
                            fontWeight: on ? 600 : 400,
                          }}
                        >
                          {clip(r.label, 14)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            }}
          </Chart>
        )}

        {hidden > 0 && (
          <p className="mt-3 text-[11.5px] text-ink-4 tnum">
            {hidden} smaller {hidden === 1 ? "one is" : "ones are"} in the table below.
          </p>
        )}

        <button
          type="button"
          onClick={() => setTableOpen((v) => !v)}
          aria-expanded={tableOpen}
          className={cn(
            "mt-4 inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-[11.5px]",
            "transition-colors duration-150",
            tableOpen ? "bg-hover text-ink" : "text-ink-4 hover:bg-hover hover:text-ink-2",
          )}
        >
          <ChevronDown
            className={cn("size-3 transition-transform duration-200", tableOpen && "rotate-180")}
            aria-hidden
          />
          Every number
        </button>

        {tableOpen && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-[12px]">
              <caption className="sr-only">
                {METRIC_LABELS[metric]} by {by}, every row
              </caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-4">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">Topic</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Notes</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Words</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-semibold">Share</th>
                  <th scope="col" className="py-1.5 text-right font-semibold">Last</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="hairline-t">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">{r.label}</th>
                    <td className="py-1.5 pr-3 text-right text-ink-2 tnum">{fmt(r.notes)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-2 tnum">{fmt(r.words)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-3 tnum">{Math.round(r.share * 100)}%</td>
                    <td className="py-1.5 text-right text-ink-3 tnum">
                      {r.daysSince == null ? "—" : r.daysSince === 0 ? "Today" : `${r.daysSince}d`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
