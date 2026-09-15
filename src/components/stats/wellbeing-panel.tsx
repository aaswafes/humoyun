"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HeartPulse } from "lucide-react";
import { formatDate } from "@/lib/date";
import { Button, EmptyState } from "@/components/ui/primitives";
import {
  AxisText, Chart, GridY, HoverSurface, Legend, Panel, PanelNote, UnitLabel,
  axisTicks, fmt, linePath,
  type TableSpec, type TipState,
} from "./chart-kit";
import type { WellbeingSummary } from "./derive";

const PAD = { l: 26, r: 8, t: 16, b: 20 };
const H = 176;

/** Mood and energy are both 1–5, so one axis carries them honestly. */
const SCALE_MAX = 5;

function correlationPhrase(r: number | null): string {
  if (r == null) return "Not enough logged days yet to say whether sleep moves your mood.";
  const strength = Math.abs(r) >= 0.5 ? "clearly" : Math.abs(r) >= 0.3 ? "a little" : "barely";
  if (Math.abs(r) < 0.15) return "Sleep and mood move independently over this window.";
  return r > 0
    ? `Mood tracks sleep ${strength} (r ${fmt(r, 2)}) — longer nights, better days.`
    : `Mood runs against sleep ${strength} (r ${fmt(r, 2)}), which is worth a second look.`;
}

export function WellbeingPanel({ data }: { data: WellbeingSummary }) {
  const router = useRouter();
  const [cursor, setCursor] = React.useState<number | null>(null);

  const rows = data.days;
  const hasAny = data.loggedDays > 0;

  const summary = hasAny
    ? [
        `Logged on ${data.loggedDays} of ${rows.length} days.`,
        data.mood != null ? `Mood ${fmt(data.mood, 1)}/5` : "",
        data.energy != null ? `energy ${fmt(data.energy, 1)}/5` : "",
        data.sleep != null ? `${fmt(data.sleep, 1)}h sleep` : "",
      ].filter(Boolean).join(" · ") + ". " + correlationPhrase(data.sleepMoodCorrelation)
    : "Mood, energy, sleep, water and steps are recorded on the day log. Nothing has been logged in this window.";

  const geom = React.useCallback((w: number) => {
    const n = Math.max(1, rows.length);
    const plotW = Math.max(1, w - PAD.l - PAD.r);
    const plotH = H - PAD.t - PAD.b;
    return {
      n, plotW, plotH,
      y: (v: number) => PAD.t + plotH - (v / SCALE_MAX) * plotH,
      cx: (i: number) => (n === 1 ? PAD.l + plotW / 2 : PAD.l + (plotW / (n - 1)) * i),
    };
  }, [rows.length]);

  const describe = React.useCallback((i: number) => {
    const r = rows[i];
    if (!r) return "";
    if (!r.logged) return `${formatDate(r.date)}: nothing logged.`;
    const parts: string[] = [];
    if (r.mood != null) parts.push(`mood ${r.mood} of 5`);
    if (r.energy != null) parts.push(`energy ${r.energy} of 5`);
    if (r.sleep != null) parts.push(`${r.sleep} hours slept`);
    if (r.water > 0) parts.push(`${r.water} glasses of water`);
    if (r.steps != null) parts.push(`${r.steps} steps`);
    return `${formatDate(r.date)}: ${parts.join(", ")}.`;
  }, [rows]);

  const tipAt = (w: number): TipState | null => {
    const r = cursor == null ? null : rows[cursor];
    if (!r) return null;
    const g = geom(w);
    const tipRows = [];
    if (r.mood != null) tipRows.push({ label: "Mood", value: `${r.mood}/5`, color: "var(--accent)" });
    if (r.energy != null) tipRows.push({ label: "Energy", value: `${r.energy}/5`, color: "var(--success)" });
    if (r.sleep != null) tipRows.push({ label: "Sleep", value: `${r.sleep}h`, color: "var(--ink-3)" });
    if (r.water > 0) tipRows.push({ label: "Water", value: `${r.water}`, color: "var(--ink-4)" });
    if (!tipRows.length) tipRows.push({ label: "Logged", value: "nothing", color: "var(--ink-4)" });
    return { x: g.cx(cursor as number), y: g.y(r.mood ?? r.energy ?? 0), title: formatDate(r.date), rows: tipRows };
  };

  const table: TableSpec = {
    caption: "What the day log recorded, day by day.",
    columns: ["Date", "Mood / energy", "Sleep, water, steps"],
    rows: rows.filter((r) => r.logged).map((r) => [
      r.date,
      `${r.mood ?? "—"} / ${r.energy ?? "—"}`,
      `${r.sleep ?? "—"}h · ${r.water} · ${r.steps ?? "—"}`,
    ]),
  };

  if (!hasAny) {
    return (
      <Panel id="panel-wellbeing" title="Mood and energy" subtitle={summary}>
        <EmptyState
          className="py-8"
          icon={HeartPulse}
          title="Nothing logged yet"
          description="Rate a day's mood and energy, or note how long you slept, and this panel starts telling you which weeks ran you down and whether sleep is what moves your mood."
          action={
            <Button variant="primary" size="sm" onClick={() => router.push("/today")}>
              Open today
            </Button>
          }
        />
      </Panel>
    );
  }

  const moodPoints = (g: ReturnType<typeof geom>) =>
    rows.map((r, i) => (r.mood == null ? null : [g.cx(i), g.y(r.mood)] as [number, number]))
      .filter((p): p is [number, number] => p !== null);
  const energyPoints = (g: ReturnType<typeof geom>) =>
    rows.map((r, i) => (r.energy == null ? null : [g.cx(i), g.y(r.energy)] as [number, number]))
      .filter((p): p is [number, number] => p !== null);

  return (
    <Panel id="panel-wellbeing" title="Mood and energy" subtitle={summary} table={table}>
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          { label: "Mood", value: data.mood != null ? fmt(data.mood, 1) : "—", sub: "out of 5" },
          { label: "Energy", value: data.energy != null ? fmt(data.energy, 1) : "—", sub: "out of 5" },
          { label: "Sleep", value: data.sleep != null ? `${fmt(data.sleep, 1)}h` : "—", sub: "a night, on logged days" },
          { label: "Steps", value: data.steps != null ? fmt(data.steps, 0) : "—", sub: data.water != null ? `${fmt(data.water, 1)} glasses water` : "a day" },
        ].map((cell) => (
          <div key={cell.label} className="min-w-0">
            <div className="text-[11.5px] text-ink-3">{cell.label}</div>
            <div className="display-serif mt-1 text-[22px] leading-none text-ink tnum">{cell.value}</div>
            <p className="mt-1 truncate text-[11px] text-ink-4 tnum">{cell.sub}</p>
          </div>
        ))}
      </div>

      <Chart
        height={H}
        animateKey={`wellbeing-${rows.length}`}
        label={`Mood and energy, day by day. ${summary}`}
        tip={({ w }) => tipAt(w)}
        nav={{ n: Math.max(1, rows.length), index: cursor, onIndex: setCursor, describe, hint: "Arrow keys move between days" }}
      >
        {({ w }) => {
          const g = geom(w);
          const labelStep = Math.max(1, Math.ceil(g.n / 6));
          const mood = moodPoints(g);
          const energy = energyPoints(g);

          return (
            <>
              <GridY
                x0={PAD.l} x1={PAD.l + g.plotW} ticks={axisTicks(SCALE_MAX, 2)} y={g.y}
                format={(v) => fmt(v)}
              />
              <UnitLabel x={0} y={9}>/ 5</UnitLabel>

              {energy.length > 1 && (
                <path d={linePath(energy)} fill="none" stroke="var(--success)" strokeWidth={1.5}
                  strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
              )}
              {mood.length > 1 && (
                <path d={linePath(mood)} fill="none" stroke="var(--accent)" strokeWidth={1.75}
                  strokeLinecap="round" strokeLinejoin="round" />
              )}

              {rows.map((r, i) =>
                r.mood == null ? null : (
                  <circle key={r.date} cx={g.cx(i)} cy={g.y(r.mood)} r={cursor === i ? 3.5 : 2}
                    fill="var(--accent)">
                    <title>{describe(i)}</title>
                  </circle>
                ),
              )}

              {rows.map((r, i) =>
                i % labelStep === 0 || i === g.n - 1 ? (
                  <AxisText key={r.date} x={g.cx(i)} y={H - 5}>
                    {formatDate(r.date, { weekday: false })}
                  </AxisText>
                ) : null,
              )}

              <HoverSurface
                x={PAD.l} y={PAD.t} w={g.plotW} h={g.plotH} n={g.n} mode="point"
                onIndex={setCursor}
                onLeave={() => setCursor(null)}
              />
            </>
          );
        }}
      </Chart>

      <Legend
        items={[
          { key: "mood", label: "Mood", color: "var(--accent)" },
          { key: "energy", label: "Energy", color: "var(--success)" },
        ]}
      />

      {(data.best || data.worst) && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[12px] text-ink-3">
          {data.best && (
            <span>Best day: {formatDate(data.best.date)} at {data.best.mood}/5</span>
          )}
          {data.worst && data.worst.date !== data.best?.date && (
            <span>Hardest: {formatDate(data.worst.date)} at {data.worst.mood}/5</span>
          )}
        </div>
      )}

      <PanelNote>
        Only days you actually rated are averaged — a day left blank is a day unanswered, not a
        zero, and counting it as one would drag every average down for no reason.
      </PanelNote>
    </Panel>
  );
}
