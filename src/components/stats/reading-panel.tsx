"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { diffDays, formatDate, formatDuration, todayISO, yearOf } from "@/lib/date";
import { Button, EmptyState, Progress } from "@/components/ui/primitives";
import type { ReadingHistory } from "@/components/books/reading-history";
import {
  AxisText, Chart, GridY, HoverSurface, Legend, Panel, PanelNote, UnitLabel,
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
  weeks, projections, history,
}: {
  weeks: WeekPages[];
  projections: Projection[];
  history: ReadingHistory;
}) {
  const router = useRouter();
  const [cursor, setCursor] = React.useState<number | null>(null);

  const totalPages = history.pages + history.quranPages;
  const perWeek = weeks.length ? totalPages / weeks.length : 0;
  const bestWeek = weeks.reduce<WeekPages | null>(
    (acc, w) => (!acc || w.pages + w.quranPages > acc.pages + acc.quranPages ? w : acc),
    null,
  );
  const soonest = projections.find((p) => p.finish);
  const finished = history.books.filter((b) => b.finishedOn);

  const summary = totalPages
    ? [
        `${totalPages} pages read, about ${fmt(perWeek, 0)} a week across ${history.daysRead}` +
          ` reading ${history.daysRead === 1 ? "day" : "days"}.`,
        finished.length
          ? `${finished.length} ${finished.length === 1 ? "book" : "books"} finished: ` +
            `${finished.map((b) => b.book.title).join(", ")}.`
          : "",
        history.minutes > 0 ? `${formatDuration(history.minutes)} at the page.` : "",
        bestWeek && bestWeek.pages + bestWeek.quranPages > 0
          ? `Best week: ${bestWeek.pages + bestWeek.quranPages} pages.` : "",
        soonest ? `${soonest.book.title} lands around ${finishLabel(soonest)}, ${sourceNote(soonest)}.` : "",
      ].filter(Boolean).join(" ")
    : projections.length
      ? "Nothing read in this window, so there is no pace to project from yet."
      : "No reading is being tracked yet.";

  const geom = React.useCallback((w: number) => {
    const n = Math.max(1, weeks.length);
    const plotW = Math.max(1, w - PAD.l - PAD.r);
    const plotH = H - PAD.t - PAD.b;
    const max = niceMax(Math.max(1, ...weeks.map((k) => k.pages + k.quranPages)));
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
    const parts = [`${k.pages} book ${k.pages === 1 ? "page" : "pages"}`];
    if (k.quranPages) parts.push(`${k.quranPages} Qur'an pages`);
    if (k.minutes) parts.push(formatDuration(k.minutes));
    return `${k.title}: ${parts.join(", ")}.`;
  }, [weeks]);

  const tipAt = (w: number): TipState | null => {
    if (cursor == null || !weeks[cursor]) return null;
    const k = weeks[cursor];
    const g = geom(w);
    const rows = [{ label: "Books", value: String(k.pages), color: "var(--accent)" }];
    if (k.quranPages) rows.push({ label: "Qur'an", value: String(k.quranPages), color: "var(--success)" });
    if (k.minutes) rows.push({ label: "Time", value: formatDuration(k.minutes), color: "var(--ink-4)" });
    return { x: g.cx(cursor), y: g.y(k.pages + k.quranPages), title: k.title, rows };
  };

  const table: TableSpec = {
    caption: "Pages read per week, the books that closed, and where the rest land.",
    columns: ["Row", "Pages / page", "Detail"],
    rows: [
      ...weeks.map((k) => [k.title, k.pages + k.quranPages, `${k.pages} book, ${k.quranPages} Qur'an`]),
      ...history.books.map((b) => [
        b.book.title,
        b.pages,
        b.finishedOn ? `finished ${formatDate(b.finishedOn)}` : `now ${b.progress}%`,
      ]),
      ...projections.map((p) => [
        p.book.title,
        `${p.book.current_page}/${p.book.total_pages}`,
        `${finishLabel(p)} — ${sourceNote(p)}`,
      ]),
    ],
  };

  if (!totalPages && !projections.length && !history.books.length) {
    return (
      <Panel id="panel-reading" title="Reading" subtitle={summary}>
        <EmptyState
          className="py-8"
          icon={BookOpen}
          title="No books on the go"
          description="Add a book and give it a page count. Move the bookmark, log a sitting or tick a scheduled block and this panel tracks pages a week, time at the page, and the date each book finishes."
          action={
            <Button variant="primary" size="sm" onClick={() => router.push("/consumption/books")}>
              Add a book
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <Panel id="panel-reading" title="Reading" subtitle={summary} table={table}>
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          { label: "Pages", value: String(history.pages), sub: "books" },
          { label: "Qur'an", value: String(history.quranPages), sub: history.quranPages ? `${fmt(history.quranPages / 20, 1)} juz` : "none logged" },
          { label: "Books finished", value: String(history.booksFinished), sub: history.booksFinished ? finished.map((b) => b.book.title).join(", ") : "none closed out" },
          { label: "At the page", value: history.minutes ? formatDuration(history.minutes) : "—", sub: history.minutes ? `over ${history.daysRead} ${history.daysRead === 1 ? "day" : "days"}` : "no sitting timed" },
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
                const dim = cursor != null && cursor !== i ? 0.5 : 0.85;
                const bookH = k.pages > 0 ? Math.max(2, g.baseY - g.y(k.pages)) : 0;
                const quranH = k.quranPages > 0 ? Math.max(2, g.baseY - g.y(k.quranPages)) : 0;
                const x = g.cx(i) - g.barW / 2;
                const r = Math.min(3, g.barW / 2);
                return (
                  <g key={k.key}>
                    <rect
                      x={x} y={g.baseY - bookH} width={g.barW} height={bookH} rx={r}
                      fill="var(--accent)" opacity={dim}
                    >
                      <title>{describe(i)}</title>
                    </rect>
                    {quranH > 0 && (
                      <rect
                        x={x} y={g.baseY - bookH - quranH} width={g.barW} height={quranH} rx={r}
                        fill="var(--success)" opacity={dim}
                      >
                        <title>{describe(i)}</title>
                      </rect>
                    )}
                  </g>
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

      <Legend
        items={[
          { key: "books", label: "Books", color: "var(--accent)" },
          { key: "quran", label: "Qur'an", color: "var(--success)" },
        ]}
      />

      {history.books.length > 0 && (
        <div className="mt-5 hairline-t pt-4">
          <p className="text-[11.5px] font-medium text-ink-3">Read in this window</p>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {history.books.slice(0, 6).map((b) => (
              <li key={b.book.id} className={`tint-${b.book.color} flex items-baseline gap-2`}>
                <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--tint)" }} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{b.book.title}</span>
                <span className="shrink-0 text-[11.5px] text-ink-3 tnum">
                  {b.pages} pp
                  {b.minutes > 0 && ` · ${formatDuration(b.minutes)}`}
                  {b.finishedOn && ` · finished ${formatDate(b.finishedOn, { weekday: false })}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 hairline-t pt-4">
        <p className="text-[11.5px] font-medium text-ink-3">Finishing</p>
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
        Pages come from every dated record there is — sittings you log, bookmarks you move, and
        reading blocks you tick — counted once each, never twice for the same day.
        {history.settledPages > 0 && (
          <>
            {" "}
            <span className="tnum">{history.settledPages}</span> of them were carried by a book
            finishing rather than by a dated record: that book was read before its pages were being
            logged, so they are counted on the day it was closed out.
          </>
        )}
      </PanelNote>
    </Panel>
  );
}
