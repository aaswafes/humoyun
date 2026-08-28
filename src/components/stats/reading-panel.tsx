"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { diffDays, formatDate, todayISO, yearOf } from "@/lib/date";
import { Button, EmptyState, Progress, SectionLabel } from "@/components/ui/primitives";
import {
  AxisText, Chart, GridY, HoverSurface, Panel, PanelNote, UnitLabel,
  axisTicks, fmt, niceMax,
  type TableSpec, type TipState,
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

/** Says plainly whether the finish date is measured or merely planned. */
function sourceNote(p: Projection): string {
  if (p.source === "pace") return "from your measured pace";
  if (p.source === "plan") return "from the schedule you set, not measured yet";
  return "nothing to project from";
}

export function ReadingPanel({
  weeks, projections,
}: {
  weeks: WeekPages[];
  projections: Projection[];
}) {
  const router = useRouter();
  const [cursor, setCursor] = React.useState<number | null>(null);

  const totalPages = weeks.reduce((s, w) => s + w.pages, 0);
  const perWeek = weeks.length ? totalPages / weeks.length : 0;
  const bestWeek = weeks.reduce<WeekPages | null>(
    (acc, w) => (!acc || w.pages > acc.pages ? w : acc),
    null,
  );
  const soonest = projections.find((p) => p.finish);

  const summary = totalPages
    ? `${totalPages} pages read, about ${fmt(perWeek, 0)} a week` +
      (bestWeek && bestWeek.pages > 0 ? `, best week ${bestWeek.pages}` : "") + "." +
      (soonest ? ` ${soonest.book.title} lands around ${finishLabel(soonest)}, ${sourceNote(soonest)}.` : "")
    : projections.length
      ? "No finished reading blocks in this window, so there is no pace to project from yet."
      : "No reading is being tracked yet.";

  const geom = React.useCallback((w: number) => {
    const n = Math.max(1, weeks.length);
    const plotW = Math.max(1, w - PAD.l - PAD.r);
    const plotH = H - PAD.t - PAD.b;
    const max = niceMax(Math.max(1, ...weeks.map((k) => k.pages)));
    const band = plotW / n;
    return {
      n, plotW, plotH, max, band,
      barW: Math.max(2, Math.min(26, band - 6)),
      baseY: PAD.t + plotH,
      y: (v: number) => PAD.t + plotH - (v / max) * plotH,
      cx: (i: number) => PAD.l + band * i + band / 2,
    };
  }, [weeks]);

  const describe = React.useCallback((i: number) => {
    const k = weeks[i];
    if (!k) return "";
    return `${k.title}: ${k.pages} ${k.pages === 1 ? "page" : "pages"} read.`;
  }, [weeks]);

  const tipAt = (w: number): TipState | null => {
    if (cursor == null || !weeks[cursor]) return null;
    const g = geom(w);
    return {
      x: g.cx(cursor),
      y: g.y(weeks[cursor].pages),
      title: weeks[cursor].title,
      rows: [{ label: "Pages", value: String(weeks[cursor].pages), color: "var(--accent)" }],
    };
  };

  const table: TableSpec = {
    caption: "Pages read per week, and where each book lands.",
    columns: ["Row", "Pages / page", "Detail"],
    rows: [
      ...weeks.map((k) => [k.title, k.pages, "pages read"]),
      ...projections.map((p) => [
        p.book.title,
        `${p.book.current_page}/${p.book.total_pages}`,
        `${finishLabel(p)} — ${sourceNote(p)}`,
      ]),
    ],
  };

  if (!totalPages && !projections.length) {
    return (
      <Panel id="panel-reading" title="Reading" subtitle={summary}>
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
    <Panel id="panel-reading" title="Reading" subtitle={summary} table={table}>
      <Chart
        height={H}
        animateKey={`reading-${weeks.length}`}
        label={`Pages read per week. ${summary}`}
        tip={({ w }) => tipAt(w)}
        nav={{ n: Math.max(1, weeks.length), index: cursor, onIndex: setCursor, describe, hint: "Arrow keys move between weeks" }}
      >
        {({ w }) => {
          const g = geom(w);
          const labelStep = Math.max(1, Math.ceil(g.n / 6));

          return (
            <>
              <GridY
                x0={PAD.l} x1={PAD.l + g.plotW} ticks={axisTicks(g.max, 2)} y={g.y}
                format={(v) => fmt(v)}
              />
              <UnitLabel x={0} y={9}>pages</UnitLabel>

              {weeks.map((k, i) => {
                const height = k.pages > 0 ? Math.max(2, g.baseY - g.y(k.pages)) : 0;
                return (
                  <rect
                    key={k.key}
                    x={g.cx(i) - g.barW / 2} y={g.baseY - height} width={g.barW} height={height}
                    rx={Math.min(3, g.barW / 2)}
                    fill="var(--accent)"
                    opacity={cursor != null && cursor !== i ? 0.5 : 0.85}
                  >
                    <title>{describe(i)}</title>
                  </rect>
                );
              })}

              {weeks.map((k, i) =>
                i % labelStep === 0 || i === g.n - 1 ? (
                  <AxisText key={k.key} x={g.cx(i)} y={H - 5}>{k.label}</AxisText>
                ) : null,
              )}

              <HoverSurface
                x={PAD.l} y={PAD.t} w={g.plotW} h={g.plotH} n={g.n} mode="band"
                onIndex={setCursor}
                onLeave={() => setCursor(null)}
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
                <p className="mt-1 pl-4 text-[11px] text-ink-4">{sourceNote(p)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PanelNote>
        Pages come from finished reading blocks on your calendar — the only dated page history there
        is. A book with no finished block yet falls back to the plan you set, and says so.
      </PanelNote>
    </Panel>
  );
}
