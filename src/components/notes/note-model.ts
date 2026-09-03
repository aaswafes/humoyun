import { formatClock, formatDate, friendlyDate, todayISO, yearOf } from "@/lib/date";
import { NOTE_KIND_LABELS, type Book, type Goal, type MapNode, type Media, type Note, type NoteKind, type Task } from "@/lib/types";
import { hasCategory } from "./category-model";
import { noteText } from "./rich-text";

// =========================================================
// Where a note came from.
//
// A note carries six possible links — a book, a title, a task, a goal, a map
// node, a day — but only one of them is its home. Resolving that in one place,
// in one order, is what keeps the chip on the card, the summary in the sheet
// and the source filter telling the same story.
// =========================================================

export type SourceKind = "book" | "media" | "task" | "goal" | "node" | "day" | "none";

export interface SourceIndex {
  books: Map<string, Book>;
  media: Map<string, Media>;
  tasks: Map<string, Task>;
  goals: Map<string, Goal>;
  nodes: Map<string, MapNode>;
}

export function buildSourceIndex(
  books: Book[], media: Media[], tasks: Task[], goals: Goal[], nodes: MapNode[],
): SourceIndex {
  return {
    books: new Map(books.map((b) => [b.id, b])),
    media: new Map(media.map((m) => [m.id, m])),
    tasks: new Map(tasks.map((t) => [t.id, t])),
    goals: new Map(goals.map((g) => [g.id, g])),
    nodes: new Map(nodes.map((n) => [n.id, n])),
  };
}

export interface SourceRef {
  kind: SourceKind;
  /** the row id, or the ISO date when the source is a day */
  id: string | null;
  /** what the chip says */
  label: string;
  /** the page the chip opens; null when the note stands alone */
  href: string | null;
  /** true when the link points at a row that is no longer there */
  missing: boolean;
}

const STANDALONE: SourceRef = {
  kind: "none", id: null, label: "Standalone", href: null, missing: false,
};

/** "Today" near at hand, a dated day further out — and never a bare day from another year. */
export function dayLabel(iso: string): string {
  if (yearOf(iso) !== yearOf(todayISO())) return formatDate(iso, { year: true });
  return friendlyDate(iso);
}

export function resolveSource(note: Note, idx: SourceIndex): SourceRef {
  if (note.book_id) {
    const book = idx.books.get(note.book_id);
    return {
      kind: "book", id: note.book_id, href: "/books",
      label: book?.title ?? "Book removed", missing: !book,
    };
  }
  if (note.media_id) {
    const item = idx.media.get(note.media_id);
    // YouTube shares the media table but lives on its own shelf.
    const href = item && (item.kind === "youtube" || item.kind === "playlist") ? "/youtube" : "/watch";
    return {
      kind: "media", id: note.media_id, href,
      label: item?.title ?? "Title removed", missing: !item,
    };
  }
  if (note.task_id) {
    const task = idx.tasks.get(note.task_id);
    return {
      kind: "task", id: note.task_id, href: "/inbox",
      label: task?.title || (task ? "Untitled task" : "Task removed"), missing: !task,
    };
  }
  if (note.goal_id) {
    const goal = idx.goals.get(note.goal_id);
    return {
      kind: "goal", id: note.goal_id, href: "/goals",
      label: goal?.title ?? "Goal removed", missing: !goal,
    };
  }
  if (note.node_id) {
    const node = idx.nodes.get(note.node_id);
    return {
      kind: "node", id: note.node_id, href: "/map",
      label: node?.title ?? "Node removed", missing: !node,
    };
  }
  if (note.date) {
    return { kind: "day", id: note.date, label: dayLabel(note.date), href: "/calendar", missing: false };
  }
  return STANDALONE;
}

export function buildSourceRefs(notes: Note[], idx: SourceIndex): Map<string, SourceRef> {
  return new Map(notes.map((n) => [n.id, resolveSource(n, idx)]));
}

// ---------------------------------------------------------
// Locator — the same integer means a page, a minute or an episode
// ---------------------------------------------------------

/** True when the note's source gives its locator a meaning worth typing. */
export function locatorUnit(
  ref: SourceRef, idx: SourceIndex, mediaId: string | null,
): "page" | "minute" | "episode" | null {
  if (ref.kind === "book") return "page";
  if (ref.kind === "media") {
    const item = mediaId ? idx.media.get(mediaId) : undefined;
    // A film is a one-episode title, so a number against it is a timestamp.
    return !item || item.total_episodes <= 1 ? "minute" : "episode";
  }
  return null;
}

export const LOCATOR_LABELS = { page: "Page", minute: "Minute", episode: "Episode" } as const;

export function locatorLabel(note: Note, ref: SourceRef, idx: SourceIndex): string | null {
  if (note.locator == null) return null;
  const unit = locatorUnit(ref, idx, note.media_id);
  if (unit === "page") return `p. ${note.locator}`;
  if (unit === "episode") return `ep. ${note.locator}`;
  if (unit === "minute") return formatClock(note.locator * 60);
  return String(note.locator);
}

// ---------------------------------------------------------
// Reading a note at a glance
// ---------------------------------------------------------

/**
 * A note's words, whichever shape its body is stored in.
 *
 * Everything below reads through here rather than touching `body`, so a note
 * written in the rich editor and one written before it existed summarise,
 * search and sort identically.
 */
export function notePlain(note: Note): string {
  return noteText(note);
}

/** The first line with something on it — what a note is called when it has no title. */
export function noteExcerpt(body: string): string {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Title if there is one, else the opening line. A daily note that has not been
 * written in yet falls back to its day — anything else would read as a blank.
 */
export function noteHeading(note: Note, ref: SourceRef): string {
  const title = note.title?.trim();
  if (title) return title;
  const first = noteExcerpt(notePlain(note));
  if (first) return first;
  if (ref.kind === "day") return ref.label;
  return "Empty note";
}

/** The body with the heading line removed, so a card never says the same thing twice. */
export function noteRest(note: Note): string {
  const plain = notePlain(note);
  if (note.title?.trim()) return plain;
  const first = noteExcerpt(plain);
  if (!first) return "";
  const at = plain.indexOf(first);
  return plain.slice(at + first.length).replace(/^\s*\n/, "");
}

/** The day a note belongs to: its own date when it has one, else the day it was written. */
export function noteDay(note: Note): string {
  return note.date ?? note.created_at.slice(0, 10);
}

// ---------------------------------------------------------
// Filtering
// ---------------------------------------------------------

export type SourceFilter = "all" | "book" | "media" | "day" | "work" | "none";

export const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "Anywhere" },
  { value: "book", label: "From books" },
  { value: "media", label: "From films" },
  { value: "day", label: "Daily" },
  { value: "work", label: "Tasks, goals & map" },
  { value: "none", label: "Standalone" },
];

export function matchesSourceFilter(kind: SourceKind, filter: SourceFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "book": return kind === "book";
    case "media": return kind === "media";
    case "day": return kind === "day";
    case "work": return kind === "task" || kind === "goal" || kind === "node";
    case "none": return kind === "none";
  }
}

export interface NoteFilters {
  query: string;
  kind: NoteKind | "all";
  source: SourceFilter;
  tag: string | null;
  /** every one of these must be on the note — narrowing, not widening */
  categories: string[];
}

export const NO_FILTERS: NoteFilters = {
  query: "", kind: "all", source: "all", tag: null, categories: [],
};

export function filterNotes(
  notes: Note[], refs: Map<string, SourceRef>, f: NoteFilters,
): Note[] {
  const q = f.query.trim().toLowerCase();
  return notes.filter((note) => {
    if (f.kind !== "all" && note.kind !== f.kind) return false;
    if (f.tag && !note.tags.includes(f.tag)) return false;
    for (const category of f.categories) {
      if (!hasCategory(note.categories, category)) return false;
    }
    if (f.source !== "all") {
      const ref = refs.get(note.id);
      if (!ref || !matchesSourceFilter(ref.kind, f.source)) return false;
    }
    if (!q) return true;
    // Searching the stored body would match style attributes, so a note
    // written in Georgia would answer to "georgia".
    return (note.title ?? "").toLowerCase().includes(q)
      || notePlain(note).toLowerCase().includes(q);
  });
}

/** Templates are notes, and every list on this surface starts by setting them aside. */
export function writtenNotes(notes: Note[]): Note[] {
  return notes.filter((n) => !n.is_template);
}

/**
 * A frame on the canvas is a box you drop other things into. It is a note
 * only because the board needs somewhere to keep its position and its label —
 * nobody wrote it, so it does not belong in a list of what you have written,
 * in the count, or as a dot in the graph.
 */
export function isScenery(note: Note): boolean {
  return note.layout?.style === "frame";
}

/** Everything written: no templates, no scenery. */
export function readableNotes(notes: Note[]): Note[] {
  return notes.filter((n) => !n.is_template && !isScenery(n));
}

export function templateNotes(notes: Note[]): Note[] {
  return notes.filter((n) => n.is_template);
}

/** Pinned first, then newest. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

/** How many of the three folded filters are actually narrowing the list. */
export function activeFilterCount(f: NoteFilters): number {
  return (f.kind !== "all" ? 1 : 0) + (f.source !== "all" ? 1 : 0)
    + (f.tag ? 1 : 0) + f.categories.length;
}

/** What the one filter control says about itself when it is closed. */
export function filterSummary(f: NoteFilters): string {
  const parts: string[] = [];
  if (f.categories.length === 1) parts.push(f.categories[0]);
  else if (f.categories.length > 1) parts.push(f.categories.length + " categories");
  if (f.kind !== "all") parts.push(NOTE_KIND_LABELS[f.kind]);
  if (f.source !== "all") {
    parts.push(SOURCE_FILTERS.find((s) => s.value === f.source)?.label ?? "");
  }
  if (f.tag) parts.push(`#${f.tag}`);
  return parts.length ? parts.join(" · ") : "All notes";
}

// ---------------------------------------------------------
// Tags
// ---------------------------------------------------------

/** Every tag in use, most-written first — the order the filter menu wants. */
export function tagCounts(notes: Note[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const key = tag.trim();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** How many notes hang off something rather than standing alone. */
export function linkedCount(refs: Map<string, SourceRef>): number {
  let n = 0;
  for (const ref of refs.values()) if (ref.kind !== "none") n += 1;
  return n;
}
