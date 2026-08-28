"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Moon } from "lucide-react";
import { PRAYER_LABELS } from "@/lib/types";
import { Button, EmptyState, Ring } from "@/components/ui/primitives";
import {
  Chart, Legend, Panel, PanelNote, SeriesPatterns, fillOf, pctOf, useSvgId,
  type SeriesStyle, type TableSpec, type TipState,
} from "./chart-kit";
import { onTime, type PrayerStat } from "./derive";

const ROW_H = 30;
const LABEL_W = 54;
const VALUE_W = 44;
const BAR_H = 10;

/**
 * Five states, five colours — and five fills. Qadha and "not logged" were two
 * near-identical greys, so they now differ in tone *and* in shape.
 */
type SalahSegment = SeriesStyle & { key: "jamaah" | "prayed" | "late" | "qadha" | "missing" };

const SEGMENTS: readonly SalahSegment[] = [
  { key: "jamaah", label: "Jamaah", color: "var(--success)", pattern: "solid" },
  { key: "prayed", label: "On time", color: "var(--accent)", pattern: "solid" },
  { key: "late", label: "Late", color: "var(--warn)", pattern: "hatch", mark: "var(--raised)" },
  { key: "qadha", label: "Qadha", color: "var(--ink-2)", pattern: "dots", mark: "var(--raised)" },
  { key: "missing", label: "Not logged", color: "var(--hover)", pattern: "back-hatch", mark: "var(--line-strong)" },
];

export function SalahPanel({
  stats, streak, days,
}: {
  stats: PrayerStat[];
  streak: number;
  days: number;
}) {
  const router = useRouter();
  const clipId = useSvgId("salah-clip");
  const patternId = useSvgId("salah-seg");
  const [cursor, setCursor] = React.useState<number | null>(null);
  const [isolated, setIsolated] = React.useState<ReadonlySet<string>>(new Set());

  const total = days * 5;
  const kept = stats.reduce((s, p) => s + onTime(p), 0);
  const jamaah = stats.reduce((s, p) => s + p.jamaah, 0);
  const qadha = stats.reduce((s, p) => s + p.qadha, 0);
  const weakest = React.useMemo(
    () => [...stats].sort((a, b) => onTime(a) - onTime(b))[0],
    [stats],
  );
  const hasData = kept + qadha > 0;

  const toggleSeries = (key: string) =>
    setIsolated((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const isolating = isolated.size > 0;
  const selectedSum = (p: PrayerStat) =>
    SEGMENTS.reduce((sum, s) => (isolated.has(s.key) ? sum + p[s.key] : sum), 0);

  const summary = hasData
    ? `${kept} of ${total} prayers kept on time — ${pctOf(kept, total)}%` +
      (jamaah ? `, ${jamaah} of them in jamaah` : "") +
      (qadha ? `, plus ${qadha} made up as qadha` : "") +
      (weakest ? `. ${PRAYER_LABELS[weakest.name]} slips most, missing ${weakest.missing} of ${weakest.total} days.` : ".")
    : "No salah has been logged in this window.";

  const describe = React.useCallback((i: number) => {
    const p = stats[i];
    if (!p) return "";
    const parts = SEGMENTS.map((s) => `${s.label} ${p[s.key]}`).join(", ");
    return `${PRAYER_LABELS[p.name]}: ${parts}. ${pctOf(onTime(p), p.total)}% kept on time.`;
  }, [stats]);

  const tipAt = (w: number): TipState | null => {
    if (cursor == null || !stats[cursor]) return null;
    const p = stats[cursor];
    return {
      x: LABEL_W + Math.max(20, w - LABEL_W - VALUE_W) / 2,
      y: cursor * ROW_H + 6,
      title: PRAYER_LABELS[p.name],
      rows: SEGMENTS.map((seg) => ({
        label: seg.label,
        value: String(p[seg.key]),
        color: seg.color,
        pattern: seg.pattern,
        mark: seg.mark,
        muted: isolating && !isolated.has(seg.key),
      })),
    };
  };

  const table: TableSpec = {
    caption: "Each prayer across the window, by how it was kept.",
    columns: ["Prayer", ...SEGMENTS.map((s) => s.label), "On time %"],
    rows: stats.map((p) => [
      PRAYER_LABELS[p.name],
      ...SEGMENTS.map((s) => p[s.key]),
      pctOf(onTime(p), p.total),
    ]),
  };

  return (
    <Panel id="panel-salah" title="Salah" subtitle={summary} table={table}>
      {!hasData ? (
        <EmptyState
          className="py-8"
          icon={Moon}
          title="No prayers logged yet"
          description="Tap through the five prayers each day and this ring fills in — along with an honest read on which one keeps slipping."
          action={
            <Button variant="primary" size="sm" onClick={() => router.push("/salah")}>
              Log today&rsquo;s salah
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="flex shrink-0 flex-col items-center gap-2">
            <Ring value={kept} max={Math.max(1, total)} size={132} stroke={9}>
              <div className="text-center">
                <p className="display-serif text-[32px] leading-none text-ink tnum">
                  {pctOf(kept, total)}
                  <span className="text-[15px]">%</span>
                </p>
                <p className="mt-1 text-[10.5px] uppercase tracking-[0.06em] text-ink-4">on time</p>
              </div>
            </Ring>
            <p className="text-[11.5px] text-ink-3 tnum">
              {streak > 0 ? `${streak}-day full streak` : "No full day streak"}
            </p>
            <p className="text-[11px] text-ink-4 tnum">
              {pctOf(jamaah, Math.max(1, kept))}% of kept prayers in jamaah
            </p>
          </div>

          <div className="min-w-0 flex-1">
            <Chart
              height={stats.length * ROW_H}
              animateKey={`salah-${days}`}
              label={`Per-prayer breakdown. ${summary}`}
              description="Each bar runs across every day in the window: jamaah, on time, late, qadha, then the days with no record."
              tip={({ w }) => tipAt(w)}
              nav={{
                n: stats.length,
                index: cursor,
                onIndex: setCursor,
                describe,
                hint: "Arrow keys move between prayers",
              }}
            >
              {({ w }) => {
                const barX = LABEL_W;
                const barW = Math.max(20, w - LABEL_W - VALUE_W);

                return (
                  <>
                    <SeriesPatterns prefix={patternId} series={SEGMENTS} />
                    <defs>
                      <clipPath id={clipId}>
                        {stats.map((p, i) => (
                          <rect
                            key={p.name}
                            x={barX} y={i * ROW_H + 8} width={barW} height={BAR_H} rx={BAR_H / 2}
                          />
                        ))}
                      </clipPath>
                    </defs>

                    {stats.map((p, i) => {
                      const top = i * ROW_H;
                      const dim = cursor != null && cursor !== i;
                      let x = barX;
                      return (
                        <g key={p.name} opacity={dim ? 0.55 : 1}>
                          <title>{describe(i)}</title>

                          <text
                            x={0} y={top + 17}
                            className="text-[12px]"
                            fill="var(--ink-2)"
                          >
                            {PRAYER_LABELS[p.name]}
                          </text>

                          <g clipPath={`url(#${clipId})`}>
                            {SEGMENTS.map((seg) => {
                              const value = p[seg.key];
                              const width = (value / Math.max(1, p.total)) * barW;
                              const segX = x;
                              x += width;
                              if (width <= 0) return null;
                              return (
                                <rect
                                  key={seg.key}
                                  x={segX} y={top + 8} width={width} height={BAR_H}
                                  fill={fillOf(patternId, seg)}
                                  opacity={isolating && !isolated.has(seg.key) ? 0.22 : 1}
                                >
                                  <title>
                                    {`${PRAYER_LABELS[p.name]} — ${seg.label}: ${value} of ${p.total} days (${pctOf(value, p.total)}%)`}
                                  </title>
                                </rect>
                              );
                            })}
                          </g>

                          <text
                            x={w} y={top + 17} textAnchor="end"
                            className="text-[11.5px] tnum"
                            fill={isolating ? "var(--ink-2)" : "var(--ink-3)"}
                          >
                            {isolating ? selectedSum(p) : `${pctOf(onTime(p), p.total)}%`}
                          </text>

                          <rect
                            x={0} y={top} width={w} height={ROW_H}
                            fill="transparent"
                            onMouseEnter={() => setCursor(i)}
                            onMouseLeave={() => setCursor((c) => (c === i ? null : c))}
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
              label="Isolate a way of keeping the prayer"
              active={isolated}
              onToggle={toggleSeries}
              items={SEGMENTS.map((s) => ({
                key: s.key,
                label: s.label,
                color: s.color,
                pattern: s.pattern,
                mark: s.mark,
                value: String(stats.reduce((sum, p) => sum + p[s.key], 0)),
              }))}
            />

            <PanelNote>
              {isolating
                ? "The number at the end of each bar counts only the states you picked. Press a legend button again to release it."
                : "Every state has a fill of its own as well as a colour. Press a legend button to isolate one and read its count per prayer."}
            </PanelNote>
          </div>
        </div>
      )}
    </Panel>
  );
}
