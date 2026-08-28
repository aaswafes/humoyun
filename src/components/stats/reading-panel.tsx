"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { diffDays, formatDate, todayISO, yearOf } from "@/lib/date";
import { Button, EmptyState, Progress, SectionLabel } from "@/components/ui/primitives";
import {
  AxisText, Chart, GridY, HoverSurface, Panel, axisTicks, fmt, niceMax,
  type HoverPoint, type TipState,
} from "./chart-kit";
import type { Projection, WeekPages } from "./derive";

const PAD = { l: 30, r: 8, t: 18, b: 20 };
const H = 168;

function finishLabel(p: Projection): string {
  if (!p.finish) return p.source === "none" ? "No pace yet" : "Too slow to land";
  if (p.farOut) return `${formatDate(p.finish, { weekday: false, year: true })} at this pace`;
  const sameYear = yearOf(p.finish) === yearOf(todayISO());
  return formatDate(p.finish, { weekday: false, year: !sameYear });
}

export function ReadingPanel({
  weeks, projections,
}: {
  weeks: WeekPages[];
  projections: Projection[];
}) {
  const router = useRouter();
  const [hover, setHover] = React.useState<HoverPoint | null>(null);

  const totalPages = weeks.reduce((s, w) => s + w.pages, 0);
  const perWeek = weeks.length ? totalPages / weeks.length : 0;
  const soonest = projections.find((p) => p.finish);

  const summary = totalPages
    ? `${totalPages} pages read, about ${fmt(perWeek, 0)} a week.` +
      (soonest ? ` ${soonest.book.title} lands around ${finishLabel(soonest)}.` : "")
    : projections.length
      ? "No finished reading blocks in this window, so there is no pace to project from yet."
      : "No reading is being tracked yet.";

  const tip: TipState | null = hover && weeks[hover.i]
    ? {
        x: hover.x,
        y: hover.y,
        title: weeks[hover.i].title,
        rows: [{ label: "Pages", value: String(weeks[hover.i].pages), color: "var(--accent)" }],
      }
    : null;

  if (!totalPages && !projections.length) {
    return (
      <Panel title="Reading" subtitle={summary}>
        <EmptyState
          className="py-8"
          icon={BookOpen}
          title="No books on the go"
          description="Add a book, give it a page count, and schedule it across your calendar. This panel then tracks pages a week and tells you the date each book finishes."
          action={
            <Button variant="primary" size="sm" onClick={() => router.push("/books")}>
              Add a book
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <Panel title="Reading" subtitle={summary}>
      <Chart height={H} label={`Pages read per week. ${summary}`} tip={tip}>
        {({ w }) => {
          const n = Math.max(1, weeks.length);
          const plotW = Math.max(1, w - PAD.l - PAD.r);
          const plotH = H - PAD.t - PAD.b;
          const max = niceMax(Math.max(1, ...weeks.map((k) => k.pages)));
          const band = plotW / n;
          const barW = Math.max(2, Math.min(26, band - 6));
          const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
          const baseY = PAD.t + plotH;
          const labelStep = Math.max(1, Math.ceil(n / 6));

          return (
            <>
              <GridY
                x0={PAD.l} x1={PAD.l + plotW} ticks={axisTicks(max, 2)} y={y}
                format={(v) => fmt(v)}
              />
              <text
                x={0} y={9}
                className="text-[9.5px] font-semibold uppercase tracking-[0.08em]"
                fill="var(--ink-4)"
              >
                pages
              </text>

              {weeks.map((k, i) => {
                const cx = PAD.l + band * i + band / 2;
                const height = k.pages > 0 ? Math.max(2, baseY - y(k.pages)) : 0;
                return (
                  <rect
                    key={k.key}
                    x={cx - barW / 2} y={baseY - height} width={barW} height={height}
                    rx={Math.min(3, barW / 2)}
                    fill="var(--accent)"
                    opacity={hover && hover.i !== i ? 0.5 : 0.85}
                  />
                );
              })}

              {weeks.map((k, i) =>
                i % labelStep === 0 || i === n - 1 ? (
                  <AxisText key={k.key} x={PAD.l + band * i + band / 2} y={H - 5}>
                    {k.label}
                  </AxisText>
                ) : null,
              )}

              <HoverSurface
                x={PAD.l} y={PAD.t} w={plotW} h={plotH} n={n} mode="band"
                onIndex={(i) => setHover({ i, x: PAD.l + band * i + band / 2, y: y(weeks[i].pages) })}
                onLeave={() => setHover(null)}
              />
            </>
          );
        }}
      </Chart>

      <div className="mt-5 hairline-t pt-4">
        <SectionLabel>Finishing</SectionLabel>
        {projections.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-ink-4">
            No book is currently marked as reading.
          </p>
        ) : (
          <ul className="mt-2.5 flex flex-col gap-3">
            {projections.slice(0, 4).map((p) => (
              <li key={p.book.id} className={`tint-${p.book.color}`}>
                <div className="flex items-baseline gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--tint)" }} />
                  <p className="min-w-0 flex-1 truncate text-[13px] text-ink">{p.book.title}</p>
                  <p className="shrink-0 text-[11.5px] font-medium text-ink-2 tnum">
                    {finishLabel(p)}
                  </p>
                </div>
                <div className="mt-1.5 flex items-center gap-2 pl-4">
                  <Progress
                    value={p.book.current_page}
                    max={Math.max(1, p.book.total_pages)}
                    tint={p.book.color}
                    className="flex-1"
                  />
                  <p className="shrink-0 text-[11px] text-ink-4 tnum">
                    p.{p.book.current_page}/{p.book.total_pages}
                    {p.perDay > 0 && ` · ${fmt(p.perDay, 1)}/day`}
                    {p.finish && !p.farOut && ` · ${Math.max(0, diffDays(p.finish, todayISO()))}d left`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
