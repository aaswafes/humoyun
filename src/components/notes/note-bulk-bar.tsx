"use client";

import * as React from "react";
import { ChevronsDownUp, ChevronsUpDown, Palette, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Note, Tint } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/primitives";
import { Popover, TintPicker } from "@/components/ui/overlays";
import { useDeleteNotes } from "./note-actions";

// =========================================================
// What you can do to several notes at once.
//
// Appears only when something is selected and floats over the page rather than
// pushing it, because a bar that shifted the cards would move the very things
// you just spent a shift-click picking out.
// =========================================================

export function NoteBulkBar({
  selected, notes, onClear,
}: {
  /** ids, already narrowed to what is actually on screen */
  selected: Set<string>;
  notes: Note[];
  onClear: () => void;
}) {
  const patch = useStore((s) => s.patch);
  const batchUndo = useStore((s) => s.batchUndo);
  const deleteNotes = useDeleteNotes();

  const ids = React.useMemo(() => [...selected], [selected]);
  const picked = React.useMemo(
    () => ids.map((id) => notes.find((n) => n.id === id)).filter((n): n is Note => !!n),
    [ids, notes]);

  // Keyboard, because a selection you made with the keyboard has to be
  // dismissable with it too.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el?.tagName === "INPUT" || el?.isContentEditable) return;
      onClear();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClear]);

  if (!picked.length) return null;

  const anyExpanded = picked.some((n) => !n.collapsed);

  const fold = () => batchUndo(anyExpanded ? "Fold the selection" : "Unfold the selection", () => {
    for (const n of picked) patch("notes", n.id, { collapsed: anyExpanded });
  });

  const tint = (color: Tint | null) => batchUndo("Recolour the selection", () => {
    for (const n of picked) patch("notes", n.id, { color });
  });

  return (
    <div
      role="toolbar"
      aria-label={`${picked.length} notes selected`}
      className={cn(
        "fixed bottom-5 left-1/2 z-40 -translate-x-1/2 anim-pop",
        "flex items-center gap-1 rounded-xl border border-line bg-raised p-1 pl-3 shadow-lg",
      )}
    >
      <span className="pr-1 text-[12.5px] text-ink tnum">
        {picked.length} selected
      </span>

      <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />

      <Button size="sm" variant="ghost" onClick={fold}>
        {anyExpanded ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
        {anyExpanded ? "Fold" : "Unfold"}
      </Button>

      <Popover
        align="center"
        side="top"
        className="w-auto"
        trigger={
          <IconButton label="Colour the selection" size="md"><Palette /></IconButton>
        }
      >
        {(close) => (
          <TintPicker
            allowNone
            value={picked[0]?.color ?? null}
            onChange={(color) => { tint(color); close(); }}
          />
        )}
      </Popover>

      <IconButton
        label={`Delete ${picked.length} notes`}
        size="md"
        tone="danger"
        onClick={() => { deleteNotes(picked); onClear(); }}
      >
        <Trash2 />
      </IconButton>

      <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />

      <IconButton label="Clear the selection (Esc)" size="md" onClick={onClear}>
        <X />
      </IconButton>
    </div>
  );
}
