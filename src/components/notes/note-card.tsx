"use client";

import * as React from "react";
import { ChevronDown, Lock, Pin } from "lucide-react";
import { cn } from "@/lib/cn";
import { NOTE_KIND_LABELS, type Note } from "@/lib/types";
import { useStore } from "@/lib/store";
import { IconButton } from "@/components/ui/primitives";
import { NOTE_KIND_ICONS, TagPill } from "./note-fields";
import { CategoryChips } from "./category-picker";
import type { CategoryIndex } from "./category-model";
import { NoteActions, useDeleteNote } from "./note-actions";
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
  note, refer, locator, categories, onOpen, className,
}: {
  note: Note;
  refer: SourceRef;
  locator: string | null;
  categories: CategoryIndex;
  onOpen: (note: Note) => void;
  /** the board sizes the card itself, so it needs the last word on the box */
  className?: string;
}) {
  const deleteNote = useDeleteNote();
  const patch = useStore((s) => s.patch);
  const Kind = NOTE_KIND_ICONS[note.kind];
  const heading = noteHeading(note, refer);
  const rest = noteRest(note);
  const tags = note.tags.slice(0, MAX_TAGS);
  const hidden = note.tags.length - tags.length;
  const locked = note.lock != null;
  // Two different reasons to show only the title, and they are not the same
  // thing: folded is a choice about clutter, locked is the absence of a key.
  const folded = note.collapsed || locked;

  return (
    <article
      className={cn(
        `tint-${note.color ?? "slate"}`,
        "group/note relative mb-4 flex break-inside-avoid flex-col overflow-hidden rounded-lg p-4",
        "transition-[box-shadow] duration-200 ease-[var(--ease-out-apple)]",
        "hover:shadow-[var(--shadow-sm)] focus-within:shadow-[var(--shadow-sm)]",
        className,
      )}
      style={{ background: "var(--tint-soft)" }}
    >
      {note.pinned && (
        <span
          aria-hidden
          className="absolute right-3 top-3.5 text-ink-3 transition-opacity group-hover/note:opacity-0"
          title="Pinned"
        >
          <Pin className="size-3" fill="currentColor" strokeWidth={0} />
        </span>
      )}

      <NoteActions note={note} />

      {/* The fold sits on the left, away from the hover actions on the right,
          because it is the one control you reach for repeatedly. */}
      <IconButton
        label={note.collapsed ? `Expand ${heading}` : `Fold ${heading} down to its title`}
        size="sm"
        aria-expanded={!note.collapsed}
        onClick={() => patch("notes", note.id, { collapsed: !note.collapsed })}
        className={cn(
          "absolute left-1 top-1 z-10 transition-opacity duration-150",
          "focus-visible:opacity-100 group-hover/note:opacity-100",
          note.collapsed ? "opacity-70" : "opacity-0",
        )}
      >
        <ChevronDown
          className={cn("transition-transform duration-200", note.collapsed && "-rotate-90")}
        />
      </IconButton>

      <button
        type="button"
        onClick={() => onOpen(note)}
        onKeyDown={(e) => {
          // The card is the thing in hand, so the delete key acts on it.
          if (e.key === "Backspace" || e.key === "Delete") {
            e.preventDefault();
            deleteNote(note);
          }
        }}
        aria-label={
          `Open the ${NOTE_KIND_LABELS[note.kind].toLowerCase()} ${heading}`
          + (note.pinned ? ", pinned" : "")
        }
        className="block w-full cursor-pointer text-left"
      >
        {/* The left gutter is reserved whether or not the chevron is showing.
            Letting the title reflow when it appears on hover would make every
            card twitch under the cursor. */}
        <h3 className={cn(
          "flex items-start gap-1.5 text-[13.5px] font-medium leading-snug text-ink",
          "pl-5 pr-14",
        )}>
          {/* A plain note needs no badge saying it is a note. */}
          {note.kind !== "note" && (
            <Kind className="mt-[3px] size-3.5 shrink-0 text-ink-3" aria-hidden />
          )}
          <span className="line-clamp-2 min-w-0">{heading}</span>
        </h3>

        {locked ? (
          <p className="mt-1.5 flex items-center gap-1.5 pl-5 text-[12px] text-ink-4">
            <Lock className="size-3" aria-hidden />
            Locked — open it to read
          </p>
        ) : (
          !folded && rest && (
            <p className="mt-1.5 line-clamp-6 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-2">
              {rest}
            </p>
          )
        )}
      </button>

      {/* Folded, the chips go too. Keeping them would make the fold save one
          line and cost the point of folding. */}
      {!note.collapsed && (
        <footer className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {/* Where it belongs comes before where it came from: the shelves are
              what the page is filtered and clustered by. */}
          <CategoryChips names={note.categories} index={categories} max={2} />
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
      )}
    </article>
  );
}
