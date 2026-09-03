"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Note } from "@/lib/types";
import { useMounted } from "@/components/ui/overlays";
import { DOC_CLASS, DocStyles } from "./doc-styles";
import { fontFromStack } from "./fonts";
import { EditorToolbar, type RunCommand, type ToolbarState } from "./editor-toolbar";
import {
  applyShorthand, caretBlock, caretFontSize, caretList, caretStyle,
  checklistItemAt, exitBlockOnEnter, insertWikiLink, normalizeBlocks, queryState,
  selectionInside, wikiQueryAtCaret,
} from "./editor-commands";
import { noteText, sanitizeHtml } from "./rich-text";

// =========================================================
// The writing surface.
//
// A contentEditable rather than a document model, deliberately: a note is
// prose with a few marks on it, and a real editor framework would be a
// dependency the size of the rest of the app to gain a structure nobody here
// needs. What that costs is care in three places, all of them handled below —
// the caret must survive an external re-render, paste must be scrubbed, and
// the toolbar must not steal focus.
//
// The DOM is the source of truth while typing. `value` is written into it once
// on mount and afterwards only when it changed somewhere else, which is what
// stops every keystroke from resetting the caret to the top of the note.
// =========================================================

const EMPTY = "<p><br></p>";

const EMPTY_STATE: ToolbarState = {
  bold: false, italic: false, underline: false, strike: false,
  block: "p", list: null, align: "left", font: null, size: null,
};

export function RichEditor({
  value, onChange, notes, currentId, onOpenNote,
  placeholder = "Write it down…", autoFocus, minHeight = 260, className, toolbarClassName,
  ariaLabel = "Note body", toolbarPortal,
}: {
  value: string;
  onChange: (html: string) => void;
  /** everything a [[link]] could point at */
  notes: Note[];
  /** the note being edited, so it cannot link to itself */
  currentId?: string;
  onOpenNote?: (id: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  minHeight?: number;
  className?: string;
  toolbarClassName?: string;
  ariaLabel?: string;
  /**
   * Somewhere else to draw the formatting bar. A note being edited in place on
   * the canvas is 280px wide; the toolbar belongs above the board, not folded
   * into six rows inside the card.
   */
  toolbarPortal?: HTMLElement | null;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const emitted = React.useRef(value);
  const savedRange = React.useRef<Range | null>(null);
  const [state, setState] = React.useState<ToolbarState>(EMPTY_STATE);
  const [empty, setEmpty] = React.useState(true);
  const [wiki, setWiki] = React.useState<WikiPrompt | null>(null);

  // ---- reading the DOM back out ----
  const emit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    emitted.current = html;
    setEmpty(el.textContent?.trim() === "" && !el.querySelector("img, hr"));
    onChange(html);
  }, [onChange]);

  const refresh = React.useCallback(() => {
    const el = ref.current;
    if (!el || !selectionInside(el)) return;
    const align = caretStyle(el, "text-align");
    setState({
      bold: queryState("bold"),
      italic: queryState("italic"),
      underline: queryState("underline"),
      strike: queryState("strikeThrough"),
      block: caretBlock(el),
      list: caretList(el),
      align: align === "center" || align === "right" || align === "justify" ? align : "left",
      font: fontFromStack(caretStyle(el, "font-family")),
      size: caretFontSize(el),
    });
  }, []);

  // ---- writing the DOM ----
  // Only when `value` came from somewhere other than this editor. Comparing
  // against what was last emitted is what tells the two apart.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === emitted.current) return;
    el.innerHTML = value || EMPTY;
    emitted.current = value;
    setEmpty(el.textContent?.trim() === "");
  }, [value]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.innerHTML) el.innerHTML = value || EMPTY;
    setEmpty(el.textContent?.trim() === "");

    /**
     * Enter must make a `<p>`, not a bare `<div>`.
     *
     * This is the difference between a note that has blocks and one that has a
     * run of inline text with line breaks in it. Every block command downstream
     * — the heading shorthand, the list, the quote — needs a block to act on,
     * and the browser's default separator does not reliably give it one.
     */
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* older engines */ }
    if (autoFocus) {
      el.focus();
      // The caret belongs at the end of what is already written, not the start.
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    // Mount only: `value` is handled by the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- keeping the selection across a trip to the toolbar ----
  React.useEffect(() => {
    const onSelect = () => {
      const el = ref.current;
      if (!el || !selectionInside(el)) return;
      const sel = window.getSelection();
      if (sel && sel.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange();
      refresh();
      setWiki(readWiki(el, notes, currentId));
    };
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, [refresh, notes, currentId]);

  const run = React.useCallback<RunCommand>((fn) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    fn(el);
    normalizeBlocks(el);
    // The command may have moved or rebuilt the selection; the next one must
    // start from where this one finished, not from where it began.
    const after = window.getSelection();
    if (after && after.rangeCount) savedRange.current = after.getRangeAt(0).cloneRange();
    emit();
    refresh();
  }, [emit, refresh]);

  // ---- paste: the one place untrusted markup can arrive ----
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (html) document.execCommand("insertHTML", false, sanitizeHtml(html));
    else document.execCommand("insertText", false, text);
    emit();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;

    if (wiki) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setWiki((w) => w && {
          ...w,
          active: (w.active + (e.key === "ArrowDown" ? 1 : w.matches.length - 1)) % w.matches.length,
        });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const pick = wiki.matches[wiki.active];
        if (pick) {
          e.preventDefault();
          insertWikiLink(pick.id, pick.label, wiki.typed);
          setWiki(null);
          emit();
          return;
        }
      }
      if (e.key === "Escape") { e.preventDefault(); setWiki(null); return; }
    }

    // Markdown shorthand fires on the space that would follow the marker.
    if (e.key === " " && applyShorthand(el)) {
      e.preventDefault();
      emit();
      refresh();
      return;
    }

    // Enter on an empty quote or code block steps out of it. Without this
    // there is no way back to ordinary prose except the toolbar.
    if (e.key === "Enter" && !e.shiftKey && exitBlockOnEnter(el)) {
      e.preventDefault();
      normalizeBlocks(el);
      emit();
      refresh();
      return;
    }

    // Tab indents a list rather than leaving the note.
    if (e.key === "Tab" && caretList(el)) {
      e.preventDefault();
      document.execCommand(e.shiftKey ? "outdent" : "indent");
      emit();
    }
  };

  /**
   * One click handler for the two things inside the text that are not text:
   * the box in front of a checklist item, and a link to another note.
   */
  const onClick = (e: React.MouseEvent) => {
    const item = checklistItemAt(e.target, e.clientX);
    if (item) {
      e.preventDefault();
      item.setAttribute("data-done", item.getAttribute("data-done") === "true" ? "false" : "true");
      emit();
      return;
    }
    const link = (e.target as Element).closest?.("a.hm-wiki");
    const id = link?.getAttribute("data-note");
    if (id && onOpenNote) {
      e.preventDefault();
      onOpenNote(id);
    }
  };

  const toolbar = (
    <EditorToolbar
      state={state}
      run={run}
      className={cn(!toolbarPortal && "mb-3", toolbarClassName)}
    />
  );

  return (
    <div className={className}>
      <DocStyles />
      {toolbarPortal ? createPortal(toolbar, toolbarPortal) : toolbar}

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-empty={empty}
        data-placeholder={placeholder}
        spellCheck
        style={{ minHeight }}
        onInput={() => { emit(); refresh(); }}
        onBlur={() => {
          const el = ref.current;
          if (!el) return;
          // A cheap safety net: whatever route markup took in, it is scrubbed
          // before it can be stored.
          const clean = sanitizeHtml(el.innerHTML);
          if (clean !== el.innerHTML) { el.innerHTML = clean; emit(); }
          setWiki(null);
        }}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onClick={onClick}
        className={cn(DOC_CLASS, "relative w-full text-[14px] text-ink")}
      />

      {wiki && (
        <WikiMenu
          prompt={wiki}
          onPick={(pick) => {
            const el = ref.current;
            if (!el) return;
            el.focus();
            insertWikiLink(pick.id, pick.label, wiki.typed);
            setWiki(null);
            emit();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------
// [[ links ]]
//
// Typing "[[" opens a list of notes; picking one writes an anchor carrying its
// id, so the link survives the title being edited afterwards. Typing straight
// past the menu still works — a bare [[title]] is resolved by name.
// ---------------------------------------------------------

interface WikiMatch { id: string; label: string; hint: string }

interface WikiPrompt {
  matches: WikiMatch[];
  active: number;
  typed: number;
  rect: { top: number; left: number };
}

const WIKI_LIMIT = 7;

function readWiki(root: HTMLElement, notes: Note[], currentId?: string): WikiPrompt | null {
  const at = wikiQueryAtCaret(root);
  if (!at) return null;

  const q = at.query.trim().toLowerCase();
  const matches: WikiMatch[] = [];
  for (const note of notes) {
    if (note.id === currentId || note.is_template) continue;
    const label = note.title?.trim() || noteText(note).split("\n")[0]?.trim() || "Untitled";
    if (q && !label.toLowerCase().includes(q)) continue;
    matches.push({ id: note.id, label, hint: note.categories[0] ?? note.kind });
    if (matches.length >= WIKI_LIMIT) break;
  }
  if (!matches.length) return null;

  const sel = window.getSelection();
  const rects = sel?.rangeCount ? sel.getRangeAt(0).getClientRects() : null;
  const box = rects?.length ? rects[rects.length - 1] : root.getBoundingClientRect();

  return { matches, active: 0, typed: at.typed, rect: { top: box.bottom + 6, left: box.left } };
}

function WikiMenu({ prompt, onPick }: { prompt: WikiPrompt; onPick: (m: WikiMatch) => void }) {
  const mounted = useMounted();
  if (!mounted) return null;

  const left = Math.min(prompt.rect.left, window.innerWidth - 268);
  const top = Math.min(prompt.rect.top, window.innerHeight - 240);

  return createPortal(
    <div
      role="listbox"
      aria-label="Link to a note"
      style={{ top, left }}
      className="fixed z-[95] w-[260px] rounded-xl border border-line bg-raised p-1 shadow-lg anim-pop"
    >
      {prompt.matches.map((m, i) => (
        <button
          key={m.id}
          type="button"
          role="option"
          aria-selected={i === prompt.active}
          onMouseDown={(e) => { e.preventDefault(); onPick(m); }}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-[6px] text-left text-[13px]",
            i === prompt.active ? "bg-hover text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
          )}
        >
          <FileText className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{m.label}</span>
          <span className="shrink-0 text-[11px] text-ink-4">{m.hint}</span>
        </button>
      ))}
      <p className="flex items-center gap-1 px-2 pb-0.5 pt-1 text-[11px] text-ink-4">
        <CornerDownLeft className="size-3" aria-hidden />
        to link
      </p>
    </div>,
    document.body,
  );
}
