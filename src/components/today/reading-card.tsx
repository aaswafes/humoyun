"use client";

import { BookOpen, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { Progress } from "@/components/ui/primitives";
import { RailCard, RailEmpty, RailLink, RailRow } from "./rail-card";

export function ReadingCard({ date }: { date: string }) {
  const tasks = useStore((s) => s.tasks);
  const books = useStore((s) => s.books);
  const toggleTask = useStore((s) => s.toggleTask);

  const blocks = tasks
    .filter((t) => t.date === date && !t.parent_id && (t.kind === "reading" || !!t.book_id))
    .sort((a, b) => (a.start_min ?? 1440) - (b.start_min ?? 1440) || a.order_index - b.order_index);

  // The book's progress bar belongs to its first block of the day, not to every one.
  const seen = new Set<string>();
  const rows = blocks.map((block) => {
    const book = block.book_id ? books.find((b) => b.id === block.book_id) : undefined;
    const leading = !!book && !seen.has(book.id);
    if (book) seen.add(book.id);
    return { block, book, leading };
  });

  const done = blocks.filter((b) => b.status === "done").length;

  return (
    <RailCard
      icon={BookOpen}
      title="Reading"
      href="/books"
      hrefLabel="Open Books"
      accessory={
        blocks.length > 0 ? (
          <span className="text-[11.5px] font-medium text-ink-2 tnum">
            {done}/{blocks.length}
          </span>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <RailEmpty action={<RailLink href="/books">{books.length ? "Schedule a book" : "Add a book"}</RailLink>}>
          Nothing to read today. Schedule a book across your calendar and its daily page ranges land here.
        </RailEmpty>
      ) : (
        rows.map(({ block, book, leading }) => {
          const complete = block.status === "done";
          const pages =
            block.page_from != null && block.page_to != null ? `p. ${block.page_from}–${block.page_to}` : null;
          const pct = book && book.total_pages > 0
            ? Math.round((book.current_page / book.total_pages) * 100)
            : 0;

          return (
            <div key={block.id} className={cn(book ? `tint-${book.color}` : "tint-slate")}>
              <RailRow
                onClick={() => toggleTask(block.id)}
                ariaLabel={`${book?.title ?? block.title}${pages ? ` ${pages}` : ""} — mark as ${complete ? "not read" : "read"}`}
                ariaPressed={complete}
                className="items-start"
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-[2px] grid size-[17px] shrink-0 place-items-center rounded-[5px] border",
                    "transition-[background-color,border-color] duration-150 ease-[var(--ease-out-apple)]",
                    complete ? "border-transparent text-canvas" : "border-line-strong",
                  )}
                  style={complete ? { background: "var(--tint)" } : undefined}
                >
                  {complete && <Check className="size-3 stroke-[3.5]" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[13px]",
                      complete ? "text-ink-3 line-through decoration-ink-4/60" : "text-ink",
                    )}
                  >
                    {book?.title ?? block.title}
                  </span>
                  {(pages || book?.author) && (
                    <span className="mt-0.5 block truncate text-[11.5px] text-ink-3 tnum">
                      {pages}
                      {pages && book?.author ? " · " : ""}
                      {book?.author}
                    </span>
                  )}
                </span>
              </RailRow>

              {leading && book && (
                <div className="px-2 pb-2 pt-1">
                  <Progress value={book.current_page} max={book.total_pages} tint={book.color} height={3} />
                  <p className="mt-1 flex items-baseline justify-between text-[11px] text-ink-4 tnum">
                    <span>
                      {book.current_page} / {book.total_pages} pages
                    </span>
                    <span>{pct}%</span>
                  </p>
                </div>
              )}
            </div>
          );
        })
      )}
    </RailCard>
  );
}
