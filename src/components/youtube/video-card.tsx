"use client";

import * as React from "react";
import { Pause } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/date";
import type { Media } from "@/lib/types";
import { Progress } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import { MediaCover } from "@/components/watch/media-cover";
import { round1, shortDate, statusWord } from "@/components/watch/media-table";
import { RatingStars } from "@/components/watch/watch-fields";
import { OpenOnYoutube } from "./youtube-link";

export interface VideoCardMeta {
  /** measured videos a day, 0 when there is no history yet */
  perDay: number;
  /** projected finish for a playlist, the evening a single video is booked for */
  finish: string | null;
  /** an unfinished watch block sits on today */
  dueToday?: boolean;
}

/**
 * The two halves of the line under the thumbnail. The first is always
 * readable, the second rides in on hover and focus — the sheet has it all at
 * rest.
 */
function detailLine(
  item: Media, meta: VideoCardMeta | undefined, watched: number, total: number,
): { primary: string; extra: string } {
  const single = item.total_episodes <= 1;
  const runtime = item.runtime_min ? formatDuration(item.runtime_min) : "";

  if (item.status === "paused" || item.status === "dropped") {
    return {
      primary: statusWord(item),
      extra: single ? runtime : `video ${watched} of ${total}`,
    };
  }

  // A single video has no counting to do — its length is the number that means
  // something, and the only date is the evening it is booked for.
  if (single) {
    return {
      primary: runtime || "Video",
      extra: meta?.finish ? shortDate(meta.finish) : item.genre ?? "",
    };
  }

  if (item.status === "finished") {
    return { primary: `${total} videos`, extra: runtime ? `${runtime} each` : "" };
  }

  const bits: string[] = [];
  if (meta && meta.perDay > 0) bits.push(`${round1(meta.perDay)} vid/d`);
  if (meta?.finish) bits.push(shortDate(meta.finish));
  return { primary: `video ${watched} of ${total}`, extra: bits.join(" · ") };
}

/**
 * The shelf card.
 *
 * It differs from the films card in one structural way: a video carries a link
 * out to YouTube, and a link inside a button is a nesting bug. So the card is a
 * plain container, its hit area is a labelled overlay button that comes first
 * in the tab order, and the link sits above that overlay.
 */
export function VideoCard({
  item, meta, onOpen,
}: {
  item: Media;
  meta?: VideoCardMeta;
  onOpen: (item: Media) => void;
}) {
  const total = Math.max(1, item.total_episodes);
  const watched = Math.max(0, Math.min(item.current_episode, total));
  const single = item.total_episodes <= 1;
  const finished = item.status === "finished";
  const resting = item.status === "paused" || item.status === "dropped";

  // Channel and series are one identity line rather than two stacked greys.
  const identity = [item.channel || "No channel", item.series].filter(Boolean).join(" · ");
  const { primary, extra } = detailLine(item, meta, watched, total);

  return (
    <div
      className={cn(
        "group relative flex w-full flex-col gap-2.5 rounded-lg p-2 text-left",
        "transition-colors duration-200 ease-[var(--ease-out-apple)] hover:bg-hover",
        "has-[button:focus-visible]:bg-hover",
      )}
    >
      {/* First in the DOM so the card is reached before the link it contains. */}
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="absolute inset-0 z-10 cursor-pointer rounded-lg"
      >
        <VisuallyHidden>{`Open ${item.title || "Untitled"}`}</VisuallyHidden>
      </button>

      {/*
        The link has to sit above the card's own hit area, and a translated
        element is a stacking context its children cannot climb out of — so the
        lift is on an inner wrapper and the link is a sibling of it, not a
        child. Without this the link would go under the overlay on hover, which
        is exactly when it appears.
      */}
      <div className="relative">
        <div className="transition-transform duration-200 ease-[var(--ease-out-apple)] group-hover:-translate-y-0.5">
          <MediaCover item={item} />
        </div>

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

        {item.url && (
          <OpenOnYoutube
            url={item.url}
            title={item.title}
            className={cn(
              "absolute bottom-1.5 right-1.5 z-20",
              // Quiet until wanted, but never hidden from the keyboard — and
              // never hidden at all where there is no hover to reveal it.
              "opacity-0 transition-opacity duration-200 ease-[var(--ease-out-apple)]",
              "group-hover:opacity-100 focus-visible:opacity-100",
              "[@media(hover:none)]:opacity-100",
            )}
          />
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-snug text-ink">{item.title || "Untitled"}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-3" title={identity}>{identity}</p>
      </div>

      <div className="min-w-0">
        <div className="flex h-4 items-center">
          {finished && item.rating ? (
            <RatingStars value={item.rating} size={11} />
          ) : single ? (
            // Never a bar for a one-video title: it would only ever read empty
            // or full, and "1 of 1" says nothing.
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
                "group-hover:opacity-100 group-has-[button:focus-visible]:opacity-100",
              )}
            >
              · {extra}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
