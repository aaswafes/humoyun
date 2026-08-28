"use client";

import * as React from "react";
import { Check, Pause } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Book } from "@/lib/types";
import { Ring } from "@/components/ui/primitives";
import { BookCover } from "./book-cover";
import { RatingStars } from "./fields";

export function BookCard({ book, onOpen }: { book: Book; onOpen: (book: Book) => void }) {
  const total = Math.max(1, book.total_pages);
  const read = Math.max(0, Math.min(book.current_page, total));
  const finished = book.status === "finished";
  const resting = book.status === "paused" || book.status === "dropped";

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
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-snug text-ink">{book.title || "Untitled"}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{book.author || "Unknown author"}</p>
      </div>

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
    </button>
  );
}
