"use client";

import * as React from "react";
import { BellDot, CalendarPlus, CircleCheck, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { endOfWeek, formatDate, startOfWeek, todayISO } from "@/lib/date";
import type { Goal } from "@/lib/types";
import { Badge, Button, EmptyState, Input } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/overlays";
import {
  ATTENTION_BLURB, ATTENTION_ORDER, ATTENTION_TITLE, attentionScore, fmtNum,
  formatGoalRange, goalAttention, HORIZON_LABEL, pct, periodRange,
  type AttentionFlag, type AttentionKind, type GoalIndex,
} from "./goal-model";
import { ATTENTION_ICON, AttentionLine, GoalDot } from "./goal-card";
import { Fold, useFold } from "./goal-fold";
import { useGoalMeta } from "./use-goal-actions";

/** Long lists get a lid — the point of this view is the top of it. */
const ROW_CAP = 40;

interface Entry {
  goal: Goal;
  flags: AttentionFlag[];
  score: number;
  kinds: Set<AttentionKind>;
}

/**
 * The weekly "what wants something from me" pass. One row per goal — a goal
 * with three problems is one conversation, not three — with the fix that
 * actually resolves it sitting on the row. Filtering is a tool you reach for,
 * so it rests folded behind the filter it is currently applying.
 */
export function GoalReview({
  goals, index, onOpen,
}: {
  goals: Goal[];
  index: GoalIndex;
  onOpen: (id: string) => void;
}) {
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const today = todayISO();
  const [filter, setFilter] = React.useState<AttentionKind | "all">("all");
  const [expanded, setExpanded] = React.useState(false);
  const filters = useFold("review.filters", false);

  const entries = React.useMemo<Entry[]>(() => {
    return goals
      .filter((g) => g.status === "active")
      .map((goal) => {
        const flags = goalAttention(goal, index.stats(goal.id), today);
        return { goal, flags, score: attentionScore(flags), kinds: new Set(flags.map((f) => f.kind)) };
      })
      .filter((entry) => entry.flags.length > 0)
      .sort((a, b) => b.score - a.score || a.goal.title.localeCompare(b.goal.title));
  }, [goals, index, today]);

  const counts = React.useMemo(() => {
    const out = new Map<AttentionKind, number>();
    for (const entry of entries) {
      for (const kind of entry.kinds) out.set(kind, (out.get(kind) ?? 0) + 1);
    }
    return out;
  }, [entries]);

  const activeCount = goals.filter((g) => g.status === "active").length;
  const matching = filter === "all" ? entries : entries.filter((e) => e.kinds.has(filter));
  const shown = expanded ? matching : matching.slice(0, ROW_CAP);

  function rollForward(goal: Goal) {
    const range = periodRange(goal.horizon, today, weekStart);
    const previous = { end_date: goal.end_date, start_date: goal.start_date };
    patch("goals", goal.id, { end_date: range.end });
    toast({
      title: `Extended to ${formatDate(range.end, { weekday: false })}`,
      description: goal.title || undefined,
      action: { label: "Undo", run: () => patch("goals", goal.id, previous) },
    });
  }

  /** The commonest fix for an undated goal: give it the period it belongs to. */
  function addDates(goal: Goal) {
    const range = periodRange(goal.horizon, today, weekStart);
    const previous = { start_date: goal.start_date, end_date: goal.end_date };
    patch("goals", goal.id, { start_date: range.start, end_date: range.end });
    toast({
      title: `Dated ${formatDate(range.start, { weekday: false })} – ${formatDate(range.end, { weekday: false })}`,
      description: goal.title || undefined,
      action: { label: "Undo", run: () => patch("goals", goal.id, previous) },
    });
  }

  function complete(goal: Goal) {
    patch("goals", goal.id, { status: "done" });
    toast({
      title: "Goal completed",
      description: goal.title || undefined,
      tone: "success",
      action: { label: "Undo", run: () => patch("goals", goal.id, { status: "active" }) },
    });
  }

  if (!activeCount) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No active goals to review"
        description="Reopen something, or start a new goal on the ladder. This page only ever talks about goals that are still running."
      />
    );
  }

  if (!entries.length) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Nothing needs you"
        description={`All ${activeCount} active ${activeCount === 1 ? "goal is" : "goals are"} dated, defined, linked to something, and moving. Come back after the week turns.`}
      />
    );
  }

  const filterSummary = filter === "all"
    ? `Everything · ${entries.length}`
    : `${ATTENTION_TITLE[filter]} · ${counts.get(filter) ?? 0}`;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="display-serif text-[32px] leading-none text-ink tnum">{entries.length}</span>
          <span className="text-[13px] text-ink-2">
            of {activeCount} active {activeCount === 1 ? "goal wants" : "goals want"} something from you
          </span>
        </div>
        <p className="mt-1.5 text-[12px] text-ink-4 tnum">
          Week of {formatDate(startOfWeek(today, weekStart), { weekday: false })} –{" "}
          {formatDate(endOfWeek(today, weekStart), { weekday: false })} · worst first
        </p>
      </div>

      <Fold
        id="goal-review-filters"
        label="Filter"
        summary={filterSummary}
        open={filters.open}
        onToggle={filters.toggle}
      >
        <div className="flex flex-wrap gap-1.5 pt-1">
          <FilterChip
            active={filter === "all"}
            label="Everything"
            count={entries.length}
            onClick={() => setFilter("all")}
          />
          {ATTENTION_ORDER.filter((kind) => counts.get(kind)).map((kind) => (
            <FilterChip
              key={kind}
              active={filter === kind}
              label={ATTENTION_TITLE[kind]}
              count={counts.get(kind) as number}
              icon={ATTENTION_ICON[kind]}
              onClick={() => setFilter(kind)}
            />
          ))}
        </div>
        {filter !== "all" && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">{ATTENTION_BLURB[filter]}</p>
        )}
      </Fold>

      <div className="-mx-2">
        {shown.map((entry) => {
          const stats = index.stats(entry.goal.id);
          return (
            <div
              key={entry.goal.id}
              className="group/row relative flex items-start gap-2.5 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-hover"
            >
              <span className="mt-[3px]"><GoalDot goal={entry.goal} /></span>

              <div className="min-w-0 flex-1">
                <button
                  onClick={() => onOpen(entry.goal.id)}
                  className={cn(
                    "block max-w-full cursor-pointer truncate text-left text-[13.5px] font-medium text-ink",
                    "after:absolute after:inset-0 after:rounded-lg after:content-['']",
                  )}
                >
                  {entry.goal.title || "Untitled goal"}
                </button>

                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Badge tint={entry.goal.color}>{HORIZON_LABEL[entry.goal.horizon]}</Badge>
                  <span className="text-[11.5px] text-ink-3 tnum">{formatGoalRange(entry.goal)}</span>
                  <span className="text-[11.5px] text-ink-3 tnum">{pct(stats.overall)}</span>
                </div>

                {/* Outlined pills for every flag turned a list of goals into a
                    warning panel. The words carry the state; the ink is grey
                    unless something has genuinely failed. */}
                <AttentionLine flags={entry.flags} className="mt-1.5" />
              </div>

              <div className="relative z-[1] flex shrink-0 items-center gap-1 pt-0.5">
                {entry.kinds.has("overdue") && (
                  <>
                    <Button size="xs" onClick={() => rollForward(entry.goal)}>
                      <CalendarPlus className="size-3.5" />
                      Extend
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => complete(entry.goal)}>
                      <CircleCheck className="size-3.5" />
                      Done
                    </Button>
                  </>
                )}
                {!entry.kinds.has("overdue") && entry.kinds.has("checkin") && (
                  <QuickCheckIn goal={entry.goal} />
                )}
                {!entry.kinds.has("overdue") && !entry.kinds.has("checkin") && entry.kinds.has("undated") && (
                  <Button size="xs" onClick={() => addDates(entry.goal)}>
                    <CalendarPlus className="size-3.5" />
                    Add dates
                  </Button>
                )}
                {!entry.kinds.has("overdue") && !entry.kinds.has("checkin") && !entry.kinds.has("undated") && (
                  <Button size="xs" variant="ghost" onClick={() => onOpen(entry.goal.id)}>
                    {entry.kinds.has("undefined") ? "Define" : "Open"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {matching.length > ROW_CAP && (
        <div className="flex justify-center">
          <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show fewer" : `Show ${matching.length - ROW_CAP} more`}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The check-in prompt answered where it is asked. Opening the goal to type one
 * number is exactly the friction that makes people stop checking in.
 */
function QuickCheckIn({ goal }: { goal: Goal }) {
  const { logCheckIn } = useGoalMeta();
  const [draft, setDraft] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");

  const value = draft ?? String(goal.current);
  const parsed = Number(value.trim().replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(parsed);

  return (
    <Popover
      align="end"
      className="w-[248px] p-2"
      trigger={
        <Button size="xs">
          <BellDot className="size-3.5" />
          Check in
        </Button>
      }
    >
      {(close) => (
        <div>
          <p className="px-0.5 pb-1.5 text-[11.5px] text-ink-3">
            Where does {goal.title || "this goal"} actually stand today?
          </p>
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={value}
              inputMode="decimal"
              aria-label="Current value"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid) { logCheckIn(goal, Math.max(0, parsed), note); close(); }
              }}
              className="w-[76px] text-center tnum"
            />
            {goal.target != null && (
              <span className="text-[12px] text-ink-3 tnum">
                of {fmtNum(goal.target)}{goal.unit ? ` ${goal.unit}` : ""}
              </span>
            )}
          </div>
          <Input
            value={note}
            placeholder="Note (optional)"
            aria-label="Check-in note"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) { logCheckIn(goal, Math.max(0, parsed), note); close(); }
            }}
            className="mt-1.5"
          />
          <Button
            variant="primary"
            size="sm"
            className="mt-1.5 w-full"
            disabled={!valid}
            onClick={() => { logCheckIn(goal, Math.max(0, parsed), note); close(); }}
          >
            Log check-in
          </Button>
        </div>
      )}
    </Popover>
  );
}

function FilterChip({
  active, label, count, icon: Icon, onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]",
        "transition-[background-color,border-color,color] duration-150",
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-line bg-raised text-ink-2 hover:border-line-strong hover:bg-hover",
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {label}
      <span className={cn("tnum", active ? "text-accent" : "text-ink-4")}>{count}</span>
    </button>
  );
}
