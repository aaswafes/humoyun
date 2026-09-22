"use client";

import * as React from "react";
import { ChevronDown, History, Tag, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { UMR_CATEGORIES, UMR_META } from "@/lib/umr";
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
// The label is optional and says *what exactly*. It is what the Umr stats
// group by, so "Chemistry" and "Qurʼan" stay tellable apart inside their kind.
// =========================================================

const PILL =
  "inline-flex h-7 max-w-[320px] items-center gap-1.5 rounded-full border border-line px-2.5 text-[12.5px]";

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
  const sessions = useStore((s) => s.focusSessions);
  const tasks = useStore((s) => s.tasks);
  const [draft, setDraft] = React.useState("");

  const meta = value.umr ? UMR_META[value.umr] : null;
  const task = value.taskId ? tasks.find((t) => t.id === value.taskId) ?? null : null;
  const shown = task?.title || value.label;

  /**
   * Labels used before under the same kind, so a subject that comes back every
   * day is one tap rather than a retype.
   */
  const recent = React.useMemo(() => {
    const seen: string[] = [];
    for (let i = sessions.length - 1; i >= 0 && seen.length < 5; i--) {
      const s = sessions[i];
      const label = (s.label ?? "").trim();
      if (!label || s.mode === "break") continue;
      if (value.umr && s.umr && s.umr !== value.umr) continue;
      if (label.toLowerCase() === value.label.trim().toLowerCase()) continue;
      if (!seen.some((l) => l.toLowerCase() === label.toLowerCase())) seen.push(label);
    }
    return seen;
  }, [sessions, value.umr, value.label]);

  if (locked) {
    return (
      <span
        className={cn(meta && `tint-${meta.tint}`, PILL, "text-ink-2", className)}
        title="The kind is fixed while a session runs"
      >
        {meta ? (
          <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--tint)" }} aria-hidden />
        ) : null}
        <span className="truncate">
          {meta ? meta.label : "Open focus"}
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
            meta && `tint-${meta.tint}`,
            PILL,
            "cursor-pointer transition-colors duration-150 hover:bg-hover",
            meta ? "text-ink" : "text-ink-3 hover:text-ink",
            className,
          )}
        >
          {meta ? (
            <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--tint)" }} aria-hidden />
          ) : null}
          <span className={cn("min-w-0 flex-1 truncate", !meta && "text-ink-4")}>
            {meta ? meta.label : "Choose a kind"}
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
              const active = value.umr === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ ...value, umr: c })}
                  className={cn(
                    `tint-${m.tint}`,
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left cursor-pointer",
                    "transition-colors duration-120",
                    active ? "bg-[var(--tint-soft)]" : "hover:bg-hover",
                  )}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: "var(--tint)" }}
                    aria-hidden
                  />
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

          {recent.length > 0 && (
            <>
              <MenuSeparator />
              <MenuLabel>Recent</MenuLabel>
              {recent.map((label) => (
                <MenuItem
                  key={label}
                  icon={History}
                  onClick={() => { onChange({ ...value, taskId: null, label }); close(); }}
                >
                  {label}
                </MenuItem>
              ))}
            </>
          )}

          {(value.umr || value.label || value.taskId) && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={X}
                onClick={() => { onChange({ umr: null, taskId: null, label: "" }); close(); }}
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
