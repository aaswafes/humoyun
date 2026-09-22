"use client";

import * as React from "react";
import { Minus, Plus, Trash2, X, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDuration, formatRange, friendlyDate } from "@/lib/date";
import { Badge, Button, IconButton, Textarea } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlays";
import { SubjectPicker } from "./subject-picker";
import { CategoryMultiPicker } from "@/components/umr/category-picker";
import { interruptionsOf, normalizeTag, toView, visibleTags } from "./focus-data";
import {
  deleteSession, reattachSession, setSessionInterruptions, setSessionNote, setSessionTags,
} from "./session-actions";

/**
 * One editor for a logged session, opened from the wrap-up card and from any
 * row in history. Everything it changes is a store patch, so the page behind it
 * updates as you type.
 */
export function SessionEditor({
  sessionId, onClose,
}: {
  sessionId: string | null;
  onClose: () => void;
}) {
  const session = useStore((s) => s.focusSessions.find((x) => x.id === sessionId) ?? null);
  const tasks = useStore((s) => s.tasks);
  const allTags = useStore((s) => s.tags);
  const hour12 = useStore((s) => s.hour12);
  const patch = useStore((s) => s.patch);

  const [note, setNote] = React.useState("");
  const [tagDraft, setTagDraft] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const noteRef = React.useRef("");

  // Seed the draft when a different session is opened, not on every patch.
  React.useEffect(() => {
    const current = useStore.getState().focusSessions.find((x) => x.id === sessionId);
    const seed = current?.note ?? "";
    setNote(seed);
    noteRef.current = seed;
    setTagDraft("");
  }, [sessionId]);

  const commitNote = React.useCallback(() => {
    if (sessionId) setSessionNote(sessionId, noteRef.current);
  }, [sessionId]);

  const close = React.useCallback(() => {
    commitNote();
    onClose();
  }, [commitNote, onClose]);

  if (!sessionId || !session) return null;

  const view = toView(session);
  const tags = visibleTags(session.tags);
  const interruptions = interruptionsOf(session);
  const task = session.task_id ? tasks.find((t) => t.id === session.task_id) ?? null : null;

  const suggestions = [
    ...new Set([
      ...allTags.map((t) => t.name),
      ...tasks.flatMap((t) => t.tags),
    ].map(normalizeTag).filter(Boolean)),
  ]
    .filter((t) => !tags.includes(t))
    .slice(0, 6);

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || tags.includes(tag)) { setTagDraft(""); return; }
    setSessionTags(sessionId, [...tags, tag]);
    setTagDraft("");
  };

  return (
    <>
      <Modal open onClose={close} title="Session" width={460}>
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="display-serif tnum text-[22px] leading-none text-ink">
              {formatDuration(view.minutes)}
            </span>
            <span className="text-[12.5px] text-ink-3 tnum">
              {friendlyDate(view.date)} · {formatRange(view.startMin, view.endMin, hour12)}
            </span>
            <span className="ml-auto text-[11.5px] text-ink-4">
              {session.mode === "break"
                ? "Break"
                : session.mode === "pomodoro"
                  ? session.completed ? "Pomodoro · finished" : "Pomodoro · stopped early"
                  : "Stopwatch"}
            </span>
          </div>

          {session.mode !== "break" && (
            <Field
              label="Kinds of living"
              description={
                (session.umr_kinds ?? []).length > 1
                  ? "This hour was more than one thing, so its minutes split evenly between them."
                  : "Which of the five this hour went to. Pick more than one and the minutes split evenly."
              }
            >
              {() => (
                <CategoryMultiPicker
                  size="sm"
                  values={session.umr_kinds ?? []}
                  onChange={(next) => patch("focusSessions", session.id, { umr_kinds: next })}
                  label="Kinds of living"
                />
              )}
            </Field>
          )}

          {session.mode !== "break" && (
            <Field
              label="Credited to"
              description={
                task
                  ? "Moving the session moves its minutes with it."
                  : "Attach it to a task and its minutes land on that task."
              }
            >
              {(wiring) => (
                <SubjectPicker
                  variant="field"
                  id={wiring.id}
                  aria-describedby={wiring["aria-describedby"]}
                  value={{ taskId: session.task_id, label: session.label ?? "" }}
                  onChange={(next) => reattachSession(sessionId, next.taskId, next.label)}
                  emptyLabel="Not attached"
                />
              )}
            </Field>
          )}

          <Field label="Note" description="What happened in this block — the thing you would forget by tonight.">
            {(wiring) => (
              <Textarea
                id={wiring.id}
                aria-describedby={wiring["aria-describedby"]}
                rows={3}
                value={note}
                placeholder="Wrote the intro, got stuck on the middle section…"
                onChange={(e) => { setNote(e.target.value); noteRef.current = e.target.value; }}
                onBlur={commitNote}
              />
            )}
          </Field>

          <Field label="Tags" description="Totals in Rhythm are grouped by these.">
            {(wiring) => (
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex h-[22px] items-center gap-1 rounded-full bg-hover pl-2 pr-1 text-[12px] text-ink-2"
                    >
                      {tag}
                      <IconButton
                        label={`Remove tag ${tag}`}
                        size="sm"
                        className="size-[18px] [&_svg]:size-3"
                        onClick={() => setSessionTags(sessionId, tags.filter((t) => t !== tag))}
                      >
                        <X />
                      </IconButton>
                    </span>
                  ))}
                  <input
                    id={wiring.id}
                    aria-describedby={wiring["aria-describedby"]}
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagDraft); }
                      if (e.key === "Backspace" && !tagDraft && tags.length) {
                        setSessionTags(sessionId, tags.slice(0, -1));
                      }
                    }}
                    onBlur={() => addTag(tagDraft)}
                    placeholder={tags.length ? "Add another" : "deep, writing, admin…"}
                    className="h-7 min-w-[110px] flex-1 rounded-md bg-transparent px-1 text-[13px] text-ink outline-none placeholder:text-ink-4"
                  />
                </div>

                {suggestions.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {suggestions.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => addTag(tag)}
                        className="cursor-pointer rounded-full px-1.5 py-0.5 text-[11.5px] text-ink-4 transition-colors hover:bg-hover hover:text-ink-2"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>

          {session.mode !== "break" && (
            <Field label="Interruptions" description="Times you were pulled away during this block.">
              {(wiring) => (
                <div
                  id={wiring.id}
                  aria-describedby={wiring["aria-describedby"]}
                  className="flex items-center gap-2"
                >
                  <IconButton
                    label="One fewer interruption"
                    disabled={interruptions === 0}
                    onClick={() => setSessionInterruptions(sessionId, interruptions - 1)}
                  >
                    <Minus />
                  </IconButton>
                  <span
                    className={cn(
                      "inline-flex h-8 min-w-[52px] items-center justify-center gap-1.5 rounded-md px-2 text-[13.5px] tnum",
                      interruptions ? "bg-warn-soft text-warn" : "bg-hover text-ink-3",
                    )}
                  >
                    <Zap className="size-3.5" aria-hidden />
                    {interruptions}
                  </span>
                  <IconButton
                    label="One more interruption"
                    onClick={() => setSessionInterruptions(sessionId, interruptions + 1)}
                  >
                    <Plus />
                  </IconButton>
                  {interruptions > 0 && (
                    <Badge tint="amber" className="ml-1">
                      {Math.round(view.minutes / (interruptions + 1))}m between
                    </Badge>
                  )}
                </div>
              )}
            </Field>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-3.5" />
            Delete
          </Button>
          <Button variant="primary" size="sm" onClick={close}>Done</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { deleteSession(sessionId); onClose(); }}
        title="Delete this session?"
        description={`${formatDuration(view.minutes)} comes off the record${task ? ` and off ${task.title}` : ""}.`}
      />
    </>
  );
}
