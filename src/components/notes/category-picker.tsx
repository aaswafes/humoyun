"use client";

import * as React from "react";
import {
  Book, Briefcase, Camera, Code, Compass, Film, Flag, Flame, Folder,
  GraduationCap, Heart, Languages, Layers, Leaf, Lightbulb, Map, Moon, Music,
  PenLine, Plus, Quote, Search, Sparkles, Star, Tag, Users, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Note, Tint } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/overlays";
import {
  STARTER_CATEGORIES, type CategoryIndex, allCategoryNames, hasCategory, toggleCategory,
} from "./category-model";

// =========================================================
// Picking the shelves a note sits on.
//
// One control, many answers — which is the whole difference from the kind
// menu next to it. Nothing here writes a note's kind, its source or its tags;
// those are three other questions with three other answers.
// =========================================================

type Glyph = React.ComponentType<{ className?: string }>;

export const CATEGORY_ICONS: Record<string, Glyph> = {
  book: Book, film: Film, moon: Moon, graduation: GraduationCap,
  lightbulb: Lightbulb, users: Users, briefcase: Briefcase, heart: Heart,
  quote: Quote, languages: Languages, star: Star, flag: Flag, map: Map,
  music: Music, code: Code, camera: Camera, leaf: Leaf, flame: Flame,
  compass: Compass, pen: PenLine, layers: Layers, sparkles: Sparkles,
  folder: Folder,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

/** Past this many categories of your own, the starter list stops being help. */
const SUGGEST_UNTIL = 5;

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Glyph = (name && CATEGORY_ICONS[name]) || Tag;
  return <Glyph className={className} />;
}

// ---------------------------------------------------------
// Read-only pill — cards, canvas, the graph legend
// ---------------------------------------------------------

export function CategoryChip({
  name, color, icon, onRemove, className,
}: {
  name: string;
  color: Tint;
  icon?: string | null;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        `tint-${color}`,
        "inline-flex h-[20px] max-w-[150px] items-center gap-1 rounded-[6px] pl-1.5 text-[11px] font-medium leading-none",
        onRemove ? "pr-0.5" : "pr-1.5",
        className,
      )}
      style={{ background: "var(--tint-soft)", color: "var(--tint-ink)" }}
    >
      <CategoryIcon name={icon ?? null} className="size-3 shrink-0 opacity-80" />
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Take this note off ${name}`}
          onClick={onRemove}
          className="-my-1 grid size-[20px] shrink-0 cursor-pointer place-items-center rounded-[6px] opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------
// The multiselect
// ---------------------------------------------------------

export function CategoryPicker({
  value, onChange, notes, index, align = "start", trigger,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  notes: Note[];
  index: CategoryIndex;
  align?: "start" | "end" | "center";
  /** override the default pill, e.g. a toolbar button */
  trigger?: React.ReactElement;
}) {
  const insert = useStore((s) => s.insert);
  const [query, setQuery] = React.useState("");
  const inputId = React.useId();

  const names = React.useMemo(() => allCategoryNames(notes, index), [notes, index]);
  const q = query.trim().toLowerCase();
  const shown = q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
  const exact = names.some((n) => n.toLowerCase() === q);

  /**
   * Starters worth offering: only while the vocabulary is small, only the ones
   * not already there, and never over a search — a suggestion in the middle of
   * a filtered list reads as a match that is not one.
   */
  const suggestions = q || index.known.length >= SUGGEST_UNTIL
    ? []
    : STARTER_CATEGORIES.filter((s) => !names.some((n) => n.toLowerCase() === s.name.toLowerCase()));

  /**
   * A category typed here becomes a real row, not just a string on one note.
   * Otherwise it would have no colour to give the graph and nothing to rename
   * later — it would exist only as long as that one note did.
   */
  const create = () => {
    const name = query.trim();
    if (!name || exact) return;
    insert("noteCategories", {
      name,
      color: index.look(name).color,
      order_index: index.known.length,
    });
    onChange(toggleCategory(value, name));
    setQuery("");
  };

  const summary = value.length === 0
    ? "Categories"
    : value.length === 1
      ? value[0]
      : `${value[0]} +${value.length - 1}`;

  const defaultTrigger = (
    <button
      type="button"
      aria-label={
        value.length
          ? `Categories: ${value.join(", ")}. Change them`
          : "Add this note to a category"
      }
      className={cn(
        "inline-flex h-7 max-w-[190px] cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5",
        "text-[12px] transition-colors duration-150 hover:bg-hover hover:text-ink",
        value.length ? "text-ink" : "text-ink-2",
      )}
    >
      <Layers className="size-3.5 shrink-0 text-ink-3" aria-hidden />
      <span className="truncate">{summary}</span>
    </button>
  );

  return (
    <Popover align={align} className="w-[236px] p-0" trigger={trigger ?? defaultTrigger}>
      {() => (
        <>
          <div className="relative border-b border-line p-1.5">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4"
              aria-hidden
            />
            <label htmlFor={inputId} className="sr-only">Find or create a category</label>
            <input
              id={inputId}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (!exact && query.trim()) { create(); return; }
                const first = shown[0];
                if (first) { onChange(toggleCategory(value, first)); setQuery(""); }
              }}
              placeholder="Find or create…"
              className="h-7 w-full rounded-md bg-transparent pl-6 pr-2 text-[12.5px] text-ink outline-none placeholder:text-ink-4"
            />
          </div>

          <div className="max-h-[248px] overflow-y-auto p-1">
            {shown.map((name) => {
              const look = index.look(name);
              const on = hasCategory(value, name);
              return (
                <button
                  key={name}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => onChange(toggleCategory(value, name))}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-[6px] text-left",
                    "text-[13px] text-ink transition-colors duration-100 hover:bg-hover",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      `tint-${look.color}`,
                      "grid size-[18px] shrink-0 place-items-center rounded-[5px]",
                    )}
                    style={{ background: "var(--tint-soft)", color: "var(--tint-ink)" }}
                  >
                    <CategoryIcon name={look.icon} className="size-3" />
                  </span>
                  <span className="flex-1 truncate">{name}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-[15px] shrink-0 place-items-center rounded-[4px] border transition-colors",
                      on ? "border-accent bg-accent text-white" : "border-line-strong",
                    )}
                  >
                    {on && (
                      <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={2.2}>
                        <path d="M2.5 6.3 4.8 8.6 9.5 3.9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}

            {/* Suggestions while the vocabulary is still being built, and gone
                once it is the user's own. Offering them only when the list is
                completely empty meant the first pick took the rest away. */}
            {suggestions.length > 0 && (
              <div className="px-1 py-1">
                <p className="px-1 pb-1.5 text-[11.5px] leading-snug text-ink-4">
                  {names.length ? "Or start with one of these." : "No categories yet. Type one above, or start with these."}
                </p>
                {suggestions.map((seed, i) => (
                  <button
                    key={seed.name}
                    type="button"
                    onClick={() => {
                      insert("noteCategories", { ...seed, order_index: index.known.length + i });
                      onChange(toggleCategory(value, seed.name));
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-[6px] text-left text-[13px] text-ink transition-colors hover:bg-hover"
                  >
                    <span
                      aria-hidden
                      className={cn(`tint-${seed.color}`, "grid size-[18px] shrink-0 place-items-center rounded-[5px]")}
                      style={{ background: "var(--tint-soft)", color: "var(--tint-ink)" }}
                    >
                      <CategoryIcon name={seed.icon} className="size-3" />
                    </span>
                    <span className="flex-1 truncate">{seed.name}</span>
                    <Plus className="size-3 shrink-0 text-ink-4" aria-hidden />
                  </button>
                ))}
              </div>
            )}

            {query.trim() && !exact && (
              <button
                type="button"
                onClick={create}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-[6px] text-left text-[13px] text-ink transition-colors hover:bg-hover"
              >
                <Plus className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                <span className="truncate">Create &ldquo;{query.trim()}&rdquo;</span>
              </button>
            )}
          </div>

          {value.length > 0 && (
            <div className="border-t border-line p-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full cursor-pointer rounded-md px-1.5 py-[6px] text-left text-[12.5px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
              >
                Clear all {value.length}
              </button>
            </div>
          )}
        </>
      )}
    </Popover>
  );
}

/** The row of pills under a note's title, with a remove on each. */
export function CategoryRow({
  value, onChange, index, className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  index: CategoryIndex;
  className?: string;
}) {
  if (!value.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {value.map((name) => {
        const look = index.look(name);
        return (
          <li key={name}>
            <CategoryChip
              name={name}
              color={look.color}
              icon={look.icon}
              onRemove={() => onChange(toggleCategory(value, name))}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Compact, read-only, capped — what a card and a canvas item show. */
export function CategoryChips({
  names, index, max = 3, className,
}: {
  names: string[];
  index: CategoryIndex;
  max?: number;
  className?: string;
}) {
  if (!names.length) return null;
  const shown = names.slice(0, max);
  const hidden = names.length - shown.length;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((name) => {
        const look = index.look(name);
        return <CategoryChip key={name} name={name} color={look.color} icon={look.icon} />;
      })}
      {hidden > 0 && <span className="text-[11px] text-ink-4 tnum">+{hidden}</span>}
    </span>
  );
}

/** Used by the manager and the picker header alike. */
export function IconPicker({
  value, onChange,
}: {
  value: string | null;
  onChange: (next: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5 p-1">
      {CATEGORY_ICON_NAMES.map((name) => (
        <IconButton
          key={name}
          label={name}
          size="md"
          active={value === name}
          onClick={() => onChange(name)}
        >
          <CategoryIcon name={name} />
        </IconButton>
      ))}
    </div>
  );
}
