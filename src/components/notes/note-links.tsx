"use client";

import * as React from "react";
import { ArrowUpRight, CornerUpLeft } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";
import { cn } from "@/lib/cn";
import { buildLinkGraph, backlinksOf, outlinksOf } from "./link-graph";
import { noteHeading, resolveSource, type SourceIndex } from "./note-model";
import { Disclosure } from "./note-fields";
import { NoteIcon } from "./note-icons";
import { useT } from "@/lib/i18n";

// =========================================================
// What this note points at, and what points back at it.
//
// The second half is the one that did not exist: [[links]] have always
// worked, and until now a note could not tell you it was being referred to.
// Both lists are derived on the fly — no column, no table, no write.
//
// The source index is passed in rather than rebuilt: the editor already
// holds one, and a second subscription here would re-render this panel on
// every unrelated store change.
// =========================================================

function LinkList({
  title, notes, index, icon, onOpen,
}: {
  title: string;
  notes: Note[];
  index: SourceIndex;
  icon: React.ReactNode;
  onOpen?: (id: string) => void;
}) {
  if (!notes.length) return null;
  return (
    <section>
      <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
        {title}
      </p>
      <div className="flex flex-col">
        {notes.map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={onOpen ? () => onOpen(note.id) : undefined}
            disabled={!onOpen}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
              onOpen ? "cursor-pointer hover:bg-hover" : "cursor-default",
            )}
          >
            {/* The note's own icon when it has one, otherwise the arrow
                that says which direction this link runs. */}
            <span className="shrink-0 text-ink-3" aria-hidden>
              {note.icon ? <NoteIcon name={note.icon} className="size-3.5" /> : icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
              {noteHeading(note, resolveSource(note, index))}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function NoteLinks({
  noteId, index, onOpenNote, className,
}: {
  noteId: string;
  index: SourceIndex;
  onOpenNote?: (id: string) => void;
  className?: string;
}) {
  const notes = useStore((s) => s.notes);
  const { t } = useT();

  const { back, outward } = React.useMemo(() => {
    const graph = buildLinkGraph(notes);
    return {
      back: backlinksOf(graph, notes, noteId),
      outward: outlinksOf(graph, notes, noteId),
    };
  }, [notes, noteId]);

  // A note with no links either way says nothing, rather than showing two
  // empty headings — the editor stays quiet until there is something to say.
  if (!back.length && !outward.length) return null;

  const summary = [
    back.length ? `${back.length} in` : null,
    outward.length ? `${outward.length} out` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Disclosure
      storageKey="humoyun.notes.editor.links"
      label={t("notes.links")}
      summary={summary}
      defaultOpen
      className={cn("hairline-t", className)}
      bodyClassName="pb-2 pt-1"
    >
      <div className="flex flex-col gap-3">
        <LinkList
          title={t("notes.linkedFrom")}
          notes={back}
          index={index}
          onOpen={onOpenNote}
          icon={<CornerUpLeft size={13} />}
        />
        <LinkList
          title={t("notes.linksTo")}
          notes={outward}
          index={index}
          onOpen={onOpenNote}
          icon={<ArrowUpRight size={13} />}
        />
      </div>
    </Disclosure>
  );
}
