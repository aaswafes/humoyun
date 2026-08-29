"use client";

import * as React from "react";
import { useStore, uid } from "@/lib/store";

// =========================================================
// Library state that has no column in the books table.
//
// Sessions, marginalia, series, the queue, pauses and the yearly goal all
// live under profile.prefs.books — the same loosely-typed bag Settings
// already uses for work_start / hour12. It round-trips through
// updateProfile, so it persists in Supabase and in solo localStorage
// without touching the shared schema.
// =========================================================

const KEY = "books";

export type NoteKind = "highlight" | "thought";
export type LibraryView = "shelf" | "table";
export type GroupBy = "status" | "series" | "author" | "genre" | "topic" | "none";

/** One sitting with a book: what day, how many pages, how long. */
export interface ReadingSession {
  id: string;
  book_id: string;
  date: string;      // yyyy-MM-dd
  pages: number;
  minutes: number;
  end_page: number;  // the bookmark this session left behind
}

/** A quote or a thought, anchored to a page. */
export interface BookNote {
  id: string;
  book_id: string;
  kind: NoteKind;
  page: number | null;
  text: string;
  created_at: string;
}

export interface LibraryPrefs {
  view: LibraryView;
  group: GroupBy;
  /** books to finish this calendar year */
  goal: number;
  sessions: ReadingSession[];
  notes: BookNote[];
  /** book id -> series / collection name */
  series: Record<string, string>;
  /** ordered book ids for the "to read" queue */
  queue: string[];
  /** book id -> the day it should come back */
  paused: Record<string, string>;
}

export const DEFAULT_LIBRARY: LibraryPrefs = {
  view: "shelf",
  group: "status",
  goal: 12,
  sessions: [],
  notes: [],
  series: {},
  queue: [],
  paused: {},
};

// ---------------------------------------------------------
// Parsing — prefs arrives as `unknown`, so nothing is trusted.
// ---------------------------------------------------------
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function stringMap(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    const s = str(val).trim();
    if (s) out[k] = s;
  }
  return out;
}

function parseSessions(v: unknown): ReadingSession[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw): ReadingSession[] => {
    if (!isRecord(raw)) return [];
    const bookId = str(raw.book_id);
    const date = str(raw.date);
    if (!bookId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    return [{
      id: str(raw.id) || uid(),
      book_id: bookId,
      date,
      pages: Math.max(0, Math.round(num(raw.pages))),
      minutes: Math.max(0, Math.round(num(raw.minutes))),
      end_page: Math.max(0, Math.round(num(raw.end_page))),
    }];
  });
}

function parseNotes(v: unknown): BookNote[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw): BookNote[] => {
    if (!isRecord(raw)) return [];
    const bookId = str(raw.book_id);
    const text = str(raw.text);
    if (!bookId || !text.trim()) return [];
    return [{
      id: str(raw.id) || uid(),
      book_id: bookId,
      kind: raw.kind === "thought" ? "thought" : "highlight",
      page: raw.page == null ? null : Math.max(0, Math.round(num(raw.page))),
      text,
      created_at: str(raw.created_at) || new Date().toISOString(),
    }];
  });
}

export function parseLibrary(prefs: Record<string, unknown> | undefined | null): LibraryPrefs {
  const raw = isRecord(prefs) ? prefs[KEY] : undefined;
  if (!isRecord(raw)) return DEFAULT_LIBRARY;
  return {
    view: raw.view === "table" ? "table" : "shelf",
    group:
      raw.group === "series" || raw.group === "author" || raw.group === "genre"
      || raw.group === "topic" || raw.group === "none"
        ? raw.group
        : "status",
    goal: Math.max(0, Math.round(num(raw.goal, DEFAULT_LIBRARY.goal))),
    sessions: parseSessions(raw.sessions),
    notes: parseNotes(raw.notes),
    series: stringMap(raw.series),
    queue: Array.isArray(raw.queue) ? raw.queue.filter((x): x is string => typeof x === "string") : [],
    paused: stringMap(raw.paused),
  };
}

// ---------------------------------------------------------
// Reading
// ---------------------------------------------------------
export function useLibraryPrefs(): LibraryPrefs {
  const prefs = useStore((s) => s.profile?.prefs);
  return React.useMemo(() => parseLibrary(prefs), [prefs]);
}

// ---------------------------------------------------------
// Writing — always re-read the live profile so two quick edits
// (drag a queue row, then rate a book) can never clobber each other.
// ---------------------------------------------------------
function commit(mutate: (prev: LibraryPrefs) => LibraryPrefs): void {
  const { profile, updateProfile } = useStore.getState();
  if (!profile) return;
  const prev = parseLibrary(profile.prefs);
  const next = mutate(prev);
  updateProfile({ prefs: { ...(profile.prefs ?? {}), [KEY]: next } });
}

export const setLibraryView = (view: LibraryView) => commit((p) => ({ ...p, view }));
export const setLibraryGroup = (group: GroupBy) => commit((p) => ({ ...p, group }));
export const setYearGoal = (goal: number) =>
  commit((p) => ({ ...p, goal: Math.max(0, Math.round(goal)) }));

export function addSession(input: {
  bookId: string; date: string; pages: number; minutes: number; endPage: number;
}): ReadingSession {
  const session: ReadingSession = {
    id: uid(),
    book_id: input.bookId,
    date: input.date,
    pages: Math.max(0, Math.round(input.pages)),
    minutes: Math.max(0, Math.round(input.minutes)),
    end_page: Math.max(0, Math.round(input.endPage)),
  };
  commit((p) => ({ ...p, sessions: [...p.sessions, session] }));
  return session;
}

export const removeSession = (id: string) =>
  commit((p) => ({ ...p, sessions: p.sessions.filter((s) => s.id !== id) }));

export function addNote(input: {
  bookId: string; kind: NoteKind; page: number | null; text: string;
}): BookNote {
  const note: BookNote = {
    id: uid(),
    book_id: input.bookId,
    kind: input.kind,
    page: input.page,
    text: input.text,
    created_at: new Date().toISOString(),
  };
  commit((p) => ({ ...p, notes: [...p.notes, note] }));
  return note;
}

export const updateNote = (id: string, changes: Partial<Omit<BookNote, "id" | "book_id">>) =>
  commit((p) => ({
    ...p,
    notes: p.notes.map((n) => (n.id === id ? { ...n, ...changes } : n)),
  }));

export const removeNote = (id: string) =>
  commit((p) => ({ ...p, notes: p.notes.filter((n) => n.id !== id) }));

export function setSeries(bookId: string, name: string): void {
  const trimmed = name.trim();
  commit((p) => {
    const series = { ...p.series };
    if (trimmed) series[bookId] = trimmed;
    else delete series[bookId];
    return { ...p, series };
  });
}

export const setQueue = (queue: string[]) => commit((p) => ({ ...p, queue }));

export const pauseUntil = (bookId: string, date: string) =>
  commit((p) => ({ ...p, paused: { ...p.paused, [bookId]: date } }));

export function clearPause(bookId: string): void {
  commit((p) => {
    const paused = { ...p.paused };
    delete paused[bookId];
    return { ...p, paused };
  });
}

/** Drop everything a deleted book left behind. */
export function forgetBook(bookId: string): void {
  commit((p) => {
    const series = { ...p.series };
    const paused = { ...p.paused };
    delete series[bookId];
    delete paused[bookId];
    return {
      ...p,
      series,
      paused,
      sessions: p.sessions.filter((s) => s.book_id !== bookId),
      notes: p.notes.filter((n) => n.book_id !== bookId),
      queue: p.queue.filter((id) => id !== bookId),
    };
  });
}

// ---------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------
/** Newest sitting first. */
export const sessionsFor = (sessions: ReadingSession[], bookId: string): ReadingSession[] =>
  sessions.filter((s) => s.book_id === bookId).sort((a, b) => b.date.localeCompare(a.date));

/** In page order, unplaced notes last. */
export const notesFor = (notes: BookNote[], bookId: string): BookNote[] =>
  notes
    .filter((n) => n.book_id === bookId)
    .sort((a, b) =>
      (a.page ?? Number.MAX_SAFE_INTEGER) - (b.page ?? Number.MAX_SAFE_INTEGER)
      || a.created_at.localeCompare(b.created_at));

/** Every series name in use, alphabetical — feeds the suggestion list. */
export function seriesNames(series: Record<string, string>): string[] {
  return [...new Set(Object.values(series))].sort((a, b) => a.localeCompare(b));
}

/**
 * Queue order. Anything missing from the stored order joins the back of the
 * line, so a newly added book never vanishes because nobody dragged it yet.
 */
export function orderedQueue<T extends { id: string; order_index: number }>(
  books: T[], queue: string[],
): T[] {
  const rank = new Map(queue.map((id, i) => [id, i]));
  return [...books].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.order_index - b.order_index;
  });
}
