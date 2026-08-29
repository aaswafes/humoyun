"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import {
  BookOpen, CalendarPlus, Clapperboard, Clock, Flag, Inbox, LayoutTemplate, Maximize2,
  PanelRightClose, PanelRightOpen,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addDays, dayName, formatDate, formatDuration, formatTime, friendlyDate,
} from "@/lib/date";
import { inboxTasks, useStore } from "@/lib/store";
import { MEDIA_KIND_LABELS, type Book, type Media, type Task, type Template } from "@/lib/types";
import { Button, IconButton, Progress } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import { openQuickAdd } from "@/components/shell/quick-add";
import { MediaCover } from "@/components/watch/media-cover";
import { Fold, useStickyFlag } from "./view-prefs";
import {
  applyTemplateOnDay, mediaPreview, moveTaskToDay, scheduleBookOnDay, scheduleMediaOnDay,
} from "./calendar-utils";

type Section = "books" | "watch" | "templates" | "unscheduled";

const STATUS_LABEL: Record<string, string> = {
  reading: "Reading",
  watching: "Watching",
  planned: "Planned",
};

const OPEN_KEY: Record<Section, string> = {
  books: "humoyun.calendar.rail.books",
  watch: "humoyun.calendar.rail.watch",
  templates: "humoyun.calendar.rail.templates",
  unscheduled: "humoyun.calendar.rail.unscheduled",
};

/**
 * Two rows with the same id would render the same card twice — a duplicated
 * shelf is the one bug a drag target must never have, because both copies
 * schedule the same book.
 */
function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

/** Reading and watching shelves both put what is in progress above what is queued. */
function shelfOrder<T extends { status: string; order_index: number }>(active: string) {
  return (a: T, b: T) =>
    a.status === b.status ? a.order_index - b.order_index : a.status === active ? -1 : 1;
}

// ---------------------------------------------------------
// Shared card shell — drag with the pointer, or use the button.
// dnd-kit's keyboard sensor needs `attributes` to take a tab stop; this card
// deliberately skips them and offers the button instead, so there is exactly
// one keyboard route and it says what it will do.
// ---------------------------------------------------------
function RailCard({
  dragId, payload, cover, title, subtitle, meta, footer, preview, actionLabel, onAction,
  openLabel, onOpen,
}: {
  dragId: string;
  payload: Record<string, unknown>;
  cover: React.ReactNode;
  title: string;
  subtitle?: string | null;
  meta?: React.ReactNode;
  footer?: React.ReactNode;
  preview: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  openLabel?: string;
  onOpen?: () => void;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data: payload });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={cn(
        "group/card relative flex cursor-grab items-start gap-2.5 rounded-lg p-1.5 touch-none",
        "transition-[background-color,opacity] duration-150 hover:bg-hover active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
    >
      {cover}

      <div className="min-w-0 flex-1 pt-0.5">
        <p className={cn("truncate text-[13px] font-medium leading-snug text-ink", onOpen ? "pr-14" : "pr-7")}>
          {title}
        </p>
        {subtitle && <p className="truncate text-[11.5px] leading-snug text-ink-3">{subtitle}</p>}
        {meta}
        {footer}
        {/* What the drop will do, before anything is dropped. It is a hint,
            not the headline, so it sits in the quietest ink on the card. */}
        <p className="mt-1 truncate text-[11px] leading-snug text-ink-4 tnum">{preview}</p>
      </div>

      <div className="absolute right-0.5 top-0.5 flex items-center gap-0.5">
        {onOpen && (
          <IconButton
            label={openLabel ?? "Open"}
            size="md"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onOpen}
            className="opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/card:opacity-100"
          >
            <Maximize2 />
          </IconButton>
        )}
        <IconButton
          label={actionLabel}
          size="md"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onAction}
          className="opacity-70 transition-opacity duration-150 group-hover/card:opacity-100"
        >
          <CalendarPlus />
        </IconButton>
      </div>
    </div>
  );
}

function CoverBlock({ tint, children }: { tint: string; children: React.ReactNode }) {
  return (
    <div
      className={`tint-${tint} relative grid h-[46px] w-[34px] shrink-0 place-items-center overflow-hidden rounded-[5px]`}
      style={{ background: "var(--tint-soft)", boxShadow: "inset 3px 0 0 0 var(--tint)" }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------
// Books
// ---------------------------------------------------------
function BookCard({ book, date }: { book: Book; date: string }) {
  const perDay = Math.max(1, book.pages_per_day ?? 30);
  const remaining = Math.max(0, book.total_pages - book.current_page);
  const days = remaining ? Math.max(1, Math.ceil(remaining / perDay)) : 0;

  return (
    <RailCard
      dragId={`book:${book.id}`}
      payload={{ type: "book", id: book.id }}
      actionLabel={`Schedule ${book.title} from ${friendlyDate(date)}`}
      onAction={() => scheduleBookOnDay(book.id, date)}
      cover={
        <CoverBlock tint={book.color}>
          <span className="display-serif text-[15px] leading-none text-[var(--tint-ink)]">
            {book.title.trim().charAt(0).toUpperCase() || "?"}
          </span>
        </CoverBlock>
      }
      title={book.title}
      subtitle={book.author}
      meta={
        // The bar and the page count are the same number twice; the bar keeps
        // the shape, the page count keeps the detail, the percentage goes.
        <Progress
          value={book.current_page}
          max={Math.max(1, book.total_pages)}
          tint={book.color}
          height={3}
          className="mt-1.5"
        />
      }
      footer={
        <p className="mt-1 text-[11px] leading-snug text-ink-4 tnum">
          p.{book.current_page}/{book.total_pages}
          <span className="mx-1">·</span>
          {perDay}/day
          <span className="mx-1">·</span>
          {STATUS_LABEL[book.status] ?? book.status}
        </p>
      }
      preview={
        days === 0
          ? "Finished — nothing left to schedule"
          : `${days} ${days === 1 ? "block" : "blocks"} → finishes ${formatDate(addDays(date, days - 1), { weekday: false })}`
      }
    />
  );
}

function BooksPane({ date }: { date: string }) {
  const books = useStore((s) => s.books);
  const router = useRouter();

  const shelf = React.useMemo(
    () => uniqueById(books.filter((b) => b.status === "reading" || b.status === "planned"))
      .sort(shelfOrder("reading")),
    [books],
  );

  if (!shelf.length) {
    return (
      <MiniEmpty action={<Button size="sm" onClick={() => router.push("/books")}>Add a book</Button>}>
        Books you are reading or planning live here. Drag one onto a day and the
        following days fill with reading blocks.
      </MiniEmpty>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 pb-1">
      {shelf.map((book) => <BookCard key={book.id} book={book} date={date} />)}
    </div>
  );
}

// ---------------------------------------------------------
// Watch — films and anime, the same shelf treatment as books
//
// The whole difference between the two is the episode count. A film is a
// one-episode title: no rate, no span, no progress bar to fill in — it takes an
// evening, and its running time is the one number worth printing. Anything
// longer paces itself exactly the way a book paces pages.
// ---------------------------------------------------------
function MediaCard({ item, date }: { item: Media; date: string }) {
  const single = item.total_episodes <= 1;
  const preview = mediaPreview(item, date);
  const status = STATUS_LABEL[item.status] ?? item.status;

  return (
    <RailCard
      dragId={`media:${item.id}`}
      payload={{ type: "media", id: item.id }}
      actionLabel={
        single
          ? `Schedule ${item.title} on ${friendlyDate(date)}`
          : `Schedule ${item.title} from ${friendlyDate(date)}`
      }
      onAction={() => scheduleMediaOnDay(item.id, date)}
      cover={
        // The poster is the shelf's own component, so a cover change over there
        // lands here too; the rail only decides how much room it gets. At 34px
        // the drawn title can only smudge, so the thumbnail keeps what actually
        // reads at this size — the tint, the spine bar and the kind glyph.
        // Real artwork is untouched: there is no drawn title to hide.
        <div className="h-[46px] w-[34px] shrink-0 overflow-hidden rounded-[5px]">
          <MediaCover
            item={item}
            className="size-full rounded-[5px] shadow-none [&_.display-serif]:hidden"
          />
        </div>
      }
      title={item.title}
      subtitle={item.creator}
      meta={
        single ? undefined : (
          <Progress
            value={item.current_episode}
            max={Math.max(1, item.total_episodes)}
            tint={item.color}
            height={3}
            className="mt-1.5"
          />
        )
      }
      footer={
        <p className="mt-1 text-[11px] leading-snug text-ink-4 tnum">
          {single ? (
            <>
              {MEDIA_KIND_LABELS[item.kind]}
              {item.runtime_min ? (
                <><span className="mx-1">·</span>{formatDuration(item.runtime_min)}</>
              ) : null}
            </>
          ) : (
            <>
              ep. {item.current_episode} of {item.total_episodes}
              {item.episodes_per_day ? (
                <><span className="mx-1">·</span>{item.episodes_per_day} ep/day</>
              ) : null}
            </>
          )}
          <span className="mx-1">·</span>
          {status}
        </p>
      }
      preview={preview.line ?? `${preview.headline} · ${preview.detail}`}
    />
  );
}

function WatchPane({ date }: { date: string }) {
  const media = useStore((s) => s.media);
  const router = useRouter();

  const shelf = React.useMemo(
    () => uniqueById(media.filter((m) => m.status === "watching" || m.status === "planned"))
      .sort(shelfOrder("watching")),
    [media],
  );

  if (!shelf.length) {
    return (
      <MiniEmpty action={<Button size="sm" onClick={() => router.push("/watch")}>Add a film</Button>}>
        Films and anime you are watching or planning live here. A film drops onto
        one evening; an anime fills the days after it, episode by episode.
      </MiniEmpty>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 pb-1">
      {shelf.map((item) => <MediaCard key={item.id} item={item} date={date} />)}
    </div>
  );
}

// ---------------------------------------------------------
// Templates
// ---------------------------------------------------------
function TemplateCard({ template, date }: { template: Template; date: string }) {
  const count = template.items.length;
  const timed = template.items.filter((i) => i.start_min != null).length;
  const offsets = template.items.map((i) => i.day_offset ?? 0);
  const span = count ? Math.max(0, ...offsets) - Math.min(0, ...offsets) + 1 : 0;

  return (
    <RailCard
      dragId={`template:${template.id}`}
      payload={{ type: "template", id: template.id }}
      actionLabel={`Apply ${template.name} to ${friendlyDate(date)}`}
      onAction={() => applyTemplateOnDay(template.id, date)}
      cover={
        <CoverBlock tint={template.color}>
          <LayoutTemplate className="size-4 text-[var(--tint-ink)]" />
        </CoverBlock>
      }
      title={template.name}
      subtitle={template.description}
      footer={
        <p className="mt-1 text-[11px] leading-snug text-ink-4 tnum">
          {count} {count === 1 ? "item" : "items"}
          {timed > 0 && <><span className="mx-1">·</span>{timed} timed</>}
          {template.use_count > 0 && <><span className="mx-1">·</span>used {template.use_count}×</>}
        </p>
      }
      preview={
        count === 0
          ? "Empty — add items on the Templates page"
          : `${count} ${count === 1 ? "task" : "tasks"} on ${formatDate(date, { weekday: false })}` +
            (span > 1 ? ` over ${span} days` : "")
      }
    />
  );
}

function useSaveDayAsTemplate(date: string) {
  const saveDayAsTemplate = useStore((s) => s.saveDayAsTemplate);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);

  return React.useCallback(() => {
    const made = saveDayAsTemplate(date, `${dayName(date)} routine`);
    if (!made) {
      toast({
        title: "That day is empty",
        description: `Put a few tasks on ${friendlyDate(date)} first, then save it as a template.`,
      });
      return;
    }
    toast({
      title: `Saved “${made.name}”`,
      description: `${made.items.length} items.`,
      tone: "success",
      action: { label: "Undo", run: () => remove("templates", made.id) },
    });
  }, [date, saveDayAsTemplate, remove, toast]);
}

function TemplatesPane({ date }: { date: string }) {
  const templates = useStore((s) => s.templates);
  const saveToday = useSaveDayAsTemplate(date);

  const sorted = React.useMemo(
    () => uniqueById(templates).sort((a, b) => a.order_index - b.order_index || b.use_count - a.use_count),
    [templates],
  );

  if (!sorted.length) {
    return (
      <MiniEmpty action={<Button size="sm" onClick={saveToday}>Save this day</Button>}>
        A template is a day you can re-apply — a study block, a travel day, a
        Friday routine.
      </MiniEmpty>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 pb-1">
      {sorted.map((template) => <TemplateCard key={template.id} template={template} date={date} />)}
      <button
        type="button"
        onClick={saveToday}
        title={`Turn ${friendlyDate(date)} into a reusable template`}
        className="mt-1 h-7 cursor-pointer rounded-md px-1.5 text-left text-[12px] text-ink-4 transition-colors hover:bg-hover hover:text-ink-2"
      >
        + Save this day as a template
      </button>
    </div>
  );
}

// ---------------------------------------------------------
// Unscheduled — the inbox, one drag away from a date
// ---------------------------------------------------------
function UnscheduledCard({ task, date }: { task: Task; date: string }) {
  const openInspector = useStore((s) => s.openInspector);
  const hour12 = useStore((s) => s.hour12);
  const timed = task.start_min != null;

  return (
    <RailCard
      dragId={`task:${task.id}`}
      payload={{ type: "task", taskId: task.id }}
      actionLabel={`Schedule ${task.title || "task"} on ${friendlyDate(date)}`}
      onAction={() => moveTaskToDay(task.id, date)}
      openLabel={`Open ${task.title || "task"}`}
      onOpen={() => openInspector(task.id)}
      cover={
        <CoverBlock tint={task.color ?? "slate"}>
          <Inbox className="size-4 text-[var(--tint-ink)]" />
        </CoverBlock>
      }
      title={task.title || "Untitled"}
      subtitle={task.notes}
      footer={
        (task.priority > 0 || task.duration_min || task.tags.length > 0) ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] leading-snug text-ink-4 tnum">
            {task.priority > 0 && (
              // A priority is a fact about the task, not an alarm on the shelf.
              <span className="inline-flex items-center gap-1">
                <Flag className="size-2.5" fill={task.priority === 3 ? "currentColor" : "none"} aria-hidden />
                {["", "Low", "Medium", "High"][task.priority]}
              </span>
            )}
            {task.duration_min != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-2.5" aria-hidden />
                {formatDuration(task.duration_min)}
              </span>
            )}
            {task.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
          </p>
        ) : null
      }
      preview={
        timed
          ? `Lands ${formatDate(date, { weekday: false })} at ${formatTime(task.start_min, hour12)}`
          : `Lands all-day on ${formatDate(date, { weekday: false })}`
      }
    />
  );
}

function UnscheduledPane({ date }: { date: string }) {
  const tasks = useStore((s) => s.tasks);
  const inbox = React.useMemo(() => uniqueById(inboxTasks(tasks)), [tasks]);

  if (!inbox.length) {
    return (
      <MiniEmpty action={<Button size="sm" onClick={openQuickAdd}>Capture something</Button>}>
        Anything captured without a date lands here, ready to be dropped on a day.
      </MiniEmpty>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 pb-1">
      {inbox.map((task) => <UnscheduledCard key={task.id} task={task} date={date} />)}
    </div>
  );
}

// ---------------------------------------------------------
// Rail
//
// Collapsed it is a 44px edge that still says what is behind it; open it is an
// accordion, so one shelf is on screen at a time instead of four tabs and a
// scrolling list. Both states, and which pane is open, are remembered.
// ---------------------------------------------------------
export function RightRail({
  date, open, onOpenChange,
}: {
  date: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const books = useStore((s) => s.books);
  const media = useStore((s) => s.media);
  const templates = useStore((s) => s.templates);
  const tasks = useStore((s) => s.tasks);

  const [booksOpen, setBooksOpen] = useStickyFlag(OPEN_KEY.books, true);
  const [watchOpen, setWatchOpen] = useStickyFlag(OPEN_KEY.watch, false);
  const [templatesOpen, setTemplatesOpen] = useStickyFlag(OPEN_KEY.templates, false);
  const [inboxOpen, setInboxOpen] = useStickyFlag(OPEN_KEY.unscheduled, false);

  const counts = React.useMemo(() => ({
    books: uniqueById(books.filter((b) => b.status === "reading" || b.status === "planned")).length,
    watch: uniqueById(media.filter((m) => m.status === "watching" || m.status === "planned")).length,
    templates: uniqueById(templates).length,
    unscheduled: inboxTasks(tasks).length,
  }), [books, media, templates, tasks]);

  const setSectionOpen: Record<Section, (next: boolean) => void> = {
    books: setBooksOpen,
    watch: setWatchOpen,
    templates: setTemplatesOpen,
    unscheduled: setInboxOpen,
  };

  const EDGE: { key: Section; icon: React.ComponentType<{ className?: string }>; noun: (n: number) => string }[] = [
    { key: "books", icon: BookOpen, noun: (n) => `${n} ${n === 1 ? "book" : "books"} on the shelf` },
    { key: "watch", icon: Clapperboard, noun: (n) => `${n} ${n === 1 ? "title" : "titles"} on the watchlist` },
    { key: "templates", icon: LayoutTemplate, noun: (n) => `${n} ${n === 1 ? "template" : "templates"} saved` },
    { key: "unscheduled", icon: Inbox, noun: (n) => `${n} ${n === 1 ? "task" : "tasks"} without a date` },
  ];

  if (!open) {
    return (
      <aside
        aria-label="Books, films, templates and unscheduled"
        className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-line pl-1 pt-0.5"
      >
        <IconButton label="Show books, films and templates" size="md" onClick={() => onOpenChange(true)}>
          <PanelRightOpen />
        </IconButton>

        <div className="mt-1 h-px w-5 bg-line" />

        {EDGE.map(({ key, icon: Icon, noun }) => (
          <button
            key={key}
            type="button"
            onClick={() => { onOpenChange(true); setSectionOpen[key](true); }}
            aria-label={`Open the rail — ${noun(counts[key])}`}
            title={noun(counts[key])}
            className={cn(
              "flex w-9 cursor-pointer flex-col items-center gap-0.5 rounded-md py-1.5",
              "text-ink-4 transition-colors duration-150 hover:bg-hover hover:text-ink-2",
            )}
          >
            <Icon className="size-4" />
            <span className="text-[11px] font-medium text-ink-3 tnum">{counts[key]}</span>
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="flex w-[292px] shrink-0 flex-col border-l border-line pl-4">
      <div className="flex items-center gap-1 pb-1">
        <p className="min-w-0 flex-1 truncate text-[11.5px] text-ink-4">
          Drag onto any day · buttons use {friendlyDate(date).toLowerCase()}
        </p>
        <IconButton label="Hide the rail" size="md" onClick={() => onOpenChange(false)}>
          <PanelRightClose />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        <Fold
          label="Books"
          summary={`${counts.books} on the shelf`}
          open={booksOpen}
          onOpenChange={setBooksOpen}
        >
          <BooksPane date={date} />
        </Fold>

        <Fold
          label="Watch"
          summary={`${counts.watch} on the watchlist`}
          open={watchOpen}
          onOpenChange={setWatchOpen}
        >
          <WatchPane date={date} />
        </Fold>

        <Fold
          label="Templates"
          summary={`${counts.templates} saved`}
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
        >
          <TemplatesPane date={date} />
        </Fold>

        <Fold
          label="Unscheduled"
          summary={`${counts.unscheduled} without a date`}
          open={inboxOpen}
          onOpenChange={setInboxOpen}
        >
          <UnscheduledPane date={date} />
        </Fold>
      </div>
    </aside>
  );
}
