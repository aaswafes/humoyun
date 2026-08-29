"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { MEDIA_KIND_LABELS, type Media } from "@/lib/types";
import { Progress } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import {
  round1, shortDate, statusWord, type MediaRow, type SortDir,
} from "@/components/watch/media-table";
import { OpenOnYoutube } from "./youtube-link";

// =========================================================
// Rows are built by the watch surface (buildMediaRows) — the history maths is
// identical for a playlist and a series, and two copies of it would drift.
// Sorting is not shared: this shelf sorts by channel, which the films shelf
// has no column for.
// =========================================================

export type VideoSortKey =
  | "title" | "channel" | "kind" | "genre" | "topic"
  | "videos" | "progress" | "pace" | "finish" | "added";

/** Nulls always sink, whichever way the column is pointing. */
function compare(a: MediaRow, b: MediaRow, key: VideoSortKey): number {
  switch (key) {
    case "title": return (a.item.title || "").localeCompare(b.item.title || "");
    // "~" sorts after every letter, so unfiled titles settle at the bottom
    // rather than heading the list under a blank heading.
    case "channel": return (a.item.channel || "~").localeCompare(b.item.channel || "~");
    case "kind": return MEDIA_KIND_LABELS[a.item.kind].localeCompare(MEDIA_KIND_LABELS[b.item.kind]);
    case "genre": return (a.item.genre || "~").localeCompare(b.item.genre || "~");
    case "topic": return (a.item.topic || "~").localeCompare(b.item.topic || "~");
    case "videos": return a.total - b.total;
    case "progress": return a.progress - b.progress;
    case "pace": return a.perDay - b.perDay;
    // Oldest first, like every other ascending column. The shelf opens on this
    // key pointing down, which is what makes it a watch-later list.
    case "added": return (a.item.created_at || "").localeCompare(b.item.created_at || "");
    case "finish":
      if (!a.finish && !b.finish) return 0;
      if (!a.finish) return 1;
      if (!b.finish) return -1;
      return a.finish.localeCompare(b.finish);
  }
}

export function sortVideoRows(rows: MediaRow[], key: VideoSortKey, dir: SortDir): MediaRow[] {
  const out = [...rows].sort((a, b) => compare(a, b, key));
  // Nulls were pushed to the end by compare; flipping would drag them to the top.
  if (dir === "desc") {
    const missing = (r: MediaRow) => (key === "finish" ? !r.finish : false);
    const present = out.filter((r) => !missing(r)).reverse();
    return [...present, ...out.filter(missing)];
  }
  return out;
}

// =========================================================
// Table
// =========================================================

const COLUMNS: { key: VideoSortKey; label: string; numeric?: boolean; hideBelow?: string }[] = [
  { key: "title", label: "Title" },
  { key: "channel", label: "Channel", hideBelow: "sm:table-cell" },
  { key: "kind", label: "Kind", hideBelow: "md:table-cell" },
  { key: "genre", label: "Genre", hideBelow: "lg:table-cell" },
  { key: "videos", label: "Videos", numeric: true },
  { key: "progress", label: "Progress", numeric: true },
  { key: "pace", label: "Pace", numeric: true, hideBelow: "md:table-cell" },
  { key: "finish", label: "Finish", numeric: true, hideBelow: "lg:table-cell" },
];

const STATUS_COLOR: Record<Media["status"], string> = {
  watching: "var(--accent)",
  planned: "var(--ink-3)",
  finished: "var(--success)",
  // Setting a video aside is information, not a failure — it stays grey.
  paused: "var(--ink-4)",
  dropped: "var(--ink-4)",
};

const Dash = () => <span className="text-ink-4">—</span>;

export function VideoTable({
  rows, sort, dir, onSort, onOpen, className,
}: {
  rows: MediaRow[];
  sort: VideoSortKey;
  dir: SortDir;
  onSort: (key: VideoSortKey) => void;
  onOpen: (item: Media) => void;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-line", className)}>
      <table className="w-full min-w-[660px] border-collapse text-left">
        {/* A caption may not be wrapped, so it carries the hiding styles itself. */}
        <caption
          className="absolute size-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]"
          style={{ clip: "rect(0 0 0 0)", margin: -1, padding: 0, border: 0 }}
        >
          Every video and playlist on the shelf, with progress, measured pace and projected finish
          date. A single video is one sitting, so its count, progress and pace cells read as a dash.
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
            {/* The link column has nothing to sort by, so it carries no button. */}
            <th scope="col" className="w-10 bg-sunken px-2 py-1.5">
              <VisuallyHidden>Link</VisuallyHidden>
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map(({ item, isFilm: single, watched, total, progress, perDay, finish }, i) => {
            // The sub-line carries whatever a single video would otherwise have
            // nowhere to say.
            const sub = [item.series, single && item.runtime_min ? `${item.runtime_min}m` : null]
              .filter(Boolean).join(" · ");
            return (
              <tr key={item.id} className={cn("transition-colors hover:bg-hover", i > 0 && "hairline-t")}>
                <td className="px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: STATUS_COLOR[item.status] }}
                      title={statusWord(item)}
                    />
                    <VisuallyHidden>{statusWord(item)}. </VisuallyHidden>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpen(item)}
                        className="block max-w-full truncate text-left text-[13px] font-medium text-ink cursor-pointer transition-colors hover:text-accent"
                      >
                        {item.title || "Untitled"}
                      </button>
                      {sub && <span className="block truncate text-[11px] text-ink-4">{sub}</span>}
                    </div>
                  </div>
                </td>

                <td className="hidden truncate px-2 py-1.5 text-[12.5px] text-ink-2 sm:table-cell">
                  {item.channel || <Dash />}
                </td>

                <td className="hidden px-2 py-1.5 text-[12.5px] text-ink-2 md:table-cell">
                  {MEDIA_KIND_LABELS[item.kind]}
                </td>

                {/* Genre carries the topic beside it — two facets, one column,
                    so the table does not grow a column per facet. */}
                <td className="hidden truncate px-2 py-1.5 text-[12.5px] lg:table-cell">
                  {item.genre ? <span className="text-ink-2">{item.genre}</span> : <Dash />}
                  {item.topic && <span className="ml-1.5 text-[11.5px] text-ink-4">{item.topic}</span>}
                </td>

                {/* One video is one sitting. "1" would read as a count worth tracking. */}
                <td className="px-2 py-1.5 text-right text-[12.5px] text-ink-2 tnum">
                  {single ? <Dash /> : total.toLocaleString()}
                </td>

                <td className="px-2 py-1.5">
                  {single ? (
                    <div className="text-right text-[12.5px]"><Dash /></div>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <Progress
                        value={progress * 100}
                        tint={item.color}
                        height={4}
                        className="hidden w-[64px] sm:block"
                      />
                      <span className="w-[52px] text-right text-[12.5px] text-ink-2 tnum">
                        {watched}/{total}
                      </span>
                    </div>
                  )}
                </td>

                <td className="hidden px-2 py-1.5 text-right text-[12.5px] tnum md:table-cell">
                  {single || perDay <= 0
                    ? <Dash />
                    : <span className="text-ink-2">{round1(perDay)} vid/d</span>}
                </td>

                <td className="hidden px-2 py-1.5 text-right text-[12.5px] tnum lg:table-cell">
                  {finish ? <span className="text-ink-2">{shortDate(finish)}</span> : <Dash />}
                </td>

                <td className="px-1 py-1.5">
                  {item.url
                    ? <OpenOnYoutube url={item.url} title={item.title} className="shadow-none" />
                    : <VisuallyHidden>No link saved</VisuallyHidden>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
