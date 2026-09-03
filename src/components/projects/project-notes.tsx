"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/date";
import type { Note, Project } from "@/lib/types";
import { AutoTextarea, Button, IconButton } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import { DOC_CLASS, DocStyles } from "@/components/notes/doc-styles";

/** Newest first — a project's notes are read as a running log. */
const byNewest = (a: Note, b: Note) => b.created_at.localeCompare(a.created_at);

function NoteRow({ note }: { note: Note }) {
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const [draft, setDraft] = React.useState(note.body);
  // A note written in the rich editor is HTML, and a textarea would show its
  // tags and then save them back as text. This log stays a log; the full
  // editor is one click away on the Notes page.
  const rich = note.format === "html";

  // Adjusted during render rather than in an effect: an edit made elsewhere
  // should never be painted stale for a frame first.
  const [seen, setSeen] = React.useState(note.body);
  if (seen !== note.body) {
    setSeen(note.body);
    setDraft(note.body);
  }

  return (
    <li className="group/note rounded-md px-1 py-1.5 transition-colors hover:bg-hover">
      {rich ? (
        <div
          className={`${DOC_CLASS} text-[13px] leading-relaxed text-ink-2`}
          dangerouslySetInnerHTML={{ __html: note.body }}
        />
      ) : (
        <AutoTextarea
          value={draft}
          onChange={setDraft}
          aria-label={`Note from ${formatDate(note.created_at.slice(0, 10), { weekday: false })}`}
          onBlur={() => {
            const next = draft.trim();
            if (next !== note.body) patch("notes", note.id, { body: next });
          }}
          placeholder="Empty note"
          minRows={1}
          className="text-[13px] leading-relaxed text-ink-2 placeholder:text-ink-4"
        />
      )}
      <div className="mt-0.5 flex items-center gap-2">
        <span className="text-[11px] text-ink-4 tnum">
          {formatDate(note.created_at.slice(0, 10), { weekday: false, year: false })}
        </span>
        <div className="flex-1" />
        <span className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/note:opacity-100">
          <IconButton size="sm" label="Delete note" onClick={() => remove("notes", note.id)}>
            <Trash2 />
          </IconButton>
        </span>
      </div>
    </li>
  );
}

/**
 * The running log of a project — decisions, blockers, what you tried. These are
 * real rows in `notes`, so they also appear on the Notes page with everything
 * else you have written.
 */
export function ProjectNotes({ project, notes }: { project: Project; notes: Note[] }) {
  const insert = useStore((s) => s.insert);
  const [draft, setDraft] = React.useState("");

  const ordered = React.useMemo(() => notes.slice().sort(byNewest), [notes]);

  function commit() {
    const body = draft.trim();
    if (!body) return;
    insert("notes", {
      body,
      kind: "note",
      project_id: project.id,
      goal_id: project.goal_id,
      color: project.color,
    });
    setDraft("");
  }

  return (
    <div>
      <DocStyles />
      <div className="rounded-md border border-line px-2 py-1.5 focus-within:border-line-strong">
        <AutoTextarea
          value={draft}
          onChange={setDraft}
          aria-label="New note"
          placeholder="What happened, what you decided, what is in the way…"
          minRows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
          }}
          className="text-[13px] leading-relaxed text-ink placeholder:text-ink-4"
        />
        {draft.trim() && (
          <div className="mt-1 flex justify-end">
            <Button size="xs" variant="primary" onClick={commit}>
              <Plus className="size-3" />
              Add note
            </Button>
          </div>
        )}
      </div>

      {ordered.length === 0 ? (
        <MiniEmpty>Nothing written down yet.</MiniEmpty>
      ) : (
        <ul className="mt-1 space-y-px">
          {ordered.map((note) => <NoteRow key={note.id} note={note} />)}
        </ul>
      )}
    </div>
  );
}
