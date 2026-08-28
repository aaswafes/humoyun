"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { diffDays, todayISO } from "@/lib/date";
import type { Book } from "@/lib/types";
import { Progress } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import { paceStats, projectFinish, type ReadDay } from "./pace";
import { shortDate } from "./plan";

export type SortKey = "title" | "author" | "pages" | "progress" | "pace" | "daysLeft" | "finish";
export type SortDir = "asc" | "desc";

export interface TableRow {
  book: Book;
  progress: number;      // 0..1
  perDay: number;
  finish: string | null;
  daysLeft: number | null;
  series: string | undefined;
}

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; hideBelow?: string }[] = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author", hideBelow: "sm:table-cell" },
  { key: "pages", label: "Pages", numeric: true },
  { key: "progress", label: "Progress", numeric: true },
  { key: "pace", label: "Pace", numeric: true, hideBelow: "md:table-cell" },
  { key: "daysLeft", label: "Days left", numeric: true, hideBelow: "md:table-cell" },
  { key: "finish", label: "Finish", numeric: true, hideBelow: "lg:table-cell" },
];

const STATUS_COLOR: Record<Book["status"], string> = {
  reading: "var(--accent)",
  planned: "var(--ink-3)",
  finished: "var(--success)",
  paused: "var(--warn)",
  dropped: "var(--ink-4)",
};

const STATUS_LABEL: Record<Book["status"], string> = {
  reading: "Reading", planned: "Planned", finished: "Finished",
  paused: "Paused", dropped: "Dropped",
};

export function buildRows(
  books: Book[], history: Map<string, ReadDay[]>, series: Record<string, string>,
): TableRow[] {
  const today = todayISO();
  return books.map((book) => {
    const total = Math.max(1, book.total_pages);
    const read = Math.max(0, Math.min(book.current_page, total));
    const pace = paceStats(history.get(book.id) ?? []);
    const projection = projectFinish(book, pace, today);
    // A finished book has no future; fall back to the plan when there is no history.
    const finish = book.status === "finished"
      ? null
      : projection.finish ?? (book.end_date && book.end_date >= today ? book.end_date : null);
    return {
      book,
      progress: read / total,
      perDay: pace.perDay,
      finish,
      daysLeft: finish ? diffDays(finish, today) : null,
      series: series[book.id],
    };
  });
}

/** Nulls always sink, whichever way the column is pointing. */
function compare(a: TableRow, b: TableRow, key: SortKey): number {
  switch (key) {
    case "title": return (a.book.title || "").localeCompare(b.book.title || "");
    case "author": return (a.book.author || "~").localeCompare(b.book.author || "~");
    case "pages": return a.book.total_pages - b.book.total_pages;
    case "progress": return a.progress - b.progress;
    case "pace": return a.perDay - b.perDay;
    case "daysLeft":
      if (a.daysLeft == null && b.daysLeft == null) return 0;
      if (a.daysLeft == null) return 1;
      if (b.daysLeft == null) return -1;
      return a.daysLeft - b.daysLeft;
    case "finish":
      if (!a.finish && !b.finish) return 0;
      if (!a.finish) return 1;
      if (!b.finish) return -1;
      return a.finish.localeCompare(b.finish);
  }
}

export function sortRows(rows: TableRow[], key: SortKey, dir: SortDir): TableRow[] {
  const out = [...rows].sort((a, b) => compare(a, b, key));
  // Nulls were pushed to the end by compare; flipping would drag them to the top.
  if (dir === "desc") {
    const missing = (r: TableRow) => (key === "finish" ? !r.finish : key === "daysLeft" ? r.daysLeft == null : false);
    const present = out.filter((r) => !missing(r)).reverse();
    return [...present, ...out.filter(missing)];
  }
  return out;
}

export function BooksTable({
  rows, sort, dir, onSort, onOpen, className,
}: {
  rows: TableRow[];
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  onOpen: (book: Book) => void;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-line", className)}>
      <table className="w-full min-w-[560px] border-collapse text-left">
        {/* A caption may not be wrapped, so it carries the hiding styles itself. */}
        <caption
          className="absolute size-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]"
          style={{ clip: "rect(0 0 0 0)", margin: -1, padding: 0, border: 0 }}
        >
          Every book on the shelf, with progress, measured pace and projected finish date.
        </caption>
        <thead>
          <tr className="hairline-b">
            {COLUMNS.map((col) => {
              const active = sort === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                  className={cn(
                    "bg-sunken px-2 py-1.5 font-medium",
                    col.hideBelow && `hidden ${col.hideBelow}`,
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-sm px-1 -mx-1 cursor-pointer",
                      "text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors",
                      active ? "text-ink" : "text-ink-3 hover:text-ink-2",
                      col.numeric && "w-full justify-end",
                    )}
                  >
                    {col.label}
                    {active
                      ? (dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)
                      : <ChevronDown className="size-3 opacity-0" aria-hidden />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map(({ book, progress, perDay, finish, daysLeft, series }, i) => (
            <tr key={book.id} className={cn("transition-colors hover:bg-hover", i > 0 && "hairline-t")}>
              <td className="px-2 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: STATUS_COLOR[book.status] }}
                    title={STATUS_LABEL[book.status]}
                  />
                  <VisuallyHidden>{STATUS_LABEL[book.status]}. </VisuallyHidden>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpen(book)}
                      className="block max-w-full truncate text-left text-[13px] font-medium text-ink cursor-pointer transition-colors hover:text-accent"
                    >
                      {book.title || "Untitled"}
                    </button>
                    {series && <span className="block truncate text-[11px] text-ink-4">{series}</span>}
                  </div>
                </div>
              </td>

              <td className="hidden truncate px-2 py-1.5 text-[12.5px] text-ink-2 sm:table-cell">
                {book.author || "—"}
              </td>

              <td className="px-2 py-1.5 text-right text-[12.5px] text-ink-2 tnum">
                {book.total_pages.toLocaleString()}
              </td>

              <td className="px-2 py-1.5">
                <div className="flex items-center justify-end gap-2">
                  <Progress
                    value={progress * 100}
                    tint={book.color}
                    height={4}
                    className="hidden w-[64px] sm:block"
                  />
                  <span className="w-[34px] text-right text-[12.5px] text-ink-2 tnum">
                    {Math.round(progress * 100)}%
                  </span>
                </div>
              </td>

              <td className="hidden px-2 py-1.5 text-right text-[12.5px] tnum md:table-cell">
                {perDay > 0
                  ? <span className="text-ink-2">{perDay >= 10 ? Math.round(perDay) : Math.round(perDay * 10) / 10} pp/d</span>
                  : <span className="text-ink-4">—</span>}
              </td>

              <td className="hidden px-2 py-1.5 text-right text-[12.5px] tnum md:table-cell">
                {daysLeft == null
                  ? <span className="text-ink-4">—</span>
                  : <span className={cn(daysLeft < 0 ? "text-warn" : "text-ink-2")}>{daysLeft}</span>}
              </td>

              <td className="hidden px-2 py-1.5 text-right text-[12.5px] tnum lg:table-cell">
                {finish
                  ? <span className="text-ink-2">{shortDate(finish)}</span>
                  : <span className="text-ink-4">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
