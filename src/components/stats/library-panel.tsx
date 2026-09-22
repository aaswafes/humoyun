"use client";

import * as React from "react";
import { formatDuration } from "@/lib/date";
import { Panel, PanelNote, type TableSpec } from "./chart-kit";
import type { ShelfSummary } from "./derive";

/**
 * What is on the shelves — books, films and videos in one panel, the same way
 * Consumption keeps them on one page.
 */
export function LibraryPanel({
  shelves, days,
}: {
  shelves: ShelfSummary;
  days: number;
}) {
  const summary = [
    `${shelves.booksReading} ${shelves.booksReading === 1 ? "book" : "books"} on the go, ${shelves.booksFinished} finished all told, ${shelves.booksPlanned} waiting.`,
    shelves.episodes ? `${shelves.episodes} ${shelves.episodes === 1 ? "episode" : "episodes"} watched in these ${days} days.` : "",
  ].filter(Boolean).join(" ");

  const table: TableSpec = {
    caption: "What is on the shelves.",
    columns: ["Measure", "Count", "Detail"],
    rows: [
      ["Books reading", shelves.booksReading, "in progress"],
      ["Books finished", shelves.booksFinished, "all time"],
      ["Books planned", shelves.booksPlanned, "queued"],
      ["Watching", shelves.mediaWatching, `${shelves.mediaFinished} finished`],
      ["Episodes", shelves.episodes, shelves.watchMinutes ? formatDuration(shelves.watchMinutes) : "no runtime set"],
    ],
  };

  return (
    <Panel id="panel-library" title="Shelves" subtitle={summary} table={table}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {[
          {
            label: "Reading",
            value: String(shelves.booksReading),
            sub: `${shelves.booksPlanned} queued · ${shelves.booksFinished} finished`,
          },
          {
            label: "Watching",
            value: String(shelves.mediaWatching),
            sub: `${shelves.mediaFinished} finished`,
          },
          {
            label: "Episodes",
            value: String(shelves.episodes),
            sub: shelves.watchMinutes ? formatDuration(shelves.watchMinutes) : "no runtime recorded",
          },
          {
            label: "Finished",
            value: String(shelves.booksFinished + shelves.mediaFinished),
            sub: "books and titles, all time",
          },
        ].map((cell) => (
          <div key={cell.label} className="min-w-0">
            <div className="text-[11.5px] text-ink-3">{cell.label}</div>
            <div className="display-serif mt-1 text-[22px] leading-none text-ink tnum">{cell.value}</div>
            <p className="mt-1 truncate text-[11px] text-ink-4 tnum">{cell.sub}</p>
          </div>
        ))}
      </div>

      <PanelNote>
        Shelf counts are the state of the shelves today; episodes are what happened inside this
        window.
      </PanelNote>
    </Panel>
  );
}
