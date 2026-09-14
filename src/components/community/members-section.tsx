"use client";

import * as React from "react";
import { Check, Copy, LogOut, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Button, Input, SectionLabel, Textarea } from "@/components/ui/primitives";
import { Field, Toggle } from "@/components/ui/form";
import { ConfirmDialog, Modal, TintPicker } from "@/components/ui/overlays";
import type { Community, FeedMember, Membership, ShareKey } from "./community-types";
import type { Tint } from "@/lib/types";
import { deleteCommunity, leaveCommunity, setShare, updateCommunity, useUserId } from "./community-data";
import { Avatar } from "./member-today";

const SWITCHES: { key: ShareKey; label: string; description: string }[] = [
  {
    key: "share_plan",
    label: "Today's plan",
    description: "Members see the titles of today's tasks and which are done. Never times, notes or any other day.",
  },
  {
    key: "share_salah",
    label: "Salah",
    description: "Members see today's five prayers and how each was prayed.",
  },
  {
    key: "share_shelf",
    label: "What I'm reading and watching",
    description: "Lets members see the books and titles you recommend from your own shelves.",
  },
];

export function MembersSection({
  community, membership, members, onChanged,
}: {
  community: Community;
  membership: Membership | null;
  members: FeedMember[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const userId = useUserId();
  const toast = useStore((s) => s.toast);
  const [copied, setCopied] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  // Flipping a switch has to feel instant, and the row it writes is the one
  // row this member is allowed to write — so the optimistic value is safe.
  const [pending, setPending] = React.useState<Partial<Record<ShareKey, boolean>>>({});

  const isOwner = community.created_by === userId;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(community.invite_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: "Could not copy — the code is on screen", tone: "danger" });
    }
  }

  async function flip(key: ShareKey, next: boolean) {
    if (!membership) return;
    setPending((p) => ({ ...p, [key]: next }));
    try {
      await setShare(membership.id, key, next);
      onChanged();
    } catch (e) {
      setPending((p) => { const copy = { ...p }; delete copy[key]; return copy; });
      toast({ title: e instanceof Error ? e.message : "Could not save that", tone: "danger" });
    }
  }

  const shareValue = (key: ShareKey) => pending[key] ?? membership?.[key] ?? false;

  return (
    <div className="space-y-8">
      <section>
        <SectionLabel>What you share here</SectionLabel>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
          These are set per community. Turning something on here changes nothing anywhere else.
        </p>
        <div className="mt-4 space-y-4">
          {SWITCHES.map((s) => (
            <Toggle
              key={s.key}
              checked={shareValue(s.key)}
              onChange={(next) => flip(s.key, next)}
              label={s.label}
              description={s.description}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Invite</SectionLabel>
        <p className="mt-1.5 text-[12.5px] text-ink-3">
          Anyone with this code can join. They share nothing until they choose to.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="rounded-md bg-hover px-2.5 py-1.5 text-[15px] font-semibold tracking-[0.14em] text-ink tnum">
            {community.invite_code}
          </code>
          <Button size="sm" onClick={copyCode}>
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </section>

      <section>
        <SectionLabel>{members.length} {members.length === 1 ? "member" : "members"}</SectionLabel>
        <ul className="mt-2 divide-y divide-line">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2.5 py-2.5">
              <Avatar member={m} size={26} />
              <p className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {m.is_self ? "You" : m.display_name}
              </p>
              {m.role === "owner" && (
                <span className="text-[10.5px] uppercase tracking-[0.06em] text-ink-4">Owner</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap gap-2 pt-2">
        {isOwner && (
          <Button onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            Rename
          </Button>
        )}
        {membership && (
          <Button onClick={() => setLeaving(true)}>
            <LogOut className="size-3.5" />
            Leave community
          </Button>
        )}
        {isOwner && (
          <Button onClick={() => setDeleting(true)} className="text-danger">
            <Trash2 className="size-3.5" />
            Delete community
          </Button>
        )}
      </section>

      {editing && (
        <EditDialog
          community={community}
          onClose={() => setEditing(false)}
          onDone={onChanged}
        />
      )}

      <ConfirmDialog
        open={leaving}
        title={`Leave ${community.name}?`}
        description="You stop seeing everyone's days and they stop seeing yours. Your own tasks, salah and shelves are untouched."
        confirmLabel="Leave"
        tone="danger"
        onClose={() => setLeaving(false)}
        onConfirm={async () => {
          if (!membership) return;
          try { await leaveCommunity(membership.id); router.push("/community"); }
          catch (e) { toast({ title: e instanceof Error ? e.message : "Could not leave", tone: "danger" }); }
        }}
      />

      <ConfirmDialog
        open={deleting}
        title={`Delete ${community.name}?`}
        description="Its joint goals and recommendations go with it, for everyone. Nobody's own tasks, salah or shelves are affected. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          try { await deleteCommunity(community.id); router.push("/community"); }
          catch (e) { toast({ title: e instanceof Error ? e.message : "Could not delete", tone: "danger" }); }
        }}
      />
    </div>
  );
}

/** Mounted only while open, so its fields start from the current row once. */
function EditDialog({
  community, onClose, onDone,
}: {
  community: Community; onClose: () => void; onDone: () => void;
}) {
  const toast = useStore((s) => s.toast);
  const [name, setName] = React.useState(community.name);
  const [description, setDescription] = React.useState(community.description ?? "");
  const [color, setColor] = React.useState<Tint>(community.color);
  const [busy, setBusy] = React.useState(false);

  const valid = name.trim().length > 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await updateCommunity(community.id, {
        name: name.trim(),
        description: description.trim() || null,
        color,
      });
      onDone();
      onClose();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not save", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit community" width={440}>
      <div className="space-y-4 p-4">
        <Field label="Name" required>
          {(props) => (
            <Input
              {...props}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && valid) submit(); }}
            />
          )}
        </Field>
        <Field label="What it's for" description="Optional">
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <Field label="Colour">
          {() => <TintPicker value={color} onChange={(t) => t && setColor(t)} />}
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
