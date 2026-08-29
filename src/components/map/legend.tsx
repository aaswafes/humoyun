"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/primitives";
import type { Grouping } from "./grouping";

/**
 * The key to whatever the board is currently coloured by. Each row is also a
 * filter: pressing one dims everything that is not in that group, which is the
 * fastest way to ask "where does this thread actually run?".
 *
 * Closed at rest — the View menu opens it and remembers.
 */
export function Legend({
  grouping, active, onToggle, onClear, onClose,
}: {
  grouping: Grouping;
  active: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const total = grouping.groups.reduce((s, g) => s + g.count, 0);
  const shown = grouping.groups
    .filter((g) => active.has(g.key))
    .reduce((s, g) => s + g.count, 0);

  return (
    // Opened on purpose, so it stays fully legible — only the ambient chrome
    // (toolbar, zoom, overview) dims when the pointer is elsewhere.
    <div
      data-no-zoom
      onPointerDown={(e) => e.stopPropagation()}
      className="w-[184px] overflow-hidden rounded-lg material shadow-[var(--shadow-md)] anim-pop"
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span className="flex-1 truncate text-[11px] font-medium text-ink-3">
          {grouping.label}
        </span>
        {active.size > 0 && (
          <button
            onClick={onClear}
            className="-m-1 cursor-pointer p-1 text-[11px] font-medium text-ink-2 transition-colors hover:text-ink"
          >
            Clear
          </button>
        )}
        <IconButton label="Hide legend" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <div className="max-h-[220px] overflow-y-auto px-1 pb-1">
        {grouping.groups.map((g) => {
          const on = active.has(g.key);
          return (
            <button
              key={g.key}
              onClick={() => onToggle(g.key)}
              aria-pressed={on}
              className={cn(
                `tint-${g.tint}`,
                "flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-[5px] text-left",
                "transition-colors duration-100 hover:bg-hover",
                on && "bg-selected",
                active.size > 0 && !on && "opacity-55",
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: "var(--tint)" }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{g.label}</span>
              <span className="text-[11px] text-ink-4 tnum">{g.count}</span>
            </button>
          );
        })}
        {!grouping.groups.length && (
          <p className="px-1.5 py-2 text-[11.5px] text-ink-4">Nothing to group yet.</p>
        )}
      </div>

      {/* the total lives in the page header; this line only earns its space
          once a filter is hiding something */}
      {active.size > 0 && (
        <p className="px-2 py-1.5 text-[11px] text-ink-4 tnum hairline-t">
          {shown} of {total} shown
        </p>
      )}
    </div>
  );
}
