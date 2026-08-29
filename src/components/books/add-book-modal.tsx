"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { addDays, todayISO } from "@/lib/date";
import type { Book, Tint } from "@/lib/types";
import { Button, Input } from "@/components/ui/primitives";
import { Modal, TintPicker } from "@/components/ui/overlays";
import { Field, NumberField, SuggestInput, Toggle } from "./fields";
import { PlanEditor } from "./plan-editor";
import { BookCover } from "./book-cover";
import { computePlan, skipWeekdaysOf, type PlanDraft } from "./plan";
import { seriesNames, setSeries, useLibraryPrefs } from "./library-prefs";
import { facetValues } from "./facets";

const freshDraft = (): PlanDraft => ({
  mode: "rate",
  startDate: todayISO(),
  pagesPerDay: 30,
  endDate: addDays(todayISO(), 30),
  skipWeekends: false,
});

/** Mounted only while open, so each visit starts from a clean sheet. */
export function AddBookModal({
  open, onClose, onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded?: (book: Book) => void;
}) {
  const books = useStore((s) => s.books);
  const insert = useStore((s) => s.insert);
  const scheduleBook = useStore((s) => s.scheduleBook);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const library = useLibraryPrefs();

  const [title, setTitle] = React.useState("");
  const [author, setAuthor] = React.useState("");
  const [totalPages, setTotalPages] = React.useState(300);
  const [tint, setTint] = React.useState<Tint>("amber");
  const [series, setSeriesDraft] = React.useState("");
  const [genre, setGenre] = React.useState("");
  const [topic, setTopic] = React.useState("");

  const [draft, setDraft] = React.useState<PlanDraft>(freshDraft);

  const plan = computePlan(draft, totalPages, 0);
  const canSave = title.trim().length > 0 && totalPages >= 1;

  function save() {
    if (!canSave) return;
    const book = insert("books", {
      title: title.trim(),
      author: author.trim() || null,
      genre: genre.trim() || null,
      topic: topic.trim() || null,
      series: series.trim() || null,
      total_pages: Math.max(1, Math.round(totalPages)),
      current_page: 0,
      color: tint,
      // A new book is unplanned. Nothing lands on a day until it is dragged
      // there, or scheduled from the book's own Plan section.
      status: "planned",
      start_date: null,
      pages_per_day: null,
      order_index: books.length ? Math.max(...books.map((b) => b.order_index)) + 1 : 0,
    });

    // Mirrored into prefs so a library saved before the column existed keeps
    // grouping consistently.
    if (series.trim()) setSeries(book.id, series);

    toast({
      title: "Added to your shelf",
      description: "Drag it onto a day in Calendar when you want to start it.",
    });

    onAdded?.(book);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a book" width={520}>
      <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
        <div className="flex gap-4">
          <div className="w-[92px] shrink-0">
            <BookCover title={title} tint={tint} titleClassName="text-[13px] line-clamp-4" />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <Field label="Title">
              <Input
                autoFocus
                aria-label="Book title"
                placeholder="The Brothers Karamazov"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) save(); }}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Author">
                <Input
                  aria-label="Author"
                  placeholder="Fyodor Dostoevsky"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
              </Field>
              <Field label="Genre" hint="optional">
                <SuggestInput
                  label="Genre"
                  placeholder="Sirah"
                  value={genre}
                  suggestions={facetValues(books, "genre")}
                  onChange={setGenre}
                  onCommit={setGenre}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Topic" hint="optional">
                <SuggestInput
                  label="Topic"
                  placeholder="Time and discipline"
                  value={topic}
                  suggestions={facetValues(books, "topic")}
                  onChange={setTopic}
                  onCommit={setTopic}
                />
              </Field>
              <Field label="Series" hint="optional">
                <SuggestInput
                  label="Series or collection"
                  placeholder="Karamazov cycle"
                  value={series}
                  suggestions={[...new Set([...facetValues(books, "series"), ...seriesNames(library.series)])]}
                  onChange={setSeriesDraft}
                  onCommit={setSeriesDraft}
                />
              </Field>
            </div>

            <div className="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-3">
              <Field label="Pages">
                <NumberField
                  label="Total pages"
                  value={totalPages}
                  min={1}
                  max={20000}
                  step={10}
                  onChange={setTotalPages}
                />
              </Field>
              <Field label="Colour">
                <div className="-ml-1">
                  <TintPicker value={tint} onChange={(t) => t && setTint(t)} />
                </div>
              </Field>
            </div>
          </div>
        </div>

        <p className="mt-5 border-t border-line pt-4 text-[12px] leading-relaxed text-ink-3">
          Goes to your shelf unscheduled. Drag it onto a day in Calendar, or open
          it and use Plan, when you want reading blocks.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={!canSave} onClick={save}>
          Add book
        </Button>
      </div>
    </Modal>
  );
}
