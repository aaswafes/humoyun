"use client";

import * as React from "react";
import { Library, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Book } from "@/lib/types";
import { Button, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { AddBookModal } from "@/components/books/add-book-modal";
import { BookCard } from "@/components/books/book-card";
import { BookSheet } from "@/components/books/book-sheet";
import { ReadingPaceChart } from "@/components/books/reading-pace-chart";
import { ReadingStats } from "@/components/books/reading-stats";
import { finishedOn } from "@/components/books/metrics";

type Status = Book["status"];
type Filter = "all" | Status;

const GROUPS: { status: Status; label: string }[] = [
  { status: "reading", label: "Reading" },
  { status: "planned", label: "Planned" },
  { status: "finished", label: "Finished" },
  { status: "paused", label: "Paused" },
  { status: "dropped", label: "Dropped" },
];

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reading", label: "Reading" },
  { value: "planned", label: "Planned" },
  { value: "finished", label: "Finished" },
  { value: "paused", label: "Paused" },
];

const SHELF_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

export default function BooksPage() {
  const ready = useStore((s) => s.ready);
  const books = useStore((s) => s.books);
  const tasks = useStore((s) => s.tasks);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const [filter, setFilter] = React.useState<Filter>("all");
  const [adding, setAdding] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const grouped = React.useMemo(() => {
    return GROUPS.map(({ status, label }) => {
      const list = books.filter((b) => b.status === status);
      // Finished books read best newest-first; everything else keeps shelf order.
      list.sort((a, b) =>
        status === "finished"
          ? finishedOn(b, tasks).localeCompare(finishedOn(a, tasks))
          : a.order_index - b.order_index);
      return { status, label, list };
    });
  }, [books, tasks]);

  const visible = grouped.filter((g) => g.list.length > 0 && (filter === "all" || filter === g.status));
  const readingCount = books.filter((b) => b.status === "reading").length;

  const addButton = (
    <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
      <Plus className="size-3.5" />
      Add book
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Books"
        subtitle={
          books.length
            ? `${books.length} ${books.length === 1 ? "book" : "books"} · ${readingCount} in progress`
            : undefined
        }
        actions={addButton}
      >
        {books.length > 0 && (
          <Segmented<Filter>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={FILTERS}
            className="mr-1 hidden sm:inline-flex"
          />
        )}
      </PageHeader>

      <PageBody wide>
        {!ready ? (
          <ShelfSkeleton />
        ) : books.length === 0 ? (
          <EmptyState
            icon={Library}
            title="Your shelf is empty"
            description="Add a book with its page count and a pace, and Humoyun drops a reading block on every day until the last page."
            action={addButton}
            className="py-24"
          />
        ) : (
          <>
            <section className="mb-9 grid gap-8 border-b border-line pb-7 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
              <ReadingStats books={books} tasks={tasks} />
              <ReadingPaceChart tasks={tasks} weekStart={weekStart} />
            </section>

            {visible.length === 0 ? (
              <EmptyState
                icon={Library}
                title={`Nothing ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}`}
                description="No book on your shelf sits in this state right now."
                action={<Button size="sm" onClick={() => setFilter("all")}>Show every book</Button>}
              />
            ) : (
              visible.map((group) => (
                <section key={group.status} className="mb-9 last:mb-0">
                  <div className="mb-3 flex items-baseline gap-2 border-b border-line pb-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                      {group.label}
                    </h2>
                    <span className="text-[11px] text-ink-4 tnum">{group.list.length}</span>
                  </div>
                  <div className={SHELF_GRID}>
                    {group.list.map((book) => (
                      <BookCard key={book.id} book={book} onOpen={(b) => setOpenId(b.id)} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
        )}
      </PageBody>

      {adding && <AddBookModal open onClose={() => setAdding(false)} />}
      <BookSheet bookId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function ShelfSkeleton() {
  return (
    <div className={SHELF_GRID} aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5 p-2">
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-2.5 w-3/5" />
        </div>
      ))}
    </div>
  );
}
