"use client";

import * as React from "react";
import { formatDuration } from "@/lib/date";
import { Panel, PanelNote, fmt, type TableSpec } from "./chart-kit";
import type { NoteSummary, ShelfSummary } from "./derive";
import { NOTE_KIND_LABELS } from "@/lib/types";

/**
 * The shelves and the notebook in one panel. Both answer the same question —
 * what went in, and what came out of it — and neither has enough of its own
 * to earn a card on a page that is already long.
 */
export function LibraryPanel({
  shelves, notes, days,
}: {
  shelves: ShelfSummary;
  notes: NoteSummary;
  days: number;
}) {
  const summary = [
    `${shelves.booksReading} ${shelves.booksReading === 1 ? "book" : "books"} on the go, ${shelves.booksFinished} finished all told, ${shelves.booksPlanned} waiting.`,
    shelves.episodes ? `${shelves.episodes} ${shelves.episodes === 1 ? "episode" : "episodes"} watched in these ${days} days.` : "",
    notes.total ? `${notes.total} ${notes.total === 1 ? "note" : "notes"} written, about ${fmt(notes.words, 0)} words.` : "Nothing written down in this window.",
  ].filter(Boolean).join(" ");

  const table: TableSpec = {
    caption: "What is on the shelves, and what was written.",
    columns: ["Measure", "Count", "Detail"],
    rows: [
      ["Books reading", shelves.booksReading, "in progress"],
      ["Books finished", shelves.booksFinished, "all time"],
      ["Books planned", shelves.booksPlanned, "queued"],
      ["Watching", shelves.mediaWatching, `${shelves.mediaFinished} finished`],
      ["Episodes", shelves.episodes, shelves.watchMinutes ? formatDuration(shelves.watchMinutes) : "no runtime set"],
      ["Notes", notes.total, `${fmt(notes.words, 0)} words`],
      ...notes.byKind.map((k) => [NOTE_KIND_LABELS[k.kind], k.count, "notes"]),
    ],
  };

  return (
    <Panel id="panel-library" title="Shelves and notes" subtitle={summary} table={table}>
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
            label: "Notes written",
            value: String(notes.total),
            sub: notes.total ? `${fmt(notes.words, 0)} words` : "nothing captured",
          },
        ].map((cell) => (
          <div key={cell.label} className="min-w-0">
            <div className="text-[11.5px] text-ink-3">{cell.label}</div>
            <div className="display-serif mt-1 text-[22px] leading-none text-ink tnum">{cell.value}</div>
            <p className="mt-1 truncate text-[11px] text-ink-4 tnum">{cell.sub}</p>
          </div>
        ))}
      </div>

      {notes.byKind.length > 0 && (
        <div className="mt-5 hairline-t pt-4">
          <p className="text-[11.5px] font-medium text-ink-3">What you wrote</p>
          <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
            {notes.byKind.map((k) => (
              <li key={k.kind} className="text-[12.5px] text-ink-2 tnum">
                {NOTE_KIND_LABELS[k.kind]}
                <span className="ml-1.5 text-ink-4">{k.count}</span>
              </li>
            ))}
          </ul>
          {notes.busiest && (
            <p className="mt-3 text-[12px] text-ink-4 tnum">
              Busiest day: {notes.busiest.date} with {notes.busiest.count}{" "}
              {notes.busiest.count === 1 ? "note" : "notes"}.
            </p>
          )}
        </div>
      )}

      <PanelNote>
        Shelf counts are the state of the shelves today; episodes and notes are what happened inside
        this window. Word counts are rough — enough to tell a paragraph from a line, and not
        pretending to more than that.
      </PanelNote>
    </Panel>
  );
}
