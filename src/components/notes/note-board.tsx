"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";
import { NoteCard } from "./note-card";
import type { CategoryIndex } from "./category-model";
import type { SourceRef } from "./note-model";
import {
  BOARD_MIN_WIDTH, GAP, MIN_H, MIN_W, type Box, type PlacedNote,
  boardHeight, layoutBoard, pinFrom, topZ,
} from "./board-model";

// =========================================================
// The notes page, arranged by hand.
//
// Not a canvas: no zoom, no pan, no separate mode to enter. It is the same
// page of cards it always was, except that a card can be picked up and put
// somewhere else, and dragged wider or taller. Cards nobody has touched keep
// laying themselves out, so the page is tidy on the day it is opened and stays
// however you leave it after that.
//
// Below a certain width there is no honest way to honour a layout built on a
// wide screen, so the board stops pretending and stacks.
// =========================================================

/** How far the pointer must travel before a press becomes a drag and not a click. */
const DRAG_SLOP = 4;

type Mode = "move" | "resize";

interface Live {
  /** identifies this one gesture, so a stale offset can never outlive it */
  key: string;
  id: string;
  mode: Mode;
  startX: number;
  startY: number;
  box: Box;
  moved: boolean;
}

export interface Modifiers { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }

export function NoteBoard({
  notes, refs, locators, categories, onOpen, className,
  selected, onPick,
}: {
  notes: Note[];
  refs: Map<string, SourceRef>;
  locators: Map<string, string | null>;
  categories: CategoryIndex;
  onOpen: (note: Note) => void;
  className?: string;
  /** every card currently picked out, by id */
  selected: Set<string>;
  /**
   * A click on a card, with its modifiers. What that means for the selection
   * is the page's decision, not this board's: grouping splits the page into
   * one board per group, and a shift-range has to be able to cross a heading.
   */
  onPick: (id: string, mods: Modifiers) => void;
}) {
  const patch = useStore((s) => s.patch);

  const hostRef = React.useRef<HTMLDivElement>(null);
  const cardsRef = React.useRef(new Map<string, HTMLElement>());
  const [width, setWidth] = React.useState(0);
  const [heights, setHeights] = React.useState<Map<string, number>>(() => new Map());
  const [live, setLive] = React.useState<Live | null>(null);

  // ---- how wide the board is ----
  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(host);
    setWidth(Math.round(host.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  const free = width >= BOARD_MIN_WIDTH;

  // ---- how tall each flowing card wants to be ----
  // Measured rather than estimated: guessing a card's height from its text
  // length is always close enough to look wrong.
  const measure = React.useCallback(() => {
    setHeights((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, el] of cardsRef.current) {
        const h = Math.round(el.getBoundingClientRect().height);
        if (h > 0 && Math.abs((prev.get(id) ?? -1) - h) > 0.5) { next.set(id, h); changed = true; }
      }
      return changed ? next : prev;
    });
  }, []);

  React.useLayoutEffect(() => { measure(); });

  React.useEffect(() => {
    const observer = new ResizeObserver(measure);
    for (const el of cardsRef.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [measure, notes]);

  const registerCard = React.useCallback((id: string, el: HTMLElement | null) => {
    if (el) cardsRef.current.set(id, el);
    else cardsRef.current.delete(id);
  }, []);

  const placed = React.useMemo(
    () => (free && width ? layoutBoard(notes, width, heights) : []),
    [free, width, notes, heights]);

  // ---- picking a card up ----
  const begin = (e: React.PointerEvent, p: PlacedNote, mode: Mode) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    // A modifier always re-decides the selection. Without one, a drag that
    // starts on an already-picked card carries the whole selection with it.
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      // Shift-clicking two cards otherwise drags a native text selection
      // across everything between them, which is not what was asked for.
      e.preventDefault();
      onPick(p.note.id, e);
    }
    else if (!selected.has(p.note.id)) onPick(p.note.id, e);
    setLive({
      key: `${p.note.id}:${mode}:${e.clientX}:${e.clientY}`,
      id: p.note.id, mode, startX: e.clientX, startY: e.clientY, box: p.box, moved: false,
    });
  };

  const move = (e: React.PointerEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    setLive((cur) => {
      if (!cur) return cur;
      const moved = cur.moved || Math.hypot(x - cur.startX, y - cur.startY) > DRAG_SLOP;
      return moved === cur.moved ? cur : { ...cur, moved };
    });
  };

  const end = (e: React.PointerEvent) => {
    const cur = live;
    setLive(null);
    if (!cur || !cur.moved) return;

    const dx = e.clientX - cur.startX;
    const dy = e.clientY - cur.startY;
    const note = notes.find((n) => n.id === cur.id);
    if (!note) return;

    const box = cur.mode === "move"
      ? { ...cur.box, x: Math.max(0, cur.box.x + dx), y: Math.max(0, cur.box.y + dy) }
      : {
        ...cur.box,
        w: Math.max(MIN_W, Math.min(cur.box.w + dx, width - cur.box.x)),
        h: Math.max(MIN_H, cur.box.h + dy),
      };

    patch("notes", cur.id, { layout: pinFrom(box, topZ(notes)) });
  };

  /** Alt is the modifier that means "arrange", so arrows still scroll normally. */
  const onCardKeyDown = (e: React.KeyboardEvent, p: PlacedNote) => {
    if (!e.altKey) return;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const dir = dirs[e.key];
    if (!dir) return;
    e.preventDefault();
    // Shift turns the same four keys from "move it" into "resize it".
    const amount = 16;
    const box = e.shiftKey
      ? {
        ...p.box,
        w: Math.max(MIN_W, Math.min(p.box.w + dir[0] * amount, width - p.box.x)),
        h: Math.max(MIN_H, p.box.h + dir[1] * amount),
      }
      : {
        ...p.box,
        x: Math.max(0, Math.min(p.box.x + dir[0] * amount, width - p.box.w)),
        y: Math.max(0, p.box.y + dir[1] * amount),
      };
    patch("notes", p.note.id, { layout: pinFrom(box, topZ(notes)) });
  };

  // ---- the narrow fallback: a plain stack, no arranging ----
  if (!free) {
    return (
      <div ref={hostRef} className={cn("columns-1 gap-4 sm:columns-2", className)}>
        {notes.map((note) => {
          const refer = refs.get(note.id);
          if (!refer) return null;
          return (
            <NoteCard
              key={note.id}
              note={note}
              refer={refer}
              locator={locators.get(note.id) ?? null}
              categories={categories}
              onOpen={onOpen}
            />
          );
        })}
      </div>
    );
  }

  const height = boardHeight(placed);

  return (
    <div
      ref={hostRef}
      className={cn("relative", className)}
      style={{ height: height || undefined }}
    >
      {placed.map((p) => {
        const refer = refs.get(p.note.id);
        if (!refer) return null;

        return (
          <BoardCard
            key={p.note.id}
            placed={p}
            refer={refer}
            locator={locators.get(p.note.id) ?? null}
            categories={categories}
            selected={selected.has(p.note.id)}
            live={live?.id === p.note.id ? live : null}
            register={registerCard}
            onOpen={onOpen}
            onBegin={begin}
            onMove={move}
            onEnd={end}
            onKeyDown={onCardKeyDown}
          />
        );
      })}
    </div>
  );
}

function BoardCard({
  placed, refer, locator, categories, selected, live, register,
  onOpen, onBegin, onMove, onEnd, onKeyDown,
}: {
  placed: PlacedNote;
  refer: SourceRef;
  locator: string | null;
  categories: CategoryIndex;
  selected: boolean;
  live: Live | null;
  register: (id: string, el: HTMLElement | null) => void;
  onOpen: (note: Note) => void;
  onBegin: (e: React.PointerEvent, p: PlacedNote, mode: Mode) => void;
  onMove: (e: React.PointerEvent) => void;
  onEnd: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent, p: PlacedNote) => void;
}) {
  const { note, box, pinned } = placed;
  const ref = React.useRef<HTMLDivElement>(null);
  // Tagged with the gesture it belongs to, so an offset left over from the
  // last drag can never be read as the start of the next one.
  const [delta, setDelta] = React.useState<{ key: string; x: number; y: number } | null>(null);
  const dragging = !!live?.moved;

  // The offset lives here for the length of the gesture, so dragging a card
  // repaints one card rather than re-laying out the whole board sixty times.
  React.useEffect(() => {
    if (!live) return;
    const onPointerMove = (e: PointerEvent) => {
      setDelta({ key: live.key, x: e.clientX - live.startX, y: e.clientY - live.startY });
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [live]);

  const offset = live && delta?.key === live.key ? delta : { x: 0, y: 0 };
  const shift = live?.mode === "move" ? offset : { x: 0, y: 0 };
  const grow = live?.mode === "resize" ? offset : { x: 0, y: 0 };

  const style: React.CSSProperties = {
    left: box.x,
    top: box.y,
    width: Math.max(MIN_W, box.w + grow.x),
    // A flowing card measures itself; a pinned one is exactly as tall as it
    // was made, and clips what does not fit.
    height: pinned || live?.mode === "resize" ? Math.max(MIN_H, box.h + grow.y) : undefined,
    transform: shift.x || shift.y ? `translate(${shift.x}px, ${shift.y}px)` : undefined,
    zIndex: dragging ? 50 : placed.z,
  };

  return (
    <div
      ref={(el) => {
        ref.current = el;
        // Only a flowing card is measured; a pinned one has been given a size.
        register(note.id, pinned ? null : el);
      }}
      data-note-card={note.id}
      style={style}
      onPointerDown={(e) => {
        // Buttons inside the card — open, pin, the options menu — are not grips.
        if ((e.target as Element).closest("button, a, [data-no-drag]")) return;
        onBegin(e, placed, "move");
      }}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onClickCapture={(e) => {
        // Neither a drag nor a modifier-click is a request to open the note:
        // the first was arranging, the second was selecting.
        if (dragging || e.shiftKey || e.metaKey || e.ctrlKey) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onKeyDown={(e) => onKeyDown(e, placed)}
      className={cn(
        "group/board absolute",
        dragging ? "cursor-grabbing" : "cursor-grab",
        !dragging && "transition-[left,top,width,height] duration-200 ease-[var(--ease-out-apple)]",
        dragging && "scale-[1.015] shadow-[var(--shadow-lg)] rounded-lg",
      )}
    >
      <NoteCard
        note={note}
        refer={refer}
        locator={locator}
        categories={categories}
        onOpen={onOpen}
        className={cn(
          "mb-0 h-full",
          selected && "ring-2 ring-accent ring-offset-2 ring-offset-canvas",
        )}
      />

      {/* The affordance, and the only thing that says this page can be arranged. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1 top-1 grid size-5 place-items-center rounded-md",
          "text-ink-4 opacity-0 transition-opacity duration-150",
          "group-hover/board:opacity-100",
        )}
      >
        <GripVertical className="size-3.5" />
      </span>

      <button
        type="button"
        data-no-drag
        aria-label={`Resize ${note.title?.trim() || "this note"}. Hold Alt and use the arrow keys with Shift.`}
        onPointerDown={(e) => { e.stopPropagation(); onBegin(e, placed, "resize"); }}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        className={cn(
          "absolute -bottom-0.5 -right-0.5 size-5 cursor-nwse-resize rounded-br-lg",
          "opacity-0 transition-opacity duration-150",
          "after:absolute after:bottom-1.5 after:right-1.5 after:size-2",
          "after:rounded-[2px] after:border-b-2 after:border-r-2 after:border-ink-4",
          "group-hover/board:opacity-100 focus-visible:opacity-100",
          selected && "opacity-100",
        )}
      />
    </div>
  );
}

/** Everything the toolbar needs to say about, and undo, a hand-made layout. */
export function usePinnedLayouts(notes: Note[]) {
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const batchUndo = useStore((s) => s.batchUndo);

  const pinned = React.useMemo(() => notes.filter((n) => n.layout), [notes]);

  const tidy = React.useCallback(() => {
    if (!pinned.length) return;
    const before = pinned.map((n) => ({ id: n.id, layout: n.layout }));
    batchUndo("Tidy up the board", () => {
      for (const note of pinned) patch("notes", note.id, { layout: null });
    });
    toast({
      title: `${before.length} ${before.length === 1 ? "card" : "cards"} tidied up`,
      action: {
        label: "Undo",
        run: () => batchUndo("Put the board back", () => {
          for (const b of before) patch("notes", b.id, { layout: b.layout });
        }),
      },
    });
  }, [pinned, patch, toast, batchUndo]);

  return { count: pinned.length, tidy };
}

export { GAP };
