"use client";

import * as React from "react";
import { Quote, Trash2, Lightbulb, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { AutoTextarea, Button, IconButton, Segmented } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/overlays";
import { MiniEmpty } from "@/components/ui/form";
import { NOTE_KIND_LABELS, type NoteKind, type Tint } from "@/lib/types";
import { NumberField } from "./fields";
import { removeNote as forgetPrefsNote, updateNote as updatePrefsNote, type BookNote } from "./library-prefs";
import { noteText } from "@/components/notes/rich-text";

/** What you can write from here. Notes made elsewhere keep whatever kind they have. */
type Marginal = "highlight" | "thought";

const KIND_OPTIONS: { value: Marginal; label: React.ReactNode }[] = [
  { value: "highlight", label: <span className="inline-flex items-center gap-1.5"><Quote className="size-3" />Quote</span> },
  { value: "thought", label: <span className="inline-flex items-center gap-1.5"><Lightbulb className="size-3" />Thought</span> },
];

const PREVIEW = 6;

/**
 * One line in the list, whichever side it came from. A row that still lives in
 * profile prefs is `legacy` — it edits and deletes the old way until it is moved.
 */
interface Row {
  id: string;
  kind: NoteKind;
  page: number | null;
  text: string;
  at: string;
  legacy: boolean;
}

/** Page order, unplaced notes last, oldest first inside a page. */
const byPage = (a: Row, b: Row) =>
  (a.page ?? Number.MAX_SAFE_INTEGER) - (b.page ?? Number.MAX_SAFE_INTEGER)
  || a.at.localeCompare(b.at);

/** Page chip that doubles as the page editor. */
function PageChip({
  page, total, onChange,
}: {
  page: number | null;
  total: number;
  onChange: (next: number | null) => void;
}) {
  const [draft, setDraft] = React.useState(page ?? 1);
  const [seen, setSeen] = React.useState(page);

  // The note's page can change from the list while this popover is mounted.
  if (seen !== page) {
    setSeen(page);
    setDraft(page ?? 1);
  }

  return (
    <Popover
      align="start"
      className="w-[184px] p-2"
      trigger={
        <button
          type="button"
          aria-label={page == null ? "Add a page reference" : `Page ${page}. Change the page reference`}
          className={cn(
            "inline-flex h-6 shrink-0 cursor-pointer items-center rounded-full border border-line px-2",
            "text-[11.5px] tnum transition-colors hover:bg-hover",
            page == null ? "text-ink-4" : "text-ink-2",
          )}
        >
          {page == null ? "no page" : `p.${page}`}
        </button>
      }
    >
      {(close) => (
        <div className="space-y-2">
          <NumberField
            label="Page"
            value={draft}
            min={0}
            max={Math.max(1, total)}
            step={1}
            onChange={setDraft}
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" className="flex-1" onClick={() => { onChange(draft); close(); }}>
              Set page
            </Button>
            {page != null && (
              <Button size="sm" variant="ghost" onClick={() => { onChange(null); close(); }}>
                Clear
              </Button>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

function NoteRow({
  row, total, onText, onPage, onDelete,
}: {
  row: Row;
  total: number;
  onText: (next: string) => void;
  onPage: (next: number | null) => void;
  onDelete: () => void;
}) {
  const [text, setText] = React.useState(row.text);
  const [seen, setSeen] = React.useState(row.text);

  // Another edit of the same note (or a reload) has to show through the draft.
  if (seen !== row.text) {
    setSeen(row.text);
    setText(row.text);
  }

  const quote = row.kind === "highlight";
  const label = NOTE_KIND_LABELS[row.kind];

  return (
    <div className="group/note flex gap-2 py-2">
      <span
        aria-hidden
        className={cn("mt-[3px] w-[3px] shrink-0 rounded-full", quote ? "bg-[var(--tint)]" : "bg-line-strong")}
      />
      <div className="min-w-0 flex-1">
        <AutoTextarea
          value={text}
          onChange={setText}
          aria-label={label}
          onBlur={() => {
            const next = text.trim();
            if (!next) { setText(row.text); return; }
            if (next !== row.text) onText(next);
          }}
          className={cn(
            "text-[13px] text-ink placeholder:text-ink-4",
            quote && "italic",
          )}
        />
        <div className="mt-1 flex items-center gap-1.5">
          <PageChip page={row.page} total={total} onChange={onPage} />
          <span className="text-[11px] text-ink-4">{label}</span>
          {row.legacy && <span className="text-[11px] text-ink-4">· not in Notes yet</span>}
          <IconButton
            label="Delete this note"
            tone="danger"
            className="ml-auto opacity-0 transition-opacity focus-visible:opacity-100 group-hover/note:opacity-100"
            onClick={onDelete}
          >
            <Trash2 />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Quotes and thoughts, each anchored to a page. Kept apart from the book's
 * freeform Notes field: that one is a verdict, these are the trail.
 *
 * They live in the `notes` collection now, so the same line shows up on the
 * Notes page with this book as its source. Anything written before that move
 * still sits in profile prefs — it is listed here and can be carried over in
 * one tap, never dropped.
 */
export function BookNotes({
  bookId, notes, totalPages, currentPage, tint, className,
}: {
  bookId: string;
  /** Legacy marginalia still held in profile prefs. */
  notes: BookNote[];
  totalPages: number;
  currentPage: number;
  tint: Tint;
  className?: string;
}) {
  const stored = useStore((s) => s.notes);
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);

  const [kind, setKind] = React.useState<Marginal>("highlight");
  const [page, setPage] = React.useState(() => Math.max(1, currentPage || 1));
  const [text, setText] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);
  const [moving, setMoving] = React.useState(false);

  const legacy = React.useMemo(
    () => notes.filter((n) => n.book_id === bookId), [notes, bookId]);

  const rows = React.useMemo<Row[]>(() => {
    const live: Row[] = stored
      .filter((n) => n.book_id === bookId)
      .map((n) => ({
        // A note written in the rich editor is HTML; the margin here is text.
        id: n.id, kind: n.kind, page: n.locator, text: noteText(n), at: n.created_at, legacy: false,
      }));
    const old: Row[] = legacy.map((n) => ({
      id: n.id, kind: n.kind, page: n.page, text: n.text, at: n.created_at, legacy: true,
    }));
    return [...live, ...old].sort(byPage);
  }, [stored, legacy, bookId]);

  const visible = expanded ? rows : rows.slice(0, PREVIEW);
  const canAdd = text.trim().length > 0;

  function add() {
    const body = text.trim();
    if (!body) return;
    insert("notes", { book_id: bookId, kind, locator: page > 0 ? page : null, body });
    setText("");
  }

  /** Carry the prefs notes into the real collection, then let go of the copies. */
  function moveLegacy() {
    if (!legacy.length || moving) return;
    setMoving(true);
    try {
      for (const n of legacy) {
        insert("notes", {
          book_id: bookId,
          kind: n.kind,
          locator: n.page,
          body: n.text,
          // Keep the day it was written — the Notes page reads by date.
          created_at: n.created_at,
          updated_at: n.created_at,
        });
      }
      for (const n of legacy) forgetPrefsNote(n.id);
      toast({
        title: `Moved ${legacy.length} ${legacy.length === 1 ? "note" : "notes"}`,
        description: "They are in Notes now, filed under this book.",
        tone: "success",
      });
    } finally {
      setMoving(false);
    }
  }

  function commitText(row: Row, next: string) {
    if (row.legacy) updatePrefsNote(row.id, { text: next });
    else patch("notes", row.id, { body: next });
  }

  function commitPage(row: Row, next: number | null) {
    if (row.legacy) updatePrefsNote(row.id, { page: next });
    else patch("notes", row.id, { locator: next });
  }

  function drop(row: Row) {
    if (row.legacy) forgetPrefsNote(row.id);
    else remove("notes", row.id);
  }

  return (
    <div className={cn(`tint-${tint}`, className)}>
      <div className="rounded-md border border-line p-2">
        <div className="flex items-center gap-2">
          <Segmented<Marginal> size="sm" value={kind} onChange={setKind} options={KIND_OPTIONS} />
          <div className="ml-auto w-[104px]">
            <NumberField
              label="Page for this note"
              value={page}
              min={0}
              max={Math.max(1, totalPages)}
              step={1}
              onChange={setPage}
              className="h-7"
            />
          </div>
        </div>

        <AutoTextarea
          value={text}
          onChange={setText}
          minRows={2}
          aria-label={kind === "highlight" ? "Quote from the book" : "Your thought"}
          placeholder={kind === "highlight" ? "Type the line worth keeping…" : "What did it make you think?"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); }
          }}
          className="mt-2 text-[13px] text-ink placeholder:text-ink-4"
        />

        <div className="mt-1.5 flex items-center gap-2">
          <Button size="sm" variant="primary" disabled={!canAdd} onClick={add}>
            <Plus className="size-3.5" />
            Add
          </Button>
          <span className="text-[11px] text-ink-4">⌘↵ saves</span>
        </div>
      </div>

      {legacy.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 hairline-b pb-2">
          <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-ink-3 tnum">
            {legacy.length} older {legacy.length === 1 ? "note is" : "notes are"} still stored on this book
            alone, so {legacy.length === 1 ? "it does" : "they do"} not appear in Notes.
          </p>
          <Button size="sm" variant="secondary" loading={moving} onClick={moveLegacy}>
            Move {legacy.length} into Notes
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <MiniEmpty className="mt-1">Nothing kept from this book yet.</MiniEmpty>
      ) : (
        <div className="mt-1 divide-y divide-line">
          {visible.map((row) => (
            <NoteRow
              key={row.id}
              row={row}
              total={totalPages}
              onText={(next) => commitText(row, next)}
              onPage={(next) => commitPage(row, next)}
              onDelete={() => drop(row)}
            />
          ))}
          {rows.length > PREVIEW && (
            <div className="pt-1.5">
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Show fewer" : `Show all ${rows.length}`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
