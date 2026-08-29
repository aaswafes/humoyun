"use client";

import * as React from "react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { ChevronUp, ChevronDown, GripVertical, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Book } from "@/lib/types";
import { Badge, Button, IconButton } from "@/components/ui/primitives";
import { Disclosure } from "./disclosure";
import { setQueue } from "./library-prefs";

/** Enough to decide what is next without turning into a second shelf. */
const PREVIEW = 6;

interface QueueRowProps {
  book: Book;
  index: number;
  count: number;
  series: string | undefined;
  onOpen: (book: Book) => void;
  onStart: (book: Book) => void;
  onMove: (from: number, to: number) => void;
}

function QueueRow({ book, index, count, series, onOpen, onStart, onMove }: QueueRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: book.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/queue flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-hover",
        isDragging && "relative z-10 bg-raised opacity-95 shadow-md",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${book.title}. Press space, then the arrow keys.`}
        className="grid size-7 shrink-0 cursor-grab place-items-center rounded-md text-ink-4 transition-colors hover:bg-active hover:text-ink-2 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>

      <span className="w-4 shrink-0 text-right text-[11.5px] text-ink-4 tnum">{index + 1}</span>

      <span
        aria-hidden
        className={cn(`tint-${book.color}`, "h-7 w-1.5 shrink-0 rounded-full")}
        style={{ background: "var(--tint)" }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <button
            type="button"
            onClick={() => onOpen(book)}
            className="min-w-0 truncate text-left text-[13px] font-medium text-ink cursor-pointer transition-colors hover:text-accent"
          >
            {book.title || "Untitled"}
          </button>
          {series && <Badge tint={book.color}>{series}</Badge>}
        </div>
        <p className="truncate text-[11.5px] text-ink-3 tnum">
          {book.author || "Unknown author"} · {book.total_pages} pages
        </p>
      </div>

      {/* The keyboard path to the same reorder the drag handle performs. */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/queue:opacity-100">
        <IconButton
          label={`Move ${book.title} up`}
          size="sm"
          disabled={index === 0}
          onClick={() => onMove(index, index - 1)}
        >
          <ChevronUp />
        </IconButton>
        <IconButton
          label={`Move ${book.title} down`}
          size="sm"
          disabled={index === count - 1}
          onClick={() => onMove(index, index + 1)}
        >
          <ChevronDown />
        </IconButton>
      </div>

      <Button
        size="xs"
        variant="ghost"
        className="shrink-0"
        onClick={() => onStart(book)}
      >
        <Play className="size-3" />
        Start
      </Button>
    </div>
  );
}

/**
 * The to-read queue. Order lives in prefs rather than order_index because the
 * shelf sorts on order_index too, and the two answers are different questions:
 * where a book sits on the shelf, and what you read next.
 */
export function ReadingQueue({
  books, series, onOpen, onStart, className,
}: {
  books: Book[];
  series: Record<string, string>;
  onOpen: (book: Book) => void;
  onStart: (book: Book) => void;
  className?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = React.useCallback((from: number, to: number) => {
    if (to < 0 || to >= books.length || from === to) return;
    setQueue(arrayMove(books, from, to).map((b) => b.id));
  }, [books]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = books.findIndex((b) => b.id === active.id);
    const to = books.findIndex((b) => b.id === over.id);
    if (from < 0 || to < 0) return;
    move(from, to);
  }

  if (!books.length) return null;

  // The visible slice is always a prefix, so a row's index is its rank either way.
  const visible = expanded ? books : books.slice(0, PREVIEW);
  const pages = books.reduce((s, b) => s + Math.max(0, b.total_pages - b.current_page), 0);

  return (
    <Disclosure
      storageKey="humoyun.books.queueOpen"
      variant="caps"
      label="Up next"
      summary={`${books.length} ${books.length === 1 ? "book" : "books"} waiting · ${pages.toLocaleString()} pages`}
      className={className}
      bodyClassName="pb-3"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={visible.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {visible.map((book, i) => (
            <QueueRow
              key={book.id}
              book={book}
              index={i}
              count={visible.length}
              series={series[book.id]}
              onOpen={onOpen}
              onStart={onStart}
              onMove={move}
            />
          ))}
        </SortableContext>
      </DndContext>

      {books.length > PREVIEW && (
        <Button size="sm" variant="ghost" className="w-full" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : `Show all ${books.length} in the queue`}
        </Button>
      )}
    </Disclosure>
  );
}
