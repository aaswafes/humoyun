"use client";

import * as React from "react";
import { Pin } from "lucide-react";
import { cn } from "@/lib/cn";
import { NOTE_KIND_LABELS, type Note } from "@/lib/types";
import { NOTE_KIND_ICONS, TagPill } from "./note-fields";
import { CategoryChips } from "./category-picker";
import type { CategoryIndex } from "./category-model";
import { SourceChip } from "./note-source-chip";
import { NoteActions, useDeleteNote } from "./note-actions";
import { dayLabel, noteDay, noteExcerpt, noteHeading, noteRest, type SourceRef } from "./note-model";

/**
 * The same notes, one line each, for when you are looking for something rather
 * than reading. Rows are separated by a hairline instead of being boxed — the
 * list is one surface, not fifty.
 */
export function NoteList({
  notes, refs, locators, categories, onOpen,
}: {
  notes: Note[];
  refs: Map<string, SourceRef>;
  locators: Map<string, string | null>;
  categories: CategoryIndex;
  onOpen: (note: Note) => void;
}) {
  return (
    <ul className="-mx-2">
      {notes.map((note) => {
        const refer = refs.get(note.id);
        if (!refer) return null;
        return (
          <NoteRow
            key={note.id}
            note={note}
            refer={refer}
            locator={locators.get(note.id) ?? null}
            categories={categories}
            onOpen={onOpen}
          />
        );
      })}
    </ul>
  );
}

function NoteRow({
  note, refer, locator, categories, onOpen,
}: {
  note: Note;
  refer: SourceRef;
  locator: string | null;
  categories: CategoryIndex;
  onOpen: (note: Note) => void;
}) {
  const deleteNote = useDeleteNote();
  const Kind = NOTE_KIND_ICONS[note.kind];
  const heading = noteHeading(note, refer);
  const trailing = noteExcerpt(noteRest(note));

  return (
    <li
      className={cn(
        "group/note relative flex items-center gap-2 rounded-md px-2 pr-16 hairline-b",
        "transition-colors duration-150 hover:bg-hover",
      )}
    >
      <NoteActions note={note} />
      <button
        type="button"
        onClick={() => onOpen(note)}
        onKeyDown={(e) => {
          if (e.key === "Backspace" || e.key === "Delete") {
            e.preventDefault();
            deleteNote(note);
          }
        }}
        aria-label={
          `Open the ${NOTE_KIND_LABELS[note.kind].toLowerCase()} ${heading}`
          + (note.pinned ? ", pinned" : "")
        }
        className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
      >
        <span className="flex shrink-0 items-center gap-1.5">
          {note.pinned && <Pin className="size-3 text-ink-3" fill="currentColor" strokeWidth={0} aria-hidden />}
          <Kind className="size-3.5 text-ink-4" aria-hidden />
        </span>
        <span className="max-w-[52%] shrink-0 truncate text-[13px] text-ink">{heading}</span>
        {trailing && (
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-4">{trailing}</span>
        )}
      </button>

      {note.categories.length > 0 && (
        <CategoryChips
          names={note.categories}
          index={categories}
          max={1}
          className="hidden shrink-0 lg:inline-flex"
        />
      )}
      {note.tags[0] && <TagPill tag={note.tags[0]} className="hidden xl:inline-flex" />}

      {/* Where it came from survives every breakpoint; the date is what gives way. */}
      <SourceChip refer={refer} locator={locator} className="max-w-[132px] sm:max-w-[220px]" />

      {/* Kept even when empty, so the dates down the right stay in one column.
          A note filed against a day already says its date in the chip. */}
      <span className="hidden w-[66px] shrink-0 text-right text-[11px] text-ink-4 tnum sm:block">
        {refer.kind === "day" ? "" : dayLabel(noteDay(note))}
      </span>
    </li>
  );
}
