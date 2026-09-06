"use client";

import * as React from "react";
import {
  BarChart3, ChevronsDownUp, ChevronsUpDown, LayoutGrid, NotebookPen, Rows3,
  Sparkles, Sun,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import { useHotkeys } from "@/hooks/use-hotkeys";
import type { Note } from "@/lib/types";
import { Button, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { useStickyChoice } from "@/components/notes/note-fields";
import { NoteBoard, usePinnedLayouts, type Modifiers } from "@/components/notes/note-board";
import {
  ALL_FOLDERS, FolderRail, UNFILED_FOLDER, matchesFolder, type FolderFilter,
} from "@/components/notes/folder-rail";
import { NoteBulkBar } from "@/components/notes/note-bulk-bar";
import { NoteList } from "@/components/notes/note-list";
import { NoteEditor } from "@/components/notes/note-editor";
import { GroupPicker, NotesToolbar } from "@/components/notes/notes-toolbar";
import { TopicsView } from "@/components/notes/topics-view";
import { isUnfiled, type TopicBy, type TopicRow } from "@/components/notes/topic-model";
import { TemplateMenu, TemplatesModal } from "@/components/notes/note-templates";
import { buildCategoryIndex, categoryCounts } from "@/components/notes/category-model";
import {
  NO_FILTERS, buildSourceIndex, buildSourceRefs, filterNotes, groupNotes,
  linkedCount, locatorLabel, readableNotes, sortNotes, tagCounts,
  type GroupBy, type NoteFilters,
} from "@/components/notes/note-model";

type View = "cards" | "list" | "topics";
const VIEWS: readonly View[] = ["cards", "list", "topics"];
const GROUPS: readonly GroupBy[] = ["none", "tag", "category", "kind"];

/** Above this the surface pages rather than laying out a thousand cards. */
const PAGE_SIZE = 60;

const VIEW_OPTIONS = [
  {
    value: "cards" as const,
    label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5" />Cards</span>,
    title: "Notes as paper you can arrange",
  },
  {
    value: "list" as const,
    label: <span className="inline-flex items-center gap-1.5"><Rows3 className="size-3.5" />List</span>,
    title: "One line per note",
  },
  {
    value: "topics" as const,
    label: <span className="inline-flex items-center gap-1.5"><BarChart3 className="size-3.5" />Topics</span>,
    title: "What you are actually writing about, ranked",
  },
];

export default function NotesPage() {
  const ready = useStore((s) => s.ready);
  const allNotes = useStore((s) => s.notes);
  const categories = useStore((s) => s.noteCategories);
  const folders = useStore((s) => s.noteFolders);
  const books = useStore((s) => s.books);
  const media = useStore((s) => s.media);
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const batchUndo = useStore((s) => s.batchUndo);

  const toast = useStore((s) => s.toast);

  const [view, setView] = useStickyChoice<View>("humoyun.notes.view", "cards", VIEWS);
  const [group, setGroup] = useStickyChoice<GroupBy>("humoyun.notes.group", "none", GROUPS);
  const [filters, setFilters] = React.useState<NoteFilters>(NO_FILTERS);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [focusBody, setFocusBody] = React.useState(false);
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [folder, setFolder] = React.useState<FolderFilter>(ALL_FOLDERS);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Templates are notes. Every view on this page starts by setting them aside.
  const notes = React.useMemo(() => readableNotes(allNotes), [allNotes]);

  // One index over everything a note can hang off feeds every chip on the page.
  const idx = React.useMemo(
    () => buildSourceIndex(books, media, tasks, goals),
    [books, media, tasks, goals]);
  const refs = React.useMemo(() => buildSourceRefs(notes, idx), [notes, idx]);
  const catIdx = React.useMemo(() => buildCategoryIndex(categories), [categories]);

  const locators = React.useMemo(() => {
    const map = new Map<string, string | null>();
    for (const note of notes) {
      const ref = refs.get(note.id);
      if (ref) map.set(note.id, locatorLabel(note, ref, idx));
    }
    return map;
  }, [notes, refs, idx]);

  const tags = React.useMemo(() => tagCounts(notes), [notes]);
  const cats = React.useMemo(() => categoryCounts(notes, catIdx), [notes, catIdx]);

  const visible = React.useMemo(
    () => sortNotes(filterNotes(notes, refs, filters).filter((n) => matchesFolder(n, folder))),
    [notes, refs, filters, folder]);
  const paged = React.useMemo(() => visible.slice(0, limit), [visible, limit]);

  const sections = React.useMemo(() => groupNotes(paged, group), [paged, group]);
  /**
   * Every card on the page in the order it is drawn, flattened across the
   * groups. Shift-click measures its range against this, so selecting from one
   * group into the next works the way pointing at two cards suggests it will.
   */
  const order = React.useMemo(
    () => sections.flatMap((s) => s.notes.map((n) => n.id)), [sections]);

  /** Where a shift-range measures from — the last card touched, anywhere. */
  const anchorRef = React.useRef<string | null>(null);

  /**
   * Clicking a card, with the two modifiers everything else in the world uses.
   * Shift takes the run between the last card touched and this one, in the
   * order they are drawn; Cmd or Ctrl toggles a single card.
   */
  const pickNote = React.useCallback((id: string, mods: Modifiers) => {
    if (mods.shiftKey && anchorRef.current && order.includes(anchorRef.current)) {
      const from = order.indexOf(anchorRef.current);
      const to = order.indexOf(id);
      if (to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        setSelected(new Set(order.slice(lo, hi + 1)));
        return;
      }
    }

    anchorRef.current = id;
    if (mods.metaKey || mods.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }
    setSelected(new Set([id]));
  }, [order]);

  const arranged = usePinnedLayouts(notes);

  /**
   * Filing, from a drag or from the bulk bar — the same function either way, so
   * the two paths can never disagree about what "move to a folder" means.
   */
  const fileInto = React.useCallback((target: string, ids: string[]) => {
    if (target === ALL_FOLDERS || !ids.length) return;
    const next = target === UNFILED_FOLDER ? null : target;
    const before = ids
      .map((id) => allNotes.find((n) => n.id === id))
      .filter((n): n is Note => !!n)
      .map((n) => ({ id: n.id, folder_id: n.folder_id }));
    if (!before.length || before.every((b) => b.folder_id === next)) return;

    const name = target === UNFILED_FOLDER
      ? "Unfiled"
      : folders.find((f) => f.id === next)?.name ?? "the folder";

    batchUndo(`Move to ${name}`, () => {
      for (const b of before) patch("notes", b.id, { folder_id: next });
    });
    setSelected(new Set());
    toast({
      title: `${before.length} ${before.length === 1 ? "note" : "notes"} moved to ${name}`,
      action: {
        label: "Undo",
        run: () => batchUndo("Move them back", () => {
          for (const b of before) patch("notes", b.id, { folder_id: b.folder_id });
        }),
      },
    });
  }, [allNotes, folders, batchUndo, patch, toast]);

  // A selection is about what is on screen. Filter the page and anything that
  // scrolled out of it stops being selected, rather than being acted on unseen.
  const shownIds = React.useMemo(() => new Set(paged.map((n) => n.id)), [paged]);
  const liveSelection = React.useMemo(
    () => new Set([...selected].filter((id) => shownIds.has(id))), [selected, shownIds]);

  /**
   * Fold every card on screen, or unfold them. It acts on what is visible
   * rather than on everything: folding away notes a filter is hiding would be
   * a change you cannot see and did not ask for.
   */
  const anyExpanded = paged.some((n) => !n.collapsed);
  const foldAll = React.useCallback(() => {
    const targets = paged.filter((n) => n.collapsed === anyExpanded);
    if (!targets.length) return;
    batchUndo(anyExpanded ? "Fold every note" : "Unfold every note", () => {
      for (const n of targets) patch("notes", n.id, { collapsed: anyExpanded });
    });
  }, [paged, anyExpanded, batchUndo, patch]);

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

/**
   * A bar is the filter for its own topic, so the chart is not a report you
   * read and then go elsewhere to act on. The unfiled bar is the exception:
   * "no tag" is not a tag, and there is nothing to narrow to.
   */
  const activeFor = React.useCallback((by: TopicBy) => (
    by === "tag" ? filters.tags
      : by === "category" ? filters.categories
        : filters.kind === "all" ? [] : [filters.kind]
  ), [filters]);

  const toggleTopic = React.useCallback((by: TopicBy, row: TopicRow) => {
    if (isUnfiled(row)) return;
    const has = (list: string[]) => list.some((v) => v.toLowerCase() === row.label.toLowerCase());
    const without = (list: string[]) => list.filter((v) => v.toLowerCase() !== row.label.toLowerCase());

    if (by === "tag") {
      changeFilters({ ...filters, tags: has(filters.tags) ? without(filters.tags) : [...filters.tags, row.label] });
    } else if (by === "category") {
      changeFilters({
        ...filters,
        categories: has(filters.categories) ? without(filters.categories) : [...filters.categories, row.label],
      });
    } else {
      changeFilters({ ...filters, kind: filters.kind === row.key ? "all" : (row.key as NoteFilters["kind"]) });
    }
    setView("cards");
  }, [filters, changeFilters, setView]);

  useHotkeys({ "/": () => searchRef.current?.focus() }, { enabled: !openId });
  useTakeKey("n", writeOne, !openId && !templatesOpen);

  const linked = React.useMemo(() => linkedCount(refs), [refs]);
  const subtitle = notes.length
    ? `${notes.length} ${notes.length === 1 ? "note" : "notes"}${linked ? ` · ${linked} linked` : ""}`
    : undefined;

  const header = (
    <PageHeader
      title="Notes"
      subtitle={subtitle}
      actions={
        <TemplateMenu
          notes={allNotes}
          onNew={writeOne}
          onManage={() => setTemplatesOpen(true)}
          onOpen={(note) => { setFocusBody(true); setOpenId(note.id); }}
        />
      }
    >
      {notes.length > 0 && view !== "topics" && (
        <GroupPicker group={group} onGroup={setGroup} />
      )}
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
  );

  const overlays = (
    <>
      {openId && (
        <NoteEditor
          noteId={openId}
          focusBody={focusBody}
          onClose={() => { setOpenId(null); setFocusBody(false); }}
          onOpenNote={(id) => { setFocusBody(false); setOpenId(id); }}
        />
      )}
      <TemplatesModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        notes={allNotes}
        index={catIdx}
        onEdit={(note) => { setFocusBody(false); setOpenId(note.id); }}
        onStarted={(note) => { setFocusBody(true); setOpenId(note.id); }}
      />
    </>
  );

  if (ready && notes.length > 0 && view === "topics") {
    return (
      <>
        {header}
        <PageBody wide>
          <TopicsView
            notes={notes}
            index={catIdx}
            activeFor={activeFor}
            onToggle={toggleTopic}
          />
        </PageBody>
        {overlays}
      </>
    );
  }

  return (
    <>
      {header}

      <PageBody wide>
        {!ready ? (
          <NotesSkeleton />
        ) : notes.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="Nothing written yet"
            description="A note can stand on its own, or hang off something: a highlight from page 128, a thought after episode four, what today was actually about. Wherever it came from, it lands here."
            action={
              // The daily button lives in the toolbar, which is not on screen
              // yet, so the first note can still be today's.
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="primary" onClick={writeOne}>Write one</Button>
                <Button onClick={openDaily}>
                  <Sun className="size-3.5" />
                  Start today&rsquo;s note
                </Button>
              </div>
            }
            className="py-24"
          />
        ) : (
          <div className="flex items-start gap-6">
            {/* The rail is the drop target for a drag, so it has to be on
                screen whenever cards are — which is every view but Topics. */}
            <FolderRail
              notes={notes}
              folders={folders}
              active={folder}
              onActive={(next) => { setFolder(next); setSelected(new Set()); }}
              dropTarget={dropTarget}
              className="sticky top-[68px] hidden lg:block"
            />

            <div className="min-w-0 flex-1">
            <NotesToolbar
              className="mb-6"
              query={filters.query}
              onQuery={(query) => changeFilters({ ...filters, query })}
              filters={filters}
              onFilters={changeFilters}
              tags={tags}
              categories={cats}
              categoryIndex={catIdx}
              count={visible.length}
              total={notes.length}
              searchRef={searchRef}
              onDaily={openDaily}
              extra={
                <>
                  {view === "cards" && arranged.count > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={arranged.tidy}
                      title="Put every card back into the automatic layout"
                    >
                      <Sparkles className="size-3.5" />
                      Tidy up
                      <span className="text-ink-4 tnum">{arranged.count}</span>
                    </Button>
                  )}
                  {view === "cards" && paged.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={foldAll}
                      title={anyExpanded
                        ? "Show only the titles"
                        : "Show what is written in each one"}
                    >
                      {anyExpanded
                        ? <ChevronsDownUp className="size-3.5" />
                        : <ChevronsUpDown className="size-3.5" />}
                      {anyExpanded ? "Fold all" : "Unfold all"}
                    </Button>
                  )}
                </>
              }
            />

            {visible.length === 0 ? (
              <EmptyState
                icon={NotebookPen}
                title={filters.query.trim()
                  ? `Nothing matches “${filters.query.trim()}”`
                  : "Nothing written like that"}
                description={filters.query.trim()
                  ? "Search runs over every title and every line of every note."
                  : "No note you have written sits under this category, kind, source or tag."}
                action={
                  <Button size="sm" onClick={() => changeFilters(NO_FILTERS)}>
                    Show every note
                  </Button>
                }
              />
            ) : (
              <div className={group === "none" ? undefined : "space-y-9"}>
                {sections.map((section) => (
                  <section key={section.key}>
                    {section.label && (
                      <GroupHeading label={section.label} count={section.notes.length} />
                    )}
                    {view === "list" ? (
                      <NoteList
                        notes={section.notes}
                        refs={refs}
                        locators={locators}
                        categories={catIdx}
                        onOpen={open}
                      />
                    ) : (
                      <NoteBoard
                        notes={section.notes}
                        refs={refs}
                        locators={locators}
                        categories={catIdx}
                        onOpen={open}
                        selected={liveSelection}
                        onPick={pickNote}
                        onDropTarget={setDropTarget}
                        onFileInto={fileInto}
                      />
                    )}
                  </section>
                ))}
              </div>
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
            </div>
          </div>
        )}
      </PageBody>

      {liveSelection.size > 0 && (
        <NoteBulkBar
          selected={liveSelection}
          notes={notes}
          folders={folders}
          onClear={() => setSelected(new Set())}
          onFileInto={fileInto}
        />
      )}

      {overlays}
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
      run();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [key, enabled, run]);
}

/** The one line above a group of notes: what they share, and how many. */
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
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4" aria-hidden>
      {SKELETON_HEIGHTS.map((h, i) => (
        <Skeleton key={i} className={`mb-4 block break-inside-avoid rounded-lg ${h}`} />
      ))}
    </div>
  );
}
