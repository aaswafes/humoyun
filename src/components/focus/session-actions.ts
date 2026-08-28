"use client";

import { useStore } from "@/lib/store";
import type { FocusSession } from "@/lib/types";
import { normalizeTag, visibleTags, withInterruptions } from "./focus-data";

// =========================================================
// Editing a session after it was logged.
//
// Every one of these keeps `task.actual_min` honest: the timer credits the
// task it was attached to when it stopped, so moving or deleting a session has
// to move the minutes with it.
// =========================================================

function creditTask(taskId: string | null, deltaMinutes: number) {
  if (!taskId || !deltaMinutes) return;
  const state = useStore.getState();
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  state.patch("tasks", task.id, { actual_min: Math.max(0, task.actual_min + deltaMinutes) });
}

export function sessionMinutes(session: FocusSession): number {
  return Math.max(1, Math.round(session.seconds / 60));
}

/** Move a logged session onto a different task, or onto a plain label. */
export function reattachSession(sessionId: string, taskId: string | null, label: string) {
  const state = useStore.getState();
  const session = state.focusSessions.find((s) => s.id === sessionId);
  if (!session) return;

  const minutes = sessionMinutes(session);
  if (session.task_id !== taskId) {
    creditTask(session.task_id, -minutes);
    creditTask(taskId, minutes);
  }
  state.patch("focusSessions", sessionId, {
    task_id: taskId,
    label: label.trim() ? label.trim() : null,
  });
}

export function setSessionNote(sessionId: string, note: string) {
  const trimmed = note.trim();
  const state = useStore.getState();
  const session = state.focusSessions.find((s) => s.id === sessionId);
  if (!session || (session.note ?? "") === trimmed) return;
  state.patch("focusSessions", sessionId, { note: trimmed || null });
}

export function setSessionTags(sessionId: string, tags: string[]) {
  const state = useStore.getState();
  const session = state.focusSessions.find((s) => s.id === sessionId);
  if (!session) return;
  const clean = [...new Set(tags.map(normalizeTag).filter(Boolean))].slice(0, 8);
  // Bookkeeping tags are invisible to the editor, so they are re-attached here.
  const reserved = (session.tags ?? []).filter((t) => !visibleTags([t]).length);
  state.patch("focusSessions", sessionId, { tags: [...clean, ...reserved] });
}

export function setSessionInterruptions(sessionId: string, count: number) {
  const state = useStore.getState();
  const session = state.focusSessions.find((s) => s.id === sessionId);
  if (!session) return;
  state.patch("focusSessions", sessionId, {
    tags: withInterruptions(session.tags, Math.max(0, Math.round(count))),
  });
}

/** Delete a session and hand its minutes back to the task it was credited to. */
export function deleteSession(sessionId: string) {
  const state = useStore.getState();
  const session = state.focusSessions.find((s) => s.id === sessionId);
  if (!session) return;
  creditTask(session.task_id, -sessionMinutes(session));
  state.remove("focusSessions", sessionId);
}
