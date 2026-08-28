"use client";

import * as React from "react";
import { CalendarRange, Clock } from "lucide-react";
import { dayNameOf, formatDuration } from "@/lib/date";
import { EmptyState, Segmented } from "@/components/ui/primitives";
import {
  AxisText, Chart, GridY, HoverSurface, Legend, Panel, PanelNote, UnitLabel,
  axisTicks, fmt, niceMax, pctOf,
  type TableSpec, type TipState,
} from "./chart-kit";
import { hourLabel, peakWindow, type HourStat, type WeekdayStat } from "./derive";

// =========================================================
// Day-of-week and time-of-day — the two rhythms a calendar-first
// system can see that a to-do list cannot.
// =========================================================

type WeekdayMetric = "rate" | "done" | "focus";

const WEEKDAY_METRICS: { value: WeekdayMetric; label: string; title: string }[] = [
  { value: "rate", label: "Rate", title: "Share of planned tasks you close" },
  { value: "done", label: "Tasks", title: "Tasks finished on an average day" },
  { value: "focus", label: "Focus", title: "Hours of focus on an average day" },
];

const WD_PAD = { l: 32, r: 8, t: 20, b: 22 };
const WD_H = 190;

function weekdayValue(row: WeekdayStat, metric: WeekdayMetric): number {
  if (metric === "rate") return row.rate ?? 0;
  if (metric === "done") return row.days > 0 ? row.done / row.days : 0;
  return row.days > 0 ? row.focusMin / row.days / 60 : 0;
}

function weekdayText(row: WeekdayStat, metric: WeekdayMetric): string {
  const v = weekdayValue(row, metric);
  if (metric === "rate") return row.rate == null ? "nothing planned" : `${Math.round(v * 100)}%`;
  if (metric === "done") return `${fmt(v, 1)} tasks a day`;
  return `${fmt(v, 1)} hours a day`;
}

export function WeekdayPanel({
  rows, previous, previousLabel,
}: {
  rows: WeekdayStat[];
  previous?: WeekdayStat[] | null;
  previousLabel?: string;
}) {
  const [metric, setMetric] = React.useState<WeekdayMetric>("rate");
  const [cursor, setCursor] = React.useState<number | null>(null);
  const ghost = previous && previous.length === rows.length ? previous : null;

  const ranked = rows.filter((r) => r.rate != null && r.days > 0);
  const best = ranked.length ? ranked.reduce((a, b) => ((b.rate ?? 0) > (a.rate ?? 0) ? b : a)) : null;
  const worst = ranked.length ? ranked.reduce((a, b) => ((b.rate ?? 1) < (a.rate ?? 1) ? b : a)) : null;
  const hasData = rows.some((r) => r.planned > 0 || r.focusMin > 0);

  const summary = !hasData
    ? "Nothing has been planned or logged in this window, so there is no weekly shape to read yet."
    : best && worst && best.index !== worst.index
      ? `${dayNameOf(best.index, "long")} is your strongest day at ${pctOf(best.done, best.planned)}% of plan, ` +
        `${dayNameOf(worst.index, "long")} your weakest at ${pctOf(worst.done, worst.planned)}%. ` +
        `Each bar averages every occurrence of that weekday inside the window, so a short range is a thin read.`
      : "One weekday carries everything measured so far — widen the range to see a shape.";

  const geom = React.useCallback((w: number) => {
    const n = rows.length;
    const plotW = Math.max(1, w - WD_PAD.l - WD_PAD.r);
    const plotH = WD_H - WD_PAD.t - WD_PAD.b;
    const values = rows.map((r) => weekdayValue(r, metric));
    const ghostValues = ghost ? ghost.map((r) => weekdayValue(r, metric)) : [];
    const max = metric === "rate" ? 1 : niceMax(Math.max(0.1, ...values, ...ghostValues));
    const band = plotW / n;
    return {
      n, plotW, plotH, max, band,
      barW: Math.max(6, Math.min(38, band - 12)),
      baseY: WD_PAD.t + plotH,
      y: (v: number) => WD_PAD.t + plotH - (Math.min(v, max) / max) * plotH,
      cx: (i: number) => WD_PAD.l + band * i + band / 2,
    };
  }, [rows, metric, ghost]);

  const describe = React.useCallback((i: number) => {
    const r = rows[i];
    if (!r) return "";
    return (
      `${dayNameOf(r.index, "long")}: ${weekdayText(r, metric)}, ` +
      `${r.done} of ${r.planned} planned tasks done across ${r.days} ${r.days === 1 ? "day" : "days"}, ` +
      `${formatDuration(Math.round(r.focusMin))} of focus.`
    );
  }, [rows, metric]);

  const tipAt = (w: number): TipState | null => {
    if (cursor == null || !rows[cursor]) return null;
    const g = geom(w);
    const r = rows[cursor];
    return {
      x: g.cx(cursor),
      y: g.y(weekdayValue(r, metric)),
      title: dayNameOf(r.index, "long"),
      rows: [
        { label: "Of plan", value: r.rate == null ? "—" : `${Math.round(r.rate * 100)}%`, color: "var(--accent)" },
        { label: "Tasks a day", value: fmt(r.days ? r.done / r.days : 0, 1) },
        { label: "Focus a day", value: `${fmt(r.days ? r.focusMin / r.days / 60 : 0, 1)}h` },
        { label: "Days counted", value: String(r.days) },
        ...(ghost
          ? [{
              label: previousLabel ?? "Previous",
              value: metric === "rate"
                ? `${Math.round(weekdayValue(ghost[cursor], metric) * 100)}%`
                : fmt(weekdayValue(ghost[cursor], metric), 1),
              color: "var(--ink-4)",
              muted: true,
            }]
          : []),
      ],
    };
  };

  const table: TableSpec = {
    caption: "Performance by day of the week.",
    columns: ["Weekday", "Days", "Done", "Planned", "Of plan %", "Focus (min)"],
    rows: rows.map((r) => [
      dayNameOf(r.index, "long"),
      r.days,
      r.done,
      r.planned,
      r.rate == null ? "—" : Math.round(r.rate * 100),
      Math.round(r.focusMin),
    ]),
  };

  return (
    <Panel
      id="panel-weekday"
      title="Day of the week"
      subtitle={summary}
      table={table}
      actions={
        hasData ? (
          <Segmented value={metric} onChange={setMetric} options={WEEKDAY_METRICS} size="sm" />
        ) : undefined
      }
    >
      {!hasData ? (
        <EmptyState
          className="py-8"
          icon={CalendarRange}
          title="No weekly shape yet"
          description="Plan a few tasks across different days and this shows which weekday you actually deliver on — and which one you keep over-booking."
        />
      ) : (
        <>
          <Chart
            height={WD_H}
            animateKey={`${metric}-${ghost ? 1 : 0}`}
            label={`Performance by day of the week, measured as ${WEEKDAY_METRICS.find((m) => m.value === metric)!.title.toLowerCase()}. ${summary}`}
            tip={({ w }) => tipAt(w)}
            nav={{ n: rows.length, index: cursor, onIndex: setCursor, describe }}
          >
            {({ w }) => {
              const g = geom(w);
              return (
                <>
                  <UnitLabel x={0} y={9}>
                    {metric === "rate" ? "% of plan" : metric === "done" ? "tasks / day" : "hours / day"}
                  </UnitLabel>
                  <GridY
                    x0={WD_PAD.l} x1={WD_PAD.l + g.plotW}
                    ticks={axisTicks(g.max, metric === "rate" ? 2 : 3)} y={g.y}
                    format={(v) => (metric === "rate" ? `${Math.round(v * 100)}` : fmt(v, g.max <= 3 ? 1 : 0))}
                  />

                  {rows.map((r, i) => {
                    const value = weekdayValue(r, metric);
                    const height = Math.max(value > 0 ? 2 : 0, g.baseY - g.y(value));
                    const active = cursor === i;
                    return (
                      <g key={r.index} opacity={cursor != null && !active ? 0.55 : 1}>
                        <rect
                          x={g.cx(i) - g.barW / 2} y={g.baseY - height}
                          width={g.barW} height={height}
                          rx={Math.min(3, g.barW / 2)}
                          fill="var(--accent)"
                          opacity={r.days > 0 ? 0.9 : 0.35}
                        >
                          <title>{describe(i)}</title>
                        </rect>
                        {ghost && (
                          <line
                            x1={g.cx(i) - g.barW / 2 - 2} x2={g.cx(i) + g.barW / 2 + 2}
                            y1={g.y(weekdayValue(ghost[i], metric))} y2={g.y(weekdayValue(ghost[i], metric))}
                            stroke="var(--ink-4)" strokeWidth={1.5} strokeDasharray="3 2"
                          >
                            <title>{`${previousLabel ?? "Previous window"}: ${weekdayText(ghost[i], metric)}`}</title>
                          </line>
                        )}
                      </g>
                    );
                  })}

                  {rows.map((r, i) => (
                    <AxisText key={r.index} x={g.cx(i)} y={WD_H - 6} strong={cursor === i}>
                      {r.label}
                    </AxisText>
                  ))}

                  <HoverSurface
                    x={WD_PAD.l} y={WD_PAD.t} w={g.plotW} h={g.plotH} n={g.n} mode="band"
                    onIndex={setCursor}
                    onLeave={() => setCursor(null)}
                  />
                </>
              );
            }}
          </Chart>

          {ghost && (
            <Legend
              className="mt-3"
              items={[
                { key: "now", label: "This window", color: "var(--accent)" },
                { key: "prev", label: previousLabel ?? "Previous window", color: "var(--ink-4)", pattern: "hatch", mark: "var(--raised)" },
              ]}
            />
          )}

          <PanelNote>
            A weekday with fewer appearances in the window is a thinner reading — the tooltip says
            how many days each bar averages.
          </PanelNote>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------
// Time of day
// ---------------------------------------------------------
const HR_PAD = { l: 32, r: 8, t: 20, b: 22 };
const HR_H = 190;

export function HourPanel({
  hours, hour12, previous, previousLabel,
}: {
  hours: HourStat[];
  hour12: boolean;
  previous?: HourStat[] | null;
  previousLabel?: string;
}) {
  const [cursor, setCursor] = React.useState<number | null>(null);
  const ghost = previous && previous.length === hours.length ? previous : null;

  const totalFocus = hours.reduce((s, h) => s + h.focusMin, 0);
  const totalDone = hours.reduce((s, h) => s + h.completed, 0);
  const peak = peakWindow(hours, 3);
  const hasData = totalFocus > 0 || totalDone > 0;

  const summary = !hasData
    ? "No focus session and no completion carries a time of day in this window yet."
    : (peak
        ? `${pctOf(peak.minutes, totalFocus)}% of your focus lands between ${hourLabel(peak.from, hour12)} and ${hourLabel(peak.to, hour12)}. `
        : "") +
      `${formatDuration(Math.round(totalFocus))} logged across the day, and ${totalDone} ` +
      `${totalDone === 1 ? "task was" : "tasks were"} ticked off with a timestamp.`;

  const geom = React.useCallback((w: number) => {
    const n = hours.length;
    const plotW = Math.max(1, w - HR_PAD.l - HR_PAD.r);
    const plotH = HR_H - HR_PAD.t - HR_PAD.b;
    const max = niceMax(Math.max(1, ...hours.map((h) => h.focusMin), ...(ghost ? ghost.map((h) => h.focusMin) : [])));
    const doneMax = Math.max(1, ...hours.map((h) => h.completed));
    const band = plotW / n;
    return {
      n, plotW, plotH, max, doneMax, band,
      barW: Math.max(3, band - 3),
      baseY: HR_PAD.t + plotH,
      y: (v: number) => HR_PAD.t + plotH - (v / max) * plotH,
      dotY: (v: number) => HR_PAD.t + plotH - (v / doneMax) * plotH,
      cx: (i: number) => HR_PAD.l + band * i + band / 2,
    };
  }, [hours, ghost]);

  const describe = React.useCallback((i: number) => {
    const h = hours[i];
    if (!h) return "";
    return (
      `${hourLabel(h.hour, hour12)} to ${hourLabel(h.hour + 1, hour12)}: ` +
      `${formatDuration(Math.round(h.focusMin))} of focus across ${h.sessions} ` +
      `${h.sessions === 1 ? "session" : "sessions"}, ${h.completed} ${h.completed === 1 ? "task" : "tasks"} finished.`
    );
  }, [hours, hour12]);

  const tipAt = (w: number): TipState | null => {
    if (cursor == null || !hours[cursor]) return null;
    const g = geom(w);
    const h = hours[cursor];
    return {
      x: g.cx(cursor),
      y: g.y(h.focusMin),
      title: `${hourLabel(h.hour, hour12)} – ${hourLabel(h.hour + 1, hour12)}`,
      rows: [
        { label: "Focus", value: formatDuration(Math.round(h.focusMin)), color: "var(--accent)" },
        { label: "Sessions", value: String(h.sessions) },
        { label: "Finished", value: String(h.completed), color: "var(--success)" },
        ...(ghost
          ? [{ label: previousLabel ?? "Previous", value: formatDuration(Math.round(ghost[cursor].focusMin)), color: "var(--ink-4)", muted: true }]
          : []),
      ],
    };
  };

  const table: TableSpec = {
    caption: "Focus and completions by hour of the day.",
    columns: ["Hour", "Focus (min)", "Sessions", "Tasks finished"],
    rows: hours
      .filter((h) => h.focusMin > 0 || h.completed > 0)
      .map((h) => [
        `${hourLabel(h.hour, hour12)} – ${hourLabel(h.hour + 1, hour12)}`,
        Math.round(h.focusMin),
        h.sessions,
        h.completed,
      ]),
  };

  return (
    <Panel id="panel-hours" title="Time of day" subtitle={summary} table={table}>
      {!hasData ? (
        <EmptyState
          className="py-8"
          icon={Clock}
          title="No shape to the day yet"
          description="Run the focus timer and tick tasks off as you finish them. This then shows the hours that actually carry your work, so you can defend them."
        />
      ) : (
        <>
          <Chart
            height={HR_H}
            animateKey={`hours-${ghost ? 1 : 0}`}
            label={`Focus minutes and finished tasks by hour of the day. ${summary}`}
            tip={({ w }) => tipAt(w)}
            nav={{ n: hours.length, index: cursor, onIndex: setCursor, describe, step: { horizontal: 1, vertical: 6 }, hint: "Arrow keys step an hour · up and down jump six" }}
          >
            {({ w }) => {
              const g = geom(w);
              return (
                <>
                  <UnitLabel x={0} y={9}>minutes</UnitLabel>
                  <GridY
                    x0={HR_PAD.l} x1={HR_PAD.l + g.plotW}
                    ticks={axisTicks(g.max, 3)} y={g.y}
                    format={(v) => fmt(v)}
                  />

                  {peak && (
                    <rect
                      x={g.cx(peak.from) - g.band / 2} y={HR_PAD.t}
                      width={g.band * (peak.to - peak.from)} height={g.plotH}
                      fill="var(--accent)" opacity={0.06} rx={4}
                    >
                      <title>
                        {`Peak window: ${hourLabel(peak.from, hour12)} to ${hourLabel(peak.to, hour12)}, ` +
                          `${pctOf(peak.minutes, totalFocus)}% of all focus`}
                      </title>
                    </rect>
                  )}

                  {hours.map((h, i) => {
                    const height = Math.max(h.focusMin > 0 ? 1.5 : 0, g.baseY - g.y(h.focusMin));
                    const active = cursor === i;
                    return (
                      <g key={h.hour} opacity={cursor != null && !active ? 0.55 : 1}>
                        <rect
                          x={g.cx(i) - g.barW / 2} y={g.baseY - height}
                          width={g.barW} height={height}
                          rx={Math.min(2, g.barW / 2)}
                          fill="var(--accent)"
                        >
                          <title>{describe(i)}</title>
                        </rect>
                        {ghost && ghost[i].focusMin > 0 && (
                          <line
                            x1={g.cx(i) - g.barW / 2} x2={g.cx(i) + g.barW / 2}
                            y1={g.y(ghost[i].focusMin)} y2={g.y(ghost[i].focusMin)}
                            stroke="var(--ink-4)" strokeWidth={1.25} strokeDasharray="2 2"
                          />
                        )}
                        {h.completed > 0 && (
                          <circle
                            cx={g.cx(i)} cy={g.dotY(h.completed)} r={2.25}
                            fill="var(--success)"
                          >
                            <title>{`${h.completed} finished at ${hourLabel(h.hour, hour12)}`}</title>
                          </circle>
                        )}
                      </g>
                    );
                  })}

                  {hours.map((h, i) =>
                    h.hour % 6 === 0 ? (
                      <AxisText key={h.hour} x={g.cx(i)} y={HR_H - 6}>
                        {hourLabel(h.hour, hour12)}
                      </AxisText>
                    ) : null,
                  )}

                  <HoverSurface
                    x={HR_PAD.l} y={HR_PAD.t} w={g.plotW} h={g.plotH} n={g.n} mode="band"
                    onIndex={setCursor}
                    onLeave={() => setCursor(null)}
                  />
                </>
              );
            }}
          </Chart>

          <Legend
            className="mt-3"
            items={[
              { key: "focus", label: "Focus minutes", color: "var(--accent)" },
              { key: "done", label: "Tasks finished (own scale)", color: "var(--success)" },
              ...(ghost
                ? [{ key: "prev", label: previousLabel ?? "Previous window", color: "var(--ink-4)", pattern: "hatch" as const, mark: "var(--raised)" }]
                : []),
            ]}
          />

          <PanelNote>
            A session that runs past the hour is split across the hours it covers, so the bars add
            up to the real total. Completion dots use their own scale — they mark when you finish,
            not how much.
          </PanelNote>
        </>
      )}
    </Panel>
  );
}
