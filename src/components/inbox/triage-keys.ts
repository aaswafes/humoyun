"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { addDays, friendlyDate, todayISO } from "@/lib/date";
import type { Task } from "@/lib/types";
import { useTriage } from "./triage-context";
import { useTriageActions } from "./actions";
import { describeTask } from "./task-glance";
import { nextWeekISO, weekendISO } from "./quick-schedule";

// =========================================================
// The keyboard layer.
//
// It listens in the CAPTURE phase on document, one step ahead of the app
// shell's own shortcuts, so T can mean "move this task to today" here without
// also nudging the global selected date. Anything it does not claim falls
// through to the shell untouched.
// =========================================================

export interface LegendSection {
  title: string;
  items: { keys: string[]; label: string }[];
}

export const TRIAGE_LEGEND: LegendSection[] = [
  {
    title: "Move around",
    items: [
      { keys: ["J", "↓"], label: "Next task" },
      { keys: ["K", "↑"], label: "Previous task" },
      { keys: ["⇧", "J"], label: "Extend selection down" },
      { keys: ["Home"], label: "First task" },
      { keys: ["End"], label: "Last task" },
    ],
  },
  {
    title: "Select",
    items: [
      { keys: ["X"], label: "Select / deselect" },
      { keys: ["V"], label: "Select mode on / off" },
      { keys: ["⌘", "A"], label: "Select everything shown" },
      { keys: ["Esc"], label: "Clear, then leave" },
    ],
  },
  {
    title: "Schedule",
    items: [
      { keys: ["T"], label: "Today" },
      { keys: ["M"], label: "Tomorrow" },
      { keys: ["W"], label: "This weekend" },
      { keys: ["⇧", "W"], label: "Next week" },
      { keys: ["U"], label: "Back to Inbox" },
    ],
  },
  {
    title: "Change",
    items: [
      { keys: ["1"], label: "Low priority" },
      { keys: ["2"], label: "Medium priority" },
      { keys: ["3"], label: "High priority" },
      { keys: ["0"], label: "No priority" },
      { keys: ["D"], label: "Done / not done" },
      { keys: ["E"], label: "Rename inline" },
      { keys: ["↵"], label: "Open the inspector" },
      { keys: ["⌫"], label: "Delete" },
    ],
  },
  {
    title: "Everything else",
    items: [
      { keys: ["/"], label: "Jump to search" },
      { keys: ["?"], label: "This legend" },
    ],
  },
];

function isTyping(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable === true;
}

function isActivatable(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  if (node.tagName === "BUTTON" || node.tagName === "A" || node.tagName === "SUMMARY") return true;
  const role = node.getAttribute?.("role");
  return role === "button" || role === "checkbox" || role === "switch" || role === "menuitem" ||
    role === "tab" || role === "link";
}

export function useTriageKeys({
  onRequestDelete, onFocusSearch, enabled = true,
}: {
  onRequestDelete: (ids: string[]) => void;
  onFocusSearch?: () => void;
  enabled?: boolean;
}) {
  const t = useTriage();
  const actions = useTriageActions();
  const tasks = useStore((s) => s.tasks);
  const openInspector = useStore((s) => s.openInspector);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  // Rebuilt every render and parked in a ref after paint, so the document
  // listener below is attached exactly once yet always sees current state.
  const handlerRef = React.useRef<(e: KeyboardEvent) => void>(() => {});

  const onKey = (e: KeyboardEvent) => {
    if (t.editingId) return;                                     // the inline editor owns the keyboard
    if (t.dragIds.length) return;                                // a keyboard drag is in flight
    if (isTyping(e.target)) return;
    if (document.querySelector('[role="dialog"]')) return;       // a modal or popover is up
    if (e.altKey) return;

    const key = e.key.toLowerCase();
    const mod = e.metaKey || e.ctrlKey;
    const rows = t.rows;
    const byId = (id: string): Task | undefined => tasks.find((x) => x.id === id);

    const take = () => { e.preventDefault(); e.stopPropagation(); };

    // ---- select everything ----
    if (mod && key === "a") {
      if (!rows.length) return;
      take();
      if (!t.selecting) t.setSelecting(true);
      t.setSelected(rows, true);
      t.announce(`Selected all ${rows.length} tasks`);
      return;
    }
    if (mod) return;

    const cursorIndex = t.cursorId ? rows.indexOf(t.cursorId) : -1;

    const focusRow = (index: number, extend: boolean) => {
      if (!rows.length) return;
      const clamped = Math.max(0, Math.min(rows.length - 1, index));
      const id = rows[clamped];
      t.setCursor(id);
      if (extend) {
        if (!t.selecting) t.setSelecting(true);
        t.setSelected([id], true);
      }
      const task = byId(id);
      if (task) t.announce(describeTask(task, clamped, rows.length));
    };

    switch (key) {
      case "j":
      case "arrowdown":
        take();
        focusRow(cursorIndex < 0 ? 0 : cursorIndex + 1, e.shiftKey);
        return;
      case "k":
      case "arrowup":
        take();
        focusRow(cursorIndex < 0 ? rows.length - 1 : cursorIndex - 1, e.shiftKey);
        return;
      case "home":
        take();
        focusRow(0, e.shiftKey);
        return;
      case "end":
        take();
        focusRow(rows.length - 1, e.shiftKey);
        return;
      case "escape":
        take();
        if (t.count) { t.clear(); t.announce("Selection cleared"); }
        else if (t.selecting) { t.setSelecting(false); t.announce("Select mode off"); }
        else if (t.cursorId) { t.setCursor(null); }
        return;
      case "?":
        take();
        t.setLegendOpen(!t.legendOpen);
        return;
      case "/":
        if (!onFocusSearch) return;
        take();
        onFocusSearch();
        return;
      case "v":
        take();
        t.setSelecting(!t.selecting);
        t.announce(t.selecting ? "Select mode off" : "Select mode on");
        return;
      default:
        break;
    }

    // Everything below needs something to act on.
    const targets = t.targetIds;

    if (key === "x") {
      take();
      if (!t.cursorId) { t.announce("Move to a row first — press J"); return; }
      if (!t.selecting) t.setSelecting(true);
      t.toggle(t.cursorId, { shift: e.shiftKey, order: rows });
      t.announce(t.isSelected(t.cursorId) ? "Deselected" : "Selected");
      return;
    }

    if (!targets.length) {
      // Only claim the key if it is one of ours; otherwise let the shell have it.
      if ("tmwu0123de".includes(key) || key === "backspace" || key === "delete" || key === "enter") {
        if (key === "enter" && isActivatable(e.target)) return;
        take();
        t.announce("Move to a row first — press J");
      }
      return;
    }

    switch (key) {
      case "t": take(); actions.moveToDate(targets, todayISO()); return;
      case "m": take(); actions.moveToDate(targets, addDays(todayISO(), 1)); return;
      case "w":
        take();
        actions.moveToDate(targets, e.shiftKey ? nextWeekISO(todayISO(), weekStart) : weekendISO());
        return;
      case "u": take(); actions.moveToDate(targets, null); return;
      case "0": take(); actions.setPriority(targets, 0); return;
      case "1": take(); actions.setPriority(targets, 1); return;
      case "2": take(); actions.setPriority(targets, 2); return;
      case "3": take(); actions.setPriority(targets, 3); return;
      case "d": {
        take();
        const anyOpen = targets.some((id) => byId(id)?.status !== "done");
        actions.setDone(targets, anyOpen);
        return;
      }
      case "e": {
        take();
        const id = t.cursorId ?? targets[0];
        t.setCursor(id);
        t.setEditingId(id);
        return;
      }
      case "enter": {
        if (isActivatable(e.target)) return;
        take();
        openInspector(t.cursorId ?? targets[0]);
        return;
      }
      case "backspace":
      case "delete":
        take();
        onRequestDelete(targets);
        return;
      default:
        return;
    }
  };

  React.useEffect(() => { handlerRef.current = onKey; });

  React.useEffect(() => {
    if (!enabled) return;
    const listener = (e: KeyboardEvent) => handlerRef.current(e);
    document.addEventListener("keydown", listener, true);
    return () => document.removeEventListener("keydown", listener, true);
  }, [enabled]);
}

/** Short label for the "what will the keys act on" line in the rail. */
export function targetLabel(tasks: Task[], targetIds: string[], count: number): string {
  if (count > 1) return `${count} tasks selected`;
  const task = targetIds.length ? tasks.find((t) => t.id === targetIds[0]) : undefined;
  if (!task) return "No task picked";
  const when = task.date ? friendlyDate(task.date) : "Inbox";
  return `${task.title || "Untitled"} · ${when}`;
}
