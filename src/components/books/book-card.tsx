"use client";

import * as React from "react";
import { Check, Pause } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Book } from "@/lib/types";
import { Ring } from "@/components/ui/primitives";
import { BookCover } from "./book-cover";
import { RatingStars } from "./fields";
import { shortDate } from "./plan";

export interface BookCardMeta {
  /** measured pages a day, 0 when there is no history yet */
  perDay: number;
  /** honest projected finish, or the plan's end date as a fallback */
  finish: string | null;
  /** the day a paused book comes back */
  resumeDate?: string;
  series?: string;
  /** an unfinished reading block sits on today */
  dueToday?: boolean;
}

/** The one line under the ring — different question for each shelf. */
function metaLine(book: Book, meta: BookCardMeta | undefined): string | null {
  if (!meta) return null;
  if (book.status === "paused") {
    return meta.resumeDate ? `Back ${shortDate(meta.resumeDate)}` : "Paused";
  }
  if (book.status === "finished" || book.status === "dropped") return null;
  if (meta.perDay > 0 && meta.finish) {
    const rate = meta.perDay >= 10 ? Math.round(meta.perDay) : Math.round(meta.perDay * 10) / 10;
    return `${rate} pp/d · ${shortDate(meta.finish)}`;
  }
  if (meta.finish) return `Plan ends ${shortDate(meta.finish)}`;
  return null;
}

export function BookCard({
  book, meta, onOpen,
}: {
  book: Book;
  meta?: BookCardMeta;
  onOpen: (book: Book) => void;
}) {
  const total = Math.max(1, book.total_pages);
  const read = Math.max(0, Math.min(book.current_page, total));
  const finished = book.status === "finished";
  const resting = book.status === "paused" || book.status === "dropped";
  const line = metaLine(book, meta);

  return (
    <button
      type="button"
      onClick={() => onOpen(book)}
      className={cn(
        "group/book flex w-full flex-col gap-2.5 rounded-lg p-2 text-left cursor-pointer",
        "transition-[background-color,transform] duration-200 ease-[var(--ease-out-apple)]",
        "hover:bg-hover active:scale-[0.985]",
      )}
    >
      <div className="relative transition-transform duration-200 ease-[var(--ease-out-apple)] group-hover/book:-translate-y-0.5">
        <BookCover title={book.title} tint={book.color} coverUrl={book.cover_url} dim={resting} />
        {resting && (
          <span
            className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-raised text-ink-3 shadow-sm"
            title={book.status === "paused" ? "Paused" : "Dropped"}
          >
            <Pause className="size-2.5" fill="currentColor" strokeWidth={0} />
          </span>
        )}
        {meta?.dueToday && !resting && !finished && (
          <span
            className="absolute right-1.5 top-1.5 rounded-full bg-accent px-1.5 py-[3px] text-[10.5px] font-semibold leading-none text-accent-ink shadow-sm"
            title="A reading block is due today"
          >
            Today
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-snug text-ink">{book.title || "Untitled"}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{book.author || "Unknown author"}</p>
        {meta?.series && (
          <p className="mt-0.5 truncate text-[11px] text-ink-4">{meta.series}</p>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Ring value={read} max={total} size={20} stroke={2.5} tint={book.color}>
            {finished && <Check className="size-2.5 stroke-[3.5]" style={{ color: "var(--tint)" }} />}
          </Ring>
          {finished && book.rating ? (
            <RatingStars value={book.rating} size={12} />
          ) : (
            <span className="truncate text-[11.5px] text-ink-3 tnum">
              p.{read} <span className="text-ink-4">/ {total}</span>
            </span>
          )}
        </div>
        {line && (
          <p
            className={cn(
              "mt-1 truncate text-[11px] tnum",
              book.status === "paused" ? "text-warn" : "text-ink-4",
            )}
          >
            {line}
          </p>
        )}
      </div>
    </button>
  );
}
