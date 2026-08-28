"use client";

import * as React from "react";
import { Check, MoreHorizontal, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatDuration } from "@/lib/date";
import { Button, IconButton } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import { setSessionNote } from "./session-actions";
import type { FocusEngine } from "./focus-engine";

/**
 * The one thing worth capturing the second a block ends. It stays through the
 * break, so a thought that arrives two minutes into the coffee still lands on
 * the right session.
 */
export function WrapNote({
  engine, onExpand,
}: {
  engine: FocusEngine;
  onExpand: (sessionId: string) => void;
}) {
  const last = engine.last;
  const sessionId = last?.sessionId ?? null;
  const stored = useStore((s) => s.focusSessions.find((x) => x.id === sessionId)?.note ?? "");
  const [draft, setDraft] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  // Seeded per session only — re-seeding on every patch would wipe the "Saved"
  // flash the moment the patch that caused it lands.
  React.useEffect(() => {
    const note = useStore.getState().focusSessions.find((x) => x.id === sessionId)?.note ?? "";
    setDraft(note);
    setSaved(false);
  }, [sessionId]);

  if (!last || !sessionId || engine.phase === "focus") return null;

  const commit = () => {
    if (draft.trim() === stored.trim()) return;
    setSessionNote(sessionId, draft);
    setSaved(true);
  };

  return (
    <div className="mx-auto mt-7 w-full max-w-[520px] rounded-lg border border-line bg-raised p-1.5 anim-slide">
      <div className="flex items-center gap-1.5">
        <label htmlFor="focus-wrap-note">
          <VisuallyHidden>Note on the block that just ended</VisuallyHidden>
        </label>
        <input
          id="focus-wrap-note"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { setDraft(stored); (e.target as HTMLInputElement).blur(); }
          }}
          placeholder={`Note on those ${formatDuration(last.minutes)} — where you got to`}
          className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-ink-4"
        />

        {saved && (
          <span className="flex shrink-0 items-center gap-1 pr-1 text-[11.5px] text-success anim-fade">
            <Check className="size-3" aria-hidden />
            Saved
          </span>
        )}

        <Button variant="ghost" size="sm" onClick={() => onExpand(sessionId)}>
          <MoreHorizontal className="size-3.5" />
          Details
        </Button>
        <IconButton label="Discard this session" tone="danger" onClick={engine.discardWrapped}>
          <Trash2 />
        </IconButton>
      </div>
    </div>
  );
}
