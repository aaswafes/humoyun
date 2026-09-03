"use client";

import * as React from "react";
import {
  ChevronDown, FileText, LayoutTemplate, Pencil, Plus, Sparkles, Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { dayName, formatDate, formatTime, todayISO } from "@/lib/date";
import type { Note } from "@/lib/types";
import { Button, EmptyState, IconButton } from "@/components/ui/primitives";
import { MenuItem, MenuSeparator, Modal, Popover } from "@/components/ui/overlays";
import { DOC_CLASS, DocStyles } from "./doc-styles";
import { CategoryChips } from "./category-picker";
import type { CategoryIndex } from "./category-model";
import { noteHeading, templateNotes } from "./note-model";
import { escapeHtml, noteText, plainToHtml } from "./rich-text";

// =========================================================
// Templates.
//
// A template IS a note — same table, same editor, same categories, with
// `is_template` set. There is no second kind of thing to learn and no second
// editor to maintain; the only difference is that a template is held back from
// the lists and offered when a new note is started.
//
// Four placeholders, filled in the moment a template is used. Everything else
// is copied exactly, which is what makes a template predictable.
// =========================================================

const PLACEHOLDERS = ["{{date}}", "{{time}}", "{{weekday}}", "{{title}}"] as const;

function fill(text: string, title: string): string {
  const iso = todayISO();
  return text
    .replaceAll("{{date}}", formatDate(iso, { year: true }))
    .replaceAll("{{weekday}}", dayName(iso))
    .replaceAll("{{time}}", formatTime(new Date().getHours() * 60 + new Date().getMinutes(), true))
    .replaceAll("{{title}}", title);
}

/**
 * Start a note from a template.
 *
 * Everything that describes the shape of the note is copied — kind, colour,
 * tags, categories, body. Everything that describes a particular note is not:
 * its links to a book or a task, its pin, its place on the canvas.
 */
export function useApplyTemplate() {
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  return React.useCallback((template: Note): Note => {
    const title = fill(template.title?.trim() ?? "", "");
    const note = insert("notes", {
      title: title || null,
      body: fill(template.body, title),
      format: template.format,
      kind: template.kind,
      color: template.color,
      tags: [...template.tags],
      categories: [...template.categories],
      date: template.kind === "daily" ? todayISO() : null,
      is_template: false,
      layout: null,
    });
    // Templates are notes, so the counter that says how often one is used has
    // nowhere of its own to live. Bumping the template's own updated_at is
    // enough to float a favourite to the top of the list.
    patch("notes", template.id, { updated_at: new Date().toISOString() });
    toast({ title: `Started from ${noteHeading(template, STANDALONE)}` });
    return note;
  }, [insert, patch, toast]);
}

const STANDALONE = {
  kind: "none" as const, id: null, label: "Standalone", href: null, missing: false,
};

// ---------------------------------------------------------
// Starters
// ---------------------------------------------------------

interface Starter {
  title: string;
  kind: Note["kind"];
  categories: string[];
  lines: string[];
}

const STARTERS: Starter[] = [
  {
    title: "Daily reflection — {{date}}",
    kind: "daily",
    categories: [],
    lines: [
      "## What actually happened",
      "",
      "## What I learned",
      "",
      "## One thing for tomorrow",
      "",
    ],
  },
  {
    title: "Book notes — {{title}}",
    kind: "highlight",
    categories: ["Books"],
    lines: [
      "**Author:**",
      "**Read on:** {{date}}",
      "",
      "## Highlights",
      "",
      "## What I disagree with",
      "",
      "## What I will do differently",
      "",
    ],
  },
  {
    title: "Lecture — {{title}}",
    kind: "summary",
    categories: ["Study"],
    lines: [
      "**Date:** {{date}} · {{weekday}}",
      "",
      "## The claim",
      "",
      "## The evidence",
      "",
      "## Questions I still have",
      "",
    ],
  },
  {
    title: "Idea — {{title}}",
    kind: "idea",
    categories: ["Ideas"],
    lines: [
      "## The idea in one sentence",
      "",
      "## Who it is for",
      "",
      "## Why it might not work",
      "",
      "## Smallest first step",
      "",
    ],
  },
  {
    title: "Meeting — {{title}}",
    kind: "note",
    categories: ["Work"],
    lines: [
      "**When:** {{date}}, {{time}}",
      "**With:**",
      "",
      "## Decisions",
      "",
      "## Next steps",
      "",
    ],
  },
];

function starterHtml(starter: Starter): string {
  // Written as markdown-ish lines and converted once, so the seed data reads
  // like something a person typed rather than a wall of tags.
  return starter.lines
    .map((line) => {
      if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (!line.trim()) return "<p><br></p>";
      return `<p>${escapeHtml(line)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`;
    })
    .join("");
}

// ---------------------------------------------------------
// The split button beside "New note"
// ---------------------------------------------------------

export function TemplateMenu({
  notes, onNew, onManage, onOpen,
}: {
  notes: Note[];
  onNew: () => void;
  onManage: () => void;
  onOpen: (note: Note) => void;
}) {
  const apply = useApplyTemplate();
  const templates = React.useMemo(
    () => templateNotes(notes).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [notes]);

  return (
    <div className="flex items-center">
      <Button
        variant="primary"
        size="sm"
        onClick={onNew}
        className="rounded-r-none pr-2"
      >
        <Plus className="size-3.5" />
        New note
      </Button>

      <Popover
        align="end"
        className="w-[240px]"
        trigger={
          <button
            type="button"
            aria-label="Start from a template"
            className={cn(
              "inline-flex h-7 cursor-pointer items-center rounded-r-md pl-1 pr-1.5",
              "bg-accent text-accent-ink transition-colors duration-150 hover:bg-accent-hover",
              "border-l border-white/25",
            )}
          >
            <ChevronDown className="size-3.5" />
          </button>
        }
      >
        {(close) => (
          <>
            {templates.length > 0 ? (
              templates.slice(0, 8).map((template) => (
                <MenuItem
                  key={template.id}
                  icon={FileText}
                  onClick={() => { onOpen(apply(template)); close(); }}
                >
                  {noteHeading(template, STANDALONE)}
                </MenuItem>
              ))
            ) : (
              <p className="px-2 py-2 text-[12px] leading-snug text-ink-4">
                No templates yet. A template is just a note you start from.
              </p>
            )}
            <MenuSeparator />
            <MenuItem icon={LayoutTemplate} onClick={() => { onManage(); close(); }}>
              Manage templates
            </MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------
// The gallery
// ---------------------------------------------------------

export function TemplatesModal({
  open, onClose, notes, index, onEdit, onStarted,
}: {
  open: boolean;
  onClose: () => void;
  notes: Note[];
  index: CategoryIndex;
  onEdit: (note: Note) => void;
  onStarted: (note: Note) => void;
}) {
  const insert = useStore((s) => s.insert);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const apply = useApplyTemplate();

  const templates = React.useMemo(
    () => templateNotes(notes).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [notes]);

  const existing = new Set(templates.map((t) => (t.title ?? "").trim()));

  const addStarter = (starter: Starter) => {
    const note = insert("notes", {
      title: starter.title,
      body: starterHtml(starter),
      format: "html",
      kind: starter.kind,
      categories: [...starter.categories],
      is_template: true,
    });
    toast({ title: `${starter.title.replace(/ — .*/, "")} added` });
    return note;
  };

  const blank = () => {
    const note = insert("notes", {
      title: "New template",
      body: plainToHtml(""),
      format: "html",
      is_template: true,
    });
    onEdit(note);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Templates" width={620}>
      <DocStyles />
      <div className="max-h-[68vh] overflow-y-auto px-4 pb-4 pt-3">
        <p className="mb-4 text-[12.5px] leading-relaxed text-ink-3">
          A template is a note you start from. Write it once — headings,
          categories, colour and all — and every note made from it arrives with
          the same shape.{" "}
          <span className="text-ink-4">
            {PLACEHOLDERS.join("  ")} are filled in as you use it.
          </span>
        </p>

        {templates.length > 0 ? (
          <ul className="mb-6 space-y-2">
            {templates.map((template) => (
              <li
                key={template.id}
                className={cn(
                  `tint-${template.color ?? "slate"}`,
                  "group/tpl flex items-start gap-3 rounded-lg p-3",
                )}
                style={{ background: "var(--tint-soft)" }}
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[13.5px] font-medium text-ink">
                    {noteHeading(template, STANDALONE)}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-[12px] leading-snug text-ink-3">
                    {noteText(template).split("\n").slice(1).join("\n").trim() || "Empty"}
                  </p>
                  {template.categories.length > 0 && (
                    <CategoryChips names={template.categories} index={index} className="mt-2" />
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    onClick={() => { onStarted(apply(template)); onClose(); }}
                  >
                    Use
                  </Button>
                  <IconButton
                    label={`Edit ${noteHeading(template, STANDALONE)}`}
                    size="md"
                    onClick={() => { onEdit(template); onClose(); }}
                  >
                    <Pencil />
                  </IconButton>
                  <IconButton
                    label={`Delete ${noteHeading(template, STANDALONE)}`}
                    size="md"
                    tone="danger"
                    onClick={() => {
                      remove("notes", template.id);
                      toast({
                        title: "Template deleted",
                        action: { label: "Undo", run: () => { insert("notes", template); } },
                      });
                    }}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={LayoutTemplate}
            title="No templates yet"
            description="Start from one below, or write your own from scratch."
            className="py-8"
          />
        )}

        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-3.5 text-ink-3" aria-hidden />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Ready to use
          </h3>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {STARTERS.map((starter) => {
            const already = existing.has(starter.title);
            return (
              <li key={starter.title}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => addStarter(starter)}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-2 rounded-lg border border-line p-2.5 text-left",
                    "transition-colors duration-150 hover:bg-hover",
                    already && "pointer-events-none opacity-45",
                  )}
                >
                  <FileText className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">
                      {starter.title}
                    </span>
                    <span className="block text-[11.5px] text-ink-4">
                      {already ? "Already added" : `${starter.lines.filter((l) => l.startsWith("## ")).length} sections`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <p className="text-[11.5px] text-ink-4">
          Templates never appear in your notes list.
        </p>
        <Button variant="primary" size="sm" onClick={blank}>
          <Plus className="size-3.5" />
          Write a template
        </Button>
      </div>
    </Modal>
  );
}

/** Read-only preview of a template body, used nowhere else but worth naming. */
export function TemplatePreview({ note }: { note: Note }) {
  if (note.format !== "html") {
    return <p className={cn(DOC_CLASS, "whitespace-pre-line")}>{noteText(note)}</p>;
  }
  return <div className={DOC_CLASS} dangerouslySetInnerHTML={{ __html: note.body }} />;
}
