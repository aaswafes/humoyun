"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import { dayNameOf, formatDate } from "@/lib/date";
import { cadenceLabel } from "@/lib/habits";
import { Button, EmptyState, Segmented } from "@/components/ui/primitives";
import {
  Chart, HoverSurface, Panel, PanelNote, areaPath, linePath, pctOf,
  type TableSpec, type TipState,
} from "./chart-kit";
import { useOpenDay } from "./open-day";
import type { HabitSeries } from "./derive";

const SPARK_H = 46;
const BAR_LIMIT = 92;

type SortKey = "rate" | "streak" | "name";

const SORTS: { value: SortKey; label: string; title: string }[] = [
  { value: "rate", label: "Rate", title: "Strongest completion rate first" },
  { value: "streak", label: "Streak", title: "Longest current streak first" },
  { value: "name", label: "A–Z", title: "Alphabetical" },
];

/** Trailing completion rate, counting only the days the habit was actually due. */
function rollingRate(values: (number | null)[], window: number): number[] {
  return values.map((_, i) => {
    let sum = 0;
    let seen = 0;
    for (let k = Math.max(0, i - window + 1); k <= i; k++) {
      const v = values[k];
      if (v == null) continue;
      sum += v >= 1 ? 1 : 0;
      seen++;
    }
    return seen ? sum / seen : 0;
  });
}

function HabitCard({ series, days }: { series: HabitSeries; days: string[] }) {
  const [cursor, setCursor] = React.useState<number | null>(null);
  const openDay = useOpenDay();
  const n = days.length;
  const asBars = n <= BAR_LIMIT;
  const rate = React.useMemo(
    () => (asBars ? [] : rollingRate(series.values, 7)),
    [asBars, series.values],
  );

  const target = Math.max(1, series.habit.target_count);
  const pct = pctOf(series.hit, series.due);
  const unit = series.habit.unit ? ` ${series.habit.unit}` : "";
  const cadence = cadenceLabel(series.habit, (i) => dayNameOf(i, "short"));

  const describe = React.useCallback((i: number) => {
    const date = days[i];
    if (!date) return "";
    const value = series.values[i];
    const state = value == null ? "not due" : value >= 1 ? "kept" : value > 0 ? "partly logged" : "missed";
    const trailing = asBars ? "" : `, 7-day rate ${Math.round((rate[i] ?? 0) * 100)}%`;
    return `${formatDate(date, { year: true })}: ${state}, ${series.counts[i]} of ${target}${unit}${trailing}.`;
  }, [days, series, target, unit, asBars, rate]);

  const tipAt = (w: number): TipState | null => {
    if (cursor == null || !days[cursor]) return null;
    const band = w / Math.max(1, n);
    const x = asBars ? cursor * band + band / 2 : (n === 1 ? w / 2 : (cursor / (n - 1)) * w);
    return {
      x,
      y: 4,
      title: formatDate(days[cursor]),
      rows: asBars
        ? [
            {
              label: series.values[cursor] == null ? "Rest day" : "Logged",
              value: `${series.counts[cursor]}/${target}${unit}`,
              color: "var(--tint)",
            },
          ]
        : [
            { label: "7-day rate", value: `${Math.round((rate[cursor] ?? 0) * 100)}%`, color: "var(--tint)" },
            { label: "Logged", value: `${series.counts[cursor]}/${target}${unit}` },
          ],
    };
  };

  return (
    <div className={`tint-${series.habit.color}`}>
      <div className="flex items-baseline gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--tint)" }} />
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {series.habit.name}
        </p>
        <p className="shrink-0 text-[11.5px] text-ink-3 tnum">
          {pct}%
          {series.streak > 0 && <span className="text-ink-4"> · {series.streak}d</span>}
        </p>
      </div>
      <p className="mt-0.5 text-[11px] text-ink-4 tnum">
        {cadence} · {series.hit} of {series.due} due days kept
      </p>

      <Chart
        className="mt-1.5"
        height={SPARK_H}
        animateKey={`${series.habit.id}-${n}`}
        label={`${series.habit.name}: ${series.hit} of ${series.due} due days kept, ${pct} percent, current streak ${series.streak} days.`}
        tip={({ w }) => tipAt(w)}
        nav={{
          n,
          index: cursor,
          onIndex: setCursor,
          describe,
          onActivate: (i) => openDay(days[i]),
          activateLabel: "open that day",
        }}
      >
        {({ w }) => {
          const plotH = SPARK_H - 6;
          const baseY = SPARK_H - 3;

          if (asBars) {
            const band = w / Math.max(1, n);
            const gap = band > 4 ? 1 : 0.4;
            const barW = Math.max(1, band - gap);
            return (
              <>
                <line
                  x1={0} x2={w} y1={baseY} y2={baseY}
                  stroke="var(--line)" strokeWidth={1} shapeRendering="crispEdges"
                />
                {days.map((d, i) => {
                  const v = series.values[i];
                  const x = i * band;
                  const title = <title>{describe(i)}</title>;
                  if (v == null) {
                    return (
                      <rect key={d} x={x} y={baseY - 2} width={barW} height={2} rx={1} fill="var(--line)">
                        {title}
                      </rect>
                    );
                  }
                  if (v <= 0) {
                    return (
                      <rect key={d} x={x} y={baseY - 3} width={barW} height={3} rx={1} fill="var(--line-strong)">
                        {title}
                      </rect>
                    );
                  }
                  const height = Math.max(4, v * plotH);
                  return (
                    <rect
                      key={d}
                      x={x} y={baseY - height} width={barW} height={height}
                      rx={Math.min(1.5, barW / 2)}
                      fill="var(--tint)"
                      opacity={v >= 1 ? 1 : 0.5}
                    >
                      {title}
                    </rect>
                  );
                })}
                {cursor != null && (
                  <line
                    x1={cursor * band + band / 2} x2={cursor * band + band / 2}
                    y1={0} y2={baseY}
                    stroke="var(--line-strong)" strokeWidth={1} pointerEvents="none"
                  />
                )}
                <HoverSurface
                  x={0} y={0} w={w} h={SPARK_H} n={n} mode="band"
                  onIndex={setCursor}
                  onLeave={() => setCursor(null)}
                  onActivate={(i) => openDay(days[i])}
                />
              </>
            );
          }

          const x = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
          const y = (v: number) => baseY - v * plotH;
          const pts = rate.map((v, i) => [x(i), y(v)] as [number, number]);

          return (
            <>
              <line
                x1={0} x2={w} y1={baseY} y2={baseY}
                stroke="var(--line)" strokeWidth={1} shapeRendering="crispEdges"
              />
              <path d={areaPath(pts, baseY)} fill="var(--tint)" opacity={0.14} />
              <path
                d={linePath(pts)} fill="none" stroke="var(--tint)"
                strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
              >
                <title>{`${series.habit.name}: trailing 7-day completion rate`}</title>
              </path>
              {cursor != null && (
                <g pointerEvents="none">
                  <line x1={x(cursor)} x2={x(cursor)} y1={0} y2={baseY} stroke="var(--line-strong)" strokeWidth={1} />
                  <circle cx={x(cursor)} cy={y(rate[cursor] ?? 0)} r={2.5} fill="var(--tint)" />
                </g>
              )}
              <HoverSurface
                x={0} y={0} w={w} h={SPARK_H} n={n}
                onIndex={setCursor}
                onLeave={() => setCursor(null)}
                onActivate={(i) => openDay(days[i])}
              />
            </>
          );
        }}
      </Chart>
    </div>
  );
}

export function HabitMatrix({ series, days }: { series: HabitSeries[]; days: string[] }) {
  const router = useRouter();
  const [sort, setSort] = React.useState<SortKey>("rate");

  const ordered = React.useMemo(() => {
    const list = [...series];
    if (sort === "rate") list.sort((a, b) => pctOf(b.hit, b.due) - pctOf(a.hit, a.due));
    else if (sort === "streak") list.sort((a, b) => b.streak - a.streak);
    else list.sort((a, b) => a.habit.name.localeCompare(b.habit.name));
    return list;
  }, [series, sort]);

  const best = React.useMemo(
    () => [...series].sort((a, b) => pctOf(b.hit, b.due) - pctOf(a.hit, a.due))[0],
    [series],
  );
  const worst = React.useMemo(
    () => [...series].filter((s) => s.due > 0).sort((a, b) => pctOf(a.hit, a.due) - pctOf(b.hit, b.due))[0],
    [series],
  );

  const totalDue = series.reduce((s, x) => s + x.due, 0);
  const totalHit = series.reduce((s, x) => s + x.hit, 0);

  const summary = series.length
    ? `${series.length} live ${series.length === 1 ? "habit" : "habits"}, ${totalHit} of ${totalDue} due days kept ` +
      `(${pctOf(totalHit, totalDue)}%). ` +
      (best ? `${best.habit.name} leads at ${pctOf(best.hit, best.due)}%` : "") +
      (worst && best && worst.habit.id !== best.habit.id
        ? `, ${worst.habit.name} trails at ${pctOf(worst.hit, worst.due)}%.`
        : ".")
    : "No habits are being tracked yet.";

  const table: TableSpec = {
    caption: "Habit completion across the window.",
    columns: ["Habit", "Cadence", "Kept", "Due", "Rate %", "Streak"],
    rows: ordered.map((s) => [
      s.habit.name,
      cadenceLabel(s.habit, (i) => dayNameOf(i, "short")),
      s.hit,
      s.due,
      pctOf(s.hit, s.due),
      s.streak,
    ]),
  };

  return (
    <Panel
      id="panel-habits"
      title="Habit matrix"
      subtitle={summary}
      table={table}
      actions={
        series.length > 1 ? (
          <Segmented value={sort} onChange={setSort} options={SORTS} size="sm" />
        ) : undefined
      }
    >
      {!series.length ? (
        <EmptyState
          className="py-8"
          icon={Flame}
          title="No habits yet"
          description="A habit is anything you want to repeat on a rhythm — reading, walking, tahajjud. Each one gets its own strip here so you can see the rhythm break."
          action={
            <Button variant="primary" size="sm" onClick={() => router.push("/habits")}>
              Create a habit
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
            {ordered.map((s) => (
              <HabitCard key={s.habit.id} series={s} days={days} />
            ))}
          </div>
          <PanelNote>
            {days.length <= BAR_LIMIT
              ? "One bar per day — full colour is a day you hit the target, a faint bar is partial, a stub is a miss, and a hairline is a rest day."
              : "Each line is the trailing 7-day completion rate, counting only the days that habit was due."}
            {" "}
            {formatDate(days[0], { weekday: false })} → {formatDate(days[days.length - 1], { weekday: false })}.
            Due days follow each habit's own cadence, so a 4× a week habit is never marked down for
            the days it was never owed.
          </PanelNote>
        </>
      )}
    </Panel>
  );
}
