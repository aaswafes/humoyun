"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

// =========================================================
// Folding, for this surface only.
//
// Nothing on the goals pages was removed in the calm pass — the panels that
// used to shout on load now rest folded behind a line that says what is inside
// them, and remember whether you opened them.
// =========================================================

const PREFIX = "humoyun.goals.";

function readPref(key: string): string | null {
  try { return localStorage.getItem(PREFIX + key); } catch { return null; }
}

function writePref(key: string, value: string) {
  try { localStorage.setItem(PREFIX + key, value); } catch { /* private mode */ }
}

/**
 * Resting state for one panel, remembered. Read after mount rather than in the
 * initialiser: the server render has no localStorage, and disagreeing with it
 * costs a hydration error.
 */
export function useFold(key: string, defaultOpen = false) {
  const [open, setOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    const saved = readPref(key);
    if (saved === "1" || saved === "0") setOpen(saved === "1");
  }, [key]);

  const set = React.useCallback((next: boolean) => {
    writePref(key, next ? "1" : "0");
    setOpen(next);
  }, [key]);

  const toggle = React.useCallback(() => set(!open), [set, open]);

  return { open, setOpen: set, toggle };
}

const KEYFRAMES =
  "@keyframes hm-fold-in { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }";

/**
 * A folded section is one row: a quiet label, its summary, a chevron. The
 * summary is not decoration — it is what stops the fold being a dead end, so
 * it always states what the panel holds.
 */
export function Fold({
  id, label, summary, open, onToggle, children, actions, strong, className, bodyClassName,
}: {
  id: string;
  label: React.ReactNode;
  /** one line that says what is inside — a count, a total, a date range */
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** controls that stay reachable while the panel is folded */
  actions?: React.ReactNode;
  /** true section header — uppercase, for the two or three that earn it */
  strong?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className={cn(
            "flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md py-1.5 text-left",
            "transition-colors duration-150",
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
              open && "rotate-90",
            )}
          />
          <span
            className={cn(
              "shrink-0",
              strong
                ? "text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3"
                : "text-[12.5px] font-medium text-ink-2",
            )}
          >
            {label}
          </span>
          {summary != null && (
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3 tnum">{summary}</span>
          )}
        </button>
        {actions}
      </div>

      {open && (
        <div
          id={id}
          className={cn("pt-1", bodyClassName)}
          style={{ animation: "hm-fold-in 200ms var(--ease-out-apple) both" }}
        >
          <style>{KEYFRAMES}</style>
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * The quiet heading inside a group. Uppercase micro-labels are reserved for the
 * two or three headers that genuinely divide a screen; everything below that
 * level says its piece in sentence case and gets out of the way.
 */
export function SubLabel({
  children, className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-[12px] font-medium text-ink-3", className)}>{children}</span>
  );
}
