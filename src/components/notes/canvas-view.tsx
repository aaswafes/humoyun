"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Copy, Grid2x2, Layers, Maximize2, PanelRightClose, PanelRightOpen, Plus,
  SquareDashed, StickyNote, Trash2, Type, ZoomIn, ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Note, NoteCanvasStyle, NoteLayout, Tint } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, TintPicker, useMounted } from "@/components/ui/overlays";
import { MiniEmpty } from "@/components/ui/form";
import { DocStyles } from "./doc-styles";
import { useSticky } from "./note-fields";
import { CanvasItem } from "./canvas-item";
import { noteText } from "./rich-text";
import {
  MIN_SIZE, type View, canvasBounds, clampZoom, freeSpotNear, newLayout, placed,
  snap, toWorld, topZ, unplaced,
} from "./canvas-model";

// =========================================================
// The board.
//
// One infinite canvas, because that is what was asked for: somewhere to put
// groups of text where you want them rather than in a column someone else
// decided. Everything on it is a real note — the same note the cards, the list
// and the graph are showing — so arranging the board is not a second copy of
// your writing that can drift from the first.
//
// Notes that are not on the board sit in a tray on the right. Drag one out, or
// press its button; both land in the same place, which is what keeps the
// pointer path and the keyboard path honestly equivalent.
// =========================================================

const DRAG_TYPE = "application/x-humoyun-note";

const ADDS: { style: NoteCanvasStyle; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { style: "text", label: "Text", icon: Type },
  { style: "card", label: "Card", icon: StickyNote },
  { style: "frame", label: "Frame", icon: SquareDashed },
];

interface Menu { id: string; x: number; y: number }

export function CanvasView({ notes, onOpen, className }: {
  notes: Note[];
  onOpen: (id: string) => void;
  className?: string;
}) {
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);

  const [view, setView] = React.useState<View>({ x: 0, y: 0, k: 1 });
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [editing, setEditing] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState<Menu | null>(null);
  const [snapOn, setSnapOn] = useSticky("humoyun.notes.canvas.snap", true);
  const [trayOpen, setTrayOpen] = useSticky("humoyun.notes.canvas.tray", true);

  const hostRef = React.useRef<HTMLDivElement>(null);
  const barRef = React.useRef<HTMLDivElement>(null);
  const [bar, setBar] = React.useState<HTMLElement | null>(null);
  const pan = React.useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  // Render only needs to know that a pan is happening, not where it started.
  const [panning, setPanning] = React.useState(false);

  // The portal target has to be a real node before the editor renders into it,
  // and a ref alone never triggers the render that would use it.
  React.useEffect(() => { setBar(barRef.current); }, []);

  const onBoard = React.useMemo(() => placed(notes), [notes]);
  const inTray = React.useMemo(() => unplaced(notes), [notes]);

  // ---- view ----
  const centreWorld = React.useCallback(() => {
    const host = hostRef.current;
    if (!host) return { x: 0, y: 0 };
    const { width, height } = host.getBoundingClientRect();
    return toWorld(view, width / 2, height / 2);
  }, [view]);

  const fit = React.useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const { width, height } = host.getBoundingClientRect();
    const b = canvasBounds(onBoard);
    // Never past 1:1 on open. Fitting three cards into a wide board would
    // otherwise magnify them, and the first thing you do is zoom back out.
    const k = clampZoom(Math.min(width / b.w, height / b.h, 1));
    setView({
      k,
      x: width / 2 - (b.x + b.w / 2) * k,
      y: height / 2 - (b.y + b.h / 2) * k,
    });
  }, [onBoard]);

  // Once, on the first paint that has something to look at. Refitting on every
  // change would yank the board out from under a drag.
  const fitted = React.useRef(false);
  React.useEffect(() => {
    if (fitted.current || !onBoard.length) return;
    fitted.current = true;
    fit();
  }, [onBoard.length, fit]);

  const zoomBy = (factor: number) => {
    const host = hostRef.current;
    if (!host) return;
    const { width, height } = host.getBoundingClientRect();
    setView((v) => {
      const k = clampZoom(v.k * factor);
      const scale = k / v.k;
      return { k, x: width / 2 - (width / 2 - v.x) * scale, y: height / 2 - (height / 2 - v.y) * scale };
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    const host = hostRef.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      const px = e.clientX - box.left;
      const py = e.clientY - box.top;
      setView((v) => {
        const k = clampZoom(v.k * Math.exp(-e.deltaY * 0.0022));
        const scale = k / v.k;
        return { k, x: px - (px - v.x) * scale, y: py - (py - v.y) * scale };
      });
      return;
    }
    setView((v) => ({
      ...v,
      x: v.x - (e.shiftKey ? e.deltaY : e.deltaX),
      y: v.y - (e.shiftKey ? 0 : e.deltaY),
    }));
  };

  // ---- placing ----
  const add = (style: NoteCanvasStyle, at?: { x: number; y: number }) => {
    const world = at ?? centreWorld();
    const spot = freeSpotNear(onBoard, world.x, world.y, style);
    const note = insert("notes", {
      layout: newLayout(style, spot.x, spot.y, topZ(onBoard)),
      color: style === "frame" ? "blue" : null,
      title: style === "frame" ? "Group" : null,
    });
    setSelected(new Set([note.id]));
    if (style !== "frame") setEditing(note.id);
  };

  const place = (id: string, at?: { x: number; y: number }) => {
    const note = notes.find((n) => n.id === id);
    if (!note || note.layout) return;
    const world = at ?? centreWorld();
    const spot = freeSpotNear(onBoard, world.x, world.y, "card");
    patch("notes", id, { layout: newLayout("card", spot.x, spot.y, topZ(onBoard)) });
    setSelected(new Set([id]));
  };

  const takeOff = (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note?.layout) return;
    const before = note.layout;
    patch("notes", id, { layout: null });
    setSelected(new Set());
    toast({
      title: "Taken off the board",
      description: "The note itself is untouched.",
      action: { label: "Undo", run: () => patch("notes", id, { layout: before }) },
    });
  };

  // ---- the board's own gestures ----
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as Element).hasAttribute?.("data-board")) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    setPanning(true);
    setSelected(new Set());
    setEditing(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pan.current;
    if (!p) return;
    setView((v) => ({ ...v, x: p.vx + (e.clientX - p.x), y: p.vy + (e.clientY - p.y) }));
  };

  const endPan = () => { pan.current = null; setPanning(false); };

  const worldAt = (clientX: number, clientY: number) => {
    const box = hostRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return toWorld(view, clientX - box.left, clientY - box.top);
  };

  // ---- keyboard ----
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing || !selected.size) return;
    const step = e.shiftKey ? 40 : 8;

    /**
     * Arrows move the selection; Alt with them resizes it.
     *
     * The grip in the corner is the discoverable way to resize, and this is
     * the one that works without a pointer — a drag with no keyboard
     * equivalent is a drag half the people using this cannot perform.
     */
    const apply = (dx: number, dy: number) => {
      e.preventDefault();
      for (const id of selected) {
        const note = notes.find((n) => n.id === id);
        if (!note?.layout) continue;
        const l = note.layout;
        patch("notes", id, {
          layout: e.altKey
            ? {
              ...l,
              w: Math.max(MIN_SIZE.w, snap(l.w + dx, snapOn)),
              h: Math.max(MIN_SIZE.h, snap(l.h + dy, snapOn)),
            }
            : { ...l, x: snap(l.x + dx, snapOn), y: snap(l.y + dy, snapOn) },
        });
      }
    };
    const nudge = apply;
    if (e.key === "ArrowLeft") nudge(-step, 0);
    else if (e.key === "ArrowRight") nudge(step, 0);
    else if (e.key === "ArrowUp") nudge(0, -step);
    else if (e.key === "ArrowDown") nudge(0, step);
    else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      for (const id of selected) takeOff(id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      setEditing([...selected][0] ?? null);
    } else if (e.key === "Escape") {
      setSelected(new Set());
    }
  };

  const menuNote = menu ? notes.find((n) => n.id === menu.id) ?? null : null;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <DocStyles />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {ADDS.map(({ style, label, icon: Glyph }) => (
            <Button key={style} size="sm" onClick={() => add(style)}>
              <Glyph className="size-3.5" />
              {label}
            </Button>
          ))}
        </div>

        {/* The formatting bar for whatever is being edited in place lands here,
            where it has the width of the page instead of the width of a card. */}
        <div ref={barRef} className="min-w-0 flex-1" />

        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label={snapOn ? "Snap to grid is on" : "Snap to grid is off"}
            aria-pressed={snapOn}
            active={snapOn}
            onClick={() => setSnapOn(!snapOn)}
          >
            <Grid2x2 />
          </IconButton>
          <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.25)}><ZoomOut /></IconButton>
          <span className="w-9 text-center text-[11.5px] text-ink-4 tnum">
            {Math.round(view.k * 100)}%
          </span>
          <IconButton label="Zoom in" onClick={() => zoomBy(1.25)}><ZoomIn /></IconButton>
          <IconButton label="Fit everything on the board" onClick={fit}><Maximize2 /></IconButton>
          <IconButton
            label={trayOpen ? "Hide the tray" : `Show the tray (${inTray.length} not on the board)`}
            aria-pressed={trayOpen}
            active={trayOpen}
            onClick={() => setTrayOpen(!trayOpen)}
          >
            {trayOpen ? <PanelRightClose /> : <PanelRightOpen />}
          </IconButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div
          ref={hostRef}
          data-board="true"
          role="application"
          aria-label="Notes canvas. Arrow keys move the selection, Alt with them resizes it, Enter edits it."
          tabIndex={0}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onKeyDown={onKeyDown}
          onDoubleClick={(e) => {
            if (e.target !== e.currentTarget) return;
            add("text", worldAt(e.clientX, e.clientY));
          }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(DRAG_TYPE);
            if (!id) return;
            e.preventDefault();
            place(id, worldAt(e.clientX, e.clientY));
          }}
          className={cn(
            "relative min-h-[460px] flex-1 touch-none overflow-hidden rounded-lg border border-line bg-canvas",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft",
            panning ? "cursor-grabbing" : "cursor-default",
          )}
          style={{
            backgroundImage: "radial-gradient(var(--line-strong) 1px, transparent 1px)",
            backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
          >
            {onBoard.map((note) => (
              <CanvasItem
                key={note.id}
                note={note}
                zoom={view.k}
                snapOn={snapOn}
                notes={notes}
                toolbarPortal={bar}
                selected={selected.has(note.id)}
                editing={editing === note.id}
                onSelect={(id, additive) => setSelected((prev) => {
                  if (!additive) return new Set([id]);
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
                onEdit={setEditing}
                onCommit={(id, layout) => patch("notes", id, { layout })}
                onBody={(id, html) => patch("notes", id, { body: html, format: "html" })}
                onOpen={onOpen}
                onMenu={(id, at) => setMenu({ id, ...at })}
              />
            ))}
          </div>

          {!onBoard.length && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-8">
              <div className="max-w-[380px] text-center">
                <p className="text-[13.5px] text-ink-2">Nothing on the board yet.</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-4">
                  Double-click anywhere to drop a chunk of text, add a frame to
                  group things, or drag a note out of the tray.
                </p>
              </div>
            </div>
          )}
        </div>

        {trayOpen && (
          <aside className="hidden w-[196px] shrink-0 flex-col md:flex">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Not on the board
              </h3>
              <span className="text-[11px] text-ink-4 tnum">{inTray.length}</span>
            </div>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
              {inTray.length === 0 ? (
                <MiniEmpty>Every note is on the board.</MiniEmpty>
              ) : (
                inTray.slice(0, 80).map((note) => (
                  <TrayRow key={note.id} note={note} onPlace={() => place(note.id)} />
                ))
              )}
              {inTray.length > 80 && (
                <p className="px-1 pt-1 text-[11px] text-ink-4 tnum">
                  {inTray.length - 80} more — narrow the list with search
                </p>
              )}
            </div>
          </aside>
        )}
      </div>

      {menu && menuNote && (
        <ItemMenu
          at={menu}
          note={menuNote}
          onClose={() => setMenu(null)}
          onStyle={(style) => patch("notes", menu.id, {
            layout: { ...(menuNote.layout as NoteLayout), style },
          })}
          onTint={(color) => patch("notes", menu.id, { color })}
          onFront={() => patch("notes", menu.id, {
            layout: { ...(menuNote.layout as NoteLayout), z: topZ(onBoard) + 1 },
          })}
          onDuplicate={() => {
            const { id: _id, created_at: _c, updated_at: _u, layout, ...rest } = menuNote;
            void _id; void _c; void _u;
            const l = layout as NoteLayout;
            insert("notes", {
              ...rest,
              pinned: false,
              layout: { ...l, x: l.x + 24, y: l.y + 24, z: topZ(onBoard) + 1 },
            });
          }}
          onTakeOff={() => takeOff(menu.id)}
          onDelete={() => {
            remove("notes", menu.id);
            toast({
              title: "Note deleted",
              action: { label: "Undo", run: () => { insert("notes", menuNote); } },
            });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------
// The tray
// ---------------------------------------------------------

function TrayRow({ note, onPlace }: { note: Note; onPlace: () => void }) {
  // The tray only needs a name. Building a whole source index per row to
  // get one would resolve six links the row does not draw.
  const lines = noteText(note).split(String.fromCharCode(10));
  const heading = note.title?.trim() || lines.find((l) => l.trim())?.trim() || "Empty note";
  const preview = lines.slice(1).join(" ").trim();

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, note.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={cn(
        `tint-${note.color ?? "slate"}`,
        "group/tray flex cursor-grab items-start gap-1.5 rounded-md px-1.5 py-1.5",
        "transition-colors duration-150 hover:bg-hover active:cursor-grabbing",
      )}
    >
      <span
        aria-hidden
        className="mt-[3px] size-2 shrink-0 rounded-full"
        style={{ background: "var(--tint)" }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-ink">{heading}</span>
        {preview && <span className="block truncate text-[11px] text-ink-4">{preview}</span>}
      </span>
      <IconButton
        label={`Put ${heading} on the board`}
        size="sm"
        className="opacity-0 transition-opacity group-hover/tray:opacity-100 focus-visible:opacity-100"
        onClick={onPlace}
      >
        <Plus />
      </IconButton>
    </div>
  );
}

// ---------------------------------------------------------
// Right-click on a thing
// ---------------------------------------------------------

function ItemMenu({
  at, note, onClose, onStyle, onTint, onFront, onDuplicate, onTakeOff, onDelete,
}: {
  at: { x: number; y: number };
  note: Note;
  onClose: () => void;
  onStyle: (style: NoteCanvasStyle) => void;
  onTint: (color: Tint | null) => void;
  onFront: () => void;
  onDuplicate: () => void;
  onTakeOff: () => void;
  onDelete: () => void;
}) {
  const mounted = useMounted();

  React.useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!mounted) return null;

  const style = (note.layout as NoteLayout).style;
  const top = Math.min(at.y, window.innerHeight - 330);
  const left = Math.min(at.x, window.innerWidth - 224);

  return createPortal(
    <div
      role="menu"
      aria-label="Canvas item"
      style={{ top, left }}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-[95] w-[212px] rounded-xl border border-line bg-raised p-1 shadow-lg anim-pop"
    >
      <MenuLabel>Shape</MenuLabel>
      {ADDS.map(({ style: s, label, icon: Glyph }) => (
        <MenuItem
          key={s}
          icon={Glyph}
          checked={style === s}
          onClick={() => { onStyle(s); onClose(); }}
        >
          {label}
        </MenuItem>
      ))}

      <MenuSeparator />
      <MenuLabel>Colour</MenuLabel>
      <TintPicker value={note.color} allowNone onChange={onTint} />

      <MenuSeparator />
      <MenuItem icon={Layers} onClick={() => { onFront(); onClose(); }}>Bring to front</MenuItem>
      <MenuItem icon={Copy} onClick={() => { onDuplicate(); onClose(); }}>Duplicate</MenuItem>
      <MenuItem icon={PanelRightOpen} onClick={() => { onTakeOff(); onClose(); }}>
        Take off the board
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={Trash2} danger onClick={() => { onDelete(); onClose(); }}>
        Delete the note
      </MenuItem>
    </div>,
    document.body,
  );
}
