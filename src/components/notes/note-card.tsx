"use client";

import * as React from "react";
import { Pin } from "lucide-react";
import { cn } from "@/lib/cn";
import { NOTE_KIND_LABELS, type Note } from "@/lib/types";
import { NOTE_KIND_ICONS, TagPill } from "./note-fields";
import { SourceChip } from "./note-source-chip";
import { dayLabel, noteDay, noteHeading, noteRest, type SourceRef } from "./note-model";

const MAX_TAGS = 3;

/**
 * A note is a piece of paper, not a panel: it carries its own tint as a fill
 * and no border at all. Twelve bordered boxes on one screen is exactly what
 * the calm pass rules out, and paper says "written" in a way a card cannot.
 *
 * The card is a container rather than a button, because the source chip inside
 * it navigates somewhere else — and a button may never hold another button.
 * The heading and body are the primary action; the footer stands beside it.
 */
export function NoteCard({
  note, refer, locator, onOpen,
}: {
  note: Note;
  refer: SourceRef;
  locator: string | null;
  onOpen: (note: Note) => void;
}) {
  const Kind = NOTE_KIND_ICONS[note.kind];
  const heading = noteHeading(note, refer);
  const rest = noteRest(note);
  const tags = note.tags.slice(0, MAX_TAGS);
  const hidden = note.tags.length - tags.length;

  return (
    <article
      className={cn(
        `tint-${note.color ?? "slate"}`,
        "group/note relative mb-4 break-inside-avoid rounded-lg p-4",
        "transition-[transform,box-shadow] duration-200 ease-[var(--ease-out-apple)]",
        "hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)]",
        "focus-within:-translate-y-0.5 focus-within:shadow-[var(--shadow-sm)]",
      )}
      style={{ background: "var(--tint-soft)" }}
    >
      {note.pinned && (
        <span
          aria-hidden
          className="absolute right-3 top-3.5 text-ink-3"
          title="Pinned"
        >
          <Pin className="size-3" fill="currentColor" strokeWidth={0} />
        </span>
      )}

      <button
        type="button"
        onClick={() => onOpen(note)}
        aria-label={
          `Open the ${NOTE_KIND_LABELS[note.kind].toLowerCase()} ${heading}`
          + (note.pinned ? ", pinned" : "")
        }
        className="block w-full cursor-pointer text-left"
      >
        <h3 className={cn(
          "flex items-start gap-1.5 text-[13.5px] font-medium leading-snug text-ink",
          note.pinned && "pr-5",
        )}>
          {/* A plain note needs no badge saying it is a note. */}
          {note.kind !== "note" && (
            <Kind className="mt-[3px] size-3.5 shrink-0 text-ink-3" aria-hidden />
          )}
          <span className="line-clamp-2 min-w-0">{heading}</span>
        </h3>

        {rest && (
          <p className="mt-1.5 line-clamp-6 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-2">
            {rest}
          </p>
        )}
      </button>

      <footer className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <SourceChip refer={refer} locator={locator} />
        {tags.map((tag) => <TagPill key={tag} tag={tag} />)}
        {hidden > 0 && <span className="text-[11px] text-ink-4 tnum">+{hidden}</span>}
        {/* A note filed against a day already says its date in the chip. */}
        {refer.kind !== "day" && (
          <span className="ml-auto shrink-0 text-[11px] text-ink-4 tnum">
            {dayLabel(noteDay(note))}
          </span>
        )}
      </footer>
    </article>
  );
}
