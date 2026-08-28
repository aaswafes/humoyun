"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { BookOpen, CalendarPlus, LayoutTemplate, PanelRightClose } from "lucide-react";
import { cn } from "@/lib/cn";
import { dayName, friendlyDate } from "@/lib/date";
import { useStore } from "@/lib/store";
import type { Book, Template } from "@/lib/types";
import { Button, EmptyState, IconButton, Progress } from "@/components/ui/primitives";
import { applyTemplateOnDay, scheduleBookOnDay } from "./calendar-utils";

type Tab = "books" | "templates";

const STATUS_LABEL: Record<string, string> = {
  reading: "Reading",
  planned: "Planned",
};

// ---------------------------------------------------------
// Shared card shell — drag with the pointer, or use the button
// (keyboard users never lose the feature to a mouse gesture).
// ---------------------------------------------------------
function RailCard({
  dragId, payload, cover, title, subtitle, meta, footer, actionLabel, onAction,
}: {
  dragId: string;
  payload: Record<string, unknown>;
  cover: React.ReactNode;
  title: string;
  subtitle?: string | null;
  meta?: React.ReactNode;
  footer?: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
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
        <p className="truncate pr-6 text-[13px] font-medium leading-snug text-ink">{title}</p>
        {subtitle && <p className="truncate text-[11.5px] leading-snug text-ink-3">{subtitle}</p>}
        {meta}
        {footer}
      </div>

      <IconButton
        label={actionLabel}
        size="sm"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onAction}
        className="absolute right-1 top-1 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/card:opacity-100"
      >
        <CalendarPlus />
      </IconButton>
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
  const perDay = book.pages_per_day ?? 30;
  const pct = book.total_pages ? Math.round((book.current_page / book.total_pages) * 100) : 0;

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
    />
  );
}

function BooksTab({ date }: { date: string }) {
  const books = useStore((s) => s.books);
  const router = useRouter();

  const shelf = React.useMemo(
    () => books
      .filter((b) => b.status === "reading" || b.status === "planned")
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
    />
  );
}

function TemplatesTab({ date }: { date: string }) {
  const templates = useStore((s) => s.templates);
  const saveDayAsTemplate = useStore((s) => s.saveDayAsTemplate);
  const toast = useStore((s) => s.toast);

  const sorted = React.useMemo(
    () => [...templates].sort((a, b) => a.order_index - b.order_index || b.use_count - a.use_count),
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
    toast({ title: `Saved “${made.name}”`, description: `${made.items.length} items.`, tone: "success" });
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
        onClick={saveToday}
        title={`Turn ${friendlyDate(date)} into a reusable template`}
        className="mt-1 cursor-pointer rounded-md px-1.5 py-1.5 text-left text-[12px] text-ink-4 transition-colors hover:bg-hover hover:text-ink-2"
      >
        + Save this day as a template
      </button>
    </div>
  );
}

// ---------------------------------------------------------
// Rail
// ---------------------------------------------------------
export function RightRail({ date, onClose }: { date: string; onClose: () => void }) {
  const [tab, setTab] = React.useState<Tab>("books");

  return (
    <aside className="flex w-[292px] shrink-0 flex-col border-l border-line pl-4">
      <div className="flex items-center gap-1 pb-2">
        <div className="flex items-center gap-3">
          {(["books", "templates"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "cursor-pointer pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors duration-150",
                tab === t
                  ? "text-ink shadow-[inset_0_-1.5px_0_0_var(--accent)]"
                  : "text-ink-4 hover:text-ink-2",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <IconButton label="Hide the rail" size="sm" onClick={onClose} className="ml-auto">
          <PanelRightClose />
        </IconButton>
      </div>

      <p className="pb-3 text-[11.5px] leading-snug text-ink-3">
        Drag onto any day to schedule it. Buttons add to{" "}
        <span className="text-ink-2">{friendlyDate(date).toLowerCase()}</span>.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === "books" ? <BooksTab date={date} /> : <TemplatesTab date={date} />}
      </div>
    </aside>
  );
}
