"use client";

import * as React from "react";
import { ChevronDown, Tag, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { UMR_CATEGORIES, UMR_META, type UmrCategory } from "@/lib/umr";
import { Popover, MenuItem, MenuSeparator, MenuLabel } from "@/components/ui/overlays";
import type { FocusSubject } from "./focus-engine";

// =========================================================
// What the dial asks for before the clock starts.
//
// Not a task and not a goal: a kind of living. An hour on the Focus page is an
// hour of your life going somewhere, and the five kinds are the only answer
// Umr can count. A timer started from a task row still credits that task —
// this is the room where you choose the hour itself.
//
// More than one can be true at once: an hour studying with a friend is Taʼlim
// and Inson both. The minutes then SPLIT EVENLY between them. Counting the
// whole hour to each would let a day total more than a day, and would let the
// Dam cap be gamed by ticking Taʼlim beside it.
//
// Choosing closes the list, because that is what a choice feels like. Picking
// a second kind is one more tap on the pill, and the toggle is additive.
// =========================================================

const PILL =
  "inline-flex h-7 max-w-[340px] items-center gap-1.5 rounded-full border border-line px-2.5 text-[12.5px]";

/** "Taʼlim + Inson", or the one, or nothing. */
function kindWords(kinds: UmrCategory[]): string {
  return kinds.map((c) => UMR_META[c].label).join(" + ");
}

function Dots({ kinds }: { kinds: UmrCategory[] }) {
  return (
    <span className="flex shrink-0 items-center -space-x-0.5">
      {kinds.map((c) => (
        <span key={c} className={`tint-${UMR_META[c].tint}`}>
          <span
            className="block size-2 rounded-full ring-1 ring-[var(--raised)]"
            style={{ background: "var(--tint)" }}
            aria-hidden
          />
        </span>
      ))}
    </span>
  );
}

export function KindPicker({
  value,
  onChange,
  locked,
  id,
  className,
  "aria-describedby": describedBy,
}: {
  value: FocusSubject;
  onChange: (next: FocusSubject) => void;
  locked?: boolean;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
}) {
  const tasks = useStore((s) => s.tasks);
  const [draft, setDraft] = React.useState("");

  const kinds = value.umr;
  const task = value.taskId ? tasks.find((t) => t.id === value.taskId) ?? null : null;
  const shown = task?.title || value.label;
  const words = kindWords(kinds);

  if (locked) {
    return (
      <span className={cn(PILL, "text-ink-2", className)} title="The kind is fixed while a session runs">
        {kinds.length > 0 && <Dots kinds={kinds} />}
        <span className="truncate">
          {words || "Open focus"}
          {shown ? <span className="text-ink-3"> · {shown}</span> : null}
        </span>
      </span>
    );
  }

  return (
    <Popover
      align="center"
      className="w-[300px]"
      onOpenChange={(open) => { if (open) setDraft(value.label); }}
      trigger={
        <button
          type="button"
          id={id}
          aria-describedby={describedBy}
          aria-haspopup="dialog"
          className={cn(
            PILL,
            "cursor-pointer transition-colors duration-150 hover:bg-hover",
            kinds.length ? "text-ink" : "text-ink-3 hover:text-ink",
            className,
          )}
        >
          {kinds.length > 0 && <Dots kinds={kinds} />}
          <span className={cn("min-w-0 flex-1 truncate", !kinds.length && "text-ink-4")}>
            {words || "Choose a kind"}
            {shown ? <span className="text-ink-3"> · {shown}</span> : null}
          </span>
          <ChevronDown className="size-3 shrink-0 text-ink-4" />
        </button>
      }
    >
      {(close) => (
        <>
          <MenuLabel>What kind of living is this hour?</MenuLabel>
          <div className="px-1 pb-1">
            {UMR_CATEGORIES.map((c) => {
              const m = UMR_META[c];
              const active = kinds.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => {
                    // Additive toggle, then close: choosing should feel like
                    // choosing. A second kind is one more tap on the pill.
                    const next = active ? kinds.filter((k) => k !== c) : [...kinds, c];
                    onChange({ ...value, umr: UMR_CATEGORIES.filter((k) => next.includes(k)) });
                    close();
                  }}
                  className={cn(
                    `tint-${m.tint}`,
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left cursor-pointer",
                    "transition-colors duration-120",
                    active ? "bg-[var(--tint-soft)]" : "hover:bg-hover",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-3.5 shrink-0 place-items-center rounded-[5px] border transition-colors",
                      active ? "border-transparent" : "border-line-strong",
                    )}
                    style={active ? { background: "var(--tint)" } : undefined}
                    aria-hidden
                  >
                    {active && (
                      <svg viewBox="0 0 10 10" className="size-2.5" fill="none">
                        <path
                          d="M2 5.2 4 7.2 8 3"
                          stroke="var(--raised)"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[13px]",
                        active ? "font-medium text-[var(--tint-ink)]" : "text-ink",
                      )}
                    >
                      {m.label}
                    </span>
                    <span className="block truncate text-[11px] text-ink-4">{m.gloss}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {kinds.length > 1 && (
            <p className="px-2.5 pb-1.5 text-[11px] leading-snug text-ink-4">
              The minutes split evenly — {kinds.length} ways.
            </p>
          )}

          <MenuSeparator />

          <form
            className="px-1.5 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              onChange({ ...value, taskId: null, label: draft.trim() });
              close();
            }}
          >
            <label className="flex items-center gap-1.5">
              <Tag className="size-3.5 shrink-0 text-ink-4" aria-hidden />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="What exactly? (optional)"
                aria-label="What exactly are you focusing on"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
              />
            </label>
          </form>

          {(kinds.length > 0 || value.label || value.taskId) && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={X}
                onClick={() => { onChange({ umr: [], taskId: null, label: "" }); close(); }}
              >
                Clear
              </MenuItem>
            </>
          )}
        </>
      )}
    </Popover>
  );
}
