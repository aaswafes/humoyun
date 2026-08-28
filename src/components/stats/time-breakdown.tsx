"use client";

import * as React from "react";
import { Hourglass } from "lucide-react";
import { formatDuration } from "@/lib/date";
import { useStore } from "@/lib/store";
import { Button, EmptyState, SectionLabel } from "@/components/ui/primitives";
import {
  Chart, Panel, PanelNote, fmt, pctOf, type HoverPoint, type TipState,
} from "./chart-kit";
import type { Slice } from "./derive";

const ROW_H = 30;
const VALUE_W = 74;

function HBars({
  slices, total, title, emptyNote,
}: {
  slices: Slice[];
  total: number;
  title: string;
  emptyNote: string;
}) {
  const clipId = React.useId();
  const [hover, setHover] = React.useState<HoverPoint | null>(null);
  const max = Math.max(1, ...slices.map((s) => s.minutes));
  const height = Math.max(ROW_H, slices.length * ROW_H);

  const tip: TipState | null =
    hover && slices[hover.i]
      ? {
          x: hover.x,
          y: hover.y,
          title: slices[hover.i].label,
          rows: [
            { label: "Focus", value: formatDuration(Math.round(slices[hover.i].minutes)) },
            { label: "Share", value: `${pctOf(slices[hover.i].minutes, total)}%` },
          ],
        }
      : null;

  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      {slices.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-ink-4">{emptyNote}</p>
      ) : (
        <Chart
          className="mt-2"
          height={height}
          label={`${title}. ${slices
            .map((s) => `${s.label}: ${formatDuration(Math.round(s.minutes))}`)
            .join(", ")}.`}
          tip={tip}
        >
          {({ w }) => {
            const barW = Math.max(20, w);
            const labelW = Math.max(40, barW - VALUE_W);
            return (
              <>
                <defs>
                  <clipPath id={clipId}>
                    <rect x={0} y={0} width={labelW} height={height} />
                  </clipPath>
                </defs>

                {slices.map((s, i) => {
                  const top = i * ROW_H;
                  const width = Math.max(2, (s.minutes / max) * barW);
                  const dim = hover != null && hover.i !== i;
                  return (
                    <g
                      key={s.key}
                      className={s.tint ? `tint-${s.tint}` : undefined}
                      opacity={dim ? 0.5 : 1}
                    >
                      <text
                        x={0} y={top + 10}
                        clipPath={`url(#${clipId})`}
                        className="text-[12px]"
                        fill="var(--ink-2)"
                      >
                        {s.label}
                      </text>
                      <text
                        x={barW} y={top + 10} textAnchor="end"
                        className="text-[11.5px] tnum"
                        fill="var(--ink-3)"
                      >
                        {formatDuration(Math.round(s.minutes))}
                      </text>
                      <rect x={0} y={top + 16} width={barW} height={6} rx={3} fill="var(--hover)" />
                      <rect
                        x={0} y={top + 16} width={width} height={6} rx={3}
                        fill={s.tint ? "var(--tint)" : "var(--accent)"}
                      />
                      <rect
                        x={0} y={top} width={barW} height={ROW_H}
                        fill="transparent"
                        onMouseEnter={() => setHover({ i, x: Math.min(width, barW - 8), y: top + 16 })}
                        onMouseLeave={() => setHover((h) => (h?.i === i ? null : h))}
                      />
                    </g>
                  );
                })}
              </>
            );
          }}
        </Chart>
      )}
    </div>
  );
}

export function TimeBreakdown({
  byTag, byTask, totalMinutes,
}: {
  byTag: Slice[];
  byTask: Slice[];
  totalMinutes: number;
}) {
  const startTimer = useStore((s) => s.startTimer);
  const hasData = byTag.length > 0 || byTask.length > 0;

  const topTag = byTag[0];
  const summary = !hasData
    ? "No focus sessions have been logged in this window."
    : `${formatDuration(Math.round(totalMinutes))} of focus in total` +
      (topTag
        ? `, and ${topTag.label} took the largest share at ${fmt(pctOf(topTag.minutes, totalMinutes))}%.`
        : ".");

  return (
    <Panel title="Where the time went" subtitle={summary}>
      {!hasData ? (
        <EmptyState
          className="py-8"
          icon={Hourglass}
          title="No focus logged yet"
          description="Run the timer while you work — from a task row, the timer bar, or right here — and this splits your hours by tag and by task."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => startTimer({ label: "Focus", mode: "pomodoro" })}
            >
              Start a focus session
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            <HBars
              slices={byTag}
              total={totalMinutes}
              title="By tag"
              emptyNote="None of your sessions carry a tag yet."
            />
            <HBars
              slices={byTask}
              total={totalMinutes}
              title="By task"
              emptyNote="No session has been attached to a task yet."
            />
          </div>
          <PanelNote>
            A session wearing several tags is counted once under each of them, so the tag column can
            add up to more than the total.
          </PanelNote>
        </>
      )}
    </Panel>
  );
}
