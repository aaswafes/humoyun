"use client";

import * as React from "react";
import { Archive } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Habit } from "@/lib/types";
import { Button, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { Field } from "@/components/ui/form";

/** The four reasons a habit actually gets retired. One tap fills the box. */
const PRESETS = [
  "It's automatic now — I don't need to track it",
  "The season for it has passed",
  "Too ambitious for where I am",
  "Replaced by a different habit",
];

/**
 * Archiving asks why. Six months later "Read 10 pages, archived in March"
 * means nothing without it, and the reason is what tells you whether to
 * restore the habit or let it go.
 */
export function ArchiveDialog({
  habit, daysLogged, onClose, onArchive,
}: {
  habit: Habit | null;
  daysLogged: number;
  onClose: () => void;
  onArchive: (habit: Habit, reason: string | null) => void;
}) {
  // Mounted with a key per habit, so the draft resets without an effect.
  const [reason, setReason] = React.useState("");

  if (!habit) return null;

  return (
    <Modal open onClose={onClose} title={`Archive ${habit.name}?`} width={440}>
      <div className="px-4 py-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          It stops appearing on your day. All {daysLogged} logged {daysLogged === 1 ? "day" : "days"},
          every note and the streak stay exactly as they are — restore it and the history is still there.
        </p>

        <div className="mt-4">
          <Field
            label="Why are you archiving it?"
            description="Optional, but this is the note that decides whether you bring it back."
          >
            {(props) => (
              <Textarea
                {...props}
                value={reason}
                autoFocus
                rows={2}
                onChange={(e) => setReason(e.target.value)}
                placeholder="It did its job…"
              />
            )}
          </Field>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={reason === preset}
                onClick={() => setReason(reason === preset ? "" : preset)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11.5px] cursor-pointer transition-colors duration-150",
                  reason === preset
                    ? "border-accent-line bg-accent-soft text-accent"
                    : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => { onArchive(habit, reason.trim() || null); onClose(); }}
        >
          <Archive className="size-3.5" />
          Archive habit
        </Button>
      </div>
    </Modal>
  );
}
