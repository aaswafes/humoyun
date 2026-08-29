"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays, diffDays, formatDate, toISO, todayISO, yearOf } from "@/lib/date";
import { MEDIA_KIND_LABELS, type Media, type Task } from "@/lib/types";
import { Progress } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";

// =========================================================
// What a ticked watch block is worth.
//
// The shelf, this table and the insights strip all answer questions about the
// same history — "how many episodes did I actually get through" — so it is
// measured once here and passed down, rather than each surface re-scanning the
// task list.
//
// Everything below counts what happened. `episodes_per_day` is the plan; it
// never feeds a projection.
// =========================================================

/** How many days of history a pace is averaged over. */
export const WATCH_WINDOW = 28;

export interface WatchDay {
  date: string;
  episodes: number;
  minutes: number;
}

export const episodesOf = (t: Task): number =>
  t.episode_from != null && t.episode_to != null
    ? Math.max(0, t.episode_to - t.episode_from + 1)
    : 0;

export const isDoneWatching = (t: Task): boolean =>
  t.kind === "watching" && t.status === "done" && !!t.media_id;

/** The day a block counts for: the day it was planned, falling back to the tick. */
export function watchedDay(t: Task): string | null {
  if (t.date) return t.date;
  if (t.completed_at) return toISO(new Date(t.completed_at));
  return null;
}

/**
 * Watch history for every title, bucketed by day in one pass.
 *
 * Minutes come from the block when it carries a duration, and from the title's
 * runtime otherwise — a film watched outside the scheduler still counts its
 * hour and a half.
 */
export function watchDaysIndex(tasks: Task[], items: Media[]): Map<string, WatchDay[]> {
  const runtime = new Map(items.map((m) => [m.id, m.runtime_min ?? 0]));
  const out = new Map<string, Map<string, WatchDay>>();

  for (const t of tasks) {
    if (!isDoneWatching(t)) continue;
    const day = watchedDay(t);
    if (!day) continue;
    const id = t.media_id as string;
    const episodes = episodesOf(t);
    const minutes = t.duration_min ?? (runtime.get(id) ?? 0) * episodes;

    let byDay = out.get(id);
    if (!byDay) { byDay = new Map(); out.set(id, byDay); }
    const row = byDay.get(day);
    if (row) {
      row.episodes += episodes;
      row.minutes += minutes;
    } else {
      byDay.set(day, { date: day, episodes, minutes });
    }
  }

  const sorted = new Map<string, WatchDay[]>();
  for (const [id, byDay] of out) {
    sorted.set(id, [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)));
  }
  return sorted;
}

/** Every day anything was watched, episodes and minutes pooled across titles. */
export function mergeWatchDays(index: Map<string, WatchDay[]>): WatchDay[] {
  const byDate = new Map<string, WatchDay>();
  for (const days of index.values()) {
    for (const d of days) {
      const row = byDate.get(d.date);
      if (row) {
        row.episodes += d.episodes;
        row.minutes += d.minutes;
      } else {
        byDate.set(d.date, { ...d });
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Days in a row ending today — or yesterday, while today is still open. */
export function watchStreak(days: WatchDay[], upTo = todayISO()): { current: number; best: number } {
  const set = new Set(days.map((d) => d.date));
  if (!set.size) return { current: 0, best: 0 };

  let cursor = set.has(upTo) ? upTo : addDays(upTo, -1);
  let current = 0;
  while (set.has(cursor) && current < 3650) { current++; cursor = addDays(cursor, -1); }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d.date ? run + 1 : 1;
    if (run > best) best = run;
    prev = d.date;
  }
  return { current, best };
}

/** Episodes and minutes inside a 'yyyy-MM' month. */
export function monthWatched(days: WatchDay[], month: string): {
  episodes: number; minutes: number; activeDays: number;
} {
  let episodes = 0;
  let minutes = 0;
  let activeDays = 0;
  for (const d of days) {
    if (d.date.slice(0, 7) !== month) continue;
    episodes += d.episodes;
    minutes += d.minutes;
    activeDays++;
  }
  return { episodes, minutes, activeDays };
}

export interface WatchPace {
  /** episodes per calendar day across the window — the number projections use */
  perDay: number;
  /** days with anything watched at all */
  activeDays: number;
  /** first..today inclusive, the denominator behind the honest rate */
  spanDays: number;
  episodes: number;
  minutes: number;
  lastWatched: string | null;
}

export const EMPTY_WATCH_PACE: WatchPace = {
  perDay: 0, activeDays: 0, spanDays: 0, episodes: 0, minutes: 0, lastWatched: null,
};

/**
 * Averages over the last `window` days, or over the whole history if it is
 * shorter — a series started three days ago should not be judged against 28.
 */
export function watchPace(days: WatchDay[], window = WATCH_WINDOW, today = todayISO()): WatchPace {
  if (!days.length) return EMPTY_WATCH_PACE;

  const first = days[0].date;
  const from = diffDays(today, first) + 1 > window ? addDays(today, -(window - 1)) : first;
  const recent = days.filter((d) => d.date >= from && d.date <= today);
  const last = days[days.length - 1].date;
  if (!recent.length) return { ...EMPTY_WATCH_PACE, lastWatched: last };

  const episodes = recent.reduce((s, d) => s + d.episodes, 0);
  const minutes = recent.reduce((s, d) => s + d.minutes, 0);
  const spanDays = Math.max(1, diffDays(today, from) + 1);

  return {
    perDay: episodes / spanDays,
    activeDays: recent.length,
    spanDays,
    episodes,
    minutes,
    lastWatched: last,
  };
}

/**
 * The media table carries no finished_at, so the last ticked watch block dates
 * the finish; a title watched outside the scheduler falls back to updated_at.
 */
export function finishedOn(item: Media, tasks: Task[]): string {
  let last: string | null = null;
  for (const t of tasks) {
    if (t.media_id !== item.id || !isDoneWatching(t)) continue;
    const day = watchedDay(t);
    if (day && (!last || day > last)) last = day;
  }
  return last ?? toISO(new Date(item.updated_at));
}

export function finishedInYear(
  items: Media[], tasks: Task[], year = yearOf(todayISO()),
): Media[] {
  return items.filter((m) => m.status === "finished" && yearOf(finishedOn(m, tasks)) === year);
}

/** "6 Sep", or "6 Sep 2027" once it leaves this year. */
export function shortDate(iso: string): string {
  return formatDate(iso, { weekday: false, year: yearOf(iso) !== yearOf(todayISO()) });
}

/** "1.4" / "3" — never a bare "1.42857". */
export const round1 = (n: number): number => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

// =========================================================
// Rows
// =========================================================

export type MediaSortKey =
  | "title" | "creator" | "kind" | "genre" | "topic"
  | "episodes" | "progress" | "pace" | "finish";
export type SortDir = "asc" | "desc";

export interface MediaRow {
  item: Media;
  /** A film is a one-episode title: every pacing number below is meaningless. */
  isFilm: boolean;
  watched: number;
  total: number;
  progress: number;   // 0..1
  /** measured episodes a day, 0 when there is no history — always 0 for a film */
  perDay: number;
  /** projected finish for a series, the day it is booked for a film */
  finish: string | null;
}

export function buildMediaRows(items: Media[], history: Map<string, WatchDay[]>): MediaRow[] {
  const today = todayISO();
  return items.map((item) => {
    const total = Math.max(1, item.total_episodes);
    const watched = Math.max(0, Math.min(item.current_episode, total));
    const isFilm = item.total_episodes <= 1;
    const planned = item.end_date && item.end_date >= today ? item.end_date : null;

    if (isFilm) {
      // A film has no pace and no projection — only the evening it is booked for.
      const booked = item.start_date && item.start_date >= today ? item.start_date : planned;
      return {
        item, isFilm, watched, total,
        progress: watched >= total ? 1 : 0,
        perDay: 0,
        finish: item.status === "finished" ? null : booked,
      };
    }

    const pace = watchPace(history.get(item.id) ?? [], WATCH_WINDOW, today);
    const remaining = Math.max(0, total - watched);
    const projected = remaining === 0
      ? null
      : pace.perDay > 0
        ? addDays(today, Math.max(1, Math.ceil(remaining / pace.perDay)))
        : null;

    return {
      item, isFilm, watched, total,
      progress: watched / total,
      perDay: pace.perDay,
      // A finished series has no future; the plan stands in until history exists.
      finish: item.status === "finished" ? null : projected ?? planned,
    };
  });
}

/** Nulls always sink, whichever way the column is pointing. */
function compare(a: MediaRow, b: MediaRow, key: MediaSortKey): number {
  switch (key) {
    case "title": return (a.item.title || "").localeCompare(b.item.title || "");
    // "~" sorts after every letter, so unfiled titles settle at the bottom
    // rather than heading the list under a blank heading.
    case "creator": return (a.item.creator || "~").localeCompare(b.item.creator || "~");
    case "kind": return MEDIA_KIND_LABELS[a.item.kind].localeCompare(MEDIA_KIND_LABELS[b.item.kind]);
    case "genre": return (a.item.genre || "~").localeCompare(b.item.genre || "~");
    case "topic": return (a.item.topic || "~").localeCompare(b.item.topic || "~");
    case "episodes": return a.total - b.total;
    case "progress": return a.progress - b.progress;
    case "pace": return a.perDay - b.perDay;
    case "finish":
      if (!a.finish && !b.finish) return 0;
      if (!a.finish) return 1;
      if (!b.finish) return -1;
      return a.finish.localeCompare(b.finish);
  }
}

export function sortMediaRows(rows: MediaRow[], key: MediaSortKey, dir: SortDir): MediaRow[] {
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

const COLUMNS: { key: MediaSortKey; label: string; numeric?: boolean; hideBelow?: string }[] = [
  { key: "title", label: "Title" },
  { key: "creator", label: "Creator", hideBelow: "sm:table-cell" },
  { key: "kind", label: "Kind", hideBelow: "md:table-cell" },
  { key: "genre", label: "Genre", hideBelow: "lg:table-cell" },
  { key: "episodes", label: "Episodes", numeric: true },
  { key: "progress", label: "Progress", numeric: true },
  { key: "pace", label: "Pace", numeric: true, hideBelow: "md:table-cell" },
  { key: "finish", label: "Finish", numeric: true, hideBelow: "lg:table-cell" },
];

const STATUS_COLOR: Record<Media["status"], string> = {
  watching: "var(--accent)",
  planned: "var(--ink-3)",
  finished: "var(--success)",
  // Setting a title aside is information, not a failure — it stays grey.
  paused: "var(--ink-4)",
  dropped: "var(--ink-4)",
};

export const MEDIA_STATUS_LABEL: Record<Media["status"], string> = {
  watching: "Watching", planned: "Planned", finished: "Finished",
  paused: "Paused", dropped: "Dropped",
};

/** A film says "Watched", a series says "Finished" — same status, different word. */
export const statusWord = (item: Media): string =>
  item.status === "finished" && item.total_episodes <= 1 ? "Watched" : MEDIA_STATUS_LABEL[item.status];

const Dash = () => <span className="text-ink-4">—</span>;

export function MediaTable({
  rows, sort, dir, onSort, onOpen, className,
}: {
  rows: MediaRow[];
  sort: MediaSortKey;
  dir: SortDir;
  onSort: (key: MediaSortKey) => void;
  onOpen: (item: Media) => void;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-line", className)}>
      <table className="w-full min-w-[620px] border-collapse text-left">
        {/* A caption may not be wrapped, so it carries the hiding styles itself. */}
        <caption
          className="absolute size-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]"
          style={{ clip: "rect(0 0 0 0)", margin: -1, padding: 0, border: 0 }}
        >
          Every title on the shelf, with progress, measured pace and projected finish date.
          Films are a single sitting, so their episode, progress and pace cells read as a dash.
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
          {rows.map(({ item, isFilm, watched, total, progress, perDay, finish }, i) => {
            // The sub-line carries whatever a film would otherwise have nowhere to say.
            const sub = [item.series, isFilm && item.runtime_min ? `${item.runtime_min}m` : null]
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
                  {item.creator || <Dash />}
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

                {/* A film is one sitting. "1" would read as a count worth tracking. */}
                <td className="px-2 py-1.5 text-right text-[12.5px] text-ink-2 tnum">
                  {isFilm ? <Dash /> : total.toLocaleString()}
                </td>

                <td className="px-2 py-1.5">
                  {isFilm ? (
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
                  {isFilm || perDay <= 0
                    ? <Dash />
                    : <span className="text-ink-2">{round1(perDay)} ep/d</span>}
                </td>

                <td className="hidden px-2 py-1.5 text-right text-[12.5px] tnum lg:table-cell">
                  {finish ? <span className="text-ink-2">{shortDate(finish)}</span> : <Dash />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
