"use client";

import * as React from "react";
import { Check, ExternalLink, MoreHorizontal, Palette, Pin, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatClock } from "@/lib/date";
import { NOTE_KINDS, NOTE_KIND_LABELS, type Note, type Tint } from "@/lib/types";
import { AutoTextarea, IconButton, InlineInput, SectionLabel } from "@/components/ui/primitives";
import {
  ConfirmDialog, MenuItem, MenuSeparator, Popover, Sheet, TintPicker,
} from "@/components/ui/overlays";
import { Disclosure, NOTE_KIND_ICONS, TagEditor } from "./note-fields";
import { useOpenSource } from "./note-source-chip";
import { SourcePicker } from "./source-picker";
import {
  LOCATOR_LABELS, buildSourceIndex, locatorUnit, noteHeading, resolveSource, tagCounts,
} from "./note-model";

/** How long the editor waits before writing. Long enough to type through, short enough to trust. */
const AUTOSAVE_MS = 500;

export function NoteSheet({
  noteId, focusBody, onClose,
}: {
  noteId: string;
  /** a brand-new note opens with the cursor already in the body */
  focusBody?: boolean;
  onClose: () => void;
}) {
  const note = useStore((s) => s.notes.find((n) => n.id === noteId) ?? null);

  return (
    <Sheet open={!!note} onClose={onClose} width={460}>
      {note && <NoteSheetBody key={note.id} note={note} focusBody={focusBody} onClose={onClose} />}
    </Sheet>
  );
}

function NoteSheetBody({
  note, focusBody, onClose,
}: {
  note: Note;
  focusBody?: boolean;
  onClose: () => void;
}) {
  const notes = useStore((s) => s.notes);
  const books = useStore((s) => s.books);
  const media = useStore((s) => s.media);
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const nodes = useStore((s) => s.nodes);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const openSource = useOpenSource();

  const [title, setTitle] = React.useState(note.title ?? "");
  const [body, setBody] = React.useState(note.body);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const idx = React.useMemo(
    () => buildSourceIndex(books, media, tasks, goals, nodes),
    [books, media, tasks, goals, nodes]);
  const refer = React.useMemo(() => resolveSource(note, idx), [note, idx]);
  const unit = locatorUnit(refer, idx, note.media_id);
  const suggestions = React.useMemo(() => tagCounts(notes).map((t) => t.tag), [notes]);

  // The saved state is derived, never stored: if what is typed differs from
  // what the store holds, the write is still coming. Nothing to reset, nothing
  // to get stuck showing "Saving…" forever.
  const nextTitle = title.trim() || null;
  const dirty = nextTitle !== note.title || body !== note.body;

  // Closing the sheet mid-keystroke must not lose the keystroke, so the
  // pending write is kept where the unmount effect can still find it.
  const pending = React.useRef<Partial<Note> | null>(null);
  const noteId = note.id;

  React.useEffect(() => {
    pending.current = dirty ? { title: nextTitle, body } : null;
    if (!dirty) return;
    const timer = setTimeout(() => {
      patch("notes", noteId, { title: nextTitle, body });
      pending.current = null;
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, nextTitle, body, noteId, patch]);

  React.useEffect(() => () => {
    if (pending.current) patch("notes", noteId, pending.current);
  }, [noteId, patch]);

  /**
   * A note lives in one place, so a new source replaces the old one — and the
   * locator goes with it: page 128 of a book is not minute 128 of a film.
   */
  const applySource = (changes: Partial<Note>) =>
    patch("notes", noteId, { ...changes, locator: null });

  const deleteNote = () => {
    pending.current = null;   // do not resurrect the row on unmount
    remove("notes", noteId);
    toast({ title: "Note deleted", tone: "default" });
    onClose();
  };

  const Kind = NOTE_KIND_ICONS[note.kind];
  const tagSummary = note.tags.length
    ? note.tags.map((t) => `#${t}`).join("  ")
    : "None yet";

  return (
    <>
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2 px-3 hairline-b">
        <SectionLabel className="shrink-0">{NOTE_KIND_LABELS[note.kind]}</SectionLabel>

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
          className="w-[216px]"
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
              {refer.href && !refer.missing && (
                <MenuItem
                  icon={ExternalLink}
                  onClick={() => { openSource(refer); close(); }}
                >
                  Open {refer.label}
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem icon={Trash2} danger onClick={() => { setConfirmDelete(true); close(); }}>
                Delete note
              </MenuItem>
            </>
          )}
        </Popover>

        <IconButton label="Close" size="md" onClick={onClose}><X /></IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-16 pt-4">
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

        <AutoTextarea
          value={body}
          onChange={setBody}
          minRows={10}
          autoFocus={focusBody}
          aria-label="Note body"
          placeholder="Write it down…"
          className="mt-4 text-[13.5px] text-ink placeholder:text-ink-4"
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

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteNote}
        title="Delete this note?"
        description={`“${noteHeading(note, refer)}” goes for good. Nothing else it is linked to is touched.`}
        confirmLabel="Delete note"
      />
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
