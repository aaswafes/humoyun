"use client";

import * as React from "react";
import {
  Archive, ArchiveRestore, ChevronDown, ChevronLeft, ChevronRight, Flame,
  Link2Off, Moon, MoreHorizontal, Pencil, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import {
  dayNameOf, diffDays, formatDate, startOfWeek, todayISO, yearOf,
} from "@/lib/date";
import type { Habit, HabitLog, Tint } from "@/lib/types";
import {
  AutoTextarea, Button, IconButton, Input, SectionLabel,
} from "@/components/ui/primitives";
import { MenuItem, Popover, Sheet, TintPicker, SheetMaximize } from "@/components/ui/overlays";
import { Field, MiniEmpty, Select, VisuallyHidden } from "@/components/ui/form";
import { HabitIcon } from "./habit-icons";
import { Heatmap, HeatmapLegend } from "./heatmap";
import { DayControl, WeekDots } from "./day-control";
import { Fold, useFold } from "./fold";
import { useHabitLogging } from "./habit-logging";
import {
  metaFor, normaliseOrder, SLOT_HINT, SLOT_ICON, SLOT_LABEL, SLOTS, stackedOnto,
  useHabitMeta, type HabitMetaMap, type Slot,
} from "./habit-meta";
import {
  cadenceLabel, completionRate, countLabel, currentStreak, DAY_STATE_LABEL,
  daysLoggedIn, earliestDay, streakRuns, targetLabel, weakestWeekday, weekDays,
  weekQuota, weekdayStats, weeksBetween, type Counts, type Skips,
} from "./habit-utils";

/** Older history arrives in pages — a two-year habit has 700 entries. */
const PAGE = 20;

const NO_LINK = "";

export function HabitSheet({
  habitId, onClose, onEdit, onArchive, onDelete,
}: {
  habitId: string | null;
  onClose: () => void;
  onEdit: (habit: Habit) => void;
  onArchive: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}) {
  const habit = useStore((s) => (habitId ? s.habits.find((h) => h.id === habitId) ?? null : null));
  return (
    <Sheet open={!!habit} onClose={onClose} width={520} resizeKey="habit">
      {habit && (
        <SheetBody
          key={habit.id}
          habit={habit}
          onClose={onClose}
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      )}
    </Sheet>
  );
}

function SheetBody({
  habit, onClose, onEdit, onArchive, onDelete,
}: {
  habit: Habit;
  onClose: () => void;
  onEdit: (habit: Habit) => void;
  onArchive: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}) {
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const { meta, metaOf, skipsOf, setMeta, setSkip } = useHabitMeta();
  const { setCount } = useHabitLogging();

  const runsFold = useFold("humoyun.habits.sheet.runsOpen");
  const weekdayFold = useFold("humoyun.habits.sheet.weekdaysOpen");
  const placeFold = useFold("humoyun.habits.sheet.placementOpen");

  const today = todayISO();
  const row = metaOf(habit.id);
  const skips = skipsOf(habit.id);

  const logs = React.useMemo(
    () => habitLogs.filter((l) => l.habit_id === habit.id).sort((a, b) => b.date.localeCompare(a.date)),
    [habitLogs, habit.id],
  );
  const counts = React.useMemo<Counts>(
    () => new Map(logs.map((l) => [l.date, l.count])),
    [logs],
  );

  // Draft title, reseeded if the habit is renamed from the editor behind us.
  const [seed, setSeed] = React.useState(habit.name);
  const [name, setName] = React.useState(habit.name);
  if (seed !== habit.name) { setSeed(habit.name); setName(habit.name); }

  const streak = currentStreak(habit, counts, skips, today, weekStart);
  const rate = completionRate(habit, counts, today, 30, skips);
  // Left to the React compiler: both walk the habit's whole history, and hand
  // memoisation over a Map and a Set is what it refuses to preserve.
  const runs = streakRuns(habit, counts, skips, today, weekStart);
  const weekdays = weekdayStats(habit, counts, skips, today, weekStart);
  const weakest = weakestWeekday(weekdays);
  const days = weekDays(habit, counts, skips, today, today, weekStart);
  const quota = weekQuota(habit, counts, today, weekStart);
  // The best run is the longest of the runs already walked above.
  const best = runs.reduce((max, run) => Math.max(max, run.length), streak);

  const after = row.after ? habits.find((h) => h.id === row.after) ?? null : null;
  const children = stackedOnto(habits.filter((h) => !h.archived), meta, habit.id);

  const stackOptions = React.useMemo(
    () => [
      { value: NO_LINK, label: "Nothing — it stands alone" },
      ...habits
        // A → B → A would leave the order undefined, so anything whose own
        // chain already runs through this habit is not offered.
        .filter((h) => !h.archived && h.id !== habit.id && !leadsTo(h.id, habit.id, habits, meta))
        .sort((a, b) => a.order_index - b.order_index)
        .map((h) => ({ value: h.id, label: h.name })),
    ],
    [habits, habit.id, meta],
  );

  function rename() {
    const next = name.trim();
    if (next && next !== habit.name) patch("habits", habit.id, { name: next });
    else setName(habit.name);
  }

  function setSlot(slot: Slot) {
    setMeta(habit.id, { slot });
    normaliseOrder();
  }

  // A stacked habit adopts its anchor's part of the day — a chain that
  // straddled morning and evening would not be a chain.
  function setAfter(id: string | null) {
    setMeta(habit.id, { after: id, slot: id ? metaOf(id).slot : row.slot });
    normaliseOrder();
  }

  function restore() {
    patch("habits", habit.id, { archived: false });
    setMeta(habit.id, { archivedReason: null, archivedAt: null });
    normaliseOrder();
    toast({ title: `${habit.name} restored`, description: "Every log came back with it.", tone: "success" });
  }

  const placement = [
    after ? `After ${after.name}` : SLOT_LABEL[row.slot],
    row.cue,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-1.5 px-3 hairline-b">
        <Popover
          className="w-auto"
          trigger={
            <IconButton label="Habit colour" className={`tint-${habit.color}`}>
              <span className="size-[15px] rounded-full" style={{ background: "var(--tint)" }} />
            </IconButton>
          }
        >
          <TintPicker
            value={habit.color}
            onChange={(t) => patch("habits", habit.id, { color: (t ?? "emerald") as Tint })}
          />
        </Popover>

        <span className="text-[12.5px] text-ink-3">{cadenceLabel(habit, weekStart)}</span>
        {habit.archived && (
          <span className="rounded-full bg-hover px-2 py-0.5 text-[11px] font-medium text-ink-3">Archived</span>
        )}

        <div className="flex-1" />

        <IconButton label="Edit habit" onClick={() => onEdit(habit)}><Pencil /></IconButton>
        <Popover
          align="end"
          className="w-[190px]"
          trigger={<IconButton label={`${habit.name} actions`}><MoreHorizontal /></IconButton>}
        >
          {(close) => (
            <>
              {habit.archived ? (
                <MenuItem icon={ArchiveRestore} onClick={() => { restore(); close(); }}>Restore habit</MenuItem>
              ) : (
                <MenuItem icon={Archive} onClick={() => { onArchive(habit); close(); }}>Archive…</MenuItem>
              )}
              <MenuItem icon={Trash2} danger onClick={() => { onDelete(habit); close(); }}>Delete forever</MenuItem>
            </>
          )}
        </Popover>
        <SheetMaximize />
        <IconButton label="Close habit" onClick={onClose}><X /></IconButton>
      </header>

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-6">
        {/* ---- identity ---- */}
        <div className={`tint-${habit.color}`}>
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md"
              style={{ background: "var(--tint-soft)" }}
              aria-hidden
            >
              <HabitIcon name={habit.icon} className="size-4 text-[var(--tint)]" />
            </span>
            <AutoTextarea
              value={name}
              onChange={setName}
              onBlur={rename}
              aria-label="Habit name"
              placeholder="Name this habit"
              className="text-[17px] font-semibold leading-[1.3] tracking-[-0.01em] text-ink placeholder:text-ink-4"
            />
          </div>
          <p className="mt-1 pl-11 text-[12.5px] text-ink-4">
            {targetLabel(habit) ?? "No daily target set"}
          </p>
        </div>

        {habit.archived && (
          <div className="rounded-lg bg-sunken px-3.5 py-3">
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              Archived{row.archivedAt ? ` on ${formatDate(row.archivedAt, { year: true })}` : ""}.
              {row.archivedReason ? ` “${row.archivedReason}”` : " No reason was written down."}
            </p>
            <Button size="sm" variant="secondary" className="mt-2.5" onClick={restore}>
              <ArchiveRestore className="size-3.5" />
              Restore
            </Button>
          </div>
        )}

        {/* ---- today ---- */}
        {!habit.archived && (
          <section className={`tint-${habit.color}`}>
            <div className="mb-2.5 flex items-center gap-2">
              <SectionLabel>Today</SectionLabel>
              <span className="text-[11.5px] text-ink-4">{formatDate(today)}</span>
              <div className="flex-1" />
              <Button
                size="xs"
                variant={skips.has(today) ? "subtle" : "ghost"}
                onClick={() => setSkip(habit.id, today, skips.has(today) ? null : "")}
              >
                <Moon className="size-3" />
                {skips.has(today) ? "Rested" : "Rest day"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <DayControl
                habit={habit}
                date={today}
                count={counts.get(today) ?? 0}
                skipped={skips.has(today)}
                onCount={(next) => setCount(habit.id, today, next)}
                onUnskip={() => setSkip(habit.id, today, null)}
              />
              <div className="flex items-center gap-2">
                <WeekDots habit={habit} days={days} weekStart={weekStart} size={8} />
                <span className="text-[12px] text-ink-4 tnum">
                  <span className="text-ink-2">{quota.done}</span> of {quota.target} this week
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ---- numbers ---- spacing, not a card: the sheet is the surface. */}
        <section className={cn(`tint-${habit.color}`, "grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4")}>
          <Stat label="Streak" value={streak} caption={streak === 1 ? "day" : "days"} tinted={streak > 0} />
          <Stat label="Best" value={best} caption={best === 1 ? "day" : "days"} />
          <Stat label="30 days" value={rate.pct} suffix="%" caption={`${rate.done} of ${rate.expected}`} />
          <Stat
            label="Logged"
            value={counts.size}
            caption={`since ${formatDate(earliestDay(habit, counts), { weekday: false, year: true })}`}
          />
        </section>

        <YearSection habit={habit} counts={counts} skips={skips} weekStart={weekStart} today={today} />

        {/* ---- streak history ---- */}
        <Fold
          label="Streak history"
          summary={
            runs.length
              ? `${runs.length} ${runs.length === 1 ? "run" : "runs"} · best ${best} ${best === 1 ? "day" : "days"}`
              : "No run has started yet"
          }
          open={runsFold.open}
          onToggle={runsFold.toggle}
        >
          {runs.length === 0 ? (
            <MiniEmpty>One logged day begins the first.</MiniEmpty>
          ) : (
            <ol className={cn(`tint-${habit.color}`, "space-y-1.5")}>
              {runs.slice(0, 6).map((run) => (
                <li key={`${run.start}-${run.end}`} className="flex items-center gap-2.5">
                  <span className="w-[46px] shrink-0 text-right text-[13px] font-medium text-ink-2 tnum">
                    {run.length}<span className="ml-0.5 text-[11px] text-ink-4">d</span>
                  </span>
                  <span aria-hidden className="h-1.5 min-w-[3px] flex-1 rounded-full bg-hover">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(4, (run.length / Math.max(1, best)) * 100)}%`, background: "var(--tint)" }}
                    />
                  </span>
                  <span className="shrink-0 text-[11.5px] text-ink-4 tnum">
                    {formatDate(run.start, { weekday: false })} – {formatDate(run.end, { weekday: false })}
                  </span>
                  {run.live && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-[var(--tint-ink)]">
                      <Flame className="size-3" aria-hidden />
                      now
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          {runs.length > 6 && (
            <p className="mt-1.5 text-[11.5px] text-ink-4 tnum">and {runs.length - 6} older runs</p>
          )}
        </Fold>

        {/* ---- weekday breakdown ---- */}
        <Fold
          label="By weekday"
          summary={
            weakest
              ? `${dayNameOf(weakest.weekday, "long")} is where it slips`
              : "Seven days compared"
          }
          open={weekdayFold.open}
          onToggle={weekdayFold.toggle}
        >
          <ul className={cn(`tint-${habit.color}`, "space-y-1")}>
            {weekdays.map((stat) => {
              const weak = !!weakest && stat.weekday === weakest.weekday;
              return (
                <li key={stat.weekday} className="flex items-center gap-2.5">
                  <span className={cn("w-8 shrink-0 text-[11.5px]", weak ? "font-medium text-ink-2" : "text-ink-4")}>
                    {dayNameOf(stat.weekday, "short")}
                  </span>
                  <span aria-hidden className="h-2 flex-1 rounded-full bg-hover">
                    <span
                      className="block h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-apple)]"
                      style={{ width: `${stat.pct}%`, background: "var(--tint)", opacity: weak ? 0.45 : 1 }}
                    />
                  </span>
                  <span className="w-[38px] shrink-0 text-right text-[11.5px] text-ink-3 tnum">
                    {stat.scheduled ? `${stat.pct}%` : "—"}
                  </span>
                  <span className="w-[54px] shrink-0 text-right text-[11px] text-ink-4 tnum">
                    {stat.done}/{stat.scheduled}
                  </span>
                </li>
              );
            })}
          </ul>
        </Fold>

        {/* ---- stacking ---- */}
        <Fold
          label="Where it sits in the day"
          summary={placement}
          open={placeFold.open}
          onToggle={placeFold.toggle}
          panelClassName="space-y-3"
        >
          <div>
            <div role="group" aria-label="Time of day" className="grid grid-cols-4 gap-1">
              {SLOTS.map((slot) => {
                const Icon = SLOT_ICON[slot];
                const on = row.slot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={on}
                    disabled={!!after}
                    title={after ? `Follows ${after.name}` : SLOT_HINT[slot]}
                    onClick={() => setSlot(slot)}
                    className={cn(
                      "flex h-8 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium",
                      "cursor-pointer transition-colors duration-150",
                      "disabled:pointer-events-none disabled:opacity-40",
                      on ? "bg-accent text-accent-ink" : "bg-hover text-ink-2 hover:bg-active",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {SLOT_LABEL[slot]}
                  </button>
                );
              })}
            </div>
            {after && (
              <p className="mt-1.5 text-[11.5px] leading-snug text-ink-4">
                It follows {after.name}, so it lands wherever {after.name} does. Unstack it to choose
                its own time.
              </p>
            )}
          </div>

          <Field
            label="Straight after"
            description={
              after
                ? `Sits right under ${after.name} here and on Today.`
                : "Chain this onto another habit so both land in the same moment."
            }
          >
            {(props) => (
              <div className="flex items-center gap-1.5">
                <Select
                  {...props}
                  label="Straight after"
                  value={row.after ?? NO_LINK}
                  options={stackOptions}
                  onChange={(id) => setAfter(id || null)}
                  className="flex-1"
                />
                {after && (
                  <IconButton label={`Unstack from ${after.name}`} onClick={() => setAfter(null)}>
                    <Link2Off />
                  </IconButton>
                )}
              </div>
            )}
          </Field>

          <Field label="Cue" description="The sentence that starts it — “after I pour the coffee”.">
            {(props) => (
              <Input
                {...props}
                defaultValue={row.cue ?? ""}
                placeholder="After I…"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next !== (row.cue ?? "")) setMeta(habit.id, { cue: next || null });
                }}
              />
            )}
          </Field>

          {children.length > 0 && (
            <p className="text-[11.5px] leading-relaxed text-ink-4">
              Stacked onto this: {children.map((c) => c.name).join(", ")}.
            </p>
          )}
        </Fold>

        <Timeline
          habit={habit}
          logs={logs}
          skipEntries={row.skips}
          today={today}
          onSkipReason={(date, reason) => setSkip(habit.id, date, reason)}
        />
      </div>
    </div>
  );
}

/** Does following `after` links from `start` arrive at `target`? */
function leadsTo(start: string, target: string, habits: Habit[], meta: HabitMetaMap): boolean {
  const ids = new Set(habits.map((h) => h.id));
  let cursor: string | null = start;
  for (let guard = 0; cursor && guard < 64; guard++) {
    if (cursor === target) return true;
    if (!ids.has(cursor)) return false;
    cursor = metaFor(meta, cursor).after;
  }
  return false;
}

function Stat({
  label, value, suffix, caption, tinted,
}: {
  label: string;
  value: number;
  suffix?: string;
  caption: string;
  tinted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-ink-3">{label}</p>
      <p className="mt-1 flex items-baseline gap-0.5">
        <span className={cn("display-serif text-[22px] leading-none tnum", tinted && "text-[var(--tint)]")}>
          {value}
        </span>
        {suffix && <span className="text-[12px] text-ink-4">{suffix}</span>}
      </p>
      <p className="mt-1 truncate text-[11.5px] text-ink-4">{caption}</p>
    </div>
  );
}

/**
 * The full year, folded. This is the one place the whole grid belongs — a row
 * on the list page has no room for twelve months and its own year navigation.
 */
function YearSection({
  habit, counts, skips, weekStart, today,
}: {
  habit: Habit;
  counts: Counts;
  skips: Skips;
  weekStart: number;
  today: string;
}) {
  const toggleHabit = useStore((s) => s.toggleHabit);
  const { open, toggle } = useFold("humoyun.habits.sheet.yearOpen");
  const thisYear = yearOf(today);
  const firstYear = yearOf(earliestDay(habit, counts));
  const [year, setYear] = React.useState(thisYear);

  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;
  const start = startOfWeek(jan1, weekStart);
  const weeks = weeksBetween(jan1, dec31, weekStart);
  const end = dec31 < today ? dec31 : today;

  const logged = daysLoggedIn(counts, year);
  const rate = completionRate(habit, counts, end, Math.max(1, diffDays(end, jan1) + 1), skips);
  const rested = React.useMemo(() => {
    let n = 0;
    for (const day of skips) if (day.startsWith(`${year}-`)) n++;
    return n;
  }, [skips, year]);

  return (
    <Fold
      label="Year"
      summary={`${year} · ${logged} logged · ${rate.pct}% of target`}
      open={open}
      onToggle={toggle}
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-0.5">
          <IconButton label="Previous year" size="sm" disabled={year <= firstYear} onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft />
          </IconButton>
          <span className="min-w-[42px] text-center text-[12.5px] font-medium text-ink-2 tnum">{year}</span>
          <IconButton label="Next year" size="sm" disabled={year >= thisYear} onClick={() => setYear((y) => y + 1)}>
            <ChevronRight />
          </IconButton>
        </div>
        <p className="text-[11.5px] text-ink-4 tnum">
          <span className="text-ink-2">{logged}</span> logged · <span className="text-ink-2">{rate.pct}%</span> of target
          {rested > 0 && <> · <span className="text-ink-2">{rested}</span> rested</>}
        </p>
      </div>

      <div className="overflow-x-auto pb-1">
        <Heatmap
          habit={habit}
          counts={counts}
          skips={skips}
          startWeek={start}
          weeks={weeks}
          weekStart={weekStart}
          cellSize={12}
          showMonths
          showWeekdays
          onToggle={(date) => toggleHabit(habit.id, date)}
        />
      </div>
      <HeatmapLegend habit={habit} className="mt-2" />
    </Fold>
  );
}

interface Entry {
  date: string;
  log: HabitLog | null;
  /** Non-null when the day was rested; the string is the reason, possibly empty. */
  skipReason: string | null;
}

/** Every logged day and every rest day, newest first, each with its note. */
function Timeline({
  habit, logs, skipEntries, today, onSkipReason,
}: {
  habit: Habit;
  logs: HabitLog[];
  skipEntries: Record<string, string>;
  today: string;
  onSkipReason: (date: string, reason: string | null) => void;
}) {
  const { setNote } = useHabitLogging();
  // Open by default: "All notes and history" on the list page leads here, and
  // it would be a dead end if it landed on a closed section.
  const { open, toggle } = useFold("humoyun.habits.sheet.historyOpen", true);
  const [shown, setShown] = React.useState(PAGE);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const entries = React.useMemo<Entry[]>(() => {
    const byDate = new Map<string, Entry>();
    for (const log of logs) byDate.set(log.date, { date: log.date, log, skipReason: null });
    for (const [date, reason] of Object.entries(skipEntries)) {
      const existing = byDate.get(date);
      if (existing) existing.skipReason = reason;
      else byDate.set(date, { date, log: null, skipReason: reason });
    }
    return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [logs, skipEntries]);

  const visible = entries.slice(0, shown);

  function commit(entry: Entry) {
    const next = draft.trim();
    // A note on a logged day is the log's note; on a rest day it is the reason.
    if (entry.log) setNote(habit.id, entry.date, next || null);
    else onSkipReason(entry.date, next);
    setEditing(null);
  }

  return (
    <Fold
      label="History"
      summary={
        entries.length
          ? `${entries.length} ${entries.length === 1 ? "day" : "days"} recorded`
          : "Nothing recorded yet"
      }
      open={open}
      onToggle={toggle}
    >
      {entries.length === 0 ? (
        <MiniEmpty>Log today above and it lands here with room for a note.</MiniEmpty>
      ) : (
        <>
          <VisuallyHidden>{`${entries.length} days recorded, newest first.`}</VisuallyHidden>
          <ol className={cn(`tint-${habit.color}`, "space-y-0.5")}>
            {visible.map((entry) => {
              const isSkip = !entry.log && entry.skipReason !== null;
              const text = entry.log?.note ?? entry.skipReason ?? "";
              const isOpen = editing === entry.date;

              return (
                <li key={entry.date} className="rounded-md px-2 py-1.5 transition-colors hover:bg-hover">
                  <div className="flex items-baseline gap-2">
                    <span className="w-[86px] shrink-0 text-[12px] text-ink-3 tnum">
                      {formatDate(entry.date, { year: yearOf(entry.date) !== yearOf(today) })}
                    </span>
                    <span className={cn("shrink-0 text-[11.5px]", isSkip ? "text-ink-4" : "text-[var(--tint-ink)]")}>
                      {isSkip ? DAY_STATE_LABEL.skipped : countLabel(habit, entry.log?.count ?? 0)}
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={() => { setEditing(isOpen ? null : entry.date); setDraft(text); }}
                      aria-expanded={isOpen}
                      className="shrink-0 text-[11.5px] text-ink-4 hover:text-accent cursor-pointer transition-colors"
                    >
                      {text ? "Edit note" : "Add note"}
                    </button>
                  </div>

                  {isOpen ? (
                    <div className="mt-1.5 rounded-md bg-sunken px-2.5 py-1.5">
                      <AutoTextarea
                        value={draft}
                        onChange={setDraft}
                        autoFocus
                        aria-label={`Note for ${formatDate(entry.date, { year: true })}`}
                        placeholder={isSkip ? "Why the rest day?" : "How did it go?"}
                        className="text-[12.5px] text-ink placeholder:text-ink-4"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditing(null);
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit(entry);
                        }}
                      />
                      <div className="mt-1.5 flex justify-end gap-1.5">
                        <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button size="xs" variant="primary" onClick={() => commit(entry)}>Save note</Button>
                      </div>
                    </div>
                  ) : (
                    text && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{text}</p>
                  )}
                </li>
              );
            })}
          </ol>

          {shown < entries.length && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShown((n) => n + PAGE)}>
              <ChevronDown className="size-3.5" />
              Show {Math.min(PAGE, entries.length - shown)} older
            </Button>
          )}
        </>
      )}
    </Fold>
  );
}
