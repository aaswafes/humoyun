"use client";

import * as React from "react";
import { LayoutGrid, NotebookPen, Plus, Rows3, Sun } from "lucide-react";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import { useHotkeys } from "@/hooks/use-hotkeys";
import type { Note } from "@/lib/types";
import { Button, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { useStickyChoice } from "@/components/notes/note-fields";
import { NoteCard } from "@/components/notes/note-card";
import { NoteList } from "@/components/notes/note-list";
import { NoteSheet } from "@/components/notes/note-sheet";
import { NotesToolbar } from "@/components/notes/notes-toolbar";
import {
  NO_FILTERS, buildSourceIndex, buildSourceRefs, filterNotes, linkedCount, locatorLabel,
  sortNotes, tagCounts, type NoteFilters,
} from "@/components/notes/note-model";

type View = "cards" | "list";
const VIEWS: readonly View[] = ["cards", "list"];

/** Above this the surface pages rather than laying out a thousand cards. */
const PAGE_SIZE = 60;

const MASONRY = "columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4";

const VIEW_OPTIONS = [
  {
    value: "cards" as const,
    label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5" />Cards</span>,
    title: "Notes as paper on a wall",
  },
  {
    value: "list" as const,
    label: <span className="inline-flex items-center gap-1.5"><Rows3 className="size-3.5" />List</span>,
    title: "One line per note",
  },
];

export default function NotesPage() {
  const ready = useStore((s) => s.ready);
  const notes = useStore((s) => s.notes);
  const books = useStore((s) => s.books);
  const media = useStore((s) => s.media);
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const nodes = useStore((s) => s.nodes);
  const insert = useStore((s) => s.insert);

  const [view, setView] = useStickyChoice<View>("humoyun.notes.view", "cards", VIEWS);
  const [filters, setFilters] = React.useState<NoteFilters>(NO_FILTERS);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [focusBody, setFocusBody] = React.useState(false);
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // One index over everything a note can hang off feeds every chip on the page.
  const idx = React.useMemo(
    () => buildSourceIndex(books, media, tasks, goals, nodes),
    [books, media, tasks, goals, nodes]);
  const refs = React.useMemo(() => buildSourceRefs(notes, idx), [notes, idx]);

  const locators = React.useMemo(() => {
    const map = new Map<string, string | null>();
    for (const note of notes) {
      const ref = refs.get(note.id);
      if (ref) map.set(note.id, locatorLabel(note, ref, idx));
    }
    return map;
  }, [notes, refs, idx]);

  const tags = React.useMemo(() => tagCounts(notes), [notes]);

  const visible = React.useMemo(
    () => sortNotes(filterNotes(notes, refs, filters)), [notes, refs, filters]);
  const paged = React.useMemo(() => visible.slice(0, limit), [visible, limit]);

  const pinned = paged.filter((n) => n.pinned);
  const rest = paged.filter((n) => !n.pinned);

  const open = React.useCallback((note: Note) => {
    setFocusBody(false);
    setOpenId(note.id);
  }, []);

  const writeOne = React.useCallback(() => {
    const note = insert("notes", {});
    setFocusBody(true);
    setOpenId(note.id);
  }, [insert]);

  /**
   * One daily note per day. Opening today's is the same gesture whether or not
   * it exists yet — the second press of the button must never make a twin.
   */
  const openDaily = React.useCallback(() => {
    const today = todayISO();
    const existing = notes.find((n) => n.kind === "daily" && n.date === today);
    if (existing) {
      setFocusBody(true);
      setOpenId(existing.id);
      return;
    }
    const note = insert("notes", { kind: "daily", date: today });
    setFocusBody(true);
    setOpenId(note.id);
  }, [notes, insert]);

  const changeFilters = React.useCallback((next: NoteFilters) => {
    setFilters(next);
    setLimit(PAGE_SIZE);
  }, []);

  useHotkeys({ "/": () => searchRef.current?.focus() }, { enabled: !openId });
  useTakeKey("n", writeOne, !openId);

  const linked = React.useMemo(() => linkedCount(refs), [refs]);
  const subtitle = notes.length
    ? `${notes.length} ${notes.length === 1 ? "note" : "notes"}${linked ? ` · ${linked} linked` : ""}`
    : undefined;

  const newButton = (
    <Button variant="primary" size="sm" onClick={writeOne}>
      <Plus className="size-3.5" />
      New note
    </Button>
  );

  const cards = (list: Note[]) => (
    <div className={MASONRY}>
      {list.map((note) => {
        const refer = refs.get(note.id);
        if (!refer) return null;
        return (
          <NoteCard
            key={note.id}
            note={note}
            refer={refer}
            locator={locators.get(note.id) ?? null}
            onOpen={open}
          />
        );
      })}
    </div>
  );

  return (
    <>
      <PageHeader title="Notes" subtitle={subtitle} actions={newButton}>
        {notes.length > 0 && (
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
          <NotesSkeleton />
        ) : notes.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="Nothing written yet"
            description="A note can stand on its own, or hang off something: a highlight from page 128, a thought after episode four, what today was actually about. Wherever it came from, it lands here."
            action={
              // The daily page lives in the toolbar, which is not on screen yet,
              // so the first note can still be today's.
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="primary" onClick={writeOne}>
                  <Plus className="size-3.5" />
                  Write one
                </Button>
                <Button onClick={openDaily}>
                  <Sun className="size-3.5" />
                  Start today&rsquo;s note
                </Button>
              </div>
            }
            className="py-24"
          />
        ) : (
          <>
            <NotesToolbar
              className="mb-6"
              query={filters.query}
              onQuery={(query) => changeFilters({ ...filters, query })}
              filters={filters}
              onFilters={changeFilters}
              tags={tags}
              count={visible.length}
              total={notes.length}
              searchRef={searchRef}
              onDaily={openDaily}
            />

            {visible.length === 0 ? (
              <EmptyState
                icon={NotebookPen}
                title={filters.query.trim()
                  ? `Nothing matches “${filters.query.trim()}”`
                  : "Nothing written like that"}
                description={filters.query.trim()
                  ? "Search runs over every title and every line of every note."
                  : "No note you have written sits under this kind, source or tag."}
                action={
                  <Button size="sm" onClick={() => changeFilters(NO_FILTERS)}>
                    Show every note
                  </Button>
                }
              />
            ) : view === "list" ? (
              <NoteList notes={paged} refs={refs} locators={locators} onOpen={open} />
            ) : pinned.length > 0 ? (
              <div className="space-y-8">
                <section>
                  <GroupHeading label="Pinned" count={pinned.length} />
                  {cards(pinned)}
                </section>
                {rest.length > 0 && (
                  <section>
                    <GroupHeading label="Everything else" count={rest.length} />
                    {cards(rest)}
                  </section>
                )}
              </div>
            ) : (
              cards(rest)
            )}

            {visible.length > paged.length && (
              <div className="mt-8 flex justify-center">
                <Button size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, visible.length - paged.length)} more
                  <span className="text-ink-4 tnum">
                    ({paged.length} of {visible.length})
                  </span>
                </Button>
              </div>
            )}
          </>
        )}
      </PageBody>

      {openId && (
        <NoteSheet
          noteId={openId}
          focusBody={focusBody}
          onClose={() => { setOpenId(null); setFocusBody(false); }}
        />
      )}
    </>
  );
}

/**
 * Take the key for good.
 *
 * The app shell already answers a bare "n" with Quick Add, and both listeners
 * sit on `document`, so a second bubble-phase handler here would fire on top of
 * it rather than instead of it — one press, a task *and* a note. Catching the
 * key in the capture phase, before it reaches the target at all, is what makes
 * N mean "new note" on this surface and nothing else.
 */
function useTakeKey(key: string, run: () => void, enabled: boolean) {
  const latest = React.useRef(run);
  latest.current = run;

  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // Typing an "n" is typing an "n", wherever the cursor happens to be.
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [key, enabled]);
}

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="truncate text-[12.5px] font-medium text-ink-2">{label}</h2>
      <span className="text-[11.5px] text-ink-4 tnum">{count}</span>
    </div>
  );
}

/** Paper of uneven length, because that is what the loaded wall looks like. */
const SKELETON_HEIGHTS = [
  "h-[132px]", "h-[84px]", "h-[176px]", "h-[104px]",
  "h-[148px]", "h-[92px]", "h-[120px]", "h-[160px]",
];

function NotesSkeleton() {
  return (
    <div className={MASONRY} aria-hidden>
      {SKELETON_HEIGHTS.map((h, i) => (
        <Skeleton key={i} className={`mb-4 block break-inside-avoid rounded-lg ${h}`} />
      ))}
    </div>
  );
}
