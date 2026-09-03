"use client";

import * as React from "react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold,
  ChevronDown, Code2, Heading1, Heading2, Heading3, Highlighter, Italic, Link2,
  List, ListChecks, ListOrdered, Minus, Quote, Redo2, RemoveFormatting,
  Strikethrough, Type, Underline, Undo2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
import {
  DEFAULT_FONT, DEFAULT_SIZE, FONTS, FONT_GROUPS, FONT_SIZES, HIGHLIGHTS,
  TEXT_COLORS, type FontChoice,
} from "./fonts";
import {
  applyColor, applyFont, applyHighlight, applySize, exec, insertLink, setBlock,
  toggleChecklist,
} from "./editor-commands";

// =========================================================
// The toolbar.
//
// Word's arrangement, because that is the one every person already knows:
// history, then the two type menus, then the four weights, then colour, then
// blocks, then lists, then alignment, then links. Nothing is folded away —
// a formatting bar whose buttons hide is a formatting bar you stop trusting.
//
// Every control kills its own mousedown. Without that, pressing a button
// blurs the editor, the selection collapses, and the command lands on nothing.
// =========================================================

export interface ToolbarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  block: string;
  list: "ul" | "ol" | "check" | null;
  align: "left" | "center" | "right" | "justify";
  font: FontChoice | null;
  size: number | null;
}

export type RunCommand = (fn: (root: HTMLElement) => void) => void;

const BLOCKS: { tag: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { tag: "p", label: "Body text", icon: Type },
  { tag: "h1", label: "Heading 1", icon: Heading1 },
  { tag: "h2", label: "Heading 2", icon: Heading2 },
  { tag: "h3", label: "Heading 3", icon: Heading3 },
  { tag: "blockquote", label: "Quote", icon: Quote },
  { tag: "pre", label: "Code block", icon: Code2 },
];

const ALIGNS: { key: ToolbarState["align"]; command: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "left", command: "justifyLeft", label: "Align left", icon: AlignLeft },
  { key: "center", command: "justifyCenter", label: "Centre", icon: AlignCenter },
  { key: "right", command: "justifyRight", label: "Align right", icon: AlignRight },
  { key: "justify", command: "justifyFull", label: "Justify", icon: AlignJustify },
];

/** Stops the press from stealing focus, which would collapse the selection. */
const keepFocus = (e: React.SyntheticEvent) => e.preventDefault();

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function Sep() {
  return <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-line" />;
}

function MenuButton({
  label, width, children, panel, panelClassName,
}: {
  label: string;
  width?: number;
  /** what the closed button shows */
  children: React.ReactNode;
  panel: (close: () => void) => React.ReactNode;
  panelClassName?: string;
}) {
  return (
    <Popover
      className={cn("max-h-[320px] overflow-y-auto", panelClassName)}
      trigger={
        <button
          type="button"
          aria-label={label}
          onMouseDown={keepFocus}
          style={width ? { width } : undefined}
          className={cn(
            "inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[12px] text-ink",
            "transition-colors duration-100 hover:bg-hover",
          )}
        >
          {children}
          <ChevronDown className="size-3 shrink-0 text-ink-4" aria-hidden />
        </button>
      }
    >
      {(close) => <div onMouseDown={keepFocus}>{panel(close)}</div>}
    </Popover>
  );
}

function Swatches({
  options, onPick, title,
}: {
  options: { label: string; value: string }[];
  onPick: (value: string) => void;
  title: string;
}) {
  return (
    <>
      <MenuLabel>{title}</MenuLabel>
      <div className="grid grid-cols-4 gap-1 p-1">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            title={o.label}
            aria-label={o.label}
            onMouseDown={keepFocus}
            onClick={() => onPick(o.value)}
            className="grid h-7 cursor-pointer place-items-center rounded-md border border-line transition-transform duration-100 hover:bg-hover active:scale-[0.94]"
            style={o.value ? { background: o.value.startsWith("rgba") ? o.value : undefined } : undefined}
          >
            <span
              aria-hidden
              className="text-[13px] font-semibold leading-none"
              style={{ color: o.value && !o.value.startsWith("rgba") ? o.value : "var(--ink)" }}
            >
              {o.value ? "A" : "—"}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

export function EditorToolbar({
  state, run, className,
}: {
  state: ToolbarState;
  run: RunCommand;
  className?: string;
}) {
  const block = BLOCKS.find((b) => b.tag === state.block) ?? BLOCKS[0];
  const BlockGlyph = block.icon;

  const toggle = (
    label: string, on: boolean, Glyph: React.ComponentType<{ className?: string }>,
    command: string, shortcut?: string,
  ) => (
    <IconButton
      label={shortcut ? `${label} (${shortcut})` : label}
      size="md"
      active={on}
      aria-pressed={on}
      onMouseDown={keepFocus}
      onClick={() => run(() => exec(command))}
    >
      <Glyph />
    </IconButton>
  );

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className={cn(
        "flex flex-wrap items-center gap-x-1 gap-y-1 rounded-lg border border-line bg-sunken px-1.5 py-1",
        className,
      )}
    >
      <Group>
        <IconButton label="Undo" size="md" onMouseDown={keepFocus} onClick={() => run(() => exec("undo"))}>
          <Undo2 />
        </IconButton>
        <IconButton label="Redo" size="md" onMouseDown={keepFocus} onClick={() => run(() => exec("redo"))}>
          <Redo2 />
        </IconButton>
      </Group>

      <Sep />

      <Group>
        <MenuButton
          label="Font"
          width={112}
          panelClassName="w-[196px]"
          panel={(close) => (
            <>
              {FONT_GROUPS.map((group) => (
                <React.Fragment key={group}>
                  <MenuLabel>{group}</MenuLabel>
                  {FONTS.filter((f) => f.group === group).map((f) => (
                    <MenuItem
                      key={f.label}
                      checked={state.font?.label === f.label}
                      onClick={() => { run((root) => applyFont(root, f.stack)); close(); }}
                    >
                      <span style={{ fontFamily: f.stack }}>{f.label}</span>
                    </MenuItem>
                  ))}
                </React.Fragment>
              ))}
            </>
          )}
        >
          <span
            className="min-w-0 flex-1 truncate text-left"
            style={{ fontFamily: (state.font ?? DEFAULT_FONT).stack }}
          >
            {(state.font ?? DEFAULT_FONT).label}
          </span>
        </MenuButton>

        <MenuButton
          label="Font size"
          width={54}
          panelClassName="w-[104px]"
          panel={(close) => (
            <>
              {FONT_SIZES.map((px) => (
                <MenuItem
                  key={px}
                  checked={state.size === px}
                  onClick={() => { run((root) => applySize(root, px)); close(); }}
                >
                  <span className="tnum">{px}</span>
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onClick={() => { run((root) => applySize(root, null)); close(); }}>
                Reset
              </MenuItem>
            </>
          )}
        >
          <span className="min-w-0 flex-1 text-left tnum">{state.size ?? DEFAULT_SIZE}</span>
        </MenuButton>
      </Group>

      <Sep />

      <Group>
        {toggle("Bold", state.bold, Bold, "bold", "⌘B")}
        {toggle("Italic", state.italic, Italic, "italic", "⌘I")}
        {toggle("Underline", state.underline, Underline, "underline", "⌘U")}
        {toggle("Strikethrough", state.strike, Strikethrough, "strikeThrough")}
      </Group>

      <Sep />

      <Group>
        <MenuButton
          label="Text colour"
          panelClassName="w-[176px]"
          panel={(close) => (
            <Swatches
              title="Text colour"
              options={TEXT_COLORS}
              onPick={(value) => { run((root) => applyColor(root, value)); close(); }}
            />
          )}
        >
          <Baseline className="size-4 text-ink-3" aria-hidden />
        </MenuButton>

        <MenuButton
          label="Highlight"
          panelClassName="w-[176px]"
          panel={(close) => (
            <Swatches
              title="Highlight"
              options={HIGHLIGHTS}
              onPick={(value) => { run((root) => applyHighlight(root, value)); close(); }}
            />
          )}
        >
          <Highlighter className="size-4 text-ink-3" aria-hidden />
        </MenuButton>
      </Group>

      <Sep />

      <Group>
        <MenuButton
          label={`Paragraph style: ${block.label}`}
          width={118}
          panelClassName="w-[184px]"
          panel={(close) => (
            <>
              {BLOCKS.map((b) => {
                const Glyph = b.icon;
                return (
                  <MenuItem
                    key={b.tag}
                    icon={Glyph}
                    checked={state.block === b.tag}
                    onClick={() => { run(() => setBlock(b.tag)); close(); }}
                  >
                    {b.label}
                  </MenuItem>
                );
              })}
            </>
          )}
        >
          <BlockGlyph className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{block.label}</span>
        </MenuButton>
      </Group>

      <Sep />

      <Group>
        <IconButton
          label="Bulleted list" size="md" active={state.list === "ul"} aria-pressed={state.list === "ul"}
          onMouseDown={keepFocus} onClick={() => run(() => exec("insertUnorderedList"))}
        >
          <List />
        </IconButton>
        <IconButton
          label="Numbered list" size="md" active={state.list === "ol"} aria-pressed={state.list === "ol"}
          onMouseDown={keepFocus} onClick={() => run(() => exec("insertOrderedList"))}
        >
          <ListOrdered />
        </IconButton>
        <IconButton
          label="Checklist" size="md" active={state.list === "check"} aria-pressed={state.list === "check"}
          onMouseDown={keepFocus} onClick={() => run((root) => toggleChecklist(root))}
        >
          <ListChecks />
        </IconButton>
      </Group>

      <Sep />

      <Group>
        {ALIGNS.map((a) => {
          const Glyph = a.icon;
          return (
            <IconButton
              key={a.key}
              label={a.label}
              size="md"
              active={state.align === a.key}
              aria-pressed={state.align === a.key}
              onMouseDown={keepFocus}
              onClick={() => run(() => exec(a.command))}
            >
              <Glyph />
            </IconButton>
          );
        })}
      </Group>

      <Sep />

      <Group>
        <IconButton
          label="Add a link"
          size="md"
          onMouseDown={keepFocus}
          onClick={() => run(() => {
            const url = window.prompt("Link to");
            if (url?.trim()) insertLink(url.trim());
          })}
        >
          <Link2 />
        </IconButton>
        <IconButton
          label="Divider"
          size="md"
          onMouseDown={keepFocus}
          onClick={() => run(() => exec("insertHorizontalRule"))}
        >
          <Minus />
        </IconButton>
        <IconButton
          label="Clear formatting"
          size="md"
          onMouseDown={keepFocus}
          onClick={() => run(() => { exec("removeFormat"); setBlock("p"); })}
        >
          <RemoveFormatting />
        </IconButton>
      </Group>
    </div>
  );
}
