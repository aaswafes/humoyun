"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

// =========================================================
// Folded sections.
//
// Which panels you left open lives in localStorage, which is an external store:
// reading it during render would not survive hydration, and copying it into
// state from an effect costs a second render on every fold on the screen.
// =========================================================
const listeners = new Set<() => void>();
const cache = new Map<string, boolean>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function read(key: string, fallback: boolean): boolean {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let value = fallback;
  try {
    const saved = localStorage.getItem(key);
    if (saved === "1") value = true;
    else if (saved === "0") value = false;
  } catch { /* private mode */ }
  cache.set(key, value);
  return value;
}

function write(key: string, next: boolean) {
  cache.set(key, next);
  try { localStorage.setItem(key, next ? "1" : "0"); } catch { /* private mode */ }
  listeners.forEach((fn) => fn());
}

/** Remembered open state for one folded section, keyed per surface. */
export function useFold(key: string, fallback = false) {
  const open = React.useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const setOpen = React.useCallback((next: boolean) => write(key, next), [key]);
  return [open, setOpen] as const;
}

/**
 * The animated part on its own, for sections whose header is not a plain
 * label — the `-m-1 p-1` keeps focus rings inside the clip while it moves.
 */
export function FoldRegion({
  open, children, className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-[var(--ease-out-apple)]",
        className,
      )}
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden" inert={open ? undefined : true}>
        <div className="-m-1 p-1">{children}</div>
      </div>
    </div>
  );
}

/**
 * A section that rests as one line: label, what is inside, chevron. Never a
 * dead end — the summary states the value of opening it.
 */
export function Fold({
  label, summary, storageKey, defaultOpen = false, children, className, bodyClassName,
}: {
  label: string;
  summary?: React.ReactNode;
  /** localStorage key, namespaced to the surface. */
  storageKey: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [open, setOpen] = useFold(storageKey, defaultOpen);

  return (
    <section className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "-mx-1.5 flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-1.5 text-left",
          "transition-colors duration-150 hover:bg-hover",
        )}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <span className="shrink-0 text-[12px] font-semibold text-ink-2">{label}</span>
        {summary && (
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3 tnum">{summary}</span>
        )}
      </button>
      <FoldRegion open={open}>
        <div className={cn("pt-2", bodyClassName)}>{children}</div>
      </FoldRegion>
    </section>
  );
}
