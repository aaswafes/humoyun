"use client";

import * as React from "react";
import { Clapperboard, LayoutGrid, Plus, Rows3 } from "lucide-react";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import { MEDIA_KINDS, MEDIA_KIND_LABELS, type Media } from "@/lib/types";
import { Button, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { AddMediaModal } from "@/components/watch/add-media-modal";
import { MediaSheet } from "@/components/watch/media-sheet";
import { MediaCard, type MediaCardMeta } from "@/components/watch/media-card";
import {
  buildMediaRows, finishedInYear, MediaTable, mergeWatchDays, sortMediaRows, watchDaysIndex,
  type MediaRow, type MediaSortKey, type SortDir,
} from "@/components/watch/media-table";
import { WatchInsights } from "@/components/watch/watch-insights";
import {
  WatchToolbar, type WatchGroupBy, type WatchStatusFilter,
} from "@/components/watch/watch-toolbar";
import { MEDIA_FACET_FALLBACKS, type MediaFacet } from "@/components/watch/facets";

type View = "shelf" | "table";

const VIEWS: readonly View[] = ["shelf", "table"];
const GROUPS: readonly WatchGroupBy[] =
  ["status", "kind", "creator", "genre", "topic", "series", "none"];

const STATUS_ORDER: { status: Media["status"]; label: string }[] = [
  { status: "watching", label: "Watching" },
  { status: "planned", label: "Planned" },
  { status: "finished", label: "Finished" },
  { status: "paused", label: "Paused" },
  { status: "dropped", label: "Dropped" },
];

const SHELF_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

/** Above this the shelf pages rather than rendering a thousand posters. */
const PAGE_SIZE = 60;

const VIEW_OPTIONS = [
  { value: "shelf" as const, label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5" />Shelf</span>, title: "Posters on a shelf" },
  { value: "table" as const, label: <span className="inline-flex items-center gap-1.5"><Rows3 className="size-3.5" />Table</span>, title: "Sortable table" },
];

interface Group {
  key: string;
  label: string;
  rows: MediaRow[];
}

/**
 * View and grouping are per-device furniture, not data: they live in
 * localStorage, which the server cannot read, so the stored answer arrives one
 * paint after hydration instead of as a mismatch.
 */
function useStickyChoice<T extends string>(
  key: string, fallback: T, allowed: readonly T[],
): [T, (next: T) => void] {
  const [value, setValue] = React.useState<T>(fallback);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored && (allowed as readonly string[]).includes(stored)) setValue(stored as T);
    } catch { /* private mode: the default stands */ }
  }, [key, allowed]);

  const set = React.useCallback((next: T) => {
    setValue(next);
    try { window.localStorage.setItem(key, next); } catch { /* ignore */ }
  }, [key]);

  return [value, set];
}

export default function WatchPage() {
  const ready = useStore((s) => s.ready);
  const media = useStore((s) => s.media);
  const tasks = useStore((s) => s.tasks);

  const [view, setView] = useStickyChoice<View>("humoyun.watch.view", "shelf", VIEWS);
  const [group, setGroup] = useStickyChoice<WatchGroupBy>("humoyun.watch.group", "status", GROUPS);
  const [filter, setFilter] = React.useState<WatchStatusFilter>("all");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<MediaSortKey>("title");
  const [dir, setDir] = React.useState<SortDir>("asc");
  const [adding, setAdding] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(PAGE_SIZE);

  const today = todayISO();

  // One pass over the task list feeds every pace number on this page.
  const history = React.useMemo(() => watchDaysIndex(tasks, media), [tasks, media]);
  const days = React.useMemo(() => mergeWatchDays(history), [history]);
  const rows = React.useMemo(() => buildMediaRows(media, history), [media, history]);

  /** Titles with an unfinished watch block sitting on today. */
  const dueToday = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.kind === "watching" && t.media_id && t.date === today && t.status !== "done") {
        set.add(t.media_id);
      }
    }
    return set;
  }, [tasks, today]);

  const matches = React.useCallback((row: MediaRow) => {
    if (filter !== "all" && row.item.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [
      row.item.title,
      row.item.creator ?? "",
      row.item.genre ?? "",
      row.item.topic ?? "",
      row.item.series ?? "",
    ].some((field) => field.toLowerCase().includes(q));
  }, [filter, query]);

  const visibleRows = React.useMemo(
    () => sortMediaRows(rows.filter(matches), sort, dir), [rows, matches, sort, dir]);

  const paged = React.useMemo(() => visibleRows.slice(0, limit), [visibleRows, limit]);

  const groups: Group[] = React.useMemo(() => {
    if (view === "table") return [];
    if (group === "none") return [{ key: "all", label: "All titles", rows: paged }];

    if (group === "status") {
      return STATUS_ORDER
        .map(({ status, label }) => ({
          key: status,
          label,
          rows: paged.filter((r) => r.item.status === status),
        }))
        .filter((g) => g.rows.length > 0);
    }

    if (group === "kind") {
      return MEDIA_KINDS
        .map((kind) => ({
          key: kind,
          label: MEDIA_KIND_LABELS[kind],
          rows: paged.filter((r) => r.item.kind === kind),
        }))
        .filter((g) => g.rows.length > 0);
    }

    const facet: MediaFacet = group;
    const fallback = MEDIA_FACET_FALLBACKS[facet];

    const buckets = new Map<string, MediaRow[]>();
    for (const row of paged) {
      const k = row.item[facet]?.trim() || fallback;
      const list = buckets.get(k);
      if (list) list.push(row);
      else buckets.set(k, [row]);
    }
    return [...buckets.entries()]
      .map(([k, list]) => ({ key: k, label: k, rows: list }))
      // The catch-all bucket is not a shelf of its own; it belongs at the bottom.
      .sort((a, b) =>
        a.label === fallback ? 1 : b.label === fallback ? -1 : a.label.localeCompare(b.label));
  }, [paged, group, view]);

  const finishedCount = React.useMemo(() => finishedInYear(media, tasks).length, [media, tasks]);

  const watchingCount = media.filter((m) => m.status === "watching").length;
  const dueCount = dueToday.size;

  const metaFor = React.useCallback((row: MediaRow): MediaCardMeta => ({
    perDay: row.perDay,
    finish: row.finish,
    dueToday: dueToday.has(row.item.id),
  }), [dueToday]);

  const addButton = (
    <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
      <Plus className="size-3.5" />
      Add title
    </Button>
  );

  const subtitle = media.length
    ? `${media.length} ${media.length === 1 ? "title" : "titles"} · ${watchingCount} watching${dueCount ? ` · ${dueCount} due today` : ""}`
    : undefined;

  return (
    <>
      <PageHeader title="Films & Anime" subtitle={subtitle} actions={addButton}>
        {media.length > 0 && (
          <Segmented<View>
            size="sm"
            value={view}
            onChange={setView}
            options={VIEW_OPTIONS}
            className="mr-1"
          />
        )}
      </PageHeader>

      <PageBody wide>
        {!ready ? (
          <ShelfSkeleton />
        ) : media.length === 0 ? (
          <EmptyState
            icon={Clapperboard}
            title="Nothing to watch yet"
            description="Add an anime or a series with its episode count and a pace — episodes a day — and Humoyun drops a watch block on every day until the finale. A film is simply one evening on the calendar."
            action={addButton}
            className="py-24"
          />
        ) : (
          <>
            {/* The analysis strip folds away, so the page opens on the shelf. */}
            <div className="mb-8 hairline-b">
              <WatchInsights days={days} finished={finishedCount} />
            </div>

            <WatchToolbar
              className="mb-6"
              query={query}
              onQuery={(v) => { setQuery(v); setLimit(PAGE_SIZE); }}
              filter={filter}
              onFilter={(v) => { setFilter(v); setLimit(PAGE_SIZE); }}
              group={group}
              onGroup={setGroup}
              sort={sort}
              onSort={setSort}
              dir={dir}
              onDir={setDir}
              showGrouping={view === "shelf"}
              count={visibleRows.length}
              total={rows.length}
            />

            {visibleRows.length === 0 ? (
              <EmptyState
                icon={Clapperboard}
                title={query.trim() ? `Nothing matches “${query.trim()}”` : "Nothing on this shelf"}
                description={query.trim()
                  ? "Try a different title, creator, genre or series."
                  : "No film or series on your shelf sits in this state right now."}
                action={
                  <Button size="sm" onClick={() => { setQuery(""); setFilter("all"); }}>
                    Show every title
                  </Button>
                }
              />
            ) : view === "table" ? (
              <MediaTable
                rows={paged}
                sort={sort}
                dir={dir}
                onSort={(key) => {
                  if (key === sort) setDir(dir === "asc" ? "desc" : "asc");
                  else { setSort(key); setDir("asc"); }
                }}
                onOpen={(item) => setOpenId(item.id)}
              />
            ) : (
              <div className="space-y-10">
                {groups.map((g) => (
                  <section key={g.key}>
                    {/* One ungrouped shelf explains itself — the label would be noise. */}
                    {g.key !== "all" && (
                      <div className="mb-3 flex items-baseline gap-2">
                        <h2 className="truncate text-[12.5px] font-medium text-ink-2">{g.label}</h2>
                        <span className="text-[11.5px] text-ink-4 tnum">{g.rows.length}</span>
                      </div>
                    )}
                    <div className={SHELF_GRID}>
                      {g.rows.map((row) => (
                        <MediaCard
                          key={row.item.id}
                          item={row.item}
                          meta={metaFor(row)}
                          onOpen={(item) => setOpenId(item.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
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

      {adding && <AddMediaModal open onClose={() => setAdding(false)} />}
      {openId && <MediaSheet mediaId={openId} onClose={() => setOpenId(null)} />}
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
