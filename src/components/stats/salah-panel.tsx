"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Moon } from "lucide-react";
import { PRAYER_LABELS } from "@/lib/types";
import { Button, EmptyState, Ring } from "@/components/ui/primitives";
import { Chart, Legend, Panel, pctOf, type HoverPoint, type TipState } from "./chart-kit";
import { onTime, type PrayerStat } from "./derive";

const ROW_H = 28;
const LABEL_W = 54;
const VALUE_W = 40;

const SEGMENTS = [
  { key: "jamaah", label: "Jamaah", color: "var(--success)", opacity: 1 },
  { key: "prayed", label: "On time", color: "var(--accent)", opacity: 1 },
  { key: "late", label: "Late", color: "var(--warn)", opacity: 1 },
  { key: "qadha", label: "Qadha", color: "var(--ink-3)", opacity: 1 },
  { key: "missing", label: "Not logged", color: "var(--line)", opacity: 1 },
] as const;

export function SalahPanel({
  stats, streak, days,
}: {
  stats: PrayerStat[];
  streak: number;
  days: number;
}) {
  const router = useRouter();
  const clipId = React.useId();
  const [hover, setHover] = React.useState<HoverPoint | null>(null);

  const total = days * 5;
  const kept = stats.reduce((s, p) => s + onTime(p), 0);
  const qadha = stats.reduce((s, p) => s + p.qadha, 0);
  const weakest = React.useMemo(
    () => [...stats].sort((a, b) => onTime(a) - onTime(b))[0],
    [stats],
  );
  const hasData = kept + qadha > 0;

  const summary = hasData
    ? `${kept} of ${total} prayers kept on time — ${pctOf(kept, total)}%` +
      (qadha ? `, plus ${qadha} made up as qadha` : "") +
      (weakest ? `. ${PRAYER_LABELS[weakest.name]} slips most, missing ${weakest.missing} of ${weakest.total} days.` : ".")
    : "No salah has been logged in this window.";

  const tip: TipState | null = hover && stats[hover.i]
    ? {
        x: hover.x,
        y: hover.y,
        title: PRAYER_LABELS[stats[hover.i].name],
        rows: SEGMENTS.map((seg) => ({
          label: seg.label,
          value: String(stats[hover.i][seg.key]),
          color: seg.color,
        })),
      }
    : null;

  return (
    <Panel title="Salah" subtitle={summary}>
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
                  <span className="text-[16px]">%</span>
                </p>
                <p className="mt-1 text-[10.5px] uppercase tracking-[0.06em] text-ink-4">on time</p>
              </div>
            </Ring>
            <p className="text-[11.5px] text-ink-3 tnum">
              {streak > 0 ? `${streak}-day full streak` : "No full day streak"}
            </p>
          </div>

          <div className="min-w-0 flex-1">
            <Chart
              height={stats.length * ROW_H}
              label={`Per-prayer breakdown. ${summary}`}
              tip={tip}
            >
              {({ w }) => {
                const barX = LABEL_W;
                const barW = Math.max(20, w - LABEL_W - VALUE_W);
                const barH = 9;

                return (
                  <>
                    <defs>
                      <clipPath id={clipId}>
                        {stats.map((p, i) => (
                          <rect
                            key={p.name}
                            x={barX} y={i * ROW_H + 8} width={barW} height={barH} rx={barH / 2}
                          />
                        ))}
                      </clipPath>
                    </defs>

                    {stats.map((p, i) => {
                      const top = i * ROW_H;
                      const dim = hover != null && hover.i !== i;
                      let cursor = barX;
                      return (
                        <g key={p.name} opacity={dim ? 0.55 : 1}>
                          <text
                            x={0} y={top + 16}
                            className="text-[12px]"
                            fill="var(--ink-2)"
                          >
                            {PRAYER_LABELS[p.name]}
                          </text>

                          <g clipPath={`url(#${clipId})`}>
                            {SEGMENTS.map((seg) => {
                              const value = p[seg.key];
                              const width = (value / Math.max(1, p.total)) * barW;
                              const x = cursor;
                              cursor += width;
                              if (width <= 0) return null;
                              return (
                                <rect
                                  key={seg.key}
                                  x={x} y={top + 8} width={width} height={barH}
                                  fill={seg.color}
                                />
                              );
                            })}
                          </g>

                          <text
                            x={w} y={top + 16} textAnchor="end"
                            className="text-[11.5px] tnum"
                            fill="var(--ink-3)"
                          >
                            {pctOf(onTime(p), p.total)}%
                          </text>

                          <rect
                            x={0} y={top} width={w} height={ROW_H}
                            fill="transparent"
                            onMouseEnter={() => setHover({ i, x: barX + barW / 2, y: top + 6 })}
                            onMouseLeave={() => setHover((h) => (h?.i === i ? null : h))}
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
              items={SEGMENTS.map((s) => ({ label: s.label, color: s.color }))}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}
