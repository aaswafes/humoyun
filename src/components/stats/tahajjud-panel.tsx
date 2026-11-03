"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoonStar } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate, formatTime } from "@/lib/date";
import { Button, EmptyState } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import { summarize, type TahajjudNight } from "@/components/tahajjud/night-data";
import { Panel, fmt, pctOf, type TableSpec } from "./chart-kit";

/**
 * Tahajjud sits next to Salah here but is never added into it: the five are
 * owed, the night prayer is offered. So this panel counts what was kept and
 * says nothing about what was not.
 */
export function TahajjudPanel({
  days, index, hour12,
}: {
  days: string[];
  index: Map<string, TahajjudNight>;
  hour12: boolean;
}) {
  const router = useRouter();
  const summaryId = React.useId();
  const s = React.useMemo(() => summarize(index, days), [index, days]);

  const summary = s.nights
    ? `Kept on ${s.nights} of ${s.of} nights (${pctOf(s.nights, s.of)}%)` +
      (s.avgRakat != null ? `, ${fmt(s.avgRakat, 1)} rakat on an average night` : "") +
      (s.longest > 1 ? `. Longest run: ${s.longest} nights` : "") +
      (s.typical != null ? `. Usually at ${formatTime(s.typical, hour12)}.` : ".")
    : index.size
      ? "No tahajjud recorded in this window."
      : "No tahajjud recorded yet.";

  const table: TableSpec = {
    caption: "Every night kept in the window, named by the morning it ends in.",
    columns: ["Night into", "Rakat", "Time"],
    rows: days
      .filter((d) => index.has(d))
      .map((d) => {
        const night = index.get(d) as TahajjudNight;
        return [d, night.rakat ?? "", night.at != null ? formatTime(night.at, hour12) : ""];
      }),
  };

  if (!index.size) {
    return (
      <Panel id="panel-tahajjud" title="Tahajjud" subtitle={summary}>
        <EmptyState
          className="py-8"
          icon={MoonStar}
          title="No nights recorded yet"
          description="Mark the nights you rise for tahajjud and they are counted here, on their own — apart from the five."
          action={
            <Button variant="primary" size="sm" onClick={() => router.push("/salah?view=tahajjud")}>
              Open Tahajjud
            </Button>
          }
        />
      </Panel>
    );
  }

  const tiles = [
    { label: "Nights kept", value: String(s.nights), sub: `of ${s.of} · ${pctOf(s.nights, s.of)}%` },
    { label: "Longest run", value: String(s.longest), sub: s.longest === 1 ? "night" : "nights in a row" },
    {
      label: "Rakat",
      value: s.avgRakat != null ? fmt(s.avgRakat, 1) : "—",
      sub: s.counted ? `a night · ${s.rakat} in all` : "no counts written down",
    },
    {
      label: "Usually at",
      value: s.typical != null ? formatTime(s.typical, hour12) : "—",
      sub: s.timed ? `from ${s.timed} timed ${s.timed === 1 ? "night" : "nights"}` : "no times written down",
    },
  ];

  return (
    <Panel id="panel-tahajjud" title="Tahajjud" subtitle={summary} table={table}>
      <div className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {tiles.map((cell) => (
          <div key={cell.label} className="min-w-0">
            <div className="text-[11.5px] text-ink-3">{cell.label}</div>
            <div className="display-serif mt-1 text-[22px] leading-none text-ink tnum">{cell.value}</div>
            <p className="mt-1 truncate text-[11px] text-ink-4 tnum">{cell.sub}</p>
          </div>
        ))}
      </div>

      {/* One square a night across the window, wrapping — a long window just
          makes more rows, never a wider page. */}
      <VisuallyHidden id={summaryId}>{summary}</VisuallyHidden>
      <div role="img" aria-describedby={summaryId} className="flex flex-wrap gap-[3px]">
        {days.map((d) => {
          const night = index.get(d);
          return (
            <span
              key={d}
              title={`${formatDate(d)} · ${night ? `kept${night.rakat ? `, ${night.rakat} rakat` : ""}` : "not kept"}`}
              className={cn("size-[11px] rounded-[3px]", night ? "bg-accent" : "bg-hover")}
            />
          );
        })}
      </div>
    </Panel>
  );
}
