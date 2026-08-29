"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Today's resting state. Every panel on this page keeps its own open/closed
 * memory so the page opens the way you left it — the feature never moves, only
 * whether it is unfolded when you arrive.
 */
const PREFIX = "humoyun.today.";

function readFold(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === "1" ? true : raw === "0" ? false : null;
  } catch {
    return null; // private mode
  }
}

function writeFold(key: string, open: boolean) {
  try { localStorage.setItem(PREFIX + key, open ? "1" : "0"); } catch { /* private mode */ }
}

/**
 * Read after mount, never in the initialiser: the server render has no
 * localStorage, and disagreeing with it costs a hydration error.
 */
export function useFold(key: string, defaultOpen = false) {
  const [open, setOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    const saved = readFold(key);
    if (saved !== null) setOpen(saved);
  }, [key]);

  const toggle = React.useCallback(() => {
    setOpen((v) => { writeFold(key, !v); return !v; });
  }, [key]);

  /** Anything that targets folded content unfolds it first — never a dead end. */
  const reveal = React.useCallback(() => {
    setOpen((v) => { if (!v) writeFold(key, true); return true; });
  }, [key]);

  return { open, toggle, reveal };
}

/**
 * A folded section is one row: a quiet title, a summary that states what is
 * inside, and a chevron. Open is 200ms. Nothing here is a card — the content
 * sits on spacing, so a panel inside the fold never doubles a border.
 */
export function Fold({
  title, summary, open, onToggle, icon: Icon, accessory, children, className, bodyClassName,
}: {
  title: string;
  /** Reads in place of the content while folded. Keep it factual: "5h 20m planned · 1 unscheduled". */
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  /** Controls that belong to the header. Rendered beside the toggle, never inside it. */
  accessory?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const bodyId = React.useId();

  return (
    <section className={cn("min-w-0", className)}>
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className={cn(
            "group -mx-2 flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left",
            "cursor-pointer transition-colors duration-150 ease-[var(--ease-out-apple)] hover:bg-hover",
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
              "group-hover:text-ink-3",
              open && "rotate-90",
            )}
          />
          {Icon && <Icon className="size-3.5 shrink-0 text-ink-4" />}
          <span className="shrink-0 text-[12.5px] font-medium text-ink-2">{title}</span>
          {!open && summary && (
            <span className="min-w-0 truncate text-[12.5px] text-ink-3 tnum">{summary}</span>
          )}
        </button>
        {accessory && <div className="flex shrink-0 items-center gap-1">{accessory}</div>}
      </div>

      <div
        id={bodyId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-[var(--ease-out-apple)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className={cn("min-h-0 overflow-hidden", bodyClassName)}>{children}</div>
      </div>
    </section>
  );
}
