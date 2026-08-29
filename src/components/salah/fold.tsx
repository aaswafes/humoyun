"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

// =========================================================
// Folded sections.
//
// The salah page opens on the five prayers and nothing else. Everything
// else rests closed behind a single row that says what is inside, so the
// feature is one tap away rather than one glance away. Nothing is removed
// by folding — only its resting state changes.
// =========================================================

const NS = "humoyun.salah.";

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(NS + key);
  } catch {
    // Blocked storage and private mode both throw; the default is fine.
    return null;
  }
}

function writeKey(key: string, value: string) {
  try {
    window.localStorage.setItem(NS + key, value);
  } catch {
    // The fold still works, it just will not be remembered.
  }
}

/** Open/closed, remembered. Storage is read after mount so SSR markup matches. */
export function useFold(key: string, defaultOpen = false): [boolean, (next: boolean) => void] {
  const [open, setOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    const stored = readKey(key);
    if (stored === "0" || stored === "1") setOpen(stored === "1");
  }, [key]);

  const set = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      writeKey(key, next ? "1" : "0");
    },
    [key],
  );

  return [open, set];
}

/** The same memory for a choice inside a section — pass a stable `allowed`. */
export function useRemembered<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (next: T) => void] {
  const [value, setValue] = React.useState<T>(fallback);

  React.useEffect(() => {
    const stored = readKey(key);
    if (stored && (allowed as readonly string[]).includes(stored)) setValue(stored as T);
  }, [key, allowed]);

  const set = React.useCallback(
    (next: T) => {
      setValue(next);
      writeKey(key, next);
    },
    [key],
  );

  return [value, set];
}

/**
 * One row: a quiet title, its summary, a chevron. No border — sections are
 * separated by a hairline and by space, never by a card inside a card.
 */
export function Fold({
  id, title, summary, open, onOpenChange, children, level = "section", className,
}: {
  id: string;
  title: string;
  /** Says what is inside, so a closed section is never a dead end. */
  summary: React.ReactNode;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  children: React.ReactNode;
  level?: "section" | "sub";
  className?: string;
}) {
  const panelId = `salah-${id}-panel`;
  const sub = level === "sub";
  const Heading = (sub ? "h3" : "h2") as "h2" | "h3";

  return (
    <section className={cn("hairline-t", className)}>
      <Heading>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onOpenChange(!open)}
          className={cn(
            "-mx-2 flex w-full cursor-pointer items-center gap-3 rounded-md px-2 text-left",
            "transition-colors duration-150 ease-[var(--ease-out-apple)] hover:bg-hover",
            sub ? "py-2.5" : "py-3.5",
          )}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={cn("font-medium", sub ? "text-[12.5px] text-ink-2" : "text-[13px] text-ink")}>
              {title}
            </span>
            <span className={cn("min-w-0 truncate", sub ? "text-[11.5px] text-ink-4" : "text-[12px] text-ink-3")}>
              {summary}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-ink-4",
              "transition-transform duration-200 ease-[var(--ease-out-apple)]",
              open && "rotate-180",
            )}
          />
        </button>
      </Heading>

      {open && (
        <div
          id={panelId}
          // 200ms, transform and opacity only — the global reduced-motion rule
          // still wins over this because it is declared !important.
          style={{ animation: "hm-slide-up 200ms var(--ease-out-apple) both" }}
          className={sub ? "pb-6 pt-1" : "pb-8 pt-2"}
        >
          {children}
        </div>
      )}
    </section>
  );
}
