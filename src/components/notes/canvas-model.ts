import type { Note, NoteCanvasStyle, NoteLayout } from "@/lib/types";

// =========================================================
// The canvas.
//
// One infinite board. A note is on it when it has a `layout`, and off it when
// that is null — there is no separate table of placements, because a card on
// the board and the note it shows must never be two things that can disagree.
//
// Coordinates are world units, which are pixels at zoom 1. The view is a pan
// and a scale over that world and is never persisted: where you were looking
// is not part of the document.
// =========================================================

export interface View {
  x: number;
  y: number;
  k: number;
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;

export const GRID = 8;

export const DEFAULT_SIZE: Record<NoteCanvasStyle, { w: number; h: number }> = {
  text: { w: 300, h: 130 },
  card: { w: 280, h: 190 },
  frame: { w: 460, h: 340 },
};

export const MIN_SIZE = { w: 120, h: 56 };

/**
 * A frame is scenery: it is drawn behind everything so text can be dropped
 * inside it. Giving it a z below every card is what makes that true without a
 * second render pass or a separate layer.
 */
export const FRAME_Z = 0;

export function placed(notes: Note[]): Note[] {
  return notes
    .filter((n) => !n.is_template && n.layout)
    .sort((a, b) => (a.layout as NoteLayout).z - (b.layout as NoteLayout).z);
}

export function unplaced(notes: Note[]): Note[] {
  return notes.filter((n) => !n.is_template && !n.layout);
}

export function topZ(notes: Note[]): number {
  let z = FRAME_Z;
  for (const note of notes) {
    if (note.layout && note.layout.style !== "frame") z = Math.max(z, note.layout.z);
  }
  return z;
}

export function snap(value: number, on: boolean): number {
  return on ? Math.round(value / GRID) * GRID : Math.round(value);
}

export function newLayout(
  style: NoteCanvasStyle, x: number, y: number, z: number,
): NoteLayout {
  const size = DEFAULT_SIZE[style];
  return {
    x: Math.round(x - size.w / 2),
    y: Math.round(y - size.h / 2),
    w: size.w,
    h: size.h,
    style,
    z: style === "frame" ? FRAME_Z : Math.max(z + 1, 1),
  };
}

/** Screen pixels inside the canvas host → world coordinates. */
export function toWorld(view: View, px: number, py: number) {
  return { x: (px - view.x) / view.k, y: (py - view.y) / view.k };
}

export function canvasBounds(notes: Note[]) {
  const items = notes.map((n) => n.layout).filter(Boolean) as NoteLayout[];
  if (!items.length) return { x: -400, y: -300, w: 800, h: 600 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of items) {
    x0 = Math.min(x0, l.x);
    y0 = Math.min(y0, l.y);
    x1 = Math.max(x1, l.x + l.w);
    y1 = Math.max(y1, l.y + l.h);
  }
  const pad = 120;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

export function clampZoom(k: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
}

/**
 * Somewhere free, near the middle of what is on screen.
 *
 * Dropping a new chunk exactly at the centre every time stacks them into one
 * pile; nudging down and right past whatever is already there is what a person
 * would do by hand.
 */
export function freeSpotNear(
  notes: Note[], x: number, y: number, style: NoteCanvasStyle,
): { x: number; y: number } {
  const size = DEFAULT_SIZE[style];
  const taken = notes.map((n) => n.layout).filter(Boolean) as NoteLayout[];
  let cx = x;
  let cy = y;

  for (let tries = 0; tries < 40; tries++) {
    const box = { x: cx - size.w / 2, y: cy - size.h / 2, w: size.w, h: size.h };
    const clash = taken.some((l) =>
      l.style !== "frame"
      && box.x < l.x + l.w && box.x + box.w > l.x
      && box.y < l.y + l.h && box.y + box.h > l.y);
    if (!clash) break;
    cx += 28;
    cy += 24;
  }

  return { x: cx, y: cy };
}
