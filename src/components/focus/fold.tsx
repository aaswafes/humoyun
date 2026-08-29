"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Everything on this page that is not the dial rests folded. A fold is one
 * quiet row: a label, a summary that says what is inside, and a chevron. The
 * summary is the contract — it has to be worth reading on its own, so the row
 * is never a dead end.
 */
export function Fold({
  label, summary, open, onOpenChange, actions, children, className,
}: {
  label: string;
  /** States both the value and the contents: "3 sessions · daily and weekly targets". */
  summary: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Controls that belong to the section header rather than its body. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const panelId = React.useId();

  return (
    <section className={cn("border-t border-line", className)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onOpenChange(!open)}
          className={cn(
            "-mx-1.5 flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left",
            "transition-colors duration-150 ease-[var(--ease-out-apple)] hover:bg-hover",
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
              open && "rotate-90",
            )}
          />
          <span className="shrink-0 text-[13px] font-medium text-ink-2">{label}</span>
          <span className="min-w-0 truncate text-[12px] text-ink-4 tnum">{summary}</span>
        </button>
        {actions}
      </div>

      <div id={panelId} hidden={!open}>
        {open && (
          <div
            className="pb-9 pt-4"
            style={{ animation: "hm-fold-in 200ms var(--ease-out-apple) both" }}
          >
            <style>{`@keyframes hm-fold-in { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }`}</style>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Fold state, remembered per surface. localStorage cannot be read while the
 * markup is rendered on the server, so the stored answer arrives in an effect
 * on the first client paint rather than as derived state.
 */
export function useFold(key: string, fallback = false) {
  const [open, setOpen] = React.useState(fallback);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setOpen(raw === "1");
    } catch { /* private mode */ }
  }, [key]);

  const set = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      try { window.localStorage.setItem(key, next ? "1" : "0"); } catch { /* private mode */ }
    },
    [key],
  );

  return [open, set] as const;
}

/** The same memory, for a remembered choice out of a known set — a tab, a filter. */
export function useStickyChoice<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const [value, setValue] = React.useState<T>(fallback);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key) as T | null;
      if (raw && allowed.includes(raw)) setValue(raw);
    } catch { /* private mode */ }
    // `allowed` is a module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = React.useCallback(
    (next: T) => {
      setValue(next);
      try { window.localStorage.setItem(key, next); } catch { /* private mode */ }
    },
    [key],
  );

  return [value, set] as const;
}
