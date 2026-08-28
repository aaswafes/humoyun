"use client";

import * as React from "react";
import { Hourglass } from "lucide-react";
import { formatDuration } from "@/lib/date";
import { useStore } from "@/lib/store";
import { Button, EmptyState, SectionLabel } from "@/components/ui/primitives";
import {
  Chart, Panel, PanelNote, fmt, pctOf, useSvgId,
  type TableSpec, type TipState,
} from "./chart-kit";
import type { Slice } from "./derive";

const ROW_H = 30;
const VALUE_W = 74;

function HBars({
  slices, total, title, emptyNote, activeTags, onSelectTag,
}: {
  slices: Slice[];
  total: number;
  title: string;
  emptyNote: string;
  activeTags?: string[];
  /** Given for the tag column: a row becomes a live filter for the whole page. */
  onSelectTag?: (tag: string) => void;
}) {
  const clipId = useSvgId("hbar");
  const [cursor, setCursor] = React.useState<number | null>(null);
  const max = Math.max(1, ...slices.map((s) => s.minutes));
  const height = Math.max(ROW_H, slices.length * ROW_H);
  const active = React.useMemo(() => new Set(activeTags ?? []), [activeTags]);

  const describe = React.useCallback((i: number) => {
    const s = slices[i];
    if (!s) return "";
    const filtering = s.tag && active.has(s.tag) ? " Currently filtering the page." : "";
    return `${s.label}: ${formatDuration(Math.round(s.minutes))}, ${pctOf(s.minutes, total)}% of the total.${filtering}`;
  }, [slices, total, active]);

  const tipAt = (w: number): TipState | null => {
    if (cursor == null || !slices[cursor]) return null;
    const s = slices[cursor];
    return {
      x: Math.min(w - 20, Math.max(20, (s.minutes / max) * w)),
      y: cursor * ROW_H + 16,
      title: s.label,
      rows: [
        { label: "Focus", value: formatDuration(Math.round(s.minutes)) },
        { label: "Share", value: `${pctOf(s.minutes, total)}%` },
      ],
    };
  };

  const canFilter = (s: Slice) => !!(onSelectTag && s.tag);

  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      {slices.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-ink-4">{emptyNote}</p>
      ) : (
        <Chart
          className="mt-2"
          height={height}
          animateKey={`${title}-${slices.length}`}
          label={`${title}. ${slices
            .map((s) => `${s.label}: ${formatDuration(Math.round(s.minutes))}`)
            .join(", ")}.`}
          tip={({ w }) => tipAt(w)}
          nav={{
            n: slices.length,
            index: cursor,
            onIndex: setCursor,
            describe,
            onActivate: onSelectTag
              ? (i) => { const s = slices[i]; if (s.tag) onSelectTag(s.tag); }
              : undefined,
            activateLabel: onSelectTag ? "filter the page by that tag" : undefined,
            hint: "Arrow keys move between rows",
          }}
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
                  const dim = cursor != null && cursor !== i;
                  const on = !!s.tag && active.has(s.tag);
                  return (
                    <g
                      key={s.key}
                      className={s.tint ? `tint-${s.tint}` : undefined}
                      opacity={dim ? 0.5 : 1}
                    >
                      <title>{describe(i)}</title>
                      {on && (
                        <rect
                          x={-4} y={top - 1} width={barW + 8} height={ROW_H - 2} rx={6}
                          fill="var(--accent)" opacity={0.08}
                        />
                      )}
                      <text
                        x={0} y={top + 10}
                        clipPath={`url(#${clipId})`}
                        className="text-[12px]"
                        fill={on ? "var(--accent)" : "var(--ink-2)"}
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
                        className={canFilter(s) ? "cursor-pointer" : undefined}
                        onMouseEnter={() => setCursor(i)}
                        onMouseLeave={() => setCursor((c) => (c === i ? null : c))}
                        onClick={canFilter(s) ? () => onSelectTag!(s.tag!) : undefined}
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
  byTag, byTask, totalMinutes, activeTags, onToggleTag,
}: {
  byTag: Slice[];
  byTask: Slice[];
  totalMinutes: number;
  activeTags: string[];
  onToggleTag: (tag: string) => void;
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

  const table: TableSpec = {
    caption: "Focus minutes by tag and by task.",
    columns: ["Group", "Name", "Minutes", "Share %"],
    rows: [
      ...byTag.map((s) => ["Tag", s.label, Math.round(s.minutes), pctOf(s.minutes, totalMinutes)]),
      ...byTask.map((s) => ["Task", s.label, Math.round(s.minutes), pctOf(s.minutes, totalMinutes)]),
    ],
  };

  return (
    <Panel id="panel-focus" title="Where the time went" subtitle={summary} table={table}>
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
              activeTags={activeTags}
              onSelectTag={onToggleTag}
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
            add up to more than the total. Click or press Enter on a tag row to narrow the whole
            page to it.
          </PanelNote>
        </>
      )}
    </Panel>
  );
}
