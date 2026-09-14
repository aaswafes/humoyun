"use client";

import * as React from "react";
import {
  BookOpen, BookmarkCheck, Clapperboard, ExternalLink, Library, MonitorPlay,
  Plus, Sparkles, Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { TINTS, type MediaKind, type Tint } from "@/lib/types";
import { Button, EmptyState, IconButton, Input, Skeleton, Textarea } from "@/components/ui/primitives";
import { Field, Select } from "@/components/ui/form";
import { ConfirmDialog, Modal, TintPicker } from "@/components/ui/overlays";
import {
  REC_CREATOR_LABELS, REC_KINDS, REC_KIND_LABELS,
  type FeedMember, type Rec, type RecKind, type RecSave,
} from "./community-types";
import { addRec, deleteRec, saveRec, unsaveRec, useUserId } from "./community-data";

const KIND_ICON: Record<RecKind, React.ComponentType<{ className?: string }>> = {
  book: BookOpen,
  film: Clapperboard,
  anime: Clapperboard,
  series: Clapperboard,
  youtube: MonitorPlay,
  other: Sparkles,
};

/** Which of this person's own shelves a rec belongs on when they take it. */
const SHELF_OF: Record<RecKind, "books" | MediaKind | null> = {
  book: "books",
  film: "film",
  anime: "anime",
  series: "series",
  youtube: "youtube",
  other: null,
};

export function RecsSection({
  communityId, recs, saves, members, loading, onChanged,
}: {
  communityId: string;
  recs: Rec[];
  saves: RecSave[];
  members: FeedMember[];
  loading: boolean;
  onChanged: () => void;
}) {
  const userId = useUserId();
  const toast = useStore((s) => s.toast);
  const insert = useStore((s) => s.insert);
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<Rec | null>(null);
  const [filter, setFilter] = React.useState<RecKind | "all">("all");

  const nameOf = React.useCallback(
    (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "Someone",
    [members],
  );

  const visible = filter === "all" ? recs : recs.filter((r) => r.kind === filter);
  const kindsPresent = REC_KINDS.filter((k) => recs.some((r) => r.kind === k));

  /**
   * Taking a recommendation writes a real row on the taker's own shelf, through
   * the store's own insert — which is the whole point of the button. A rec that
   * only lived here would be a group chat with extra steps.
   */
  async function take(rec: Rec) {
    if (!userId) return;
    const shelf = SHELF_OF[rec.kind];
    try {
      if (shelf === "books") {
        insert("books", {
          title: rec.title, author: rec.creator, status: "planned",
          color: rec.color, notes: rec.note,
        });
      } else if (shelf) {
        insert("media", {
          title: rec.title, creator: rec.creator, kind: shelf, status: "planned",
          color: rec.color, url: rec.url, notes: rec.note,
          channel: rec.kind === "youtube" ? rec.creator : null,
        });
      }
      await saveRec(rec.id, userId);
      onChanged();
      toast({
        title: shelf ? "Added to your shelf" : "Saved",
        description: shelf === "books" ? "It is on your Books page, planned."
          : shelf ? "It is on your shelf, planned." : undefined,
        tone: "success",
      });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not save that", tone: "danger" });
    }
  }

  async function untake(save: RecSave) {
    try { await unsaveRec(save.id); onChanged(); }
    catch (e) { toast({ title: e instanceof Error ? e.message : "Could not remove that", tone: "danger" }); }
  }

  if (loading) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-[12.5px] text-ink-3">
          Things worth someone else&rsquo;s time.
        </p>
        <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" />
          Recommend
        </Button>
      </div>

      {kindsPresent.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...kindsPresent] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "h-7 rounded-full px-2.5 text-[12px] cursor-pointer transition-colors",
                filter === k ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-hover hover:text-ink",
              )}
            >
              {k === "all" ? "All" : REC_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No recommendations yet"
          description="Tell everyone about a book, a film or a channel that was actually worth it."
          action={<Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-3.5" />Recommend something</Button>}
        />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((rec) => {
            const Icon = KIND_ICON[rec.kind];
            const recSaves = saves.filter((s) => s.rec_id === rec.id);
            const mine = recSaves.find((s) => s.user_id === userId);
            const isAuthor = rec.user_id === userId;

            return (
              <li key={rec.id} className={cn(`tint-${rec.color}`, "flex gap-3 py-3.5")}>
                <div
                  className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px]"
                  style={{ background: "var(--tint-soft)", color: "var(--tint-ink)" }}
                  aria-hidden
                >
                  <Icon className="size-3.5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-[13.5px] font-medium leading-tight text-ink">{rec.title}</p>
                    {rec.creator && <p className="text-[12px] text-ink-3">{rec.creator}</p>}
                  </div>

                  {rec.note && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{rec.note}</p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-[11.5px] text-ink-4">
                      {REC_KIND_LABELS[rec.kind]} · {isAuthor ? "you" : nameOf(rec.user_id)}
                      {recSaves.length > 0 && ` · ${recSaves.length} saved`}
                    </p>

                    {rec.url && (
                      <a
                        href={rec.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink cursor-pointer transition-colors"
                      >
                        <ExternalLink className="size-3" />
                        Open
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-start gap-1">
                  {mine ? (
                    <Button size="sm" onClick={() => untake(mine)}>
                      <BookmarkCheck className="size-3.5 text-success" />
                      Saved
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => take(rec)}>
                      <Plus className="size-3.5" />
                      {SHELF_OF[rec.kind] ? "Add to my shelf" : "Save"}
                    </Button>
                  )}
                  {isAuthor && (
                    <IconButton label="Delete recommendation" size="sm" onClick={() => setRemoving(rec)}>
                      <Trash2 />
                    </IconButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <NewRecDialog
          communityId={communityId}
          onClose={() => setAdding(false)}
          onDone={onChanged}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Delete this recommendation?"
        description="It disappears for everyone. Anything already added to a shelf stays there."
        confirmLabel="Delete"
        tone="danger"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const rec = removing;
          if (!rec) return;
          try { await deleteRec(rec.id); onChanged(); }
          catch (e) { toast({ title: e instanceof Error ? e.message : "Could not delete", tone: "danger" }); }
        }}
      />
    </div>
  );
}

/** Mounted only while open, so its fields start fresh without a reset effect. */
function NewRecDialog({
  communityId, onClose, onDone,
}: {
  communityId: string; onClose: () => void; onDone: () => void;
}) {
  const userId = useUserId();
  const toast = useStore((s) => s.toast);
  const [kind, setKind] = React.useState<RecKind>("book");
  const [title, setTitle] = React.useState("");
  const [creator, setCreator] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [note, setNote] = React.useState("");
  const [color, setColor] = React.useState<Tint>(() => TINTS[Math.floor(Math.random() * TINTS.length)]);
  const [busy, setBusy] = React.useState(false);

  const valid = title.trim().length > 0;

  async function submit() {
    if (!valid || !userId || busy) return;
    setBusy(true);
    try {
      await addRec(communityId, userId, {
        kind,
        title: title.trim(),
        creator: creator.trim() || null,
        url: url.trim() || null,
        note: note.trim() || null,
        color,
      });
      onDone();
      onClose();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not post that", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Recommend something" width={440}>
      <div className="space-y-4 p-4">
        <Field label="What kind">
          {(props) => (
            <Select
              {...props}
              value={kind}
              onChange={setKind}
              options={REC_KINDS.map((k) => ({ value: k, label: REC_KIND_LABELS[k] }))}
            />
          )}
        </Field>

        <Field label="Title" required>
          {(props) => (
            <Input
              {...props}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ihya Ulum al-Din"
            />
          )}
        </Field>

        <Field label={REC_CREATOR_LABELS[kind]} description="Optional">
          {(props) => (
            <Input {...props} value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="Imam al-Ghazali" />
          )}
        </Field>

        <Field label="Link" description="Optional">
          {(props) => (
            <Input {...props} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          )}
        </Field>

        <Field label="Why" description="The part people actually read">
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Changed how I think about intention."
            />
          )}
        </Field>

        <Field label="Colour">
          {() => <TintPicker value={color} onChange={(t) => t && setColor(t)} />}
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            {busy ? "Posting…" : "Post it"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
