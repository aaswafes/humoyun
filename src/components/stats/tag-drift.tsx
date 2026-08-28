"use client";

import * as React from "react";
import { Tags } from "lucide-react";
import { formatDuration } from "@/lib/date";
import { EmptyState, Segmented } from "@/components/ui/primitives";
import {
  Chart, Legend, Panel, PanelNote, fmt, pctOf, useSvgId,
  type TableSpec, type TipState,
} from "./chart-kit";
import { driftValue, driftValueBefore, type DriftMetric, type TagDriftRow } from "./derive";

const ROW_H = 30;
const LABEL_W = 104;
const VALUE_W = 78;
const LIMIT = 8;

const METRICS: { value: DriftMetric; label: string; title: string }[] = [
  { value: "minutes", label: "Hours", title: "Focus time carried by each tag" },
  { value: "tasks", label: "Tasks", title: "Tasks tagged with each one" },
];

function valueText(v: number, metric: DriftMetric): string {
  return metric === "minutes" ? formatDuration(Math.round(v)) : `${fmt(v)}`;
}

function deltaText(now: number, before: number, metric: DriftMetric): string {
  const d = now - before;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${sign}${valueText(Math.abs(d), metric)}`;
}

/**
 * What moved between this window and the one before it. Every row is a live
 * filter: activating one narrows the whole page to that tag.
 */
export function TagDrift({
  rows, activeTags, onToggleTag, previousLabel,
}: {
  rows: TagDriftRow[];
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  previousLabel: string;
}) {
  const [metric, setMetric] = React.useState<DriftMetric>("minutes");
  const [cursor, setCursor] = React.useState<number | null>(null);
  const clipId = useSvgId("drift");
  const active = React.useMemo(() => new Set(activeTags), [activeTags]);

  const anyMinutes = rows.some((r) => r.minutes > 0 || r.minutesBefore > 0);
  const effective: DriftMetric = anyMinutes ? metric : "tasks";

  const shown = React.useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) =>
        Math.abs(driftValue(b, effective) - driftValueBefore(b, effective)) -
        Math.abs(driftValue(a, effective) - driftValueBefore(a, effective)),
    );
    return sorted.slice(0, LIMIT);
  }, [rows, effective]);

  const biggest = shown[0];
  const nowTotal = rows.reduce((s, r) => s + driftValue(r, effective), 0);
  const beforeTotal = rows.reduce((s, r) => s + driftValueBefore(r, effective), 0);

  const summary = !rows.length
    ? "Nothing in either window carries a tag, so there is no drift to show."
    : biggest
      ? `${biggest.name} moved most — ${deltaText(driftValue(biggest, effective), driftValueBefore(biggest, effective), effective)} ` +
        `against ${previousLabel.toLowerCase()}. Across every tag the total went from ` +
        `${valueText(beforeTotal, effective)} to ${valueText(nowTotal, effective)}.`
      : "Every tag held steady against the previous window.";

  const height = Math.max(ROW_H, shown.length * ROW_H);

  const describe = React.useCallback((i: number) => {
    const r = shown[i];
    if (!r) return "";
    const now = driftValue(r, effective);
    const before = driftValueBefore(r, effective);
    const state = active.has(r.name) ? " Currently filtering the page." : "";
    return (
      `${r.name}: ${valueText(now, effective)} this window, ${valueText(before, effective)} before — ` +
      `${deltaText(now, before, effective)}.${state}`
    );
  }, [shown, effective, active]);

  const tipAt = (w: number): TipState | null => {
    if (cursor == null || !shown[cursor]) return null;
    const r = shown[cursor];
    const now = driftValue(r, effective);
    const before = driftValueBefore(r, effective);
    return {
      x: Math.min(w - 40, LABEL_W + 40),
      y: cursor * ROW_H + 6,
      wide: true,
      title: r.name,
      rows: [
        { label: "This window", value: valueText(now, effective), color: "var(--tint)" },
        { label: previousLabel, value: valueText(before, effective), color: "var(--ink-4)", muted: true },
        { label: "Change", value: deltaText(now, before, effective) },
        { label: "Share now", value: `${pctOf(now, nowTotal)}%` },
      ],
    };
  };

  const table: TableSpec = {
    caption: "Tag totals this window against the one before it.",
    columns: ["Tag", "Hours now", "Hours before", "Tasks now", "Tasks before"],
    rows: rows.map((r) => [
      r.name,
      fmt(r.minutes / 60, 1),
      fmt(r.minutesBefore / 60, 1),
      r.tasks,
      r.tasksBefore,
    ]),
  };

  return (
    <Panel
      id="panel-tags"
      title="Tag drift"
      subtitle={summary}
      table={table}
      actions={
        anyMinutes && rows.length > 0 ? (
          <Segmented value={metric} onChange={setMetric} options={METRICS} size="sm" />
        ) : undefined
      }
    >
      {!rows.length ? (
        <EmptyState
          className="py-8"
          icon={Tags}
          title="No tags in play"
          description="Tag your tasks — #deep, #admin, #quran — and this shows what quietly took over your week and what fell away, with one click to narrow the whole page to a tag."
        />
      ) : (
        <>
          <Chart
            height={height}
            animateKey={`${effective}-${shown.length}`}
            label={`Tag drift against the previous window, measured in ${effective === "minutes" ? "focus time" : "tagged tasks"}. ${summary}`}
            tip={({ w }) => tipAt(w)}
            nav={{
              n: shown.length,
              index: cursor,
              onIndex: setCursor,
              describe,
              onActivate: (i) => onToggleTag(shown[i].name),
              activateLabel: "filter the page by that tag",
              step: { horizontal: 1, vertical: 0 },
              hint: "Arrow keys move between tags",
            }}
          >
            {({ w }) => {
              const trackX = LABEL_W;
              const trackW = Math.max(24, w - LABEL_W - VALUE_W);
              const max = Math.max(
                1,
                ...shown.map((r) => Math.max(driftValue(r, effective), driftValueBefore(r, effective))),
              );
              const x = (v: number) => trackX + (v / max) * trackW;

              return (
                <>
                  <defs>
                    <clipPath id={clipId}>
                      <rect x={0} y={0} width={LABEL_W - 8} height={height} />
                    </clipPath>
                  </defs>

                  {shown.map((r, i) => {
                    const top = i * ROW_H;
                    const now = driftValue(r, effective);
                    const before = driftValueBefore(r, effective);
                    const grew = now >= before;
                    const isActive = active.has(r.name);
                    const dim = cursor != null && cursor !== i;

                    return (
                      <g
                        key={r.name}
                        className={r.tint ? `tint-${r.tint}` : "tint-slate"}
                        opacity={dim ? 0.55 : 1}
                      >
                        <title>{describe(i)}</title>

                        {isActive && (
                          <rect
                            x={0} y={top + 1} width={w} height={ROW_H - 2} rx={6}
                            fill="var(--accent)" opacity={0.08}
                          />
                        )}

                        <text
                          x={isActive ? 14 : 0} y={top + 19}
                          clipPath={`url(#${clipId})`}
                          className="text-[12px]"
                          fill={isActive ? "var(--accent)" : "var(--ink-2)"}
                        >
                          {r.name}
                        </text>
                        {isActive && (
                          <path
                            d={`M3 ${top + 15} l3 3 l6 -6.5`}
                            fill="none" stroke="var(--accent)" strokeWidth={1.8}
                            strokeLinecap="round" strokeLinejoin="round"
                          />
                        )}

                        <line
                          x1={trackX} x2={trackX + trackW} y1={top + 15} y2={top + 15}
                          stroke="var(--line)" strokeWidth={1} shapeRendering="crispEdges"
                        />
                        <line
                          x1={x(Math.min(now, before))} x2={x(Math.max(now, before))}
                          y1={top + 15} y2={top + 15}
                          stroke={grew ? "var(--tint)" : "var(--ink-4)"}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                        />
                        {/* Hollow dot is where it was, filled is where it is. */}
                        <circle
                          cx={x(before)} cy={top + 15} r={3}
                          fill="var(--canvas)" stroke="var(--ink-4)" strokeWidth={1.5}
                        />
                        <circle cx={x(now)} cy={top + 15} r={4} fill="var(--tint)" />
                        {/* Direction is a shape, not just the dot order. */}
                        <path
                          d={
                            grew
                              ? `M${x(now) + 6} ${top + 15} l-4 -3 v6 Z`
                              : `M${x(now) - 6} ${top + 15} l4 -3 v6 Z`
                          }
                          fill={grew ? "var(--tint)" : "var(--ink-4)"}
                        />

                        <text
                          x={w} y={top + 19} textAnchor="end"
                          className="text-[11.5px] font-medium tnum"
                          fill={now === before ? "var(--ink-4)" : grew ? "var(--tint-ink)" : "var(--ink-3)"}
                        >
                          {deltaText(now, before, effective)}
                        </text>

                        <rect
                          x={0} y={top} width={w} height={ROW_H}
                          fill="transparent"
                          className="cursor-pointer"
                          onMouseEnter={() => setCursor(i)}
                          onMouseLeave={() => setCursor((c) => (c === i ? null : c))}
                          onClick={() => onToggleTag(r.name)}
                        />
                      </g>
                    );
                  })}
                </>
              );
            }}
          </Chart>

          <Legend
            className="mt-3"
            items={[
              { key: "before", label: previousLabel, color: "var(--canvas)", pattern: "grid", mark: "var(--ink-4)" },
              { key: "now", label: "This window", color: "var(--ink-2)" },
            ]}
          />

          <PanelNote>
            {rows.length > shown.length
              ? `The ${rows.length - shown.length} steadiest tags are not drawn — the data table and the CSV carry all ${rows.length}. `
              : ""}
            Click or press Enter on a tag to narrow every panel on this page to it. This panel always
            reads every tag, filter or not, so you can change your mind from here.
          </PanelNote>
        </>
      )}
    </Panel>
  );
}
