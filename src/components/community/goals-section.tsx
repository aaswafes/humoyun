"use client";

import * as React from "react";
import { Plus, Target, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { todayISO, friendlyDate } from "@/lib/date";
import { TINTS, type Tint } from "@/lib/types";
import { Button, EmptyState, IconButton, Input, Progress, Skeleton } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { ConfirmDialog, Modal, TintPicker } from "@/components/ui/overlays";
import type { CommunityGoal, Contribution, FeedMember } from "./community-types";
import { addContribution, addGoal, deleteGoal, useUserId } from "./community-data";

/** Sum of everyone's contributions. One number, stated once. */
function poolOf(contributions: Contribution[], goalId: string) {
  return contributions
    .filter((c) => c.goal_id === goalId)
    .reduce((sum, c) => sum + Number(c.amount), 0);
}

export function GoalsSection({
  communityId, goals, contributions, members, loading, onChanged,
}: {
  communityId: string;
  goals: CommunityGoal[];
  contributions: Contribution[];
  members: FeedMember[];
  loading: boolean;
  onChanged: () => void;
}) {
  const userId = useUserId();
  const toast = useStore((s) => s.toast);
  const [adding, setAdding] = React.useState(false);
  const [logging, setLogging] = React.useState<CommunityGoal | null>(null);
  const [removing, setRemoving] = React.useState<CommunityGoal | null>(null);

  const nameOf = React.useCallback(
    (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "Someone",
    [members],
  );

  const active = goals.filter((g) => g.status !== "dropped");

  if (loading) {
    return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-3">
          One target, everyone&rsquo;s progress added together.
        </p>
        <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" />
          New goal
        </Button>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No joint goals yet"
          description="Set something the whole community is working towards — pages read this month, days prayed on time, projects finished."
          action={<Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-3.5" />New goal</Button>}
        />
      ) : (
        <div className="space-y-7">
          {active.map((goal) => {
            const pool = poolOf(contributions, goal.id);
            const mine = contributions.filter((c) => c.goal_id === goal.id);
            const byMember = new Map<string, number>();
            for (const c of mine) byMember.set(c.user_id, (byMember.get(c.user_id) ?? 0) + Number(c.amount));
            const ranked = [...byMember.entries()].sort((a, b) => b[1] - a[1]);
            const reached = pool >= Number(goal.target);

            return (
              <div key={goal.id} className={cn(`tint-${goal.color}`)}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-ink">{goal.title}</p>
                    {goal.due_date && (
                      <p className="mt-0.5 text-[11.5px] text-ink-4">by {friendlyDate(goal.due_date)}</p>
                    )}
                  </div>
                  <p className="display-serif shrink-0 text-[22px] leading-none text-ink tnum">
                    {pool}
                    <span className="text-[13px] text-ink-4"> / {Number(goal.target)}</span>
                  </p>
                  {goal.created_by === userId && (
                    <IconButton label="Delete goal" size="sm" onClick={() => setRemoving(goal)}>
                      <Trash2 />
                    </IconButton>
                  )}
                </div>

                <Progress value={pool} max={Number(goal.target)} tint={goal.color} className="mt-2.5" />

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {ranked.length === 0 ? (
                    <p className="text-[12px] text-ink-4">Nobody has logged anything yet</p>
                  ) : (
                    ranked.map(([id, amount]) => (
                      <p key={id} className="text-[12px] text-ink-3">
                        {nameOf(id)} <span className="text-ink-4 tnum">{amount}{goal.unit ? ` ${goal.unit}` : ""}</span>
                      </p>
                    ))
                  )}
                  <div className="flex-1" />
                  <Button size="sm" onClick={() => setLogging(goal)}>
                    <Plus className="size-3.5" />
                    Log progress
                  </Button>
                </div>

                {reached && (
                  <p className="mt-2 text-[12px] text-success">Target reached.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <NewGoalDialog
          communityId={communityId}
          onClose={() => setAdding(false)}
          onDone={onChanged}
        />
      )}

      {logging && (
        <LogDialog
          goal={logging}
          onClose={() => setLogging(null)}
          onDone={onChanged}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Delete this goal?"
        description="Everyone's logged progress on it goes too. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const goal = removing;
          if (!goal) return;
          try { await deleteGoal(goal.id); onChanged(); }
          catch (e) { toast({ title: e instanceof Error ? e.message : "Could not delete", tone: "danger" }); }
        }}
      />
    </div>
  );
}

/** Mounted only while open, so its fields start fresh without a reset effect. */
function NewGoalDialog({
  communityId, onClose, onDone,
}: {
  communityId: string; onClose: () => void; onDone: () => void;
}) {
  const userId = useUserId();
  const toast = useStore((s) => s.toast);
  const [title, setTitle] = React.useState("");
  const [target, setTarget] = React.useState("30");
  const [unit, setUnit] = React.useState("");
  const [due, setDue] = React.useState("");
  const [color, setColor] = React.useState<Tint>(() => TINTS[Math.floor(Math.random() * TINTS.length)]);
  const [busy, setBusy] = React.useState(false);

  const targetNum = Number(target);
  const valid = title.trim().length > 0 && Number.isFinite(targetNum) && targetNum > 0;

  async function submit() {
    if (!valid || !userId || busy) return;
    setBusy(true);
    try {
      await addGoal(communityId, userId, {
        title: title.trim(),
        unit: unit.trim() || null,
        target: targetNum,
        due_date: due || null,
        color,
      });
      onDone();
      onClose();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not add the goal", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New joint goal" width={440}>
      <div className="space-y-4 p-4">
        <Field label="Goal" required>
          {(props) => (
            <Input
              {...props}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && valid) submit(); }}
              placeholder="Read 30 books this month"
            />
          )}
        </Field>

        <div className="flex gap-3">
          <Field label="Target" className="flex-1" required>
            {(props) => (
              <Input {...props} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
            )}
          </Field>
          <Field label="Unit" description="Optional" className="flex-1">
            {(props) => (
              <Input {...props} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="books" />
            )}
          </Field>
        </div>

        <Field label="Deadline" description="Optional">
          {(props) => <Input {...props} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
        </Field>

        <Field label="Colour">
          {() => <TintPicker value={color} onChange={(t) => t && setColor(t)} />}
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            {busy ? "Adding…" : "Add goal"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function LogDialog({
  goal, onClose, onDone,
}: {
  goal: CommunityGoal; onClose: () => void; onDone: () => void;
}) {
  const userId = useUserId();
  const toast = useStore((s) => s.toast);
  const [amount, setAmount] = React.useState("1");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const value = Number(amount);
  const valid = Number.isFinite(value) && value !== 0;

  async function submit() {
    if (!valid || !userId || busy) return;
    setBusy(true);
    try {
      await addContribution(goal.id, userId, value, note.trim() || null, todayISO());
      onDone();
      onClose();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not log that", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Log progress — ${goal.title}`} width={400}>
      <div className="space-y-4 p-4">
        <Field label={goal.unit ? `How many ${goal.unit}?` : "How much?"} required>
          {(props) => (
            <Input
              {...props}
              autoFocus
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && valid) submit(); }}
            />
          )}
        </Field>
        <Field label="Note" description="Optional">
          {(props) => (
            <Input {...props} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Finished Ihya vol. 1" />
          )}
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            {busy ? "Saving…" : "Log it"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
