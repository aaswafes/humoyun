"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { recordReading } from "@/components/books/reading-actions";
import type { Book, Task } from "@/lib/types";
import { Button, Checkbox, Progress } from "@/components/ui/primitives";
import { RailCard, RailEmpty, RailItem, RailLink, RailMeta } from "./rail-card";

interface Group {
  book: Book;
  blocks: Task[];
  /** First and last page the day asks for. */
  from: number;
  to: number;
  /** True when nothing is scheduled and the target comes from the daily rate. */
  implied: boolean;
}

export function ReadingCard({ date }: { date: string }) {
  const tasks = useStore((s) => s.tasks);
  const books = useStore((s) => s.books);
  const toggleTask = useStore((s) => s.toggleTask);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  const blocks = React.useMemo(
    () => tasks
      .filter((t) => t.date === date && !t.parent_id && (t.kind === "reading" || !!t.book_id))
      .sort((a, b) => (a.start_min ?? 1440) - (b.start_min ?? 1440) || a.order_index - b.order_index),
    [tasks, date],
  );

  const { groups, loose } = React.useMemo(() => {
    const map = new Map<string, Group>();
    const orphans: Task[] = [];

    for (const block of blocks) {
      const book = block.book_id ? books.find((b) => b.id === block.book_id) : undefined;
      if (!book) { orphans.push(block); continue; }
      const group = map.get(book.id) ?? { book, blocks: [], from: Number.MAX_SAFE_INTEGER, to: 0, implied: false };
      group.blocks.push(block);
      if (block.page_from != null) group.from = Math.min(group.from, block.page_from);
      if (block.page_to != null) group.to = Math.max(group.to, block.page_to);
      map.set(book.id, group);
    }

    const list = [...map.values()].map((g) => ({
      ...g,
      from: g.from === Number.MAX_SAFE_INTEGER ? g.book.current_page + 1 : g.from,
    }));

    // Nothing scheduled but a book is open: the daily rate still names a target.
    if (!list.length) {
      for (const book of books) {
        if (book.status !== "reading" || !book.pages_per_day) continue;
        if (book.current_page >= book.total_pages) continue;
        list.push({
          book,
          blocks: [],
          from: book.current_page + 1,
          to: Math.min(book.total_pages, book.current_page + book.pages_per_day),
          implied: true,
        });
        if (list.length >= 2) break;
      }
    }

    return { groups: list, loose: orphans };
  }, [blocks, books]);

  const totals = groups.reduce(
    (acc, g) => {
      const planned = Math.max(0, g.to - (g.from - 1));
      const read = Math.min(planned, Math.max(0, g.book.current_page - (g.from - 1)));
      acc.planned += planned;
      acc.read += read;
      return acc;
    },
    { planned: 0, read: 0 },
  );
  const pagesLeft = Math.max(0, totals.planned - totals.read);

  function log(group: Group) {
    const before = group.book.current_page;
    const gained = group.to - before;
    recordReading(group.book.id, group.to);
    toast({
      title: `${gained} page${gained === 1 ? "" : "s"} logged`,
      description: `${group.book.title} — now on p.${group.to}`,
      tone: "success",
      action: { label: "Undo", run: () => patch("books", group.book.id, { current_page: before }) },
    });
  }

  const doneBlocks = blocks.filter((b) => b.status === "done").length;

  const summary = totals.planned > 0
    ? (pagesLeft ? `${pagesLeft} pages left today` : "today's pages are done")
    : groups.length || loose.length
      ? `${groups.length + loose.length} on the list`
      : "nothing scheduled";

  return (
    <RailCard
      icon={BookOpen}
      title="Reading"
      foldKey="rail.reading"
      summary={summary}
      href="/consumption/books"
      hrefLabel="Open Books"
      accessory={
        blocks.length > 0 ? (
          <span className="text-[11.5px] font-medium text-ink-3 tnum">
            {doneBlocks}/{blocks.length}
          </span>
        ) : undefined
      }
      footer={
        totals.planned > 0 ? (
          <div>
            <RailMeta value={`${totals.read}/${totals.planned}`}>
              {pagesLeft ? `${pagesLeft} pages left today` : "Today's pages are done"}
            </RailMeta>
            <Progress value={totals.read} max={totals.planned} tint="slate" height={3} className="mt-1.5" />
          </div>
        ) : undefined
      }
    >
      {groups.length === 0 && loose.length === 0 ? (
        <RailEmpty action={<RailLink href="/consumption/books">{books.length ? "Schedule a book" : "Add a book"}</RailLink>}>
          Nothing to read today. Schedule a book across your calendar and its daily page ranges land here.
        </RailEmpty>
      ) : (
        <>
          {groups.map((group) => {
            const { book } = group;
            const pct = book.total_pages > 0 ? Math.round((book.current_page / book.total_pages) * 100) : 0;
            const left = Math.max(0, group.to - book.current_page);

            return (
              <div key={book.id} className={`tint-${book.color}`}>
                {group.blocks.map((block) => {
                  const complete = block.status === "done";
                  const pages =
                    block.page_from != null && block.page_to != null
                      ? `p. ${block.page_from}–${block.page_to}`
                      : null;
                  return (
                    <RailItem key={block.id} className="items-start">
                      <span className="mt-[3px]">
                        <Checkbox
                          checked={complete}
                          tint={book.color}
                          onChange={() => toggleTask(block.id)}
                          label={`${book.title}${pages ? ` ${pages}` : ""} — mark as ${complete ? "not read" : "read"}`}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[13px]",
                            complete ? "text-ink-3 line-through decoration-ink-4/60" : "text-ink",
                          )}
                        >
                          {book.title}
                        </span>
                        {(pages || book.author) && (
                          <span className="mt-0.5 block truncate text-[11.5px] text-ink-3 tnum">
                            {pages}
                            {pages && book.author ? " · " : ""}
                            {book.author}
                          </span>
                        )}
                      </span>
                    </RailItem>
                  );
                })}

                {group.implied && (
                  <RailItem className="items-start">
                    <span aria-hidden className="mt-1.5 size-[7px] shrink-0 rounded-full" style={{ background: "var(--tint)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{book.title}</span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-ink-3 tnum">
                        No block scheduled · target p. {group.from}–{group.to}
                      </span>
                    </span>
                  </RailItem>
                )}

                <div className="px-2 pb-2 pt-1">
                  <div className="flex items-center gap-2">
                    <Progress
                      value={book.current_page}
                      max={book.total_pages}
                      tint={book.color}
                      height={3}
                      className="flex-1"
                    />
                    {left > 0 && (
                      <Button
                        size="sm"
                        variant="subtle"
                        className="shrink-0"
                        aria-label={`Log ${left} pages of ${book.title}, up to page ${group.to}`}
                        onClick={() => log(group)}
                      >
                        Log {left}p
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 flex items-baseline justify-between text-[11px] text-ink-4 tnum">
                    <span>
                      {book.current_page} / {book.total_pages} pages
                    </span>
                    <span>{left > 0 ? `${left} to today's target` : `${pct}% read`}</span>
                  </p>
                </div>
              </div>
            );
          })}

          {loose.map((block) => (
            <RailItem key={block.id}>
              <Checkbox
                checked={block.status === "done"}
                tint={block.color}
                onChange={() => toggleTask(block.id)}
                label={`${block.title} — mark as ${block.status === "done" ? "not read" : "read"}`}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px]",
                  block.status === "done" ? "text-ink-3 line-through decoration-ink-4/60" : "text-ink",
                )}
              >
                {block.title}
              </span>
            </RailItem>
          ))}
        </>
      )}
    </RailCard>
  );
}
