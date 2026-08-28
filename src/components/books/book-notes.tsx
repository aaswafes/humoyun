"use client";

import * as React from "react";
import { Quote, Trash2, Lightbulb, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { AutoTextarea, Button, IconButton, Segmented } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/overlays";
import { MiniEmpty } from "@/components/ui/form";
import type { Tint } from "@/lib/types";
import { NumberField } from "./fields";
import { addNote, removeNote, updateNote, type BookNote, type NoteKind } from "./library-prefs";

const KIND_OPTIONS: { value: NoteKind; label: React.ReactNode }[] = [
  { value: "highlight", label: <span className="inline-flex items-center gap-1.5"><Quote className="size-3" />Quote</span> },
  { value: "thought", label: <span className="inline-flex items-center gap-1.5"><Lightbulb className="size-3" />Thought</span> },
];

const PREVIEW = 6;

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

function NoteRow({ note, total }: { note: BookNote; total: number }) {
  const [text, setText] = React.useState(note.text);
  const [seen, setSeen] = React.useState(note.text);

  // Another edit of the same note (or a reload) has to show through the draft.
  if (seen !== note.text) {
    setSeen(note.text);
    setText(note.text);
  }

  const quote = note.kind === "highlight";

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
          aria-label={quote ? "Quote" : "Thought"}
          onBlur={() => {
            const next = text.trim();
            if (!next) { setText(note.text); return; }
            if (next !== note.text) updateNote(note.id, { text: next });
          }}
          className={cn(
            "text-[13px] text-ink placeholder:text-ink-4",
            quote && "italic",
          )}
        />
        <div className="mt-1 flex items-center gap-1.5">
          <PageChip
            page={note.page}
            total={total}
            onChange={(page) => updateNote(note.id, { page })}
          />
          <span className="text-[11px] text-ink-4">{quote ? "Quote" : "Thought"}</span>
          <IconButton
            label="Delete this note"
            size="sm"
            tone="danger"
            className="ml-auto opacity-0 transition-opacity focus-visible:opacity-100 group-hover/note:opacity-100"
            onClick={() => removeNote(note.id)}
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
 */
export function BookNotes({
  bookId, notes, totalPages, currentPage, tint, className,
}: {
  bookId: string;
  notes: BookNote[];
  totalPages: number;
  currentPage: number;
  tint: Tint;
  className?: string;
}) {
  const [kind, setKind] = React.useState<NoteKind>("highlight");
  const [page, setPage] = React.useState(() => Math.max(1, currentPage || 1));
  const [text, setText] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);

  const visible = expanded ? notes : notes.slice(0, PREVIEW);
  const canAdd = text.trim().length > 0;

  function add() {
    if (!canAdd) return;
    addNote({ bookId, kind, page, text: text.trim() });
    setText("");
  }

  return (
    <div className={cn(`tint-${tint}`, className)}>
      <div className="rounded-md border border-line p-2">
        <div className="flex items-center gap-2">
          <Segmented<NoteKind> size="sm" value={kind} onChange={setKind} options={KIND_OPTIONS} />
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

      {notes.length === 0 ? (
        <MiniEmpty className="mt-1">Nothing kept from this book yet.</MiniEmpty>
      ) : (
        <div className="mt-1 divide-y divide-line">
          {visible.map((n) => <NoteRow key={n.id} note={n} total={totalPages} />)}
          {notes.length > PREVIEW && (
            <div className="pt-1.5">
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Show fewer" : `Show all ${notes.length}`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
