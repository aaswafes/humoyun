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
  const [schedule, setSchedule] = React.useState(true);
  const [draft, setDraft] = React.useState<PlanDraft>(freshDraft);

  const plan = computePlan(draft, totalPages, 0);
  const canSave = title.trim().length > 0 && totalPages >= 1 && (!schedule || plan.valid);

  function save() {
    if (!canSave) return;
    const book = insert("books", {
      title: title.trim(),
      author: author.trim() || null,
      total_pages: Math.max(1, Math.round(totalPages)),
      current_page: 0,
      color: tint,
      status: schedule ? "reading" : "planned",
      start_date: schedule ? draft.startDate : null,
      pages_per_day: schedule ? plan.perDay : null,
      order_index: books.length ? Math.max(...books.map((b) => b.order_index)) + 1 : 0,
    });

    if (series.trim()) setSeries(book.id, series);

    if (schedule) {
      // Pass the rate we previewed rather than the end date: scheduleBook prefers
      // an explicit pagesPerDay, and this keeps the plan the user read on screen.
      const created = scheduleBook(book.id, {
        startDate: draft.startDate,
        pagesPerDay: plan.perDay,
        skipWeekdays: skipWeekdaysOf(draft.skipWeekends),
        replace: true,
      });
      toast({
        title: `${book.title} is on the calendar`,
        description: `${created} reading ${created === 1 ? "block" : "blocks"} · ${plan.perDay} pages a day`,
        tone: "success",
      });
    } else {
      toast({
        title: "Added to your shelf",
        description: `${book.title} is waiting in your Up next queue.`,
      });
    }

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
              <Field label="Series" hint="optional">
                <SuggestInput
                  label="Series or collection"
                  placeholder="Karamazov cycle"
                  value={series}
                  suggestions={seriesNames(library.series)}
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

        <div className="mt-5 border-t border-line pt-4">
          <Toggle
            label="Schedule it on my calendar"
            description="Humoyun drops a reading block on every day until the last page."
            checked={schedule}
            onChange={setSchedule}
          />

          {schedule && (
            <div className="mt-3 anim-fade">
              <PlanEditor
                draft={draft}
                onChange={setDraft}
                totalPages={totalPages}
                currentPage={0}
                weekStart={weekStart}
              />
            </div>
          )}
        </div>
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
