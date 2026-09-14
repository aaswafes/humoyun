"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LogIn, Plus, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { SOLO } from "@/lib/local-db";
import { TINTS, type Tint } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button, EmptyState, Input, Skeleton, Textarea } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { Modal, TintPicker } from "@/components/ui/overlays";
import { createCommunity, fetchMyCommunities, joinByCode, useLoad, useUserId } from "@/components/community/community-data";

export default function CommunityPage() {
  const [creating, setCreating] = React.useState(false);
  const [joining, setJoining] = React.useState(false);

  const load = React.useCallback(() => fetchMyCommunities(), []);
  const { data, error, loading, reload } = useLoad(load);

  const communities = data?.communities ?? [];
  const memberships = data?.memberships ?? [];

  return (
    <>
      <PageHeader
        title="Community"
        subtitle={communities.length > 0 ? `${communities.length} ${communities.length === 1 ? "community" : "communities"}` : undefined}
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setJoining(true)}>
              <LogIn className="size-3.5" />
              Join
            </Button>
            <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" />
              New
            </Button>
          </div>
        }
      />

      <PageBody>
        {SOLO ? (
          <EmptyState
            icon={Users}
            title="Community needs an account"
            description="This is a local preview with no account and no network, so there is nobody to share a day with. Sign in to use communities."
          />
        ) : loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : error ? (
          <EmptyState
            icon={Users}
            title="Could not load your communities"
            description={error}
            action={<Button onClick={reload}>Try again</Button>}
          />
        ) : communities.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No communities yet"
            description="A community is a small group who can see each other's day: today's plan, salah, joint goals, and what's worth reading. You choose what you share, and you share nothing by default."
            action={
              <div className="flex gap-2">
                <Button onClick={() => setJoining(true)}>
                  <LogIn className="size-3.5" />
                  Join with a code
                </Button>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus className="size-3.5" />
                  Create one
                </Button>
              </div>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {communities.map((c) => {
              const mine = memberships.find((m) => m.community_id === c.id);
              const shared = [
                mine?.share_plan && "plan",
                mine?.share_salah && "salah",
                mine?.share_shelf && "shelves",
              ].filter(Boolean) as string[];

              return (
                <li key={c.id}>
                  <Link
                    href={`/community/${c.id}`}
                    className="group flex items-center gap-3 py-3.5 cursor-pointer"
                  >
                    <div
                      className={cn(`tint-${c.color}`, "grid size-9 shrink-0 place-items-center rounded-[10px]")}
                      style={{ background: "var(--tint-soft)", color: "var(--tint-ink)" }}
                      aria-hidden
                    >
                      <Users className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-ink">{c.name}</p>
                      <p className="truncate text-[12px] text-ink-3">
                        {c.description || (shared.length > 0 ? `You share ${shared.join(", ")}` : "You share nothing here yet")}
                      </p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>

      {creating && <CreateDialog onClose={() => setCreating(false)} onDone={reload} />}
      {joining && <JoinDialog onClose={() => setJoining(false)} />}
    </>
  );
}

/**
 * Mounted only while open, so every field starts empty without an effect that
 * reaches back in to clear it.
 */
function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const userId = useUserId();
  const toast = useStore((s) => s.toast);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState<Tint>(() => TINTS[Math.floor(Math.random() * TINTS.length)]);
  const [busy, setBusy] = React.useState(false);

  const valid = name.trim().length > 0;

  async function submit() {
    if (!valid || !userId || busy) return;
    setBusy(true);
    try {
      const made = await createCommunity({
        name: name.trim(),
        description: description.trim() || null,
        color,
      });
      onDone();
      onClose();
      router.push(`/community/${made.id}`);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not create it", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New community" width={440}>
      <div className="space-y-4 p-4">
        <Field label="Name" required>
          {(props) => (
            <Input
              {...props}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && valid) submit(); }}
              placeholder="A-Level study group"
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
              placeholder="Keeping each other honest until June."
            />
          )}
        </Field>
        <Field label="Colour">
          {() => <TintPicker value={color} onChange={(t) => t && setColor(t)} />}
        </Field>
        <p className="text-[12px] leading-relaxed text-ink-4">
          You get an invite code once it exists. Nothing of yours is shared until you turn a switch on.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function JoinDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const valid = code.trim().length >= 4;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await joinByCode(code);
      onClose();
      router.push(`/community/${id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "That code did not work";
      setError(message.includes("no community") ? "No community has that code." : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Join a community" width={400}>
      <div className="space-y-4 p-4">
        <Field label="Invite code" error={error} required>
          {(props) => (
            <Input
              {...props}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter" && valid) submit(); }}
              placeholder="ABC123"
              className="tracking-[0.14em] tnum"
            />
          )}
        </Field>
        <p className="text-[12px] leading-relaxed text-ink-4">
          Joining shares nothing. You pick what to share once you are in.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            {busy ? "Joining…" : "Join"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
