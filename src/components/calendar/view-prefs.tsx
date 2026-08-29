"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

// =========================================================
// Remembered preferences
//
// Every fold on this surface persists, so the calendar opens the way the
// reader left it. Values are read after mount rather than in the initialiser:
// the server render has no localStorage, and disagreeing with it costs a
// hydration error.
// =========================================================
export function readPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

/** A boolean that survives a reload. `fallback` is what the first visit sees. */
export function useStickyFlag(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = React.useState(fallback);

  React.useEffect(() => {
    const stored = readPref(key);
    if (stored === "on") setValue(true);
    else if (stored === "off") setValue(false);
  }, [key]);

  const set = React.useCallback((next: boolean) => {
    setValue(next);
    writePref(key, next ? "on" : "off");
  }, [key]);

  return [value, set];
}

/** The same, for a small set of named choices (density, an open accordion pane). */
export function useStickyChoice<T extends string>(
  key: string, fallback: T, options: readonly T[],
): [T, (next: T) => void] {
  const [value, setValue] = React.useState<T>(fallback);

  React.useEffect(() => {
    const stored = readPref(key);
    if (stored && (options as readonly string[]).includes(stored)) setValue(stored as T);
    // The option list is a module constant everywhere this is used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = React.useCallback((next: T) => {
    setValue(next);
    writePref(key, next);
  }, [key]);

  return [value, set];
}

// =========================================================
// Fold — the one disclosure this surface uses
//
// A quiet label, a summary that says what is inside, and a chevron. The panel
// stays mounted so its content keeps its state across a fold, and goes `inert`
// when closed so Tab never walks into something the reader cannot see.
// =========================================================
export function Fold({
  label, summary, open, onOpenChange, children, className, panelClassName, dense,
}: {
  label: string;
  /** States the value of what is folded — never just "details". */
  summary?: React.ReactNode;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
  dense?: boolean;
}) {
  const panelId = React.useId();

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "-mx-1 flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1 text-left",
          "transition-colors duration-150 hover:bg-hover",
          dense ? "h-7" : "h-8",
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
            open && "rotate-90",
          )}
        />
        <span className="shrink-0 text-[12px] font-medium text-ink-2">{label}</span>
        {summary != null && (
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-4 tnum">{summary}</span>
        )}
      </button>

      <div
        id={panelId}
        inert={!open}
        className="grid transition-[grid-template-rows] duration-200 ease-[var(--ease-out-apple)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div
          className={cn(
            "min-h-0 overflow-hidden transition-opacity duration-200 ease-[var(--ease-out-apple)]",
            open ? "opacity-100" : "opacity-0",
            panelClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
