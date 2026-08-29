"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * One remembered open/closed answer, keyed per surface
 * ("humoyun.books.insightsOpen", "humoyun.books.sheet.plan", …).
 */
export function useSticky(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [open, setOpen] = React.useState(fallback);

  // localStorage does not exist while the page is rendered on the server, so
  // the stored answer arrives one paint later rather than as a hydration
  // mismatch. It cannot be derived from anything — it is the user's memory.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === "1" || stored === "0") setOpen(stored === "1");
    } catch { /* private mode: the default stands */ }
  }, [key]);

  const set = React.useCallback((next: boolean) => {
    setOpen(next);
    try { window.localStorage.setItem(key, next ? "1" : "0"); } catch { /* ignore */ }
  }, [key]);

  return [open, set];
}

const CAPS = "text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3";
const PLAIN = "text-[12.5px] font-medium text-ink-2";

/**
 * A folded section: quiet label, a summary that says what is inside, a
 * chevron. Never a dead end — the summary carries the value of the panel so
 * the user knows whether opening it is worth it.
 */
export function Disclosure({
  storageKey, label, summary, defaultOpen = false, variant = "plain",
  action, children, className, bodyClassName,
}: {
  /** localStorage key, namespaced to this surface */
  storageKey: string;
  label: string;
  /** one line stating what the panel holds — shown open or closed */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  variant?: "caps" | "plain";
  /** sits outside the toggle, so a control here never nests in a button */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [open, setOpen] = useSticky(storageKey, defaultOpen);

  return (
    <section className={className}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn(
            "-mx-1 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1 py-2 text-left",
            "transition-colors duration-150 hover:bg-hover",
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
              open && "rotate-90",
            )}
          />
          <span className={cn("shrink-0", variant === "caps" ? CAPS : PLAIN)}>{label}</span>
          {summary != null && (
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3 tnum">{summary}</span>
          )}
        </button>
        {action}
      </div>

      {open && (
        <div
          className={cn("pb-1", bodyClassName)}
          style={{ animation: "hm-slide-up 200ms var(--ease-out-apple) both" }}
        >
          {children}
        </div>
      )}
    </section>
  );
}
