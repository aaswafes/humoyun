"use client";

import * as React from "react";
import { LayoutGrid, MonitorPlay, Plus, Rows3 } from "lucide-react";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import { MEDIA_KIND_LABELS, YOUTUBE_KINDS, type Media } from "@/lib/types";
import { Button, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { useT } from "@/lib/i18n";
import { ConsumptionTabs } from "@/components/consumption/tabs";
import { ShelfDnd, ShelfGroup, ShelfItem } from "@/components/shelf/shelf-dnd";
import { MEDIA_REFILABLE, useMediaRefile } from "@/components/shelf/use-media-refile";
import {
  buildMediaRows, mergeWatchDays, watchDaysIndex, type MediaRow, type SortDir,
} from "@/components/watch/media-table";
import { AddVideoModal } from "@/components/youtube/add-video-modal";
import { VideoSheet } from "@/components/youtube/video-sheet";
import { VideoCard, type VideoCardMeta } from "@/components/youtube/video-card";
import { VideoTable, sortVideoRows, type VideoSortKey } from "@/components/youtube/video-table";
import { YoutubeInsights } from "@/components/youtube/youtube-insights";
import {
  YoutubeToolbar, type YoutubeGroupBy, type YoutubeStatusFilter,
} from "@/components/youtube/youtube-toolbar";
import { YOUTUBE_FACET_FALLBACKS, type YoutubeFacet } from "@/components/youtube/youtube-facets";

type View = "shelf" | "table";

const VIEWS: readonly View[] = ["shelf", "table"];
const GROUPS: readonly YoutubeGroupBy[] =
  ["status", "kind", "channel", "genre", "topic", "series", "none"];

const STATUS_ORDER: { status: Media["status"]; label: string }[] = [
  { status: "watching", label: "Watching" },
  { status: "planned", label: "Planned" },
  { status: "finished", label: "Finished" },
  { status: "paused", label: "Paused" },
  { status: "dropped", label: "Dropped" },
];

const SHELF_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

/** Above this the shelf pages rather than rendering a thousand thumbnails. */
const PAGE_SIZE = 60;

const VIEW_OPTIONS = [
  { value: "shelf" as const, label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5" />Shelf</span>, title: "Thumbnails on a shelf" },
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

export function YoutubeView() {
  const { t } = useT();
  const ready = useStore((s) => s.ready);
  const allMedia = useStore((s) => s.media);
  // Films and anime share the media model but have their own shelf, so this
  // one only lists what came off YouTube.
  const media = React.useMemo(
    () => allMedia.filter((m) => (YOUTUBE_KINDS as string[]).includes(m.kind)),
    [allMedia],
  );
  const allTasks = useStore((s) => s.tasks);

  // Every watch block belongs to some title; only the ones pointing at this
  // shelf may feed its pace, streak and hours, or a film night would show up
  // as a YouTube streak.
  const tasks = React.useMemo(() => {
    const ids = new Set(media.map((m) => m.id));
    return allTasks.filter((t) => t.media_id != null && ids.has(t.media_id));
  }, [allTasks, media]);

  const [view, setView] = useStickyChoice<View>("humoyun.youtube.view", "shelf", VIEWS);
  const [group, setGroup] = useStickyChoice<YoutubeGroupBy>("humoyun.youtube.group", "status", GROUPS);
  const [filter, setFilter] = React.useState<YoutubeStatusFilter>("all");
  const [query, setQuery] = React.useState("");
  // A watch-later list opens on what you saved last.
  const [sort, setSort] = React.useState<VideoSortKey>("added");
  const [dir, setDir] = React.useState<SortDir>("desc");
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
      row.item.channel ?? "",
      row.item.genre ?? "",
      row.item.topic ?? "",
      row.item.series ?? "",
    ].some((field) => field.toLowerCase().includes(q));
  }, [filter, query]);

  const visibleRows = React.useMemo(
    () => sortVideoRows(rows.filter(matches), sort, dir), [rows, matches, sort, dir]);

  const paged = React.useMemo(() => visibleRows.slice(0, limit), [visibleRows, limit]);

  const groups: Group[] = React.useMemo(() => {
    if (view === "table") return [];
    if (group === "none") return [{ key: "all", label: "Everything saved", rows: paged }];

    if (group === "status") {
      // Empty shelves stay in the model: the render drops them at rest and
      // brings them back mid-drag, because a shelf you cannot see is a shelf
      // you cannot drop on.
      return STATUS_ORDER.map(({ status, label }) => ({
        key: status,
        label,
        rows: paged.filter((r) => r.item.status === status),
      }));
    }

    if (group === "kind") {
      return YOUTUBE_KINDS.map((kind) => ({
        key: kind,
        label: MEDIA_KIND_LABELS[kind],
        rows: paged.filter((r) => r.item.kind === kind),
      }));
    }

    const facet: YoutubeFacet = group;
    const fallback = YOUTUBE_FACET_FALLBACKS[facet];

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

  const waiting = media.filter((m) => m.status === "planned").length;
  const dueCount = dueToday.size;

  const metaFor = React.useCallback((row: MediaRow): VideoCardMeta => ({
    perDay: row.perDay,
    finish: row.finish,
    dueToday: dueToday.has(row.item.id),
  }), [dueToday]);

  const canRefile = view === "shelf" && MEDIA_REFILABLE.includes(group);
  const refile = useMediaRefile(group, YOUTUBE_FACET_FALLBACKS);

  const addButton = (
    <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
      <Plus className="size-3.5" />
      Add video
    </Button>
  );

  // The one number this shelf exists for: how much is queued up.
  const subtitle = media.length
    ? `${waiting} waiting · ${media.length} saved${dueCount ? ` · ${dueCount} due today` : ""}`
    : undefined;

  return (
    <>
      <PageHeader title={t("nav.consumption")} subtitle={subtitle} actions={addButton}>
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

      <ConsumptionTabs active="youtube" />

      <PageBody wide>
        {!ready ? (
          <ShelfSkeleton />
        ) : media.length === 0 ? (
          <EmptyState
            icon={MonitorPlay}
            title="Nothing saved to watch yet"
            description="Paste a YouTube link, give it a channel, and it waits here until you want it. A playlist takes a number of videos and a pace — videos a day — and Qalamchi lays a watch block on every day until the last one."
            action={addButton}
            className="py-24"
          />
        ) : (
          <>
            {/* The analysis strip folds away, so the page opens on the queue. */}
            <div className="mb-8 hairline-b">
              <YoutubeInsights days={days} />
            </div>

            <YoutubeToolbar
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
                icon={MonitorPlay}
                title={query.trim() ? `Nothing matches “${query.trim()}”` : "Nothing on this shelf"}
                description={query.trim()
                  ? "Try a different title, channel, genre or series."
                  : "Nothing you have saved sits in this state right now."}
                action={
                  <Button size="sm" onClick={() => { setQuery(""); setFilter("all"); }}>
                    Show everything saved
                  </Button>
                }
              />
            ) : view === "table" ? (
              <VideoTable
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
              <ShelfDnd
                enabled={canRefile}
                onRefile={refile}
                overlay={(id) => (
                  <p className="truncate text-[13px] font-medium text-ink">
                    {media.find((m) => m.id === id)?.title || "Untitled"}
                  </p>
                )}
              >
                {(dragging) => (
                <div className="space-y-10">
                  {[
                    ...groups.filter((g) => g.rows.length > 0),
                    // Empty destinations join at the end, never in the middle:
                    // inserting one above the cursor mid-drag would slide the
                    // shelf you were aiming at out from under it.
                    ...(dragging ? groups.filter((g) => g.rows.length === 0) : []),
                  ].map((g) => (
                    <ShelfGroup key={g.key} groupKey={g.key} empty={g.rows.length === 0}>
                      {/* One ungrouped shelf explains itself — the label would be noise. */}
                      {g.key !== "all" && (
                        <div className="mb-3 flex items-baseline gap-2">
                          <h2 className="truncate text-[12.5px] font-medium text-ink-2">{g.label}</h2>
                          <span className="text-[11.5px] text-ink-4 tnum">{g.rows.length}</span>
                        </div>
                      )}
                      <div className={SHELF_GRID}>
                        {g.rows.map((row) => (
                          <ShelfItem
                            key={row.item.id}
                            id={row.item.id}
                            groupKey={g.key}
                            label={row.item.title || "this title"}
                          >
                            <VideoCard
                              item={row.item}
                              meta={metaFor(row)}
                              onOpen={(item) => setOpenId(item.id)}
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

      {adding && <AddVideoModal open onClose={() => setAdding(false)} />}
      {openId && <VideoSheet mediaId={openId} onClose={() => setOpenId(null)} />}
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
