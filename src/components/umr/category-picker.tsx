"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { UMR_CATEGORIES, UMR_META, type UmrCategory } from "@/lib/umr";

// =========================================================
// Five buttons. Used everywhere a category is chosen — the quick log, the
// triage list, the task inspector, settings — so the five words are learned
// once and always look the same.
// =========================================================

export function CategoryPicker({
  value, onChange, allowNone, size = "md", className, label = "Kind of living",
}: {
  value: UmrCategory | null;
  onChange: (value: UmrCategory | null) => void;
  /** Adds a "Not set" button, for rows that are allowed to stay undecided. */
  allowNone?: boolean;
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1", className)}>
      {UMR_CATEGORIES.map((c) => {
        const meta = UMR_META[c];
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${meta.label} — ${meta.gloss}: ${meta.examples}`}
            onClick={() => onChange(active && allowNone ? null : c)}
            className={cn(
              `tint-${meta.tint}`,
              "inline-flex items-center gap-1.5 rounded-full border cursor-pointer",
              "transition-colors duration-150 active:scale-[0.97]",
              size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12.5px]",
              active
                ? "border-transparent bg-[var(--tint-soft)] font-medium text-[var(--tint-ink)]"
                : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
            )}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: "var(--tint)" }}
              aria-hidden
            />
            {meta.label}
          </button>
        );
      })}

      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          title="Leave it undecided — it stays on the triage list"
          onClick={() => onChange(null)}
          className={cn(
            "inline-flex items-center rounded-full border cursor-pointer transition-colors duration-150",
            size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12.5px]",
            value === null
              ? "border-line-strong bg-hover font-medium text-ink-2"
              : "border-line text-ink-4 hover:text-ink-3",
          )}
        >
          Not set
        </button>
      )}
    </div>
  );
}

/**
 * The same five, but any number of them at once.
 *
 * Only a focus sitting can be more than one kind — an hour studying with a
 * friend is Taʼlim and Inson both — and its minutes then split evenly between
 * them. A task or a habit is one thing, and uses `CategoryPicker` above.
 */
export function CategoryMultiPicker({
  values, onChange, size = "md", className, label = "Kinds of living",
}: {
  values: UmrCategory[];
  onChange: (next: UmrCategory[]) => void;
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  const toggle = (c: UmrCategory) => {
    const next = values.includes(c) ? values.filter((v) => v !== c) : [...values, c];
    // Kept in the canonical order so two equal selections always read the same.
    onChange(UMR_CATEGORIES.filter((k) => next.includes(k)));
  };

  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1", className)}>
      {UMR_CATEGORIES.map((c) => {
        const meta = UMR_META[c];
        const active = values.includes(c);
        return (
          <button
            key={c}
            type="button"
            role="checkbox"
            aria-checked={active}
            title={`${meta.label} — ${meta.gloss}: ${meta.examples}`}
            onClick={() => toggle(c)}
            className={cn(
              `tint-${meta.tint}`,
              "inline-flex items-center gap-1.5 rounded-full border cursor-pointer",
              "transition-colors duration-150 active:scale-[0.97]",
              size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12.5px]",
              active
                ? "border-transparent bg-[var(--tint-soft)] font-medium text-[var(--tint-ink)]"
                : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
            )}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: active ? "var(--tint)" : "var(--ink-4)" }}
              aria-hidden
            />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

/** A small read-only badge, for a row that already has one. */
export function CategoryTag({
  category, className, size = "md",
}: {
  category: UmrCategory;
  className?: string;
  size?: "sm" | "md";
}) {
  const meta = UMR_META[category];
  return (
    <span
      title={`${meta.label} — ${meta.gloss}`}
      className={cn(
        `tint-${meta.tint}`,
        "inline-flex items-center gap-1 rounded-full bg-[var(--tint-soft)] text-[var(--tint-ink)]",
        size === "sm" ? "px-1.5 text-[10.5px]" : "px-2 py-0.5 text-[11.5px]",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: "var(--tint)" }} aria-hidden />
      {meta.label}
    </span>
  );
}
