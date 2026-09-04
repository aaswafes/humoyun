"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { SOURCE_ICONS } from "./note-fields";
import type { SourceRef } from "./note-model";

/**
 * Opening a source is two moves, not one: the calendar needs the day selected
 * before it is worth navigating to, and a task opens in the global inspector
 * the app shell already mounts. Both live here so every chip on the surface
 * behaves the same way.
 */
export function useOpenSource() {
  const router = useRouter();
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const openInspector = useStore((s) => s.openInspector);

  return React.useCallback((ref: SourceRef) => {
    if (!ref.href || ref.missing) return;
    if (ref.kind === "day" && ref.id) setSelectedDate(ref.id);
    if (ref.kind === "task" && ref.id) openInspector(ref.id);
    router.push(ref.href);
  }, [router, setSelectedDate, openInspector]);
}

/** What the chip promises out loud, for the button's accessible name. */
function openLabel(ref: SourceRef): string {
  switch (ref.kind) {
    case "book": return `Open ${ref.label} on the books shelf`;
    case "media": return `Open ${ref.label} on the shelf`;
    case "task": return `Open the task ${ref.label}`;
    case "goal": return `Open the goal ${ref.label}`;
    case "day": return `Open ${ref.label} in the calendar`;
    default: return "This note stands alone";
  }
}

const PILL =
  "inline-flex h-[22px] max-w-full items-center gap-1 rounded-full px-2 " +
  "text-[11.5px] font-medium leading-none";

/**
 * The provenance of a note, on every card and every row. Neutral rather than
 * tinted: the paper already carries the note's own colour, and a second colour
 * on top of it would say nothing extra.
 */
export function SourceChip({
  refer, locator, className,
}: {
  refer: SourceRef;
  /** "p. 128", "ep. 4", "1:24:00" — inside the chip, so source and place read as one fact */
  locator?: string | null;
  className?: string;
}) {
  const open = useOpenSource();
  const Icon = SOURCE_ICONS[refer.kind];
  const clickable = !!refer.href && !refer.missing;

  const inner = (
    <>
      <Icon className="size-3 shrink-0 text-ink-4" aria-hidden />
      <span className="min-w-0 truncate">{refer.label}</span>
      {locator && (
        <>
          <span aria-hidden className="shrink-0 text-ink-4">·</span>
          <span className="shrink-0 text-ink-3 tnum">{locator}</span>
        </>
      )}
    </>
  );

  if (!clickable) {
    return (
      <span
        className={cn(PILL, "bg-raised text-ink-3", className)}
        title={refer.missing ? `${refer.label} — the original is gone` : undefined}
      >
        {inner}
      </span>
    );
  }

  return (
    // The pill reads at 22px; the padding around it is what makes the target 28.
    <button
      type="button"
      onClick={() => open(refer)}
      aria-label={openLabel(refer)}
      title={openLabel(refer)}
      className={cn(
        "group/chip -my-[3px] inline-flex max-w-full cursor-pointer rounded-full py-[3px]",
        "transition-transform duration-150 ease-[var(--ease-out-apple)] active:scale-[0.97]",
        className,
      )}
    >
      <span
        className={cn(
          PILL,
          // A fill, not a ring: the paper behind it is already tinted, and one
          // more hairline per card is exactly the noise the calm pass removes.
          "bg-raised text-ink-2 transition-colors duration-150 group-hover/chip:text-ink",
        )}
      >
        {inner}
      </span>
    </button>
  );
}
