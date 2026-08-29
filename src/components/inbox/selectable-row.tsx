"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/types";
import { TaskRow } from "@/components/tasks/task-row";
import { useTriage } from "./triage-context";
import { TaskGlance } from "./task-glance";
import { EditorRow } from "./editor-row";

/**
 * One row, in whichever of the three states triage puts it in.
 *
 *  - renaming  → an inline editor owns the row
 *  - selecting → the row IS the selection control: a real `<button>` with
 *                `aria-pressed`, whose entire subtree is inert. Nothing
 *                interactive is nested inside it, and nothing invisible to the
 *                mouse is still reachable by Tab — the two failures of the old
 *                `<div onClick>` wrapper around a live TaskRow.
 *  - otherwise → the shared TaskRow with all of its own controls
 *
 * Only the cursor row is tabbable, so a thousand-row list is one Tab stop; the
 * keyboard layer moves the cursor and the focus follows it.
 */
export function SelectableRow({
  task, order, showDate, trailing, dragHandle, dense, dragProps,
}: {
  task: Task;
  /** flat visible order of the current view, for shift-range selection */
  order: string[];
  showDate?: boolean;
  trailing?: React.ReactNode;
  dragHandle?: React.ReactNode;
  dense?: boolean;
  /** pointer-only drag activation, so the row body can be grabbed in select mode */
  dragProps?: { onPointerDown?: React.PointerEventHandler<HTMLElement> };
}) {
  const { selecting, isSelected, toggle, cursorId, setCursor, editingId, announce } = useTriage();
  const selected = isSelected(task.id);
  const isCursor = cursorId === task.id;
  const ref = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  // Keep the cursor on screen when the keyboard moves it.
  React.useEffect(() => {
    if (isCursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [isCursor]);

  // In select mode the cursor is real focus, not a highlight — but it must
  // never yank the caret out of a field or a dialog the user is working in.
  React.useEffect(() => {
    if (!isCursor || !selecting) return;
    const active = document.activeElement as HTMLElement | null;
    const busy =
      !!active &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA" ||
        active.isContentEditable || !!active.closest?.('[role="dialog"]'));
    if (!busy) buttonRef.current?.focus({ preventScroll: true });
  }, [isCursor, selecting]);

  if (editingId === task.id) {
    return (
      <div ref={ref} className="px-0.5 py-1">
        <EditorRow task={task} showDate={showDate} />
      </div>
    );
  }

  // TaskRow falls back to a decorative grip when no handle is given; in views
  // without drag-to-reorder that would promise something the list cannot do.
  const handle = dragHandle ?? <span aria-hidden className="block size-4" />;

  if (!selecting) {
    return (
      <div
        ref={ref}
        data-triage-row={task.id}
        aria-current={isCursor ? "true" : undefined}
        className={cn(
          // Triage is scanning, and scanning needs air between rows.
          "group/inbox relative flex items-center gap-1 rounded-md py-0.5",
          isCursor && "bg-hover",
        )}
      >
        {isCursor && (
          <span
            aria-hidden
            className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent"
          />
        )}
        <div className="min-w-0 flex-1">
          <TaskRow task={task} showDate={showDate} dragHandle={handle} />
        </div>
        {trailing && (
          <div className="shrink-0 opacity-0 transition-opacity duration-150 ease-[var(--ease-out-apple)] focus-within:opacity-100 group-hover/inbox:opacity-100">
            {trailing}
          </div>
        )}
      </div>
    );
  }

  // No cursor yet? The first row of the view holds the single tab stop.
  const tabbable = cursorId ? isCursor : order[0] === task.id;

  return (
    <div ref={ref} className="group/row relative flex items-center gap-1 py-0.5">
      {isCursor && (
        <span
          aria-hidden
          className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent"
        />
      )}

      {dragHandle && (
        <div className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
          {dragHandle}
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        aria-pressed={selected}
        tabIndex={tabbable ? 0 : -1}
        data-triage-row={task.id}
        onPointerDown={dragProps?.onPointerDown}
        // shift-click would otherwise paint a text selection across the list
        onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
        onClick={(e) => {
          toggle(task.id, { shift: e.shiftKey, order });
          setCursor(task.id);
          announce(
            e.shiftKey
              ? "Range selected"
              : `${selected ? "Deselected" : "Selected"} ${task.title || "Untitled"}`,
          );
        }}
        className={cn(
          "flex min-w-0 flex-1 select-none items-start gap-2 rounded-md px-1.5 text-left cursor-pointer",
          "transition-colors duration-150 ease-[var(--ease-out-apple)]",
          selected ? "bg-selected" : isCursor ? "bg-hover" : "hover:bg-hover",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-[7px] grid size-[15px] shrink-0 place-items-center rounded-[5px] border",
            selected ? "border-transparent bg-accent text-accent-ink" : "border-line-strong bg-canvas",
          )}
        >
          {selected && <Check className="size-2.5 stroke-[3.5]" />}
        </span>
        <TaskGlance task={task} showDate={showDate} dense={dense} />
      </button>
    </div>
  );
}
