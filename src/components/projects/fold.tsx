"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDisclosure } from "@/components/tasks/task-list";

// =========================================================
// Folding, for this surface only.
//
// Nothing on the projects pages is hidden — the panels that would otherwise
// shout on load rest folded behind a line that says what is inside them, and
// remember whether you opened them.
// =========================================================

const PREFIX = "humoyun.projects.";

/**
 * Resting state for one panel, remembered per surface.
 *
 * The disclosure store behind this is the task list's — an external store read
 * through useSyncExternalStore, so the server snapshot is the default and the
 * client snapshot is localStorage. Nothing has to write state on mount, which
 * is what makes it hydration-safe.
 */
export function useFold(key: string, defaultOpen = false) {
  return useDisclosure(PREFIX + key, defaultOpen);
}

const KEYFRAMES =
  "@keyframes hm-fold-in { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }";

/**
 * A folded section is one row: a quiet label, its summary, a chevron. The
 * summary is what stops the fold being a dead end, so it always states what
 * the panel holds.
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
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md py-1.5 text-left transition-colors duration-150"
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
