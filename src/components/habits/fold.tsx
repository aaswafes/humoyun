"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Disclosure state that survives a reload.
 *
 * The saved value is read after mount, not in a lazy initialiser: the server
 * has no localStorage, so reading it during the first render would hydrate to
 * a different tree than the one the server sent.
 */
export function useFold(key: string, defaultOpen = false) {
  const [open, setOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved === "1" || saved === "0") setOpen(saved === "1");
    } catch {
      // Storage can be denied outright — the fold simply keeps its default.
    }
  }, [key]);

  const set = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      try { window.localStorage.setItem(key, next ? "1" : "0"); } catch { /* see above */ }
    },
    [key],
  );

  const toggle = React.useCallback(() => set(!open), [open, set]);

  return { open, toggle, set };
}

/**
 * A folded section: one quiet row that says what is inside, a chevron, and a
 * 200ms open. Nothing here is ever a dead end — the summary line carries the
 * value of the panel so it can be judged without opening it.
 */
export function Fold({
  label, summary, open, onToggle, children, className, panelClassName,
}: {
  label: string;
  /** States what is inside — a number, a ratio, a name. Never "details". */
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
}) {
  const panelId = React.useId();

  return (
    <section className={cn("min-w-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          "group/fold -mx-1.5 flex w-[calc(100%+12px)] items-center gap-2 rounded-md px-1.5 py-1.5",
          "text-left cursor-pointer transition-colors duration-150 hover:bg-hover",
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
            open && "rotate-90",
          )}
        />
        <span className="shrink-0 text-[13px] font-medium text-ink-2 transition-colors duration-150 group-hover/fold:text-ink">
          {label}
        </span>
        {summary != null && (
          <span className="min-w-0 truncate text-[12px] text-ink-4 tnum">{summary}</span>
        )}
      </button>

      <div id={panelId} hidden={!open}>
        {open && (
          <div
            className={cn("pt-2", panelClassName)}
            style={{ animation: "hm-slide-up 200ms var(--ease-out-apple) both" }}
          >
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
