"use client";

import * as React from "react";
import {
  Ban, ChevronRight, CircleCheck, Layers, Minus, Pause, Play, Plus,
  Split, Trash2, Undo2, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { daysBetween, diffDays, formatDate, todayISO } from "@/lib/date";
import type { Goal, Horizon, Tint } from "@/lib/types";
import {
  AutoTextarea, Button, IconButton, Input, Progress, Segmented,
} from "@/components/ui/primitives";
import { Select } from "@/components/ui/form";
import {
  ConfirmDialog, MenuItem, MenuLabel, MenuSeparator, Popover, Sheet, TintPicker, SheetMaximize,
} from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { TaskList } from "@/components/tasks/task-list";
import { AttentionLine, GoalDot } from "./goal-card";
import { GoalCheckIns } from "./goal-checkins";
import { Fold, SubLabel, useFold } from "./goal-fold";
import { GoalLinks } from "./goal-links";
import { GoalMilestones } from "./goal-milestones";
import { GoalProgress, GoalProgressReadout } from "./goal-progress";
import {
  breakdownPlan, childHorizon, formatGoalRange, formatTarget, goalAttention,
  HORIZON_LABEL, HORIZON_PLURAL, HORIZONS, horizonIndex, parentHorizon, pct,
  periodRange, STATUS_LABEL, type GoalIndex,
} from "./goal-model";
import { PROGRESS_MODE_LABEL, readWhy } from "./goal-meta";
import { useGoalActions, useGoalMeta } from "./use-goal-actions";

const STATUS_TONE: Record<Goal["status"], string> = {
  active: "text-ink-2",
  done: "text-success",
  paused: "text-ink-2",
  dropped: "text-ink-4",
};

const HORIZON_OPTIONS = HORIZONS.map((h) => ({ value: h, label: HORIZON_LABEL[h] }));

/** Only mark days when the range is short enough for dots to mean anything. */
function rangeMarkers(goal: Goal): Set<string> | undefined {
  if (!goal.start_date || !goal.end_date || goal.end_date < goal.start_date) return undefined;
  if (diffDays(goal.end_date, goal.start_date) > 400) return undefined;
  return new Set(daysBetween(goal.start_date, goal.end_date));
}

export function GoalSheet({
  goalId, index, onClose, onOpen,
}: {
  goalId: string | null;
  index: GoalIndex;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const goal = useStore((s) => (goalId ? s.goals.find((g) => g.id === goalId) ?? null : null));

  return (
    <Sheet open={!!goal} onClose={onClose} width={496} resizeKey="goal">
      {goal && (
        <GoalSheetBody key={goal.id} goal={goal} index={index} onClose={onClose} onOpen={onOpen} />
      )}
    </Sheet>
  );
}

/**
 * Everything about one goal, in three groups: what it is, how it is measured,
 * and what hangs off it. Only the first is open on arrival — the other two say
 * their totals on the fold line, so nothing has to be opened to be known.
 */
function GoalSheetBody({
  goal, index, onClose, onOpen,
}: {
  goal: Goal;
  index: GoalIndex;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const goals = useStore((s) => s.goals);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const { createGoal, breakDown } = useGoalActions();
  const { setMeta, setWhy } = useGoalMeta();

  const stats = index.stats(goal.id);
  const children = stats.children;
  const parent = goal.parent_id ? index.byId.get(goal.parent_id) ?? null : null;
  const nextHorizon = childHorizon(goal.horizon);
  const plan = React.useMemo(
    () => breakdownPlan(goal, goals.filter((g) => g.parent_id === goal.id), weekStart),
    [goal, goals, weekStart],
  );
  const flags = goalAttention(goal, stats);

  const dates = useFold("sheet.dates", false);
  const progress = useFold("sheet.progress", false);
  const structure = useFold("sheet.structure", false);

  const storedWhy = readWhy(goal);
  const [title, setTitle] = React.useState(goal.title);
  const [why, setWhyDraft] = React.useState(storedWhy);
  const [done, setDone] = React.useState(stats.meta.done_looks_like);
  const [current, setCurrent] = React.useState(String(goal.current));
  const [target, setTarget] = React.useState(goal.target == null ? "" : String(goal.target));
  const [unit, setUnit] = React.useState(goal.unit ?? "");
  const [dateMode, setDateMode] = React.useState<"start" | "end">("start");
  const [confirming, setConfirming] = React.useState(false);

  const markers = React.useMemo(() => rangeMarkers(goal), [goal]);

  const linkCount = stats.meta.book_ids.length + stats.meta.habit_ids.length;

  const progressSummary = [
    PROGRESS_MODE_LABEL[stats.mode],
    formatTarget(goal) ?? "no target",
    `${stats.meta.checkins.length} ${stats.meta.checkins.length === 1 ? "check-in" : "check-ins"}`,
  ].join(" · ");

  const structureSummary = [
    nextHorizon ? `${children.length} ${children.length === 1 ? "child goal" : "child goals"}` : null,
    `${stats.directDone}/${stats.directTotal} tasks`,
    stats.milestoneTotal ? `${stats.milestoneDone}/${stats.milestoneTotal} milestones` : null,
    linkCount ? `${linkCount} ${linkCount === 1 ? "link" : "links"}` : null,
  ].filter(Boolean).join(" · ");

  function commitNumber(raw: string, field: "current" | "target") {
    const trimmed = raw.trim();
    if (field === "target" && !trimmed) { patch("goals", goal.id, { target: null }); return; }
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      if (field === "current") setCurrent(String(goal.current));
      else setTarget(goal.target == null ? "" : String(goal.target));
      return;
    }
    patch("goals", goal.id, { [field]: Math.max(0, parsed) });
  }

  function step(delta: number) {
    const next = Math.max(0, goal.current + delta);
    setCurrent(String(next));
    patch("goals", goal.id, { current: next });
  }

  function pickDate(iso: string) {
    if (dateMode === "start") {
      const end = goal.end_date && goal.end_date < iso ? iso : goal.end_date;
      patch("goals", goal.id, { start_date: iso, end_date: end ?? null });
      setDateMode("end");
    } else {
      const start = goal.start_date && goal.start_date > iso ? iso : goal.start_date;
      patch("goals", goal.id, { end_date: iso, start_date: start ?? null });
    }
  }

  function fitToPeriod() {
    const anchor = goal.start_date ?? todayISO();
    const range = periodRange(goal.horizon, anchor, weekStart);
    patch("goals", goal.id, { start_date: range.start, end_date: range.end });
  }

  function setStatus(status: Goal["status"], note: string) {
    patch("goals", goal.id, { status });
    toast({ title: note, description: goal.title || undefined, tone: status === "done" ? "success" : "default" });
  }

  // Anything strictly above this goal can be its parent; never itself or its own subtree.
  const parentOptions = React.useMemo(() => {
    const blocked = new Set([goal.id, ...index.descendantsOf(goal.id)]);
    const mine = horizonIndex(goal.horizon);
    return goals
      .filter((g) => !blocked.has(g.id) && horizonIndex(g.horizon) < mine && g.status !== "dropped")
      .sort((a, b) => horizonIndex(b.horizon) - horizonIndex(a.horizon) || a.title.localeCompare(b.title));
  }, [goals, goal.id, goal.horizon, index]);

  const preferred = parentHorizon(goal.horizon);
  const directParents = parentOptions.filter((g) => g.horizon === preferred);
  const otherParents = parentOptions.filter((g) => g.horizon !== preferred);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-1.5 px-3 hairline-b">
        <Popover
          className="w-auto"
          trigger={
            <IconButton label="Goal colour" className={`tint-${goal.color}`}>
              <span className="size-[15px] rounded-full" style={{ background: "var(--tint)" }} />
            </IconButton>
          }
        >
          <TintPicker
            value={goal.color}
            onChange={(t) => patch("goals", goal.id, { color: (t ?? "blue") as Tint })}
          />
        </Popover>

        <Popover
          className="w-[176px]"
          trigger={
            <Button size="xs" variant="subtle" className={cn("gap-1.5", STATUS_TONE[goal.status])}>
              <span className="size-1.5 rounded-full bg-current" />
              {STATUS_LABEL[goal.status]}
            </Button>
          }
        >
          {(close) => (
            <>
              <MenuItem icon={Play} checked={goal.status === "active"} onClick={() => { setStatus("active", "Back to active"); close(); }}>
                Active
              </MenuItem>
              <MenuItem icon={CircleCheck} checked={goal.status === "done"} onClick={() => { setStatus("done", "Goal completed"); close(); }}>
                Done
              </MenuItem>
              <MenuItem icon={Pause} checked={goal.status === "paused"} onClick={() => { setStatus("paused", "Paused"); close(); }}>
                Paused
              </MenuItem>
              <MenuItem icon={Ban} checked={goal.status === "dropped"} onClick={() => { setStatus("dropped", "Dropped"); close(); }}>
                Dropped
              </MenuItem>
            </>
          )}
        </Popover>

        <div className="flex-1" />

        <SheetMaximize />
        <IconButton label="Close goal" onClick={onClose}>
          <X />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-6">
        {/* ================= About ================= */}
        <div className="space-y-5">
          <div>
            <AutoTextarea
              value={title}
              onChange={setTitle}
              aria-label="Goal title"
              onBlur={() => {
                const next = title.trim();
                if (next && next !== goal.title) patch("goals", goal.id, { title: next });
                else setTitle(goal.title);
              }}
              placeholder="Name this goal"
              className="text-[19px] font-semibold leading-[1.28] tracking-[-0.01em] text-ink placeholder:text-ink-4"
            />

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Select
                label="Horizon"
                size="sm"
                value={goal.horizon}
                options={HORIZON_OPTIONS}
                onChange={(h: Horizon) => patch("goals", goal.id, { horizon: h })}
                className="w-[116px]"
              />
              <AttentionLine flags={flags} />
            </div>
          </div>

          <GoalProgressReadout goal={goal} stats={stats} />

          <div>
            <SubLabel>Why it matters</SubLabel>
            <AutoTextarea
              value={why}
              onChange={setWhyDraft}
              aria-label="Why this goal matters"
              onBlur={() => {
                const next = why.trim();
                if (next !== storedWhy) setWhy(goal, next);
              }}
              placeholder="What changes in your life when this is done?"
              className="mt-1 text-[13.5px] text-ink-2 placeholder:text-ink-4"
            />
          </div>

          <div>
            <SubLabel>What done looks like</SubLabel>
            <AutoTextarea
              value={done}
              onChange={setDone}
              aria-label="What done looks like"
              onBlur={() => {
                const next = done.trim();
                if (next !== stats.meta.done_looks_like) setMeta(goal, { done_looks_like: next });
              }}
              placeholder="The sentence you will be able to say when this is finished."
              className="mt-1 text-[13.5px] text-ink-2 placeholder:text-ink-4"
            />
            {!stats.defined && (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-4">
                Both blank, and this reads as a wish. One line each is enough — the why keeps you
                going, the picture of done tells you when to stop.
              </p>
            )}
          </div>

          <Fold
            id="goal-sheet-dates"
            label="Dates"
            summary={formatGoalRange(goal)}
            open={dates.open}
            onToggle={dates.toggle}
            actions={
              <Button size="xs" variant="ghost" onClick={fitToPeriod}>
                Fit to {HORIZON_LABEL[goal.horizon].toLowerCase()}
              </Button>
            }
          >
            <div className="flex items-center gap-2">
              <Segmented
                size="sm"
                value={dateMode}
                onChange={setDateMode}
                options={[
                  { value: "start" as const, label: goal.start_date ? formatDate(goal.start_date, { weekday: false }) : "Start" },
                  { value: "end" as const, label: goal.end_date ? formatDate(goal.end_date, { weekday: false }) : "End" },
                ]}
              />
              {(goal.start_date || goal.end_date) && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => patch("goals", goal.id, { start_date: null, end_date: null })}
                >
                  Clear
                </Button>
              )}
            </div>

            <div className="mt-2.5">
              <MiniCalendar
                value={(dateMode === "start" ? goal.start_date : goal.end_date) ?? goal.start_date ?? todayISO()}
                weekStart={weekStart}
                markers={markers}
                onChange={pickDate}
              />
            </div>
          </Fold>
        </div>

        {/* ================= Progress ================= */}
        <Fold
          strong
          id="goal-sheet-progress"
          label="Progress"
          summary={progressSummary}
          open={progress.open}
          onToggle={progress.toggle}
          bodyClassName="space-y-6 pt-2"
        >
          <GoalProgress
            goal={goal}
            stats={stats}
            onModeChange={(mode) => setMeta(goal, { mode })}
          />

          <section>
            <SubLabel>Target</SubLabel>
            <div className="mt-2 flex items-center gap-1.5">
              <IconButton label="Decrease progress" size="sm" onClick={() => step(-1)}>
                <Minus />
              </IconButton>
              <Input
                value={current}
                inputMode="decimal"
                aria-label="Current value"
                onChange={(e) => setCurrent(e.target.value)}
                onBlur={() => commitNumber(current, "current")}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                className="w-[68px] text-center tnum"
              />
              <IconButton label="Increase progress" size="sm" onClick={() => step(1)}>
                <Plus />
              </IconButton>
              <span className="px-0.5 text-[12.5px] text-ink-4">of</span>
              <Input
                value={target}
                inputMode="decimal"
                placeholder="—"
                aria-label="Target value"
                onChange={(e) => setTarget(e.target.value)}
                onBlur={() => commitNumber(target, "target")}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                className="w-[68px] text-center tnum"
              />
              <Input
                value={unit}
                placeholder="unit"
                aria-label="Unit"
                onChange={(e) => setUnit(e.target.value)}
                onBlur={() => {
                  const next = unit.trim();
                  if (next !== (goal.unit ?? "")) patch("goals", goal.id, { unit: next || null });
                }}
                className="min-w-0 flex-1"
              />
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-4">
              Nudging the number here is fine. Logging a check-in below moves it too, and keeps a
              dated record of how it got there.
            </p>
          </section>

          <GoalCheckIns goal={goal} stats={stats} />
        </Fold>

        {/* ================= Structure ================= */}
        <Fold
          strong
          id="goal-sheet-structure"
          label="Structure"
          summary={structureSummary}
          open={structure.open}
          onToggle={structure.toggle}
          bodyClassName="space-y-6 pt-2"
        >
          <section>
            <SubLabel>Rolls up to</SubLabel>
            <div className="mt-1.5">
              <Popover
                className="max-h-[300px] w-[260px] overflow-y-auto"
                trigger={
                  <Button variant="secondary" size="sm" className="w-full justify-start gap-2 font-normal">
                    {parent ? (
                      <>
                        <GoalDot goal={parent} />
                        <span className="min-w-0 flex-1 truncate text-left">{parent.title || "Untitled goal"}</span>
                        <span className="shrink-0 text-[11px] text-ink-4">{HORIZON_LABEL[parent.horizon]}</span>
                      </>
                    ) : (
                      <span className="text-ink-3">Nothing — this is a top-level goal</span>
                    )}
                  </Button>
                }
              >
                {(close) => (
                  <>
                    <MenuItem
                      checked={!goal.parent_id}
                      onClick={() => { patch("goals", goal.id, { parent_id: null }); close(); }}
                    >
                      No parent
                    </MenuItem>
                    {directParents.length > 0 && (
                      <>
                        <MenuSeparator />
                        <MenuLabel>{preferred ? HORIZON_LABEL[preferred] : "Above"}</MenuLabel>
                        {directParents.map((option) => (
                          <MenuItem
                            key={option.id}
                            checked={goal.parent_id === option.id}
                            onClick={() => { patch("goals", goal.id, { parent_id: option.id }); close(); }}
                          >
                            {option.title || "Untitled goal"}
                          </MenuItem>
                        ))}
                      </>
                    )}
                    {otherParents.length > 0 && (
                      <>
                        <MenuSeparator />
                        <MenuLabel>Other levels</MenuLabel>
                        {otherParents.map((option) => (
                          <MenuItem
                            key={option.id}
                            checked={goal.parent_id === option.id}
                            onClick={() => { patch("goals", goal.id, { parent_id: option.id }); close(); }}
                          >
                            {option.title || "Untitled goal"}
                          </MenuItem>
                        ))}
                      </>
                    )}
                    {parentOptions.length === 0 && (
                      <p className="px-2 py-2 text-[12.5px] leading-relaxed text-ink-3">
                        Nothing sits above a {HORIZON_LABEL[goal.horizon].toLowerCase()} goal yet. Add one from the ladder
                        and it will show up here.
                      </p>
                    )}
                  </>
                )}
              </Popover>
            </div>
          </section>

          {nextHorizon && (
            <section>
              <div className="flex items-center gap-2">
                <SubLabel>{HORIZON_LABEL[nextHorizon]} goals</SubLabel>
                <span className="text-[11px] text-ink-4 tnum">{children.length}</span>
                <div className="flex-1" />
                {plan && (
                  <Popover
                    align="end"
                    className="w-[252px]"
                    trigger={
                      <Button size="xs" variant="ghost">
                        <Split className="size-3.5" />
                        Break down
                      </Button>
                    }
                  >
                    {(close) => (
                      <div>
                        <MenuLabel>
                          {plan.missing
                            ? `Fill this range with ${HORIZON_PLURAL[plan.horizon]}`
                            : `Every ${HORIZON_LABEL[plan.horizon].toLowerCase()} already exists`}
                        </MenuLabel>
                        <div className="max-h-[212px] overflow-y-auto">
                          {plan.periods.map((period) => (
                            <div
                              key={period.start}
                              className={cn(
                                "flex items-center justify-between gap-2 rounded-md px-2 py-[5px] text-[12.5px]",
                                period.exists ? "text-ink-4" : "text-ink",
                              )}
                            >
                              <span className="truncate">{period.label}</span>
                              <span className="shrink-0 text-[11px] text-ink-4 tnum">
                                {period.exists ? "exists" : formatDate(period.start, { weekday: false })}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="p-1 pt-1.5">
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full"
                            disabled={!plan.missing}
                            onClick={() => { breakDown(goal); close(); }}
                          >
                            Create {plan.missing} {plan.missing === 1 ? "goal" : "goals"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </Popover>
                )}
              </div>

              <div className="mt-1.5">
                {children.map((child) => {
                  const childStats = index.stats(child.id);
                  const childProgress = child.status === "done" ? 1 : childStats.overall;
                  return (
                    <div
                      key={child.id}
                      className="group/child relative flex items-center gap-2 rounded-md px-1.5 py-[7px] transition-colors duration-150 hover:bg-hover"
                    >
                      <GoalDot goal={child} />
                      <button
                        onClick={() => onOpen(child.id)}
                        className={cn(
                          "min-w-0 flex-1 cursor-pointer truncate text-left text-[13px]",
                          "after:absolute after:inset-0 after:rounded-md after:content-['']",
                          child.status === "done" ? "text-ink-3 line-through decoration-ink-4/60" : "text-ink",
                        )}
                      >
                        {child.title || "Untitled goal"}
                      </button>
                      {childStats.needsCheckIn && (
                        <span className="shrink-0 text-[11px] text-ink-3">check in</span>
                      )}
                      <div className="w-14 shrink-0">
                        <Progress value={childProgress * 100} tint={child.color} height={3} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[11px] text-ink-4 tnum">{pct(childProgress)}</span>
                      <ChevronRight className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                    </div>
                  );
                })}

                <ChildComposer
                  horizon={nextHorizon}
                  onCreate={(value) => createGoal({ horizon: nextHorizon, parent: goal, title: value })}
                />

                {children.length === 0 && (
                  <p className="mt-1.5 px-1.5 text-[12.5px] leading-relaxed text-ink-4">
                    Nothing under this yet. Add one, or break the range into {HORIZON_PLURAL[nextHorizon]} in a single click.
                  </p>
                )}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center gap-2">
              <SubLabel>Linked tasks</SubLabel>
              <span className="text-[11px] text-ink-4 tnum">
                {stats.directDone}/{stats.directTotal}
              </span>
            </div>

            <div className="mt-1">
              <TaskList
                tasks={stats.directTasks}
                sortable={false}
                showDate
                composer
                composerDate={null}
                composerDefaults={{ goal_id: goal.id }}
                emptyDescription="No tasks point at this goal yet. Anything you add here counts toward its progress."
              />
            </div>

            {stats.subtreeTotal > stats.directTotal && (
              <p className="mt-1.5 flex items-center gap-1.5 px-1.5 text-[11.5px] text-ink-4 tnum">
                <Layers className="size-3" />
                {stats.subtreeDone}/{stats.subtreeTotal} across the whole branch
              </p>
            )}
          </section>

          <GoalMilestones goal={goal} stats={stats} />

          <GoalLinks goal={goal} stats={stats} />
        </Fold>
      </div>

      <footer className="flex shrink-0 items-center gap-2 px-4 py-3 hairline-t">
        {goal.status === "done" ? (
          <Button size="sm" onClick={() => setStatus("active", "Reopened")}>
            <Undo2 className="size-3.5" />
            Reopen
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => setStatus("done", "Goal completed")}>
            <CircleCheck className="size-3.5" />
            Mark complete
          </Button>
        )}
        {goal.status === "paused" ? (
          <Button size="sm" variant="ghost" onClick={() => setStatus("active", "Resumed")}>
            <Play className="size-3.5" />
            Resume
          </Button>
        ) : goal.status === "active" ? (
          <Button size="sm" variant="ghost" onClick={() => setStatus("paused", "Paused")}>
            <Pause className="size-3.5" />
            Pause
          </Button>
        ) : null}

        <div className="flex-1" />

        <IconButton label="Delete goal" tone="danger" onClick={() => setConfirming(true)}>
          <Trash2 />
        </IconButton>
      </footer>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          remove("goals", goal.id);
          toast({ title: "Goal deleted", description: goal.title || undefined, tone: "danger" });
          onClose();
        }}
        title="Delete this goal?"
        description={
          children.length
            ? `${children.length} child ${children.length === 1 ? "goal keeps" : "goals keep"} existing but lose their parent. Linked tasks are kept.`
            : "Linked tasks are kept — only the goal is removed."
        }
      />
    </div>
  );
}

/** Notion's "click here and type" row, for child goals. */
function ChildComposer({ horizon, onCreate }: { horizon: Horizon; onCreate: (title: string) => void }) {
  const [active, setActive] = React.useState(false);
  const [value, setValue] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (active) ref.current?.focus(); }, [active]);

  function submit() {
    const text = value.trim();
    if (text) onCreate(text);
    setValue("");
  }

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-[7px] text-left text-[13px] text-ink-4 transition-colors duration-150 hover:bg-hover hover:text-ink-3"
      >
        <Plus className="size-4" />
        Add {HORIZON_LABEL[horizon].toLowerCase()} goal
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-hover px-1.5 py-[6px]">
      <Plus className="size-4 shrink-0 text-ink-4" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { submit(); setActive(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") { setValue(""); setActive(false); }
        }}
        aria-label={`New ${HORIZON_LABEL[horizon].toLowerCase()} goal`}
        placeholder={`What has to be true by the end of the ${HORIZON_LABEL[horizon].toLowerCase()}?`}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
      />
    </div>
  );
}
