"use client";

import * as React from "react";
import { Pause } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Book } from "@/lib/types";
import { Progress } from "@/components/ui/primitives";
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

/**
 * Everything the shelf knows that is not cover, title, author or progress.
 * It rides in on hover and focus; the sheet has it all at rest.
 */
function detailLine(book: Book, meta: BookCardMeta | undefined, read: number, total: number): string {
  if (book.status === "paused") {
    return meta?.resumeDate ? `Back ${shortDate(meta.resumeDate)}` : "Paused";
  }
  if (book.status === "dropped") return "Dropped";
  if (book.status === "finished") return `${total.toLocaleString()} pages · finished`;

  const bits = [`p.${read} / ${total}`];
  if (meta && meta.perDay > 0) {
    bits.push(`${meta.perDay >= 10 ? Math.round(meta.perDay) : Math.round(meta.perDay * 10) / 10} pp/d`);
  }
  if (meta?.finish) bits.push(shortDate(meta.finish));
  return bits.join(" · ");
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

  // Author and series are one identity line rather than two stacked greys.
  const identity = [book.author || "Unknown author", meta?.series].filter(Boolean).join(" · ");
  const detail = detailLine(book, meta, read, total);

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
            className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-raised px-1.5 py-[3px] text-[10.5px] font-medium leading-none text-ink-2 shadow-sm"
            title="A reading block is due today"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            Today
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-snug text-ink">{book.title || "Untitled"}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-3" title={identity}>{identity}</p>
      </div>

      <div className="min-w-0">
        <div className="flex h-4 items-center">
          {finished && book.rating
            ? <RatingStars value={book.rating} size={11} />
            : <Progress value={read} max={total} tint={book.color} height={3} />}
        </div>
        <p
          className={cn(
            "mt-1 h-[13px] truncate text-[10.5px] leading-[13px] text-ink-4 tnum",
            "opacity-0 transition-opacity duration-200 ease-[var(--ease-out-apple)]",
            "group-hover/book:opacity-100 group-focus-visible/book:opacity-100",
          )}
        >
          {detail}
        </p>
      </div>
    </button>
  );
}
