"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, Check, ExternalLink, LayoutTemplate, Lock, LockOpen,
  MoreHorizontal, Palette, Pin, Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatClock } from "@/lib/date";
import { NOTE_KINDS, NOTE_KIND_LABELS, type Note, type Tint } from "@/lib/types";
import { IconButton, Kbd, SectionLabel } from "@/components/ui/primitives";
import { MenuItem, MenuSeparator, Popover, TintPicker, useMounted } from "@/components/ui/overlays";
import { Disclosure, NOTE_KIND_ICONS, TagEditor } from "./note-fields";
import { useDeleteNote } from "./note-actions";
import { useOpenSource } from "./note-source-chip";
import { SourcePicker } from "./source-picker";
import { buildCategoryIndex } from "./category-model";
import { CategoryPicker, CategoryRow } from "./category-picker";
import { RichEditor } from "./rich-editor";
import { bodyAsHtml } from "./rich-text";
import { LockDialog, UnlockDialog, useRemoveLock } from "./note-lock";
import { passwordFor, relockBody } from "./note-crypto";
import {
  LOCATOR_LABELS, buildSourceIndex, locatorUnit, noteHeading, resolveSource, tagCounts,
} from "./note-model";

// =========================================================
// Writing a note.
//
// The whole window, because that is what writing is. A note opened to be read
// for four seconds and a note opened to be written in for forty minutes are
// the same surface, and the second one is the one that decides how wide it
// should be — a 620px drawer with a Word toolbar folded into four rows was
// answering the wrong question.
//
// The column is capped at a readable measure and centred; the space either
// side of it is the point, not waste.
// =========================================================

/** How long the editor waits before writing. Long enough to type through, short enough to trust. */
const AUTOSAVE_MS = 600;

const MEASURE = "mx-auto w-full max-w-[820px] px-6 sm:px-10";

export function NoteEditor({
  noteId, focusBody, onClose, onOpenNote,
}: {
  noteId: string;
  /** a brand-new note opens with the cursor already in the body */
  focusBody?: boolean;
  onClose: () => void;
  /** following a [[link]] swaps the note rather than opening a second editor */
  onOpenNote?: (id: string) => void;
}) {
  const note = useStore((s) => s.notes.find((n) => n.id === noteId) ?? null);
  const mounted = useMounted();
  const hostRef = React.useRef<HTMLDivElement>(null);

  // Give the page back to whatever opened the editor.
  React.useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Escape inside a menu closes the menu; only the bare press leaves.
        if ((e.target as Element)?.closest?.('[role="dialog"] [role="dialog"]')) return;
        onClose();
        return;
      }
      if (e.key !== "Tab" || !hostRef.current) return;
      // The editor covers the window, so focus must not wander behind it.
      const focusable = hostRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted || !note) return null;

  return createPortal(
    <div
      ref={hostRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Editing ${note.title?.trim() || "an untitled note"}`}
      className="fixed inset-0 z-[100] flex flex-col bg-canvas anim-fade"
    >
      <NoteEditorBody
        key={note.id}
        note={note}
        focusBody={focusBody}
        onClose={onClose}
        onOpenNote={onOpenNote}
      />
    </div>,
    document.body,
  );
}

function NoteEditorBody({
  note, focusBody, onClose, onOpenNote,
}: {
  note: Note;
  focusBody?: boolean;
  onClose: () => void;
  onOpenNote?: (id: string) => void;
}) {
  const notes = useStore((s) => s.notes);
  const categories = useStore((s) => s.noteCategories);
  const books = useStore((s) => s.books);
  const media = useStore((s) => s.media);
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const nodes = useStore((s) => s.nodes);
  const patch = useStore((s) => s.patch);
  const insert = useStore((s) => s.insert);
  const toast = useStore((s) => s.toast);
  const openSource = useOpenSource();

  const [toolbarSlot, setToolbarSlot] = React.useState<HTMLElement | null>(null);
  const [title, setTitle] = React.useState(note.title ?? "");
  /** The decrypted body of a locked note, once the password has been given. */
  const [opened, setOpened] = React.useState<string | null>(null);
  const [body, setBody] = React.useState(() => (note.lock ? "" : bodyAsHtml(note)));
  // A note written before the rich editor existed is only converted once it is
  // actually edited. Opening one to read it must not rewrite it.
  const [touched, setTouched] = React.useState(false);
  const [locking, setLocking] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const removeLock = useRemoveLock();

  const locked = note.lock != null;
  const readable = !locked || opened !== null;

  const idx = React.useMemo(
    () => buildSourceIndex(books, media, tasks, goals, nodes),
    [books, media, tasks, goals, nodes]);
  const catIdx = React.useMemo(() => buildCategoryIndex(categories), [categories]);
  const refer = React.useMemo(() => resolveSource(note, idx), [note, idx]);
  const unit = locatorUnit(refer, idx, note.media_id);
  const suggestions = React.useMemo(() => tagCounts(notes).map((t) => t.tag), [notes]);

  const noteId = note.id;
  const nextTitle = title.trim() || null;
  // A locked note's stored body is ciphertext, so "has it changed" is measured
  // against what was decrypted, never against what is in the row.
  const original = locked ? opened ?? "" : bodyAsHtml(note);
  const bodyChanged = touched && (body !== original || (!locked && note.format !== "html"));
  const dirty = nextTitle !== note.title || bodyChanged;

  // Closing mid-keystroke must not lose the keystroke, so the pending write is
  // kept where the unmount flush can still find it.
  const pending = React.useRef<{ title?: string | null; body?: string } | null>(null);

  /**
   * The only place a note is written.
   *
   * One writer rather than two because a locked note has to be sealed again
   * before it can be stored, and doing that in both the timer and the unmount
   * is exactly how one of them ends up saving plaintext. If the password is
   * not in memory the body is left alone entirely — a locked note is never
   * downgraded to readable by an autosave.
   */
  const commit = React.useCallback(async () => {
    const next = pending.current;
    pending.current = null;
    if (!next) return;

    const changes: Partial<Note> = {};
    if ("title" in next) changes.title = next.title ?? null;

    if (next.body !== undefined) {
      if (note.lock) {
        const password = passwordFor(noteId);
        if (password) {
          const sealed = await relockBody(next.body, password, note.lock);
          changes.body = sealed.body;
          changes.lock = sealed.lock;
          changes.format = "html";
        }
      } else {
        changes.body = next.body;
        changes.format = "html";
      }
    }

    if (Object.keys(changes).length) patch("notes", noteId, changes);
  }, [noteId, note.lock, patch]);

  // Held in a ref so the unmount flush does not fire every time commit is
  // rebuilt — which would save halfway through a sentence.
  const commitRef = React.useRef(commit);
  React.useEffect(() => { commitRef.current = commit; }, [commit]);

  React.useEffect(() => {
    const next: { title?: string | null; body?: string } = {};
    if (nextTitle !== note.title) next.title = nextTitle;
    if (bodyChanged) next.body = body;
    pending.current = Object.keys(next).length ? next : null;
    if (!pending.current) return;
    const timer = setTimeout(() => { void commitRef.current(); }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [nextTitle, body, bodyChanged, note.title]);

  React.useEffect(() => () => { void commitRef.current(); }, []);

  /**
   * A note lives in one place, so a new source replaces the old one — and the
   * locator goes with it: page 128 of a book is not minute 128 of a film.
   */
  const applySource = (changes: Partial<Note>) =>
    patch("notes", noteId, { ...changes, locator: null });

  const removeNote = useDeleteNote();

  const deleteNote = () => {
    pending.current = null;   // do not resurrect the row on unmount
    removeNote(note);
    onClose();
  };

  const saveAsTemplate = () => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = note;
    void _id; void _c; void _u;
    insert("notes", {
      ...rest,
      title: nextTitle ?? note.title,
      body: touched ? body : note.body,
      format: touched ? "html" : note.format,
      is_template: true,
      pinned: false,
      layout: null,
      date: null,
    });
    toast({ title: "Saved as a template", description: "Find it under New note." });
  };

  const Kind = NOTE_KIND_ICONS[note.kind];
  const tagSummary = note.tags.length ? note.tags.map((t) => `#${t}`).join("  ") : "None yet";

  return (
    <>
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2 px-3 hairline-b">
        <IconButton label="Close the editor" size="md" onClick={onClose}>
          <ArrowLeft />
        </IconButton>

        <SectionLabel className="shrink-0">
          {note.is_template ? "Template" : NOTE_KIND_LABELS[note.kind]}
        </SectionLabel>

        <p
          aria-live="polite"
          className="flex min-w-0 flex-1 items-center gap-1 text-[11.5px] text-ink-4"
        >
          {dirty ? "Saving…" : (<><Check className="size-3" aria-hidden />Saved</>)}
        </p>

        <span className="hidden items-center gap-1 text-[11px] text-ink-4 sm:flex">
          <Kbd>Esc</Kbd> to close
        </span>

        <IconButton
          label={note.pinned ? "Unpin this note" : "Pin this note to the top"}
          size="md"
          aria-pressed={note.pinned}
          active={note.pinned}
          onClick={() => patch("notes", noteId, { pinned: !note.pinned })}
        >
          <Pin />
        </IconButton>

        <Popover
          align="end"
          className="w-auto"
          trigger={<IconButton label={`Paper colour: ${note.color ?? "none"}`} size="md"><Palette /></IconButton>}
        >
          {(close) => (
            <TintPicker
              allowNone
              value={note.color}
              onChange={(color: Tint | null) => { patch("notes", noteId, { color }); close(); }}
            />
          )}
        </Popover>

        <Popover
          align="end"
          className="w-[228px]"
          trigger={<IconButton label="Note options" size="md"><MoreHorizontal /></IconButton>}
        >
          {(close) => (
            <>
              {locked ? (
                <MenuItem icon={LockOpen} onClick={() => { setRemoving(true); close(); }}>
                  Remove the lock
                </MenuItem>
              ) : (
                <MenuItem icon={Lock} onClick={() => { setLocking(true); close(); }}>
                  Lock with a password
                </MenuItem>
              )}

              {/* A template made from a locked note would be a template of
                  ciphertext, so it is simply not offered. */}
              {!locked && (
                <MenuItem
                  icon={LayoutTemplate}
                  checked={note.is_template}
                  onClick={() => {
                    if (note.is_template) patch("notes", noteId, { is_template: false });
                    else saveAsTemplate();
                    close();
                  }}
                >
                  {note.is_template ? "Turn back into a note" : "Save as a template"}
                </MenuItem>
              )}
              {refer.href && !refer.missing && (
                <MenuItem icon={ExternalLink} onClick={() => { openSource(refer); close(); }}>
                  Open {refer.label}
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem icon={Trash2} danger onClick={() => { deleteNote(); close(); }}>
                Delete note
              </MenuItem>
            </>
          )}
        </Popover>
      </header>

      <LockDialog note={note} open={locking} onClose={() => setLocking(false)} />
      <UnlockDialog
        note={note}
        open={removing}
        onClose={() => setRemoving(false)}
        onUnlocked={(html) => {
          setRemoving(false);
          removeLock(note, html);
          setOpened(html);
          setBody(html);
        }}
      />

      {/* Nothing of a locked note is drawn until it is open — not the body,
          not a skeleton of it, not its length. */}
      {!readable ? (
        <div className="grid min-h-0 flex-1 place-items-center px-6">
          <div className="text-center">
            <Lock className="mx-auto size-5 text-ink-4" aria-hidden />
            <p className="mt-3 text-[13.5px] text-ink-2">This note is locked.</p>
            <p className="mt-1 text-[12.5px] text-ink-4">
              {note.lock?.hint ? `Hint: ${note.lock.hint}` : "Enter the password to read it."}
            </p>
          </div>
          <UnlockDialog
            note={note}
            open
            onClose={onClose}
            onUnlocked={(html) => { setOpened(html); setBody(html); setTouched(false); }}
          />
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn(MEASURE, "pb-32 pt-10")}>
          <input
            aria-label="Title"
            placeholder="Untitled"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            autoFocus={!focusBody}
            className={cn(
              "w-full bg-transparent text-[30px] font-semibold leading-tight tracking-[-0.02em]",
              "text-ink outline-none placeholder:text-ink-4",
            )}
          />

          {/* Everything about where this note belongs, on one quiet line. */}
          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            <Popover
              className="w-[184px]"
              trigger={
                <button
                  type="button"
                  aria-label={`Kind: ${NOTE_KIND_LABELS[note.kind]}. Change it`}
                  className={cn(
                    "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5",
                    "text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink",
                  )}
                >
                  <Kind className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                  {NOTE_KIND_LABELS[note.kind]}
                </button>
              }
            >
              {(close) => (
                <>
                  {NOTE_KINDS.map((kind) => {
                    const Glyph = NOTE_KIND_ICONS[kind];
                    return (
                      <MenuItem
                        key={kind}
                        icon={Glyph}
                        checked={kind === note.kind}
                        onClick={() => { patch("notes", noteId, { kind }); close(); }}
                      >
                        {NOTE_KIND_LABELS[kind]}
                      </MenuItem>
                    );
                  })}
                </>
              )}
            </Popover>

            <CategoryPicker
              value={note.categories}
              onChange={(next) => patch("notes", noteId, { categories: next })}
              notes={notes}
              index={catIdx}
            />

            <SourcePicker refer={refer} onChange={applySource} />

            {unit && (
              <LocatorField
                unit={unit}
                value={note.locator}
                onChange={(next) => patch("notes", noteId, { locator: next })}
              />
            )}
          </div>

          <CategoryRow
            value={note.categories}
            onChange={(next) => patch("notes", noteId, { categories: next })}
            index={catIdx}
            className="mt-3"
          />
        </div>

        {/* The formatting bar sticks to the top of the scroller while the text
            it acts on stays in the column. `toolbarPortal` is what lets the
            editor put its bar here and its writing surface below, without a
            second copy of its state living in this file. */}
        <div className="sticky top-0 z-20 bg-canvas/85 py-2 backdrop-blur-md hairline-b">
          <div ref={setToolbarSlot} className={MEASURE} />
        </div>

        <div className={cn(MEASURE, "pb-24 pt-6")}>
          <RichEditor
            value={body}
            onChange={(html) => { setBody(html); setTouched(true); }}
            notes={notes}
            currentId={noteId}
            onOpenNote={onOpenNote}
            autoFocus={focusBody}
            minHeight={440}
            toolbarPortal={toolbarSlot}
            placeholder={note.is_template
              ? "Write the shape of the note. {{date}} and {{title}} are filled in when it is used."
              : "Write it down…"}
            ariaLabel={`Body of ${noteHeading(note, refer)}`}
          />

          <Disclosure
            storageKey="humoyun.notes.editor.tags"
            label="Tags"
            summary={tagSummary}
            className="mt-10 hairline-t"
            bodyClassName="pb-2 pt-2"
          >
            <TagEditor
              tags={note.tags}
              suggestions={suggestions}
              onChange={(tags) => patch("notes", noteId, { tags })}
            />
          </Disclosure>
        </div>
      </div>
      )}
    </>
  );
}

/**
 * The one number that says where in a book or a title the note came from.
 * A film has no episodes, so the same integer reads back as a timestamp.
 */
function LocatorField({
  unit, value, onChange,
}: {
  unit: "page" | "minute" | "episode";
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const [draft, setDraft] = React.useState(value == null ? "" : String(value));
  const [seen, setSeen] = React.useState(value);
  const inputId = React.useId();

  // The store owns the number; edits made anywhere else have to show through.
  if (seen !== value) {
    setSeen(value);
    setDraft(value == null ? "" : String(value));
  }

  const commit = () => onChange(draft.trim() === "" ? null : Number(draft));

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-2.5 text-[12px]",
        "transition-[border-color,box-shadow] duration-150",
        "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft",
      )}
    >
      <label htmlFor={inputId} className="cursor-pointer text-ink-3">{LOCATOR_LABELS[unit]}</label>
      <input
        id={inputId}
        inputMode="numeric"
        value={draft}
        placeholder="—"
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="w-[46px] bg-transparent text-ink outline-none tnum placeholder:text-ink-4"
      />
      {unit === "minute" && value != null && (
        <span className="text-ink-4 tnum">{formatClock(value * 60)}</span>
      )}
    </span>
  );
}
