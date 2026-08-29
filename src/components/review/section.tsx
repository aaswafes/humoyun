"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { SectionLabel } from "@/components/ui/primitives";

// =========================================================
// The review page's chrome.
//
// Guided mode names the part you are looking at in its own header, so a
// section rendered inside a step drops its label rather than saying the same
// word twice. Everything the label carried — the note, the controls — is
// still rendered; only the shouting stops.
// =========================================================

const HeadlessContext = React.createContext(false);

export function SectionChrome({
  headless, children,
}: {
  headless: boolean;
  children: React.ReactNode;
}) {
  return <HeadlessContext.Provider value={headless}>{children}</HeadlessContext.Provider>;
}

/** True when an ancestor already titled this content. */
export function useHeadless() {
  return React.useContext(HeadlessContext);
}

/** The one section rhythm the review page uses: label, quiet note, right-hand slot. */
export function Section({
  id, label, note, action, children, className, flush,
}: {
  id?: string;
  label: React.ReactNode;
  note?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Guided mode already spaces its steps, so the top margin gets dropped. */
  flush?: boolean;
}) {
  const headless = useHeadless();
  const showHeader = !headless || !!action;

  return (
    <section id={id} className={cn(flush ? "mt-0" : "mt-10 first:mt-0", "scroll-mt-20", className)}>
      {showHeader && (
        <div className={cn("flex min-h-7 items-center gap-2.5", headless ? "mb-1.5 justify-end" : "mb-3")}>
          {!headless && (
            <>
              <SectionLabel>{label}</SectionLabel>
              {note && <span className="hidden text-[11.5px] text-ink-4 sm:block">{note}</span>}
            </>
          )}
          {action && (
            <div className={cn("flex items-center gap-2", !headless && "ml-auto")}>{action}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

// =========================================================
// Folding
// =========================================================

const FOLD_PREFIX = "humoyun.review.";

/**
 * Fold state, remembered per surface. localStorage does not exist while the
 * page renders on the server, so the stored value is read after mount instead
 * of derived — the first paint always matches what the server sent.
 */
export function useFold(key: string, defaultOpen = false): [boolean, (next: boolean) => void] {
  const [open, setOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FOLD_PREFIX + key);
      if (stored != null) setOpen(stored === "1");
    } catch {
      // Blocked storage (private window, locked-down origin) just keeps the default.
    }
  }, [key]);

  const set = React.useCallback((next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(FOLD_PREFIX + key, next ? "1" : "0");
    } catch {
      // Losing the memory of a fold is not worth an error.
    }
  }, [key]);

  return [open, set];
}

/**
 * A folded panel: one quiet row that says what is inside, and remembers
 * whether it was left open. Never a dead end — the summary always carries the
 * count or the value the section would have shown.
 */
export function Fold({
  id, storageKey, label, summary, defaultOpen = false, children, className, tone = "section",
}: {
  id?: string;
  /** Namespaced under `humoyun.review.` in localStorage. */
  storageKey: string;
  label: React.ReactNode;
  /** States the contents — a count, a total, the thing worth opening for. */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  /** `inline` is for a fold nested inside a section that already has room. */
  tone?: "section" | "inline";
}) {
  const [open, setOpen] = useFold(storageKey, defaultOpen);
  const panelId = React.useId();

  return (
    <section
      id={id}
      className={cn(tone === "section" ? "mt-10 first:mt-0" : "mt-5", "scroll-mt-20", className)}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left cursor-pointer",
          "transition-colors duration-150 ease-[var(--ease-out-apple)] hover:bg-hover",
        )}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
            open && "rotate-90",
          )}
        />
        <span
          className={cn(
            "shrink-0",
            tone === "section"
              ? "text-[13px] font-medium text-ink"
              : "text-[12.5px] font-medium text-ink-2",
          )}
        >
          {label}
        </span>
        {summary && (
          <span className="min-w-0 truncate text-[12.5px] text-ink-3 tnum">{summary}</span>
        )}
      </button>

      <div id={panelId} hidden={!open}>
        {open && (
          // 200ms, and the global reduced-motion rule still wins with !important.
          <div className="px-1.5 pt-3" style={{ animation: "hm-fade-in 200ms var(--ease-out-apple) both" }}>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * A block inside a section. Spacing rather than a border — the page already
 * has a frame, and a card inside a card is one edge too many.
 */
export function Panel({
  title, meta, children, className, action,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-2.5 flex min-h-6 items-center gap-2">
        <h3 className="shrink-0 text-[12.5px] font-medium text-ink-2">{title}</h3>
        {meta && <span className="min-w-0 truncate text-[11.5px] text-ink-4 tnum">{meta}</span>}
        {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/** Label / value row used inside panels. */
export function Line({
  label, value, className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-2 py-1", className)}>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{label}</span>
      <span className="shrink-0 text-[12.5px] font-medium text-ink tnum">{value}</span>
    </div>
  );
}
