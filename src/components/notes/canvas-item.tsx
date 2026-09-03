"use client";

import * as React from "react";
import { GripVertical, Maximize2, MoreHorizontal, Pencil, Type } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Note, NoteLayout } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { DOC_CLASS } from "./doc-styles";
import { RichEditor } from "./rich-editor";
import { bodyAsHtml, noteText } from "./rich-text";
import { MIN_SIZE, snap } from "./canvas-model";

// =========================================================
// One thing on the board.
//
// Three shapes of the same object. A text chunk carries no chrome at all,
// which is the point — a wall of paper cards is a mood board, and what was
// asked for was somewhere to put groups of text. A card is paper when a note
// wants to look like one, and a frame is scenery you drop the other two into.
//
// Dragging never writes to the store. The offset lives here until the pointer
// comes up, so moving a card across the board is one undo step and one round
// trip rather than sixty.
// =========================================================

type Ghost = { dx: number; dy: number; dw: number; dh: number } | null;

const ZERO: Ghost = { dx: 0, dy: 0, dw: 0, dh: 0 };

export function CanvasItem({
  note, zoom, selected, editing, snapOn, notes, toolbarPortal,
  onSelect, onEdit, onCommit, onBody, onOpen, onMenu,
}: {
  note: Note;
  zoom: number;
  selected: boolean;
  editing: boolean;
  snapOn: boolean;
  notes: Note[];
  toolbarPortal: HTMLElement | null;
  onSelect: (id: string, additive: boolean) => void;
  onEdit: (id: string | null) => void;
  onCommit: (id: string, layout: NoteLayout) => void;
  onBody: (id: string, html: string) => void;
  onOpen: (id: string) => void;
  onMenu: (id: string, at: { x: number; y: number }) => void;
}) {
  const layout = note.layout as NoteLayout;
  const [ghost, setGhost] = React.useState<Ghost>(null);
  const start = React.useRef<{ x: number; y: number; mode: "move" | "resize" } | null>(null);

  const box = {
    x: layout.x + (ghost?.dx ?? 0),
    y: layout.y + (ghost?.dy ?? 0),
    w: Math.max(MIN_SIZE.w, layout.w + (ghost?.dw ?? 0)),
    h: Math.max(MIN_SIZE.h, layout.h + (ghost?.dh ?? 0)),
  };

  const begin = (e: React.PointerEvent, mode: "move" | "resize") => {
    if (editing) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, mode };
    setGhost(ZERO);
    onSelect(note.id, e.shiftKey);
  };

  const move = (e: React.PointerEvent) => {
    const from = start.current;
    if (!from) return;
    // Screen pixels are world pixels divided by the zoom — without this a drag
    // at 40% would move the card two and a half times as far as the cursor.
    const dx = (e.clientX - from.x) / zoom;
    const dy = (e.clientY - from.y) / zoom;
    setGhost(from.mode === "move"
      ? { dx: snapTo(dx, snapOn, e.altKey), dy: snapTo(dy, snapOn, e.altKey), dw: 0, dh: 0 }
      : { dx: 0, dy: 0, dw: snapTo(dx, snapOn, e.altKey), dh: snapTo(dy, snapOn, e.altKey) });
  };

  const end = () => {
    const from = start.current;
    start.current = null;
    if (!from || !ghost) { setGhost(null); return; }
    const moved = ghost.dx || ghost.dy || ghost.dw || ghost.dh;
    setGhost(null);
    if (!moved) return;

    // Only the axis the gesture actually touched is rewritten. Snapping the
    // size on a move rounded a 190px card to 192 every time it was picked up,
    // so a card grew a little each time you moved it.
    const isMove = from.mode === "move";
    onCommit(note.id, isMove
      ? {
        ...layout,
        x: snap(layout.x + ghost.dx, snapOn),
        y: snap(layout.y + ghost.dy, snapOn),
      }
      : {
        ...layout,
        w: Math.max(MIN_SIZE.w, snap(layout.w + ghost.dw, snapOn)),
        h: Math.max(MIN_SIZE.h, snap(layout.h + ghost.dh, snapOn)),
      });
  };

  const frame = layout.style === "frame";
  const card = layout.style === "card";
  const tint = note.color ?? "slate";
  const heading = note.title?.trim();

  return (
    <div
      data-canvas-item={note.id}
      className={cn(
        `tint-${tint}`,
        "group absolute select-none",
        frame ? "cursor-default" : "cursor-grab",
        editing && "cursor-text",
      )}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: layout.z }}
      onPointerDown={(e) => { if (!frame) begin(e, "move"); }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={(e) => { e.stopPropagation(); onEdit(note.id); }}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect(note.id, false);
        onMenu(note.id, { x: e.clientX, y: e.clientY });
      }}
    >
      <div
        className={cn(
          "relative flex size-full flex-col overflow-hidden transition-shadow duration-150",
          card && "rounded-lg border border-line shadow-[var(--shadow-sm)]",
          frame && "rounded-xl border-2 border-dashed",
          !card && !frame && "rounded-md",
          selected && !frame && "ring-2 ring-accent ring-offset-1 ring-offset-canvas",
          selected && frame && "ring-2 ring-accent",
          editing && "ring-2 ring-accent",
        )}
        style={{
          background: frame
            ? "color-mix(in srgb, var(--tint-soft) 55%, transparent)"
            : card ? "var(--tint-soft)" : "transparent",
          borderColor: frame ? "var(--tint)" : undefined,
        }}
      >
        {frame ? (
          <FrameLabel
            note={note}
            onGrab={(e) => begin(e, "move")}
            onMove={move}
            onEnd={end}
          />
        ) : (
          <div
            className={cn(
              "absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded-md bg-raised/85 p-0.5",
              "opacity-0 shadow-[var(--shadow-sm)] backdrop-blur-sm transition-opacity duration-150",
              "focus-within:opacity-100 group-hover:opacity-100 hover:opacity-100",
              (selected || editing) && "opacity-100",
            )}
          >
            <IconButton
              label={editing ? "Finish editing" : "Edit here"}
              size="sm"
              active={editing}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onEdit(editing ? null : note.id)}
            >
              <Pencil />
            </IconButton>
            <IconButton
              label="Open the full note"
              size="sm"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onOpen(note.id)}
            >
              <Maximize2 />
            </IconButton>
            <IconButton
              label="More"
              size="sm"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => onMenu(note.id, { x: e.clientX, y: e.clientY })}
            >
              <MoreHorizontal />
            </IconButton>
          </div>
        )}

        {!frame && (
          <div
            className={cn(
              "min-h-0 flex-1 overflow-hidden",
              card ? "px-3 py-2.5" : "px-1 py-0.5",
            )}
          >
            {heading && !editing && (
              <h4 className="mb-1 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
                {heading}
              </h4>
            )}

            {editing ? (
              <RichEditor
                value={bodyAsHtml(note)}
                onChange={(html) => onBody(note.id, html)}
                notes={notes}
                currentId={note.id}
                onOpenNote={onOpen}
                toolbarPortal={toolbarPortal}
                autoFocus
                minHeight={Math.max(40, box.h - (heading ? 46 : 24))}
                placeholder="Type here…"
                ariaLabel={`Editing ${heading || "a text chunk"}`}
                className="h-full"
              />
            ) : note.format === "html" ? (
              <div
                className={cn(DOC_CLASS, "pointer-events-none")}
                // The body was scrubbed by the editor on the way in; this is
                // the same string coming back out.
                dangerouslySetInnerHTML={{ __html: note.body }}
              />
            ) : (
              <p className={cn(DOC_CLASS, "whitespace-pre-line")}>{noteText(note)}</p>
            )}

            {!editing && !heading && !noteText(note).trim() && (
              <p className="flex items-center gap-1.5 text-[12.5px] text-ink-4">
                <Type className="size-3.5" aria-hidden />
                Double-click to write
              </p>
            )}
          </div>
        )}

        {!editing && (
          <button
            type="button"
            aria-label={`Resize ${heading || "this chunk"}. Alt with the arrow keys does the same.`}
            onPointerDown={(e) => begin(e, "resize")}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className={cn(
              "absolute bottom-0 right-0 z-10 grid size-6 cursor-nwse-resize place-items-end",
              "opacity-0 transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100",
              selected && "opacity-100",
            )}
          >
            {/* The wedge is decoration. The button around it stays a full
                square, because a clipped triangle is a hit area you miss. */}
            <span
              aria-hidden
              className="block size-3.5 rounded-tl-md"
              style={{ background: "var(--tint)", clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
            />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A frame is grabbed by its label, not its body — otherwise the whole point of
 * a frame, that you can click through it to what is inside, would be gone.
 */
function FrameLabel({
  note, onGrab, onMove, onEnd,
}: {
  note: Note;
  onGrab: (e: React.PointerEvent) => void;
  onMove: (e: React.PointerEvent) => void;
  onEnd: () => void;
}) {
  return (
    <div
      onPointerDown={onGrab}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      className="absolute -top-6 left-0 flex max-w-full cursor-grab items-center gap-1 rounded-md px-1.5 py-0.5"
      style={{ background: "var(--tint-soft)", color: "var(--tint-ink)" }}
    >
      <GripVertical className="size-3 shrink-0 opacity-60" aria-hidden />
      <span className="truncate text-[11.5px] font-medium">
        {note.title?.trim() || "Group"}
      </span>
    </div>
  );
}

/** Alt is the universal "ignore the grid" modifier, so it is honoured here too. */
function snapTo(value: number, on: boolean, alt: boolean): number {
  return snap(value, on && !alt);
}
