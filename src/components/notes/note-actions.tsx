"use client";

import * as React from "react";
import { Copy, Ellipsis, Pin, PinOff, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover, TintPicker } from "@/components/ui/overlays";

/**
 * Deleting a note is undoable rather than confirmed.
 *
 * A note is cheap and there are many of them — a modal for each one is friction
 * every single time to protect against a mistake that is rare and reversible.
 * The toast holds the row until it expires, and Undo puts it back exactly as it
 * was, id included, so anything linked to it still resolves.
 */
export function useDeleteNote() {
  const remove = useStore((s) => s.remove);
  const insert = useStore((s) => s.insert);
  const toast = useStore((s) => s.toast);

  return React.useCallback((note: Note, label?: string) => {
    remove("notes", note.id);
    toast({
      title: label ?? "Note deleted",
      action: {
        label: "Undo",
        run: () => { insert("notes", note); },
      },
    });
  }, [remove, insert, toast]);
}

/** Delete several at once, restorable as one group. */
export function useDeleteNotes() {
  const remove = useStore((s) => s.remove);
  const insert = useStore((s) => s.insert);
  const toast = useStore((s) => s.toast);

  return React.useCallback((notes: Note[]) => {
    if (!notes.length) return;
    notes.forEach((n) => remove("notes", n.id));
    toast({
      title: `${notes.length} ${notes.length === 1 ? "note" : "notes"} deleted`,
      action: {
        label: "Undo",
        run: () => { notes.forEach((n) => insert("notes", n)); },
      },
    });
  }, [remove, insert, toast]);
}

/**
 * The hover menu on a note. Everything you would want to do to a note without
 * opening it — which is what "I cannot delete these" actually meant: the only
 * delete was three steps inside the editor.
 */
export function NoteActions({ note }: { note: Note }) {
  const patch = useStore((s) => s.patch);
  const insert = useStore((s) => s.insert);
  const toast = useStore((s) => s.toast);
  const deleteNote = useDeleteNote();

  function duplicate() {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = note;
    void _id; void _c; void _u;
    insert("notes", { ...rest, pinned: false });
    toast({ title: "Note duplicated" });
  }

  return (
    <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/note:opacity-100">
      <IconButton
        label={note.pinned ? "Unpin note" : "Pin note"}
        size="sm"
        active={note.pinned}
        onClick={() => patch("notes", note.id, { pinned: !note.pinned })}
      >
        {note.pinned ? <PinOff /> : <Pin />}
      </IconButton>

      <Popover
        align="end"
        className="w-[204px]"
        trigger={<IconButton label="Note options" size="sm"><Ellipsis /></IconButton>}
      >
        {(close) => (
          <>
            <MenuItem icon={Copy} onClick={() => { duplicate(); close(); }}>Duplicate</MenuItem>
            <MenuSeparator />
            <MenuLabel>Colour</MenuLabel>
            <TintPicker
              value={note.color}
              allowNone
              onChange={(t) => patch("notes", note.id, { color: t })}
            />
            <MenuSeparator />
            <MenuItem icon={Trash2} danger onClick={() => { deleteNote(note); close(); }}>
              Delete
            </MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}
