"use client";

import * as React from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useStore, type TrashEntry } from "@/lib/store";
import { SOLO } from "@/lib/local-db";
import type { CollectionKey } from "@/lib/types";
import { Button, IconButton, Spinner } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Callout, Pane } from "./ui";

// =========================================================
// Trash.
//
// Deleting used to mean the row left Postgres. Now it is stamped and hidden,
// and this is the only place it can be seen again. The rows are fetched when
// this pane opens rather than held in the store — nothing should pay for
// deleted data at rest.
// =========================================================

const TYPE_LABEL: Record<string, string> = {
  tasks: "Task",
  notes: "Note",
  books: "Book",
  media: "Film or video",
  goals: "Goal",
  projects: "Project",
  habits: "Habit",
  templates: "Template",
  noteCategories: "Note category",
};

/** "3 days ago", from a timestamptz. Exact dates are noise at this scale. */
function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function TrashSection() {
  const loadTrash = useStore((s) => s.loadTrash);
  const restoreItem = useStore((s) => s.restoreItem);
  const purgeItem = useStore((s) => s.purgeItem);
  const emptyTrash = useStore((s) => s.emptyTrash);
  const toast = useStore((s) => s.toast);

  const [rows, setRows] = React.useState<TrashEntry[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [emptyOpen, setEmptyOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setRows(await loadTrash());
  }, [loadTrash]);

  React.useEffect(() => {
    let alive = true;
    void loadTrash().then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [loadTrash]);

  async function restore(entry: TrashEntry) {
    setBusy(entry.id);
    const ok = await restoreItem(entry.key as CollectionKey, entry.id);
    setBusy(null);
    if (ok) setRows((prev) => prev?.filter((r) => r.id !== entry.id) ?? null);
  }

  async function purge(entry: TrashEntry) {
    setBusy(entry.id);
    const ok = await purgeItem(entry.key as CollectionKey, entry.id);
    setBusy(null);
    if (ok) {
      setRows((prev) => prev?.filter((r) => r.id !== entry.id) ?? null);
      toast({ title: "Deleted for good" });
    }
  }

  async function empty() {
    const n = await emptyTrash();
    await refresh();
    toast({ title: n ? `Removed ${n} ${n === 1 ? "item" : "items"}` : "Trash was already empty" });
  }

  if (SOLO) {
    return (
      <Pane title="Trash" description="Deleted things wait here before they go for good.">
        <Callout
          tone="info"
          title="Not available in local preview"
          // Being straight about it beats an empty list that looks broken.
        >
          Local preview keeps everything in this browser and has no server to hold a
          deleted row on, so deleting here is immediate. Sign in to get a trash.
        </Callout>
      </Pane>
    );
  }

  return (
    <Pane
      title="Trash"
      description="Deleted tasks, notes, books, goals and projects wait here instead of going straight out. Nothing leaves on its own — empty the trash yourself when you are sure."
    >
      {rows === null ? (
        <div className="flex items-center gap-2 py-6 text-[13px] text-ink-3">
          <Spinner /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-[13px] text-ink-2">
          Nothing in the trash. Anything you delete from now on lands here first.
        </p>
      ) : (
        <>
          <ul className="flex flex-col rounded-lg border border-line">
            {rows.map((entry) => (
              <li
                key={`${entry.key}:${entry.id}`}
                className="flex items-center gap-3 px-3 py-2 hairline-b last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">{entry.label}</span>
                  <span className="block text-[11.5px] text-ink-3">
                    {TYPE_LABEL[entry.key] ?? entry.key} · deleted {ago(entry.deleted_at)}
                  </span>
                </span>

                {busy === entry.id ? (
                  <Spinner />
                ) : (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <IconButton
                      label={`Restore ${entry.label}`}
                      title="Put it back"
                      onClick={() => void restore(entry)}
                    >
                      <RotateCcw />
                    </IconButton>
                    <IconButton
                      label={`Delete ${entry.label} permanently`}
                      title="Delete for good"
                      onClick={() => void purge(entry)}
                    >
                      <Trash2 />
                    </IconButton>
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setEmptyOpen(true)}>
              <Trash2 className="size-3.5" />
              Empty trash
            </Button>
            <span className="text-[12px] text-ink-3 tnum">
              {rows.length} {rows.length === 1 ? "item" : "items"}
            </span>
          </div>
        </>
      )}

      <ConfirmDialog
        open={emptyOpen}
        onClose={() => setEmptyOpen(false)}
        onConfirm={() => void empty()}
        title="Empty the trash?"
        description="Everything in it goes permanently, and there is no backup unless you made one. Restore anything you want to keep first."
        confirmLabel="Empty trash"
      />
    </Pane>
  );
}
