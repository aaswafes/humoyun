"use client";

import * as React from "react";
import { CircleCheck, Ellipsis, PencilLine, Plus, Target, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, todayISO } from "@/lib/date";
import {
  TIMEFRAMES, TIMEFRAME_BLURB, TIMEFRAME_LABELS, timeframeOf, timeframeRange,
  type Timeframe,
} from "@/lib/timeframe";
import { TINTS, type Tint } from "@/lib/types";
import { Button, EmptyState, Input, Progress, Segmented, Skeleton } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { ConfirmDialog, MenuItem, MenuSeparator, Modal, Popover, TintPicker } from "@/components/ui/overlays";
import type { CommunityGoal, Contribution, FeedMember } from "./community-types";
import { addContribution, addGoal, deleteGoal, updateGoal, useUserId } from "./community-data";
import { GoalsTimeline } from "./goals-timeline";

/** Sum of everyone's contributions. One number, stated once. */
function poolOf(contributions: Contribution[], goalId: string) {
  return contributions
    .filter((c) => c.goal_id === goalId)
    .reduce((sum, c) => sum + Number(c.amount), 0);
}

function pct(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
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
  const toast = useStore((s) => s.toast);
  const [view, setView] = React.useState<"board" | "timeline">("board");
  const [adding, setAdding] = React.useState<Timeframe | "any" | null>(null);
  const [editing, setEditing] = React.useState<CommunityGoal | null>(null);
  const [logging, setLogging] = React.useState<CommunityGoal | null>(null);
  const [removing, setRemoving] = React.useState<CommunityGoal | null>(null);

  const nameOf = React.useCallback(
    (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "Someone",
    [members],
  );

  const active = React.useMemo(() => goals.filter((g) => g.status !== "dropped"), [goals]);

  // The same shelves as the Goals page, from the same `timeframeOf`: a joint
  // goal due in March files itself exactly where a personal one due in March
  // does, so the two surfaces can never disagree about what "this quarter" is.
  const columns = React.useMemo(() => {
    const map = new Map<Timeframe, CommunityGoal[]>(TIMEFRAMES.map((f) => [f, []]));
    for (const goal of active) map.get(timeframeOf(goal.due_date))?.push(goal);
    for (const list of map.values()) {
      list.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    }
    return map;
  }, [active]);

  if (loading) {
    return (
      <div className="flex gap-5">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-[250px] rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-[12.5px] text-ink-3">
          One target, everyone&rsquo;s progress added together.
        </p>
        <Segmented
          value={view}
          onChange={setView}
          size="sm"
          options={[
            { value: "board" as const, label: "Board", title: "Filed by when it is due" },
            { value: "timeline" as const, label: "Timeline", title: "Every dated goal as a bar" },
          ]}
        />
        <Button size="sm" variant="primary" onClick={() => setAdding("any")}>
          <Plus className="size-3.5" />
          New goal
        </Button>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No joint goals yet"
          description="Set something the whole community is working towards — books read this month, days prayed on time, applications sent."
          action={<Button variant="primary" onClick={() => setAdding("any")}><Plus className="size-3.5" />New goal</Button>}
        />
      ) : view === "timeline" ? (
        <GoalsTimeline
          goals={active}
          contributions={contributions}
          onEdit={setEditing}
          onLog={setLogging}
        />
      ) : (
        <div className="flex gap-5 overflow-x-auto pb-4">
          {TIMEFRAMES.map((frame) => (
            <Column
              key={frame}
              frame={frame}
              goals={columns.get(frame) ?? []}
              contributions={contributions}
              nameOf={nameOf}
              onLog={setLogging}
              onEdit={setEditing}
              onDelete={setRemoving}
              onCreate={() => setAdding(frame)}
            />
          ))}
        </div>
      )}

      {adding && (
        <GoalDialog
          communityId={communityId}
          frame={adding === "any" ? null : adding}
          onClose={() => setAdding(null)}
          onDone={onChanged}
        />
      )}

      {editing && (
        <GoalDialog
          communityId={communityId}
          goal={editing}
          frame={null}
          onClose={() => setEditing(null)}
          onDone={onChanged}
        />
      )}

      {logging && (
        <LogDialog goal={logging} onClose={() => setLogging(null)} onDone={onChanged} />
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

function Column({
  frame, goals, contributions, nameOf, onLog, onEdit, onDelete, onCreate,
}: {
  frame: Timeframe;
  goals: CommunityGoal[];
  contributions: Contribution[];
  nameOf: (id: string) => string;
  onLog: (g: CommunityGoal) => void;
  onEdit: (g: CommunityGoal) => void;
  onDelete: (g: CommunityGoal) => void;
  onCreate: () => void;
}) {
  const range = timeframeRange(frame);

  return (
    <section className="group/col relative w-[250px] shrink-0">
      <div className="mb-3 flex items-baseline gap-1.5 px-0.5">
        <h2 className="text-[12.5px] font-medium text-ink-2">{TIMEFRAME_LABELS[frame]}</h2>
        {range && <span className="text-[11px] text-ink-4">{range}</span>}
        <span className="text-[11px] text-ink-4 tnum">{goals.length}</span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label={`New joint goal due ${TIMEFRAME_LABELS[frame].toLowerCase()}`}
          onClick={onCreate}
          className={cn(
            "-m-1 grid size-6 place-items-center rounded-md p-1 text-ink-3 cursor-pointer",
            "opacity-0 transition-opacity duration-150 hover:bg-hover hover:text-ink",
            "focus-visible:opacity-100 group-hover/col:opacity-100",
          )}
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="min-h-[72px] space-y-2">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            contributions={contributions}
            nameOf={nameOf}
            onLog={onLog}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}

        {goals.length === 0 && (
          <p className="px-1.5 py-2 text-[12px] leading-relaxed text-ink-4">
            {TIMEFRAME_BLURB[frame]}
          </p>
        )}
      </div>
    </section>
  );
}

function GoalCard({
  goal, contributions, nameOf, onLog, onEdit, onDelete,
}: {
  goal: CommunityGoal;
  contributions: Contribution[];
  nameOf: (id: string) => string;
  onLog: (g: CommunityGoal) => void;
  onEdit: (g: CommunityGoal) => void;
  onDelete: (g: CommunityGoal) => void;
}) {
  const userId = useUserId();
  const pool = poolOf(contributions, goal.id);
  const target = Number(goal.target) || 1;
  const reached = pool >= target;
  const isAuthor = goal.created_by === userId;

  const ranked = React.useMemo(() => {
    const byMember = new Map<string, number>();
    for (const c of contributions) {
      if (c.goal_id !== goal.id) continue;
      byMember.set(c.user_id, (byMember.get(c.user_id) ?? 0) + Number(c.amount));
    }
    return [...byMember.entries()].sort((a, b) => b[1] - a[1]);
  }, [contributions, goal.id]);

  return (
    <div
      className={cn(
        `tint-${goal.color}`,
        "group/goal relative rounded-lg border border-line bg-raised p-3",
        "transition-[background-color,border-color] duration-200 ease-[var(--ease-out-apple)]",
        "hover:bg-hover hover:border-line-strong focus-within:border-line-strong",
      )}
    >
      <div className="flex items-start gap-2">
        {reached ? (
          <CircleCheck className="mt-[3px] size-3.5 shrink-0 text-success" aria-hidden />
        ) : (
          <span
            className="mt-[5px] size-2.5 shrink-0 rounded-full"
            style={{ background: "var(--tint)" }}
            aria-hidden
          />
        )}

        <p className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-ink">
          {goal.title || "Untitled goal"}
        </p>

        <Popover
          align="end"
          className="w-[196px]"
          trigger={
            <button
              type="button"
              aria-label={`Actions for ${goal.title || "goal"}`}
              className={cn(
                "-m-1 grid size-6 shrink-0 place-items-center rounded-md p-1 text-ink-3 cursor-pointer",
                "opacity-0 transition-opacity duration-150 hover:bg-hover hover:text-ink",
                "focus-visible:opacity-100 group-hover/goal:opacity-100",
              )}
            >
              <Ellipsis className="size-3.5" />
            </button>
          }
        >
          {(close) => (
            <>
              <MenuItem icon={Plus} onClick={() => { close(); onLog(goal); }}>
                Log progress
              </MenuItem>
              <MenuItem icon={PencilLine} onClick={() => { close(); onEdit(goal); }}>
                Edit goal
              </MenuItem>
              {isAuthor && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} danger onClick={() => { close(); onDelete(goal); }}>
                    Delete
                  </MenuItem>
                </>
              )}
            </>
          )}
        </Popover>
      </div>

      <div className="mt-2.5 flex items-center gap-2 pl-[18px]">
        <Progress value={pool} max={target} tint={goal.color} height={3} className="min-w-0 flex-1" />
        <span className="shrink-0 text-[11px] text-ink-3 tnum">{pct(pool / target)}</span>
      </div>

      <p className="mt-1.5 pl-[18px] text-[11px] text-ink-4 tnum">
        {pool} of {target}{goal.unit ? ` ${goal.unit}` : ""}
        {goal.due_date ? ` · by ${formatDate(goal.due_date, { weekday: false })}` : ""}
      </p>

      {/* Who actually moved it — the one thing a joint goal has that a personal
          one does not, so it earns its line. */}
      {ranked.length > 0 && (
        <p className="mt-1 truncate pl-[18px] text-[11px] text-ink-3">
          {ranked.slice(0, 3).map(([id, amount]) => `${nameOf(id)} ${amount}`).join(" · ")}
          {ranked.length > 3 ? ` +${ranked.length - 3}` : ""}
        </p>
      )}

      <button
        type="button"
        onClick={() => onLog(goal)}
        className={cn(
          "mt-2 ml-[18px] h-7 rounded-md px-2 text-[12px] font-medium text-ink-2 cursor-pointer",
          "transition-colors duration-150 hover:bg-hover hover:text-ink active:scale-[0.975]",
        )}
      >
        + Log progress
      </button>
    </div>
  );
}

/**
 * One dialog for new and existing goals. Mounted only while open, so its fields
 * start from the row it was handed without a reset effect.
 */
function GoalDialog({
  communityId, goal, frame, onClose, onDone,
}: {
  communityId: string;
  goal?: CommunityGoal;
  frame: Timeframe | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const userId = useUserId();
  const toast = useStore((s) => s.toast);
  const [title, setTitle] = React.useState(goal?.title ?? "");
  const [target, setTarget] = React.useState(goal ? String(Number(goal.target)) : "30");
  const [unit, setUnit] = React.useState(goal?.unit ?? "");
  const [due, setDue] = React.useState(goal?.due_date ?? (frame ? defaultDueFor(frame) : ""));
  const [color, setColor] = React.useState<Tint>(
    () => goal?.color ?? TINTS[Math.floor(Math.random() * TINTS.length)],
  );
  const [busy, setBusy] = React.useState(false);

  const targetNum = Number(target);
  const valid = title.trim().length > 0 && Number.isFinite(targetNum) && targetNum > 0;

  async function submit() {
    if (!valid || !userId || busy) return;
    setBusy(true);
    try {
      const fields = {
        title: title.trim(),
        unit: unit.trim() || null,
        target: targetNum,
        due_date: due || null,
        color,
      };
      if (goal) await updateGoal(goal.id, fields);
      else await addGoal(communityId, userId, fields);
      onDone();
      onClose();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not save the goal", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={goal ? "Edit joint goal" : "New joint goal"} width={440}>
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

        <Field label="Deadline" description="This is what files it under a shelf. No date means Someday.">
          {(props) => <Input {...props} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
        </Field>

        <Field label="Colour">
          {() => <TintPicker value={color} onChange={(t) => t && setColor(t)} />}
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            {busy ? "Saving…" : goal ? "Save" : "Add goal"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** A date that lands in the column whose "+" was pressed. */
function defaultDueFor(frame: Timeframe): string {
  const now = new Date();
  const y = now.getFullYear();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  switch (frame) {
    case "month": return iso(new Date(y, now.getMonth() + 1, 0));
    case "quarter": return iso(new Date(y, Math.floor(now.getMonth() / 3) * 3 + 3, 0));
    case "year": return `${y}-12-31`;
    case "nextYear": return `${y + 1}-12-31`;
    case "near": return `${y + 3}-12-31`;
    case "far": return `${y + 6}-12-31`;
    case "someday": return "";
  }
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
