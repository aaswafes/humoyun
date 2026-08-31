"use client";

import * as React from "react";
import {
  BookOpen, CalendarDays, ChevronRight, Clapperboard, FileText, Highlighter,
  Lightbulb, ListTodo, Network, NotebookPen, Quote, StickyNote, Sun, Target, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { NoteKind } from "@/lib/types";
import type { SourceKind } from "./note-model";

// =========================================================
// The small controls the Notes surface builds itself from.
//
// The watch shelf has its own copy of the folding and sticky-memory pieces.
// They are duplicated rather than shared because the shared kit is off limits
// to feature folders — not because two behaviours were wanted.
// =========================================================

export const NOTE_KIND_ICONS: Record<NoteKind, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  highlight: Highlighter,
  thought: Quote,
  daily: Sun,
  idea: Lightbulb,
  summary: FileText,
};

export const SOURCE_ICONS: Record<SourceKind, React.ComponentType<{ className?: string }>> = {
  book: BookOpen,
  media: Clapperboard,
  task: ListTodo,
  goal: Target,
  node: Network,
  day: CalendarDays,
  none: NotebookPen,
};

// ---------------------------------------------------------
// Sticky open/closed memory, one answer per surface
// ---------------------------------------------------------
const stickyListeners = new Set<() => void>();
// Private mode throws on write. The fold still has to open, so this session's
// answers live here too and are read first.
const stickyMemory = new Map<string, string>();

function subscribeSticky(notify: () => void) {
  stickyListeners.add(notify);
  return () => { stickyListeners.delete(notify); };
}

function readSticky(key: string): string | null {
  const cached = stickyMemory.get(key);
  if (cached !== undefined) return cached;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

/**
 * localStorage is an external store, so it is read through useSyncExternalStore
 * rather than copied into state by an effect: the server render answers with
 * the default, React swaps in the remembered answer as it hydrates, and two
 * folds sharing a key never drift apart.
 */
export function useSticky(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const stored = React.useSyncExternalStore(subscribeSticky, () => readSticky(key), () => null);

  const set = React.useCallback((next: boolean) => {
    const value = next ? "1" : "0";
    stickyMemory.set(key, value);
    try { window.localStorage.setItem(key, value); } catch { /* the fold still opens, it just forgets */ }
    stickyListeners.forEach((notify) => notify());
  }, [key]);

  return [stored === "1" ? true : stored === "0" ? false : fallback, set];
}

/** Remembers one choice out of a known set — a view switcher, a sort key. */
export function useStickyChoice<T extends string>(
  key: string, fallback: T, allowed: readonly T[],
): [T, (next: T) => void] {
  // localStorage is an external store, so read it as one. Loading it with a
  // setState inside an effect renders twice on every mount and trips the
  // cascading-render rule; useSyncExternalStore gives the server the fallback
  // and the client the stored value with no second pass.
  const stored = React.useSyncExternalStore(
    subscribeSticky,
    () => {
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    () => null,
  );

  const set = React.useCallback((next: T) => {
    try { window.localStorage.setItem(key, next); } catch { /* private mode */ }
    stickyListeners.forEach((notify) => notify());
  }, [key]);

  const value = stored && (allowed as readonly string[]).includes(stored)
    ? (stored as T)
    : fallback;

  return [value, set];
}

/**
 * A folded section: a quiet label, a summary that says what is inside, a
 * chevron. Never a dead end — the summary carries the value of the panel, so
 * the user knows whether opening it is worth it.
 */
export function Disclosure({
  storageKey, label, summary, defaultOpen = false, action, children, className, bodyClassName,
}: {
  storageKey: string;
  label: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** sits outside the toggle, so a control here never nests in a button */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [open, setOpen] = useSticky(storageKey, defaultOpen);

  return (
    <section className={className}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn(
            "-mx-1 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1 py-2 text-left",
            "transition-colors duration-150 hover:bg-hover",
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
              open && "rotate-90",
            )}
          />
          <span className="shrink-0 text-[12.5px] font-medium text-ink-2">{label}</span>
          {summary != null && (
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3 tnum">{summary}</span>
          )}
        </button>
        {action}
      </div>

      {open && (
        <div
          className={cn("pb-1", bodyClassName)}
          style={{ animation: "hm-slide-up 200ms var(--ease-out-apple) both" }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------
// Tags
// ---------------------------------------------------------

/** Read-only tag pill. Cards are laid out around buttons, so this never is one. */
export function TagPill({ tag, className }: { tag: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] max-w-[120px] items-center rounded-[5px] px-1.5",
        "text-[11px] font-medium leading-none text-ink-3",
        className,
      )}
      style={{ background: "var(--hover)" }}
    >
      <span className="truncate">#{tag}</span>
    </span>
  );
}

/**
 * Type a tag, press Enter. Every tag already written on another note is
 * offered, because "sirah" and "Sirah" as two tags helps nobody.
 */
export function TagEditor({
  tags, onChange, suggestions,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = React.useState("");
  const listId = React.useId();
  const inputId = React.useId();

  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag || tags.includes(tag)) { setDraft(""); return; }
    onChange([...tags, tag]);
    setDraft("");
  };

  const free = suggestions.filter((s) => !tags.includes(s));

  return (
    <div>
      {tags.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag}>
              <span
                className="inline-flex h-[22px] items-center gap-1 rounded-[6px] pl-2 pr-0.5 text-[12px] text-ink-2"
                style={{ background: "var(--hover)" }}
              >
                <span className="max-w-[140px] truncate">#{tag}</span>
                <button
                  type="button"
                  aria-label={`Remove the tag ${tag}`}
                  onClick={() => onChange(tags.filter((t) => t !== tag))}
                  className="-my-1 grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-[6px] text-ink-4 transition-colors hover:text-ink"
                >
                  <X className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <label htmlFor={inputId} className="sr-only">Add a tag</label>
      <input
        id={inputId}
        list={free.length ? listId : undefined}
        value={draft}
        placeholder="Add a tag, press Enter"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => add(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(draft); }
          if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        className={cn(
          "h-8 w-full rounded-md border border-line bg-transparent px-2.5 text-[13px] text-ink",
          "transition-[border-color,box-shadow] duration-150 placeholder:text-ink-4",
          "hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft",
        )}
      />
      {free.length > 0 && (
        <datalist id={listId}>
          {free.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </div>
  );
}
