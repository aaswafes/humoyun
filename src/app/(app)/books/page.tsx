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
import { LibraryInsights } from "@/components/books/library-insights";
import { ReadingQueue } from "@/components/books/reading-queue";
import { LibraryToolbar, type StatusFilter } from "@/components/books/library-toolbar";
import { PauseDialog } from "@/components/books/pause-dialog";
import { ShelfDnd, ShelfGroup, ShelfItem } from "@/components/shelf/shelf-dnd";
import { finishedInYear } from "@/components/books/metrics";
import { mergeReadDays, readDaysIndex } from "@/components/books/pace";
import {
  clearPause, orderedQueue, pauseUntil, setLibraryGroup, setLibraryView, useLibraryPrefs,
  type GroupBy, type LibraryView,
} from "@/components/books/library-prefs";

type Status = Book["status"];

const STATUS_ORDER: { status: Status; label: string }[] = [
  { status: "reading", label: "Reading" },
  { status: "planned", label: "Planned" },
  { status: "finished", label: "Finished" },
  { status: "paused", label: "Paused" },
  { status: "dropped", label: "Dropped" },
];

const STATUS_LABEL: Record<Status, string> = Object.fromEntries(
  STATUS_ORDER.map(({ status, label }) => [status, label]),
) as Record<Status, string>;

/**
 * The catch-all bucket of each facet. Dropping a book there is how you take a
 * label off it, so the shelf and the drop handler have to agree on the name.
 */
const FACET_FALLBACK: Record<string, string> = {
  series: "Standalone",
  author: "Unknown author",
  genre: "Unfiled",
  topic: "No topic",
};

/**
 * Groupings a drop can honestly change. Author is a fact about the book, not a
 * shelf you choose, so dragging never rewrites it.
 */
const REFILABLE: GroupBy[] = ["status", "series", "genre", "topic"];

const SHELF_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

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
  const [pausing, setPausing] = React.useState<Book | null>(null);

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
    return [
      row.book.title,
      row.book.author ?? "",
      row.book.genre ?? "",
      row.book.topic ?? "",
      row.book.series ?? row.series ?? "",
    ].some((field) => field.toLowerCase().includes(q));
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
      // Empty shelves stay in the model: the render drops them at rest and
      // brings them back mid-drag, because a shelf you cannot see is a shelf
      // you cannot drop on.
      return STATUS_ORDER.map(({ status, label }) => ({
        key: status,
        label,
        rows: paged.filter((r) => r.book.status === status),
      }));
    }

    // `r.series` is the legacy value that lived in prefs before the column
    // existed; the column wins when both are present.
    const FACETS: Record<string, (r: TableRow) => string> = {
      series: (r) => r.book.series ?? r.series ?? "",
      author: (r) => r.book.author ?? "",
      genre: (r) => r.book.genre ?? "",
      topic: (r) => r.book.topic ?? "",
    };
    const key = FACETS[library.group] ?? FACETS.author;
    const fallback = FACET_FALLBACK[library.group] ?? FACET_FALLBACK.author;

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

  const logReading = useStore((s) => s.logReading);
  const unscheduleBook = useStore((s) => s.unscheduleBook);

  const canRefile = library.view === "shelf" && REFILABLE.includes(library.group);

  /** Unfinished blocks still ahead of a book — what pausing would clear. */
  const upcomingBlocks = React.useCallback((bookId: string) => tasks.filter(
    (t) => t.book_id === bookId && t.kind === "reading" && t.status !== "done" && (t.date ?? "") >= today,
  ).length, [tasks, today]);

  /**
   * A card dropped on another shelf. Status follows exactly the rules the
   * sheet's status menu follows — pausing asks for a date, finishing moves the
   * bookmark to the last page — so a drag and a menu pick never disagree.
   */
  const refile = React.useCallback((bookId: string, groupKey: string) => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;

    if (library.group === "status") {
      const status = groupKey as Status;
      if (status === "paused") { setPausing(book); return; }
      if (status === "finished") {
        logReading(book.id, Math.max(1, book.total_pages));
        toast({ title: `Finished ${book.title}`, description: "Bookmark moved to the last page.", tone: "success" });
        return;
      }
      if (book.status === "paused") clearPause(book.id);
      patch("books", book.id, { status });
      toast({ title: STATUS_LABEL[status], description: book.title });
      return;
    }

    const facet = library.group as "series" | "genre" | "topic";
    const value = groupKey === FACET_FALLBACK[facet] ? null : groupKey;
    patch("books", book.id, { [facet]: value });
    toast({
      title: value ? `Filed under ${value}` : `${facet[0].toUpperCase()}${facet.slice(1)} cleared`,
      description: book.title,
    });
  }, [books, library.group, logReading, patch, toast]);

  function pauseBook(book: Book, resume: string) {
    const cleared = upcomingBlocks(book.id);
    unscheduleBook(book.id, today);
    patch("books", book.id, { status: "paused" });
    pauseUntil(book.id, resume);
    toast({
      title: `${book.title} is paused`,
      description: `Back on ${resume}.${cleared ? ` ${cleared} upcoming ${cleared === 1 ? "block" : "blocks"} cleared.` : ""}`,
    });
  }

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
            {/*
              Two quiet rows instead of two panels: everything that analyses or
              plans the library folds away, so the page opens on the shelf.
            */}
            <div className="mb-8 divide-y divide-line hairline-b">
              <LibraryInsights
                days={days}
                weekStart={weekStart}
                goal={library.goal}
                finished={finishedCount}
              />
              {queue.length > 0 && (
                <ReadingQueue
                  books={queue}
                  series={library.series}
                  onOpen={(b) => setOpenId(b.id)}
                  onStart={startReading}
                />
              )}
            </div>

            <LibraryToolbar
              className="mb-6"
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
              total={rows.length}
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
              <ShelfDnd
                enabled={canRefile}
                onRefile={refile}
                overlay={(id) => (
                  <p className="truncate text-[13px] font-medium text-ink">
                    {books.find((b) => b.id === id)?.title || "Untitled"}
                  </p>
                )}
              >
                {(dragging) => (
                <div className="space-y-10">
                  {[
                    ...groups.filter((group) => group.rows.length > 0),
                    // Empty destinations join at the end, never in the middle:
                    // inserting one above the cursor mid-drag would slide the
                    // shelf you were aiming at out from under it.
                    ...(dragging ? groups.filter((group) => group.rows.length === 0) : []),
                  ].map((group) => (
                    <ShelfGroup key={group.key} groupKey={group.key} empty={group.rows.length === 0}>
                      {/* One ungrouped shelf explains itself — the label would be noise. */}
                      {group.key !== "all" && (
                        <div className="mb-3 flex items-baseline gap-2">
                          <h2 className="truncate text-[12.5px] font-medium text-ink-2">{group.label}</h2>
                          <span className="text-[11.5px] text-ink-4 tnum">{group.rows.length}</span>
                        </div>
                      )}
                      <div className={SHELF_GRID}>
                        {group.rows.map((row) => (
                          <ShelfItem
                            key={row.book.id}
                            id={row.book.id}
                            groupKey={group.key}
                            label={row.book.title || "this book"}
                          >
                            <BookCard
                              book={row.book}
                              meta={metaFor(row)}
                              onOpen={(b) => setOpenId(b.id)}
                            />
                          </ShelfItem>
                        ))}
                      </div>
                    </ShelfGroup>
                  ))}
                </div>
                )}
              </ShelfDnd>
            )}

            {visibleRows.length > paged.length && (
              <div className="mt-8 flex justify-center">
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
      <PauseDialog
        open={!!pausing}
        onClose={() => setPausing(null)}
        onConfirm={(date) => { if (pausing) pauseBook(pausing, date); setPausing(null); }}
        bookTitle={pausing?.title ?? ""}
        upcoming={pausing ? upcomingBlocks(pausing.id) : 0}
        initialDate={pausing ? library.paused[pausing.id] : null}
        weekStart={weekStart}
      />
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
