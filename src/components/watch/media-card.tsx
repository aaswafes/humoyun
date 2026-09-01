"use client";

import * as React from "react";
import { Pause, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { DRAG_OK } from "@/components/ui/drag";
import { formatDuration } from "@/lib/date";
import type { Media } from "@/lib/types";
import { Progress } from "@/components/ui/primitives";
import { MediaCover } from "./media-cover";
import { round1, shortDate, statusWord } from "./media-table";

export interface MediaCardMeta {
  /** measured episodes a day, 0 when there is no history yet */
  perDay: number;
  /** projected finish for a series, the evening a film is booked for */
  finish: string | null;
  /** an unfinished watch block sits on today */
  dueToday?: boolean;
}

/** Read-only stars. The card is itself a button, so nothing here may be one. */
function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("size-[11px]", n <= value ? "text-warn" : "text-ink-4")}
          fill={n <= value ? "currentColor" : "none"}
          strokeWidth={n <= value ? 0 : 1.6}
        />
      ))}
    </span>
  );
}

/**
 * The two halves of the line under the poster. The first is always readable,
 * the second rides in on hover and focus — the sheet has it all at rest.
 */
function detailLine(
  item: Media, meta: MediaCardMeta | undefined, watched: number, total: number,
): { primary: string; extra: string } {
  const isFilm = item.total_episodes <= 1;
  const runtime = item.runtime_min ? formatDuration(item.runtime_min) : "";

  if (item.status === "paused" || item.status === "dropped") {
    return {
      primary: statusWord(item),
      extra: isFilm ? runtime : `ep. ${watched} of ${total}`,
    };
  }

  // A film has no episode maths at all — its length is the number that means
  // something, and the only date is the evening it is booked for.
  if (isFilm) {
    return {
      primary: runtime || "Film",
      extra: meta?.finish ? shortDate(meta.finish) : item.genre ?? "",
    };
  }

  if (item.status === "finished") {
    return { primary: `${total} episodes`, extra: runtime ? `${runtime} each` : "" };
  }

  const bits: string[] = [];
  if (meta && meta.perDay > 0) bits.push(`${round1(meta.perDay)} ep/d`);
  if (meta?.finish) bits.push(shortDate(meta.finish));
  return { primary: `ep. ${watched} of ${total}`, extra: bits.join(" · ") };
}

export function MediaCard({
  item, meta, onOpen,
}: {
  item: Media;
  meta?: MediaCardMeta;
  onOpen: (item: Media) => void;
}) {
  const total = Math.max(1, item.total_episodes);
  const watched = Math.max(0, Math.min(item.current_episode, total));
  const isFilm = item.total_episodes <= 1;
  const finished = item.status === "finished";
  const resting = item.status === "paused" || item.status === "dropped";

  // Creator and series are one identity line rather than two stacked greys.
  const identity = [item.creator || "Unknown creator", item.series].filter(Boolean).join(" · ");
  const { primary, extra } = detailLine(item, meta, watched, total);

  return (
    <button
      type="button"
      {...DRAG_OK}
      onClick={() => onOpen(item)}
      className={cn(
        "group/media flex w-full flex-col gap-2.5 rounded-lg p-2 text-left cursor-pointer",
        "transition-[background-color,transform] duration-200 ease-[var(--ease-out-apple)]",
        "hover:bg-hover active:scale-[0.985]",
      )}
    >
      <div className="relative transition-transform duration-200 ease-[var(--ease-out-apple)] group-hover/media:-translate-y-0.5">
        <MediaCover item={item} />
        {resting && (
          <span
            className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-raised text-ink-3 shadow-sm"
            title={statusWord(item)}
          >
            <Pause className="size-2.5" fill="currentColor" strokeWidth={0} />
          </span>
        )}
        {meta?.dueToday && !resting && !finished && (
          <span
            className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-raised px-1.5 py-[3px] text-[10.5px] font-medium leading-none text-ink-2 shadow-sm"
            title="A watch block is due today"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            Today
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-snug text-ink">{item.title || "Untitled"}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-3" title={identity}>{identity}</p>
      </div>

      <div className="min-w-0">
        <div className="flex h-4 items-center">
          {finished && item.rating ? (
            <Stars value={item.rating} />
          ) : isFilm ? (
            // Never a bar for a one-episode title: it would only ever read
            // empty or full, and "1 of 1" says nothing.
            <span className="inline-flex h-[18px] items-center rounded-[5px] bg-hover px-1.5 text-[11px] font-medium leading-none text-ink-2">
              {statusWord(item)}
            </span>
          ) : (
            <Progress value={watched} max={total} tint={item.color} height={3} />
          )}
        </div>

        <p className="mt-1 flex h-[13px] items-baseline gap-1 text-[10.5px] leading-[13px] tnum">
          <span className="shrink-0 truncate text-ink-3">{primary}</span>
          {extra && (
            <span
              className={cn(
                "min-w-0 truncate text-ink-4",
                "opacity-0 transition-opacity duration-200 ease-[var(--ease-out-apple)]",
                "group-hover/media:opacity-100 group-focus-visible/media:opacity-100",
              )}
            >
              · {extra}
            </span>
          )}
        </p>
      </div>
    </button>
  );
}
