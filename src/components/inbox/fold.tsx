"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDisclosure } from "./use-disclosure";

/**
 * A folded section: one quiet row that says what is inside, and the content
 * underneath when it is asked for. Nothing is ever hidden behind a fold
 * without its summary naming it, and nothing is lost — a fold changes the
 * resting state of a panel, never its existence.
 *
 * `storageKey` is the short name under "humoyun.inbox." — pass null for a fold
 * whose state is owned by the caller (a drag forcing a target open, say).
 */
export function Fold({
  label, summary, children, storageKey, defaultOpen = false, forceOpen, className, action,
}: {
  label: string;
  summary?: React.ReactNode;
  children: React.ReactNode;
  storageKey: string;
  defaultOpen?: boolean;
  /** Held open from outside — a drag needs its drop targets on screen. */
  forceOpen?: boolean;
  className?: string;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useDisclosure(storageKey, defaultOpen);
  const shown = open || !!forceOpen;

  return (
    <section className={className}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={shown}
          className={cn(
            "-mx-1.5 flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left",
            "cursor-pointer transition-colors duration-150 hover:bg-hover",
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
              shown && "rotate-90",
            )}
          />
          <span className="shrink-0 text-[12.5px] font-medium text-ink-2">{label}</span>
          {summary && (
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-4 tnum">{summary}</span>
          )}
        </button>
        {action}
      </div>

      {/* 200ms, transform and opacity only — nothing reflows on the way open. */}
      {shown && <div className="anim-pop pt-2">{children}</div>}
    </section>
  );
}
