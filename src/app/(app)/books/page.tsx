"use client";

import * as React from "react";
import { LayoutGrid, Library, Plus, Rows3 } from "lucide-react";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import type { Book } from "@/lib/types";
import { Button, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { AddBookModal } from "@/components/books/add-book-modal";
import { BookCard, type BookCardMeta } from "@/components/books/book-card";
import { BookSheet } from "@/components/books/book-sheet";
import { BooksTable, buildRows, sortRows, type SortDir, type SortKey, type TableRow } from "@/components/books/books-table";
import { ReadingPaceChart } from "@/components/books/reading-pace-chart";
import { ReadingStats } from "@/components/books/reading-stats";
import { ReadingGoal } from "@/components/books/reading-goal";
import { ReadingQueue } from "@/components/books/reading-queue";
import { LibraryToolbar, type StatusFilter } from "@/components/books/library-toolbar";
import { finishedInYear } from "@/components/books/metrics";
import { mergeReadDays, readDaysIndex } from "@/components/books/pace";
import {
  orderedQueue, setLibraryGroup, setLibraryView, useLibraryPrefs, type LibraryView,
} from "@/components/books/library-prefs";

type Status = Book["status"];

const STATUS_ORDER: { status: Status; label: string }[] = [
  { status: "reading", label: "Reading" },
  { status: "planned", label: "Planned" },
  { status: "finished", label: "Finished" },
  { status: "paused", label: "Paused" },
  { status: "dropped", label: "Dropped" },
];

const SHELF_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

/** Above this the shelf pages rather than rendering a thousand covers. */
const PAGE_SIZE = 60;

const VIEW_OPTIONS = [
  { value: "shelf" as const, label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5" />Shelf</span>, title: "Covers on a shelf" },
  { value: "table" as const, label: <span className="inline-flex items-center gap-1.5"><Rows3 className="size-3.5" />Table</span>, title: "Sortable table" },
];

interface Group {
  key: string;
  label: string;
  rows: TableRow[];
}

export default function BooksPage() {
  const ready = useStore((s) => s.ready);
  const books = useStore((s) => s.books);
  const tasks = useStore((s) => s.tasks);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const library = useLibraryPrefs();

  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("title");
  const [dir, setDir] = React.useState<SortDir>("asc");
  const [adding, setAdding] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(PAGE_SIZE);

  const today = todayISO();

  // One pass over the task list feeds every pace number on this page.
  const history = React.useMemo(
    () => readDaysIndex(tasks, library.sessions), [tasks, library.sessions]);
  const days = React.useMemo(() => mergeReadDays(history), [history]);

  const rows = React.useMemo(
    () => buildRows(books, history, library.series), [books, history, library.series]);

  /** Books with an unfinished block sitting on today. */
  const dueToday = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.kind === "reading" && t.book_id && t.date === today && t.status !== "done") {
        set.add(t.book_id);
      }
    }
    return set;
  }, [tasks, today]);

  const matches = React.useCallback((row: TableRow) => {
    if (filter !== "all" && row.book.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.book.title, row.book.author ?? "", row.series ?? ""]
      .some((field) => field.toLowerCase().includes(q));
  }, [filter, query]);

  const visibleRows = React.useMemo(
    () => sortRows(rows.filter(matches), sort, dir), [rows, matches, sort, dir]);

  const paged = React.useMemo(
    () => visibleRows.slice(0, limit), [visibleRows, limit]);

  const groups: Group[] = React.useMemo(() => {
    if (library.view === "table") return [];
    if (library.group === "none") {
      return [{ key: "all", label: "All books", rows: paged }];
    }
    if (library.group === "status") {
      return STATUS_ORDER
        .map(({ status, label }) => ({
          key: status,
          label,
          rows: paged.filter((r) => r.book.status === status),
        }))
        .filter((g) => g.rows.length > 0);
    }

    const key = (r: TableRow) => library.group === "series"
      ? (r.series ?? "")
      : (r.book.author ?? "");
    const fallback = library.group === "series" ? "Standalone" : "Unknown author";

    const buckets = new Map<string, TableRow[]>();
    for (const row of paged) {
      const k = key(row) || fallback;
      const list = buckets.get(k);
      if (list) list.push(row);
      else buckets.set(k, [row]);
    }
    return [...buckets.entries()]
      .map(([k, list]) => ({ key: k, label: k, rows: list }))
      // The catch-all bucket is not a collection; it belongs at the bottom.
      .sort((a, b) =>
        a.label === fallback ? 1 : b.label === fallback ? -1 : a.label.localeCompare(b.label));
  }, [paged, library.group, library.view]);

  const queue = React.useMemo(
    () => orderedQueue(books.filter((b) => b.status === "planned"), library.queue),
    [books, library.queue]);

  const finishedCount = React.useMemo(
    () => finishedInYear(books, tasks).length, [books, tasks]);

  const readingCount = books.filter((b) => b.status === "reading").length;
  const dueCount = dueToday.size;

  const metaFor = React.useCallback((row: TableRow): BookCardMeta => ({
    perDay: row.perDay,
    finish: row.finish,
    resumeDate: library.paused[row.book.id],
    series: row.series,
    dueToday: dueToday.has(row.book.id),
  }), [library.paused, dueToday]);

  function startReading(book: Book) {
    patch("books", book.id, { status: "reading" });
    setOpenId(book.id);
    toast({
      title: `Reading ${book.title}`,
      description: "Set a pace in the Plan section and it lands on your calendar.",
    });
  }

  const addButton = (
    <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
      <Plus className="size-3.5" />
      Add book
    </Button>
  );

  const subtitle = books.length
    ? `${books.length} ${books.length === 1 ? "book" : "books"} · ${readingCount} in progress${dueCount ? ` · ${dueCount} due today` : ""}`
    : undefined;

  return (
    <>
      <PageHeader title="Books" subtitle={subtitle} actions={addButton}>
        {books.length > 0 && (
          <Segmented<LibraryView>
            size="sm"
            value={library.view}
            onChange={setLibraryView}
            options={VIEW_OPTIONS}
            className="mr-1"
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
            <section className="mb-6 grid gap-8 border-b border-line pb-7 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
              <div className="min-w-0">
                <ReadingStats books={books} tasks={tasks} days={days} />
                <ReadingGoal
                  goal={library.goal}
                  finished={finishedCount}
                  className="mt-5 border-t border-line pt-4"
                />
              </div>
              <ReadingPaceChart days={days} weekStart={weekStart} />
            </section>

            {queue.length > 0 && (
              <ReadingQueue
                books={queue}
                series={library.series}
                onOpen={(b) => setOpenId(b.id)}
                onStart={startReading}
                className="mb-6"
              />
            )}

            <LibraryToolbar
              className="mb-5"
              query={query}
              onQuery={(v) => { setQuery(v); setLimit(PAGE_SIZE); }}
              filter={filter}
              onFilter={(v) => { setFilter(v); setLimit(PAGE_SIZE); }}
              group={library.group}
              onGroup={setLibraryGroup}
              sort={sort}
              onSort={setSort}
              dir={dir}
              onDir={setDir}
              showGrouping={library.view === "shelf"}
              count={visibleRows.length}
            />

            {visibleRows.length === 0 ? (
              <EmptyState
                icon={Library}
                title={query.trim() ? `Nothing matches “${query.trim()}”` : "Nothing on this shelf"}
                description={query.trim()
                  ? "Try a different title, author or series."
                  : "No book on your shelf sits in this state right now."}
                action={
                  <Button size="sm" onClick={() => { setQuery(""); setFilter("all"); }}>
                    Show every book
                  </Button>
                }
              />
            ) : library.view === "table" ? (
              <BooksTable
                rows={paged}
                sort={sort}
                dir={dir}
                onSort={(key) => {
                  if (key === sort) setDir(dir === "asc" ? "desc" : "asc");
                  else { setSort(key); setDir("asc"); }
                }}
                onOpen={(b) => setOpenId(b.id)}
              />
            ) : (
              groups.map((group) => (
                <section key={group.key} className="mb-9 last:mb-0">
                  <div className="mb-3 flex items-baseline gap-2 border-b border-line pb-2">
                    <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                      {group.label}
                    </h2>
                    <span className="text-[11px] text-ink-4 tnum">{group.rows.length}</span>
                  </div>
                  <div className={SHELF_GRID}>
                    {group.rows.map((row) => (
                      <BookCard
                        key={row.book.id}
                        book={row.book}
                        meta={metaFor(row)}
                        onOpen={(b) => setOpenId(b.id)}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}

            {visibleRows.length > paged.length && (
              <div className="mt-6 flex justify-center">
                <Button size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, visibleRows.length - paged.length)} more
                  <span className="text-ink-4 tnum">
                    ({paged.length} of {visibleRows.length})
                  </span>
                </Button>
              </div>
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
