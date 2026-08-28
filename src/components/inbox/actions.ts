"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { friendlyDate } from "@/lib/date";
import { PRIORITY_LABELS, type Task, type TaskKind } from "@/lib/types";
import { useTriage } from "./triage-context";

// =========================================================
// Every bulk verb in one place. The rail, the bulk bar, the keyboard layer and
// the row menus all call these, so a move made by drag and a move made by
// pressing T behave identically — same toast, same undo, same announcement.
// =========================================================

const noun = (n: number) => (n === 1 ? "task" : "tasks");

export interface TriageActions {
  moveToDate: (ids: string[], iso: string | null) => void;
  setPriority: (ids: string[], priority: number) => void;
  setTag: (ids: string[], tag: string, add: boolean) => void;
  setDone: (ids: string[], done: boolean) => void;
  setKind: (ids: string[], kind: TaskKind) => void;
  nestUnder: (ids: string[], parentId: string) => void;
  unnest: (ids: string[]) => void;
  duplicate: (ids: string[]) => void;
  deleteTasks: (ids: string[]) => void;
}

export function useTriageActions(): TriageActions {
  const patch = useStore((s) => s.patch);
  const insert = useStore((s) => s.insert);
  const remove = useStore((s) => s.remove);
  const moveTask = useStore((s) => s.moveTask);
  const toggleTask = useStore((s) => s.toggleTask);
  const duplicateTask = useStore((s) => s.duplicateTask);
  const toast = useStore((s) => s.toast);
  const { announce, clear } = useTriage();

  return React.useMemo<TriageActions>(() => {
    // Read at call time rather than at render time: these verbs fire from
    // clicks, drops and keystrokes, and every one of them wants the rows as
    // they are now — not as they were when the toolbar last rendered.
    const current = () => useStore.getState().tasks;
    const rowsFor = (ids: string[]) =>
      ids.map((id) => current().find((t) => t.id === id)).filter((t): t is Task => !!t);

    function report(text: string, undo?: () => void) {
      toast({ title: text, ...(undo ? { action: { label: "Undo", run: undo } } : {}) });
      announce(text);
    }

    return {
      moveToDate(ids, iso) {
        // Rows already on that date would only produce a toast about nothing.
        const rows = rowsFor(ids).filter((t) => t.date !== iso);
        if (!rows.length) return;
        const before = rows.map((t) => [t.id, t.date] as const);
        rows.forEach((t) => moveTask(t.id, iso));
        report(
          `${rows.length} ${noun(rows.length)} → ${iso ? friendlyDate(iso) : "Inbox"}`,
          () => before.forEach(([id, date]) => moveTask(id, date)),
        );
      },

      setPriority(ids, priority) {
        const rows = rowsFor(ids);
        if (!rows.length) return;
        const before = rows.map((t) => [t.id, t.priority] as const);
        rows.forEach((t) => patch("tasks", t.id, { priority }));
        report(
          `Priority ${PRIORITY_LABELS[priority].toLowerCase()} · ${rows.length} ${noun(rows.length)}`,
          () => before.forEach(([id, p]) => patch("tasks", id, { priority: p })),
        );
      },

      setTag(ids, tag, add) {
        const rows = rowsFor(ids);
        if (!rows.length) return;
        const before = rows.map((t) => [t.id, t.tags] as const);
        let touched = 0;
        rows.forEach((t) => {
          const next = add
            ? t.tags.includes(tag) ? t.tags : [...t.tags, tag]
            : t.tags.filter((x) => x !== tag);
          if (next.length !== t.tags.length) { patch("tasks", t.id, { tags: next }); touched++; }
        });
        if (!touched) { announce(`Every selected task already ${add ? "has" : "lacks"} ${tag}`); return; }
        report(
          `${add ? "Tagged" : "Untagged"} ${touched} ${noun(touched)} — ${tag}`,
          () => before.forEach(([id, tags]) => patch("tasks", id, { tags })),
        );
      },

      setDone(ids, done) {
        const rows = rowsFor(ids).filter((t) => (t.status === "done") !== done);
        if (!rows.length) return;
        // toggleTask carries the side effects (reading bookmark, habit log), so
        // completing goes through it; reopening is a plain patch.
        if (done) rows.forEach((t) => toggleTask(t.id));
        else rows.forEach((t) => patch("tasks", t.id, { status: "todo", completed_at: null }));
        const snapshot = rows.map((t) => [t.id, t.status, t.completed_at] as const);
        report(
          `${rows.length} ${noun(rows.length)} ${done ? "completed" : "reopened"}`,
          () => snapshot.forEach(([id, status, completedAt]) =>
            patch("tasks", id, { status, completed_at: completedAt })),
        );
      },

      setKind(ids, kind) {
        const rows = rowsFor(ids).filter((t) => t.kind !== kind);
        if (!rows.length) return;
        const before = rows.map((t) => [t.id, t.kind] as const);
        rows.forEach((t) => patch("tasks", t.id, { kind }));
        report(
          `${rows.length} ${noun(rows.length)} → ${kind}`,
          () => before.forEach(([id, k]) => patch("tasks", id, { kind: k })),
        );
      },

      nestUnder(ids, parentId) {
        const parent = current().find((t) => t.id === parentId);
        if (!parent) return;
        // A task cannot be its own ancestor, and only one level of nesting exists.
        const rows = rowsFor(ids).filter((t) => t.id !== parentId && t.parent_id !== parentId);
        const blocked = rows.filter((t) => current().some((c) => c.parent_id === t.id));
        const usable = rows.filter((t) => !blocked.includes(t));
        if (!usable.length) {
          announce(blocked.length ? "Tasks with their own subtasks cannot be nested" : "Nothing to nest");
          toast({
            title: blocked.length ? "Those already have subtasks" : "Nothing to nest",
            description: blocked.length
              ? "A task that already has subtasks cannot become one itself."
              : undefined,
            tone: "danger",
          });
          return;
        }
        const before = usable.map((t) => [t.id, t.parent_id, t.date] as const);
        usable.forEach((t) => patch("tasks", t.id, { parent_id: parentId, date: parent.date }));
        report(
          `${usable.length} ${noun(usable.length)} nested under “${parent.title || "Untitled"}”`,
          () => before.forEach(([id, parent_id, date]) => patch("tasks", id, { parent_id, date })),
        );
      },

      unnest(ids) {
        const rows = rowsFor(ids).filter((t) => t.parent_id);
        if (!rows.length) return;
        const before = rows.map((t) => [t.id, t.parent_id] as const);
        rows.forEach((t) => patch("tasks", t.id, { parent_id: null }));
        report(
          `${rows.length} ${noun(rows.length)} pulled out`,
          () => before.forEach(([id, parent_id]) => patch("tasks", id, { parent_id })),
        );
      },

      duplicate(ids) {
        const rows = rowsFor(ids);
        if (!rows.length) return;
        const copies = rows.map((t) => duplicateTask(t.id)).filter((t): t is Task => !!t);
        report(
          `Duplicated ${copies.length} ${noun(copies.length)}`,
          () => copies.forEach((c) => remove("tasks", c.id)),
        );
      },

      deleteTasks(ids) {
        const rows = rowsFor(ids);
        if (!rows.length) return;
        // Subtasks go with their parent — left behind they are unreachable.
        const victims = new Map<string, Task>();
        rows.forEach((t) => victims.set(t.id, t));
        current().forEach((t) => {
          if (t.parent_id && victims.has(t.parent_id)) victims.set(t.id, t);
        });
        const snapshot = [...victims.values()];
        snapshot.forEach((t) => remove("tasks", t.id));
        clear();
        const n = rows.length;
        toast({
          title: `Deleted ${n} ${noun(n)}`,
          tone: "danger",
          action: { label: "Undo", run: () => snapshot.forEach((t) => insert("tasks", t)) },
        });
        announce(`Deleted ${n} ${noun(n)}`);
      },
    };
  }, [patch, insert, remove, moveTask, toggleTask, duplicateTask, toast, announce, clear]);
}
