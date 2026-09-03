"use client";

import * as React from "react";
import {
  Check, ExternalLink, LayoutTemplate, MoreHorizontal, Palette, Pin,
  SquareDashed, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatClock } from "@/lib/date";
import { NOTE_KINDS, NOTE_KIND_LABELS, type Note, type Tint } from "@/lib/types";
import { IconButton, InlineInput, SectionLabel } from "@/components/ui/primitives";
import {
  MenuItem, MenuSeparator, Popover, Sheet, TintPicker,
} from "@/components/ui/overlays";
import { Disclosure, NOTE_KIND_ICONS, TagEditor } from "./note-fields";
import { useDeleteNote } from "./note-actions";
import { useOpenSource } from "./note-source-chip";
import { SourcePicker } from "./source-picker";
import { buildCategoryIndex } from "./category-model";
import { CategoryPicker, CategoryRow } from "./category-picker";
import { RichEditor } from "./rich-editor";
import { bodyAsHtml } from "./rich-text";
import { newLayout, topZ } from "./canvas-model";
import {
  LOCATOR_LABELS, buildSourceIndex, locatorUnit, noteHeading, resolveSource, tagCounts,
} from "./note-model";

/** How long the editor waits before writing. Long enough to type through, short enough to trust. */
const AUTOSAVE_MS = 600;

export function NoteSheet({
  noteId, focusBody, onClose, onOpenNote,
}: {
  noteId: string;
  /** a brand-new note opens with the cursor already in the body */
  focusBody?: boolean;
  onClose: () => void;
  /** following a [[link]] swaps the sheet rather than opening a second one */
  onOpenNote?: (id: string) => void;
}) {
  const note = useStore((s) => s.notes.find((n) => n.id === noteId) ?? null);

  return (
    <Sheet open={!!note} onClose={onClose} width={620}>
      {note && (
        <NoteSheetBody
          key={note.id}
          note={note}
          focusBody={focusBody}
          onClose={onClose}
          onOpenNote={onOpenNote}
        />
      )}
    </Sheet>
  );
}

function NoteSheetBody({
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

  const [title, setTitle] = React.useState(note.title ?? "");
  const [body, setBody] = React.useState(() => bodyAsHtml(note));
  // A note written before the rich editor existed is only converted once it is
  // actually edited. Opening one to read it must not rewrite it.
  const [touched, setTouched] = React.useState(false);

  const idx = React.useMemo(
    () => buildSourceIndex(books, media, tasks, goals, nodes),
    [books, media, tasks, goals, nodes]);
  const catIdx = React.useMemo(() => buildCategoryIndex(categories), [categories]);
  const refer = React.useMemo(() => resolveSource(note, idx), [note, idx]);
  const unit = locatorUnit(refer, idx, note.media_id);
  const suggestions = React.useMemo(() => tagCounts(notes).map((t) => t.tag), [notes]);

  // The saved state is derived, never stored: if what is typed differs from
  // what the store holds, the write is still coming. Nothing to reset, nothing
  // to get stuck showing "Saving…" forever.
  const nextTitle = title.trim() || null;
  const bodyChanged = touched && (body !== note.body || note.format !== "html");
  const dirty = nextTitle !== note.title || bodyChanged;

  // Closing the sheet mid-keystroke must not lose the keystroke, so the
  // pending write is kept where the unmount effect can still find it.
  const pending = React.useRef<Partial<Note> | null>(null);
  const noteId = note.id;

  React.useEffect(() => {
    const changes: Partial<Note> = {};
    if (nextTitle !== note.title) changes.title = nextTitle;
    if (bodyChanged) { changes.body = body; changes.format = "html"; }
    pending.current = Object.keys(changes).length ? changes : null;
    if (!pending.current) return;
    const timer = setTimeout(() => {
      if (pending.current) patch("notes", noteId, pending.current);
      pending.current = null;
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [nextTitle, body, bodyChanged, note.title, noteId, patch]);

  React.useEffect(() => () => {
    if (pending.current) patch("notes", noteId, pending.current);
  }, [noteId, patch]);

  /**
   * A note lives in one place, so a new source replaces the old one — and the
   * locator goes with it: page 128 of a book is not minute 128 of a film.
   */
  const applySource = (changes: Partial<Note>) =>
    patch("notes", noteId, { ...changes, locator: null });

  const removeNote = useDeleteNote();

  const deleteNote = () => {
    pending.current = null;   // do not resurrect the row on unmount
    removeNote(note);         // undoable, same as deleting from a card
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

  const putOnCanvas = () => {
    patch("notes", noteId, { layout: newLayout("card", 0, 0, topZ(notes)) });
    toast({ title: "Put on the canvas", description: "Open the Canvas view to place it." });
  };

  const Kind = NOTE_KIND_ICONS[note.kind];
  const tagSummary = note.tags.length
    ? note.tags.map((t) => `#${t}`).join("  ")
    : "None yet";

  return (
    <>
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2 px-3 hairline-b">
        <SectionLabel className="shrink-0">
          {note.is_template ? "Template" : NOTE_KIND_LABELS[note.kind]}
        </SectionLabel>

        <p
          aria-live="polite"
          className="flex min-w-0 flex-1 items-center gap-1 text-[11.5px] text-ink-4"
        >
          {dirty ? (
            "Saving…"
          ) : (
            <>
              <Check className="size-3" aria-hidden />
              Saved
            </>
          )}
        </p>

        <Popover
          align="end"
          className="w-[228px]"
          trigger={<IconButton label="Note options" size="md"><MoreHorizontal /></IconButton>}
        >
          {(close) => (
            <>
              <MenuItem
                icon={Pin}
                checked={note.pinned}
                onClick={() => { patch("notes", noteId, { pinned: !note.pinned }); close(); }}
              >
                {note.pinned ? "Unpin" : "Pin to the top"}
              </MenuItem>
              {!note.is_template && !note.layout && (
                <MenuItem icon={SquareDashed} onClick={() => { putOnCanvas(); close(); }}>
                  Put on the canvas
                </MenuItem>
              )}
              {!note.is_template && note.layout && (
                <MenuItem
                  icon={SquareDashed}
                  onClick={() => { patch("notes", noteId, { layout: null }); close(); }}
                >
                  Take off the canvas
                </MenuItem>
              )}
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

        <IconButton label="Close" size="md" onClick={onClose}><X /></IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-16 pt-4">
        <InlineInput
          aria-label="Title"
          placeholder="Untitled"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="text-[17px] font-semibold tracking-[-0.01em] text-ink placeholder:text-ink-4"
        />

        {/* Everything about where this note belongs, on one line of quiet pills. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
            onChange={(categories) => patch("notes", noteId, { categories })}
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

          <div className="ml-auto flex items-center gap-0.5">
            <IconButton
              label={note.pinned ? "Unpin this note" : "Pin this note to the top"}
              aria-pressed={note.pinned}
              active={note.pinned}
              onClick={() => patch("notes", noteId, { pinned: !note.pinned })}
            >
              <Pin />
            </IconButton>

            <Popover
              align="end"
              className="w-auto"
              trigger={
                <IconButton label={`Paper colour: ${note.color ?? "none"}`}>
                  <Palette />
                </IconButton>
              }
            >
              {(close) => (
                <TintPicker
                  allowNone
                  value={note.color}
                  onChange={(color: Tint | null) => { patch("notes", noteId, { color }); close(); }}
                />
              )}
            </Popover>
          </div>
        </div>

        <CategoryRow
          value={note.categories}
          onChange={(categories) => patch("notes", noteId, { categories })}
          index={catIdx}
          className="mt-2.5"
        />

        <RichEditor
          value={body}
          onChange={(html) => { setBody(html); setTouched(true); }}
          notes={notes}
          currentId={noteId}
          onOpenNote={onOpenNote}
          autoFocus={focusBody}
          minHeight={300}
          placeholder={note.is_template
            ? "Write the shape of the note. {{date}} and {{title}} are filled in when it is used."
            : "Write it down…"}
          ariaLabel={`Body of ${noteHeading(note, refer)}`}
          className="mt-4"
        />

        <Disclosure
          storageKey="humoyun.notes.sheet.tags"
          label="Tags"
          summary={tagSummary}
          className="mt-6 hairline-t"
          bodyClassName="pb-2 pt-2"
        >
          <TagEditor
            tags={note.tags}
            suggestions={suggestions}
            onChange={(tags) => patch("notes", noteId, { tags })}
          />
        </Disclosure>
      </div>
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
