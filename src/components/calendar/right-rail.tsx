"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import {
  BookOpen, CalendarPlus, Clock, Flag, Inbox, LayoutTemplate, Maximize2, PanelRightClose,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addDays, dayName, formatDate, formatDuration, formatTime, friendlyDate,
} from "@/lib/date";
import { inboxTasks, useStore } from "@/lib/store";
import type { Book, Task, Template } from "@/lib/types";
import { Button, EmptyState, IconButton, Progress, Segmented } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import { openQuickAdd } from "@/components/shell/quick-add";
import { applyTemplateOnDay, moveTaskToDay, scheduleBookOnDay } from "./calendar-utils";

type Tab = "books" | "templates" | "unscheduled";

const STATUS_LABEL: Record<string, string> = {
  reading: "Reading",
  planned: "Planned",
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
        {/* What the drop will do, before anything is dropped. */}
        <p className="mt-1 truncate text-[11px] leading-snug text-accent tnum">{preview}</p>
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
  const pct = book.total_pages ? Math.round((book.current_page / book.total_pages) * 100) : 0;
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
        <div className="mt-1.5 flex items-center gap-1.5">
          <Progress value={book.current_page} max={Math.max(1, book.total_pages)} tint={book.color} height={3} className="flex-1" />
          <span className="text-[10.5px] text-ink-4 tnum">{pct}%</span>
        </div>
      }
      footer={
        <p className="mt-1 text-[11px] leading-snug text-ink-4 tnum">
          p.{book.current_page}/{book.total_pages}
          <span className="mx-1 text-ink-4">·</span>
          {perDay}/day
          <span className="mx-1 text-ink-4">·</span>
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

function BooksTab({ date }: { date: string }) {
  const books = useStore((s) => s.books);
  const router = useRouter();

  const shelf = React.useMemo(
    () => uniqueById(books.filter((b) => b.status === "reading" || b.status === "planned"))
      .sort((a, b) => (a.status === b.status ? a.order_index - b.order_index : a.status === "reading" ? -1 : 1)),
    [books],
  );

  if (!shelf.length) {
    return (
      <EmptyState
        icon={BookOpen}
        title="The shelf is empty"
        description="Books you are reading or planning live here. Drag one onto a day and Humoyun fills the following days with reading blocks."
        action={<Button size="sm" onClick={() => router.push("/books")}>Add a book</Button>}
        className="py-10"
      />
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {shelf.map((book) => <BookCard key={book.id} book={book} date={date} />)}
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

function TemplatesTab({ date }: { date: string }) {
  const templates = useStore((s) => s.templates);
  const saveDayAsTemplate = useStore((s) => s.saveDayAsTemplate);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);

  const sorted = React.useMemo(
    () => uniqueById(templates).sort((a, b) => a.order_index - b.order_index || b.use_count - a.use_count),
    [templates],
  );

  function saveToday() {
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
  }

  if (!sorted.length) {
    return (
      <EmptyState
        icon={LayoutTemplate}
        title="No templates yet"
        description="A template is a day you can re-apply — a study block, a travel day, a Friday routine. Build one from a day you already planned."
        action={<Button size="sm" onClick={saveToday}>Save this day as a template</Button>}
        className="py-10"
      />
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
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
              <span className="inline-flex items-center gap-1 text-warn">
                <Flag className="size-2.5" fill="currentColor" aria-hidden />
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

function UnscheduledTab({ date }: { date: string }) {
  const tasks = useStore((s) => s.tasks);
  const inbox = React.useMemo(() => uniqueById(inboxTasks(tasks)), [tasks]);

  if (!inbox.length) {
    return (
      <MiniEmpty
        className="py-8"
        action={<Button size="sm" onClick={openQuickAdd}>Capture something</Button>}
      >
        Nothing waiting. Anything captured without a date lands here, ready to be
        dropped on a day.
      </MiniEmpty>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {inbox.map((task) => <UnscheduledCard key={task.id} task={task} date={date} />)}
    </div>
  );
}

// ---------------------------------------------------------
// Rail
// ---------------------------------------------------------
export function RightRail({ date, onClose }: { date: string; onClose: () => void }) {
  const [tab, setTab] = React.useState<Tab>("books");
  const books = useStore((s) => s.books);
  const templates = useStore((s) => s.templates);
  const tasks = useStore((s) => s.tasks);

  const counts = React.useMemo(() => ({
    books: uniqueById(books.filter((b) => b.status === "reading" || b.status === "planned")).length,
    templates: uniqueById(templates).length,
    unscheduled: inboxTasks(tasks).length,
  }), [books, templates, tasks]);
  const tabCount = counts[tab];

  return (
    <aside className="flex w-[292px] shrink-0 flex-col border-l border-line pl-4">
      <div className="pb-2">
        <Segmented
          value={tab}
          onChange={setTab}
          className="w-full [&>button]:flex-1"
          options={[
            { value: "books", label: "Books", title: `${counts.books} on the shelf` },
            { value: "templates", label: "Templates", title: `${counts.templates} saved` },
            { value: "unscheduled", label: "Unscheduled", title: `${counts.unscheduled} without a date` },
          ]}
        />
      </div>

      <div className="flex items-start gap-1 pb-3">
        <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-ink-3">
          Drag onto any day to schedule it. Buttons target{" "}
          <span className="text-ink-2">{friendlyDate(date).toLowerCase()}</span>
          {tabCount > 0 && (
            <>
              <span className="mx-1 text-ink-4">·</span>
              <span className="tnum">{tabCount} here</span>
            </>
          )}
        </p>
        <IconButton label="Hide the rail" size="md" onClick={onClose}>
          <PanelRightClose />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === "books" && <BooksTab date={date} />}
        {tab === "templates" && <TemplatesTab date={date} />}
        {tab === "unscheduled" && <UnscheduledTab date={date} />}
      </div>
    </aside>
  );
}
