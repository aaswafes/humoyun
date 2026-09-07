// =========================================================
// The link graph between notes.
//
// Everything here is derived — no column, no table, no write. `[[links]]`
// and the anchors the picker writes already carry the edges; this reads them
// in both directions so a note can show what it points at AND what points
// back at it, which is the half that was missing.
//
// A locked note is never a source. Its body is ciphertext, so there is
// nothing to read, and revealing "this locked note links to X" would leak a
// fact the lock exists to keep.
// =========================================================

import type { Note } from "@/lib/types";
import { outgoingLinks } from "./rich-text";

export interface LinkGraph {
  /** note id → the ids it points at */
  out: Map<string, string[]>;
  /** note id → the ids that point at it */
  in: Map<string, string[]>;
}

/**
 * Every name a note answers to, lowercased, mapped to its id: its title plus
 * each alias. Later notes do not clobber earlier ones — the first note to
 * claim a name keeps it, so adding an alias can never silently steal an
 * existing note's links.
 */
export function buildTitleIndex(notes: Note[]): Map<string, string> {
  const byName = new Map<string, string>();
  for (const note of notes) {
    const names = [note.title, ...(note.aliases ?? [])];
    for (const raw of names) {
      const name = (raw ?? "").trim().toLowerCase();
      if (name && !byName.has(name)) byName.set(name, note.id);
    }
  }
  return byName;
}

/** Both directions in one pass over the notes. */
export function buildLinkGraph(notes: Note[]): LinkGraph {
  const byName = buildTitleIndex(notes);
  const alive = new Set(notes.map((n) => n.id));
  const out = new Map<string, string[]>();
  const inbound = new Map<string, string[]>();

  for (const note of notes) {
    if (note.lock) continue;
    const targets = outgoingLinks(note, byName)
      // A link can point at a note that has since been trashed, and it can
      // point at itself when a title appears in its own body. Neither is an
      // edge worth drawing.
      .filter((id) => id !== note.id && alive.has(id));
    if (!targets.length) continue;

    out.set(note.id, targets);
    for (const id of targets) {
      const list = inbound.get(id);
      if (list) list.push(note.id);
      else inbound.set(id, [note.id]);
    }
  }

  return { out, in: inbound };
}

/** The notes pointing at `id`, in the order they were written. */
export function backlinksOf(graph: LinkGraph, notes: Note[], id: string): Note[] {
  const ids = graph.in.get(id);
  if (!ids?.length) return [];
  const wanted = new Set(ids);
  return notes.filter((n) => wanted.has(n.id));
}

/** The notes `id` points at. */
export function outlinksOf(graph: LinkGraph, notes: Note[], id: string): Note[] {
  const ids = graph.out.get(id);
  if (!ids?.length) return [];
  const wanted = new Set(ids);
  return notes.filter((n) => wanted.has(n.id));
}
