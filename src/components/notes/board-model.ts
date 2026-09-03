import type { Note, NoteLayout } from "@/lib/types";

// =========================================================
// Where the cards sit.
//
// This is the notes page itself, not a separate canvas: it scrolls like any
// other page, it has no zoom and no pan, and a card you never touch is laid
// out for you. The only thing dragging changes is that one card's `layout`,
// and from then on the board works around it.
//
// So there are two kinds of card on screen at once, and the whole model is
// about keeping them out of each other's way:
//
//   pinned   moved or resized by hand. Stays exactly where it was put.
//   flowing  never touched. Falls into the shortest column, skipping past
//            anything pinned that is in the way.
// =========================================================

export const GAP = 16;
export const COL_W = 300;
export const MIN_W = 180;
export const MIN_H = 88;
export const MAX_COLS = 5;
export const GRID = 8;

/** Under this the board gives up on free placement and just stacks. */
export const BOARD_MIN_WIDTH = 640;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedNote {
  note: Note;
  box: Box;
  pinned: boolean;
  z: number;
}

export function snap(value: number, on = true): number {
  return on ? Math.round(value / GRID) * GRID : Math.round(value);
}

export function topZ(notes: Note[]): number {
  let z = 0;
  for (const note of notes) if (note.layout) z = Math.max(z, note.layout.z);
  return z;
}

/** How many columns fit, and how wide each one is. */
export function columnsFor(width: number): { cols: number; colW: number } {
  const cols = Math.max(1, Math.min(MAX_COLS, Math.floor((width + GAP) / (COL_W + GAP))));
  return { cols, colW: Math.floor((width - GAP * (cols - 1)) / cols) };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Lay the board out.
 *
 * `heights` carries what each flowing card actually measured on screen, so the
 * columns come out flush rather than ragged — estimating a card's height from
 * its text length is close enough to look wrong and never close enough to look
 * right. A pinned card ignores it: its height is the one the user dragged.
 */
export function layoutBoard(
  notes: Note[], width: number, heights: Map<string, number>,
): PlacedNote[] {
  const { cols, colW } = columnsFor(width);

  const pinned: PlacedNote[] = [];
  const flowing: Note[] = [];

  for (const note of notes) {
    const l = note.layout;
    if (!l) { flowing.push(note); continue; }
    pinned.push({
      note,
      pinned: true,
      z: l.z,
      // A card dragged on a wide screen must not hang off a narrow one.
      box: {
        x: Math.max(0, Math.min(l.x, Math.max(0, width - l.w))),
        y: Math.max(0, l.y),
        w: Math.min(l.w, width),
        h: l.h,
      },
    });
  }

  const taken: Box[] = pinned.map((p) => p.box);
  const heads = new Array<number>(cols).fill(0);
  const placed: PlacedNote[] = [];

  for (const note of flowing) {
    const h = heights.get(note.id) ?? 168;
    // Shortest column wins, leftmost breaks the tie — which is what makes the
    // order on screen match the order in the list.
    let col = 0;
    for (let i = 1; i < cols; i++) if (heads[i] < heads[col] - 0.5) col = i;

    const x = col * (colW + GAP);
    let y = heads[col];

    // Slide down past anything pinned sitting in this column.
    for (let guard = 0; guard < 200; guard++) {
      const hit = taken.find((b) => overlaps({ x, y, w: colW, h }, b));
      if (!hit) break;
      y = hit.y + hit.h + GAP;
    }

    const box = { x, y, w: colW, h };
    placed.push({ note, box, pinned: false, z: 0 });
    taken.push(box);
    heads[col] = y + h + GAP;
  }

  // Pinned cards paint above flowing ones, and later z above earlier.
  return [...placed, ...pinned].sort((a, b) => a.z - b.z);
}

export function boardHeight(placed: PlacedNote[]): number {
  let bottom = 0;
  for (const p of placed) bottom = Math.max(bottom, p.box.y + p.box.h);
  return bottom + GAP;
}

/** The layout a card gets the first time it is dragged or resized. */
export function pinFrom(box: Box, z: number): NoteLayout {
  return {
    x: snap(box.x),
    y: snap(box.y),
    w: Math.max(MIN_W, snap(box.w)),
    h: Math.max(MIN_H, snap(box.h)),
    z: z + 1,
  };
}
