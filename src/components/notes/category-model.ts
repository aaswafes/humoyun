import type { Note, NoteCategory, Tint } from "@/lib/types";
import { TINTS } from "@/lib/types";

// =========================================================
// Categories — the shelves a note sits on.
//
// `kind` is one word for what a note *is*. A category is where it belongs, and
// a note belongs to as many as apply: a highlight can be Books and Islam and
// Quotes at once. That is the whole difference, and it is why this is an array
// on the note rather than a second single-valued column.
//
// The name is what is stored on the note. The row in `noteCategories` only
// carries colour, icon and order — so a category that has no row still works,
// which is what makes typing a new one straight into the picker safe.
// =========================================================

export interface CategorySeed {
  name: string;
  icon: string;
  color: Tint;
}

/**
 * Offered once, on an empty vocabulary. Not created behind the user's back:
 * a shelf they never asked for is clutter, and the picker can always take a
 * name it has never seen.
 */
export const STARTER_CATEGORIES: CategorySeed[] = [
  { name: "Books", icon: "book", color: "amber" },
  { name: "Films & Anime", icon: "film", color: "violet" },
  { name: "Islam", icon: "moon", color: "emerald" },
  { name: "Study", icon: "graduation", color: "blue" },
  { name: "Ideas", icon: "lightbulb", color: "orange" },
  { name: "People", icon: "users", color: "pink" },
  { name: "Work", icon: "briefcase", color: "teal" },
  { name: "Health", icon: "heart", color: "red" },
  { name: "Quotes", icon: "quote", color: "brown" },
  { name: "Language", icon: "languages", color: "slate" },
];

// ---------------------------------------------------------
// Resolving a name to its look
// ---------------------------------------------------------

export interface CategoryLook {
  name: string;
  color: Tint;
  icon: string | null;
  /** true when nothing in `noteCategories` claims this name */
  loose: boolean;
}

/**
 * A stable colour for a category nobody has given one to.
 *
 * Hashing the name rather than using its position means the colour does not
 * change when another category is added above it — a graph cluster that
 * changed colour every time you renamed something else would be unreadable.
 */
function hashTint(name: string): Tint {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

export interface CategoryIndex {
  /** every category with a row, in the order they should be offered */
  known: NoteCategory[];
  look: (name: string) => CategoryLook;
  byName: Map<string, NoteCategory>;
}

const norm = (name: string) => name.trim().toLowerCase();

export function buildCategoryIndex(categories: NoteCategory[]): CategoryIndex {
  const known = [...categories].sort(
    (a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name),
  );
  const byName = new Map(known.map((c) => [norm(c.name), c]));

  return {
    known,
    byName,
    look(name) {
      const row = byName.get(norm(name));
      if (row) return { name: row.name, color: row.color, icon: row.icon, loose: false };
      return { name, color: hashTint(norm(name)), icon: null, loose: true };
    },
  };
}

// ---------------------------------------------------------
// Counting
// ---------------------------------------------------------

export interface CategoryCount {
  name: string;
  count: number;
  color: Tint;
  loose: boolean;
}

/**
 * Every category actually in use, plus every one with a row even when empty —
 * an empty shelf you created still has to be pickable and still has to appear
 * in the graph legend, or it looks like the app forgot it.
 */
export function categoryCounts(notes: Note[], idx: CategoryIndex): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const raw of note.categories) {
      const name = raw.trim();
      if (name) counts.set(norm(name), (counts.get(norm(name)) ?? 0) + 1);
    }
  }

  const seen = new Set<string>();
  const out: CategoryCount[] = [];

  for (const row of idx.known) {
    seen.add(norm(row.name));
    out.push({ name: row.name, count: counts.get(norm(row.name)) ?? 0, color: row.color, loose: false });
  }
  for (const [key, count] of counts) {
    if (seen.has(key)) continue;
    // Only a note knows the casing it was written with; the map key is lowered.
    const original = notes
      .flatMap((n) => n.categories)
      .find((c) => norm(c) === key) ?? key;
    out.push({ name: original, count, color: idx.look(original).color, loose: true });
  }

  return out;
}

/** The names that exist at all — what the picker offers before you type. */
export function allCategoryNames(notes: Note[], idx: CategoryIndex): string[] {
  return categoryCounts(notes, idx).map((c) => c.name);
}

// ---------------------------------------------------------
// Writing
// ---------------------------------------------------------

/** Add or remove one, case-insensitively, keeping the order they were picked. */
export function toggleCategory(current: string[], name: string): string[] {
  const key = norm(name);
  return current.some((c) => norm(c) === key)
    ? current.filter((c) => norm(c) !== key)
    : [...current, name.trim()];
}

export function hasCategory(current: string[], name: string): boolean {
  const key = norm(name);
  return current.some((c) => norm(c) === key);
}

/** True when a note carries every category asked for. AND, not OR: narrowing. */
export function matchesCategories(note: Note, wanted: string[]): boolean {
  if (!wanted.length) return true;
  return wanted.every((w) => hasCategory(note.categories, w));
}
