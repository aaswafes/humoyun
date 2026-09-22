"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Flag, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { dayName, dayNameOf, dayNumber, formatDate, startOfWeek, weekNumber } from "@/lib/date";
import { cadenceLabel } from "@/lib/habits";
import { PRAYER_LABELS, PRAYER_NAMES, type PrayerStatus } from "@/lib/types";
import { Badge, Button, Progress } from "@/components/ui/primitives";
import { MiniEmpty, VisuallyHidden } from "@/components/ui/form";
import { Panel, Section } from "./section";
import { ShareBar } from "./sparkline";
import { formatHours, pct, plural, type MetricSource } from "./metrics";
import {
  bookEvidence, focusByTag, goalEvidence, goalsUntouched, habitRows,
  salahByPrayer, salahDays, timeSinks,
  type BookEvidence, type GoalEvidence, type HabitRow, type SalahDay, type TimeSlice,
} from "./derive";
import { useMetricSource } from "./recap";
import { measuredDays, SCOPE_NOUN, type Period } from "./period";

// =========================================================
// Columns — a week gets one cell per day; a month or a year would be
// unreadable that way, so the cells collapse into weeks.
// =========================================================
interface Column { key: string; label: string; title: string; days: string[] }

function buildColumns(days: string[], weekStartDay: number): Column[] {
  if (days.length <= 31) {
    return days.map((d) => ({
      key: d,
      label: String(dayNumber(d)),
      title: formatDate(d),
      days: [d],
    }));
  }
  const weeks = new Map<string, string[]>();
  for (const d of days) {
    const key = startOfWeek(d, weekStartDay);
    const list = weeks.get(key);
    if (list) list.push(d); else weeks.set(key, [d]);
  }
  return [...weeks.entries()].map(([key, group]) => ({
    key,
    label: String(weekNumber(key)),
    title: `Week ${weekNumber(key)} · ${formatDate(group[0], { weekday: false })}`,
    days: group,
  }));
}

/** Header row that only labels every nth column, so the numbers stay legible. */
function ColumnHeader({ columns, perDay }: { columns: Column[]; perDay: boolean }) {
  const step = columns.length <= 10 ? 1 : columns.length <= 31 ? 2 : 4;
  return (
    <div className="flex gap-[3px] pl-[127px]" aria-hidden>
      {columns.map((col, i) => (
        <span
          key={col.key}
          className="w-[13px] shrink-0 text-center text-[10.5px] leading-none text-ink-4 tnum"
        >
          {i % step === 0 ? (perDay ? col.label : `${col.label}`) : ""}
        </span>
      ))}
    </div>
  );
}

// =========================================================
// Habits, day by day
// =========================================================
function HabitCell({ row, column }: { row: HabitRow; column: Column }) {
  const cells = row.cells.filter((c) => column.days.includes(c.date));
  const hit = cells.filter((c) => c.state === "hit").length;
  const scheduled = cells.filter((c) => c.state !== "off").length;

  if (column.days.length === 1) {
    const state = cells[0]?.state ?? "off";
    const title = `${row.habit.name} · ${column.title} · ${
      state === "hit" ? "done" : state === "partial" ? "part done" : state === "missed" ? "missed" : "not due"
    }`;
    return (
      <span title={title} className="grid size-[13px] shrink-0 place-items-center">
        {state === "off" ? (
          <span className="size-[3px] rounded-full bg-line-strong" />
        ) : state === "hit" ? (
          <span className="size-[11px] rounded-[3px]" style={{ background: "var(--tint)" }} />
        ) : state === "partial" ? (
          <span
            className="grid size-[11px] place-items-center rounded-[3px] border"
            style={{ borderColor: "var(--tint)" }}
          >
            <span className="size-[4px] rounded-[1px]" style={{ background: "var(--tint)" }} />
          </span>
        ) : (
          <span className="size-[11px] rounded-[3px] border border-line-strong" />
        )}
      </span>
    );
  }

  const ratio = scheduled ? hit / scheduled : 0;
  return (
    <span
      title={`${row.habit.name} · ${column.title} · ${hit} of ${scheduled} done`}
      className="grid size-[13px] shrink-0 place-items-center"
    >
      {scheduled === 0 ? (
        <span className="size-[3px] rounded-full bg-line-strong" />
      ) : (
        <span
          className="size-[11px] rounded-[3px] border"
          style={{
            background: ratio > 0 ? "var(--tint)" : "transparent",
            opacity: ratio > 0 ? 0.28 + ratio * 0.72 : 1,
            borderColor: ratio > 0 ? "transparent" : "var(--line-strong)",
          }}
        />
      )}
    </span>
  );
}

function HabitMatrix({ rows, columns, perDay }: { rows: HabitRow[]; columns: Column[]; perDay: boolean }) {
  const summaryId = React.useId();
  const summary = rows
    .map((r) => `${r.habit.name}: ${r.hit} of ${r.due} due`)
    .join(". ");

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max" aria-describedby={summaryId}>
        <ColumnHeader columns={columns} perDay={perDay} />
        <VisuallyHidden id={summaryId}>{summary || "No habits were due."}</VisuallyHidden>
        {rows.map((row) => (
          <div key={row.habit.id} className={cn(`tint-${row.habit.color}`, "flex items-center gap-[3px] py-[3px]")}>
            <span className="flex w-[124px] shrink-0 items-baseline gap-1.5 pr-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2" title={row.habit.name}>
                {row.habit.name}
              </span>
              <span className="shrink-0 text-[11px] text-ink-4 tnum">
                {row.hit}/{row.due}
              </span>
            </span>
            {columns.map((col) => (
              <HabitCell key={col.key} row={row} column={col} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================
// Salah, day by day
// =========================================================
const PRAYER_TONE: Record<PrayerStatus, { fill: string; border: string; label: string }> = {
  none: { fill: "transparent", border: "var(--line-strong)", label: "not logged" },
  prayed: { fill: "var(--success)", border: "transparent", label: "prayed" },
  jamaah: { fill: "var(--success)", border: "var(--success)", label: "in jamaah" },
  late: { fill: "var(--warn)", border: "transparent", label: "late" },
  qadha: { fill: "transparent", border: "var(--warn)", label: "made up" },
  missed: { fill: "transparent", border: "var(--danger)", label: "missed" },
};

function SalahGrid({ rows, columns }: { rows: SalahDay[]; columns: Column[] }) {
  const summaryId = React.useId();
  const byPrayer = salahByPrayer(rows);
  const summary = byPrayer
    .map((p) => `${PRAYER_LABELS[p.name]}: ${p.done} of ${rows.length}${p.jamaah ? `, ${p.jamaah} in jamaah` : ""}`)
    .join(". ");
  const byDate = new Map(rows.map((r) => [r.date, r]));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max" aria-describedby={summaryId}>
        <ColumnHeader columns={columns} perDay={columns[0]?.days.length === 1} />
        <VisuallyHidden id={summaryId}>{summary}</VisuallyHidden>
        {PRAYER_NAMES.map((name) => {
          const stat = byPrayer.find((p) => p.name === name);
          return (
            <div key={name} className="flex items-center gap-[3px] py-[3px]">
              <span className="flex w-[124px] shrink-0 items-baseline gap-1.5 pr-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{PRAYER_LABELS[name]}</span>
                <span className="shrink-0 text-[11px] text-ink-4 tnum">
                  {stat?.done ?? 0}/{rows.length}
                </span>
              </span>
              {columns.map((col) => {
                if (col.days.length === 1) {
                  const status = byDate.get(col.days[0])?.statuses[name] ?? "none";
                  const tone = PRAYER_TONE[status];
                  return (
                    <span
                      key={col.key}
                      title={`${PRAYER_LABELS[name]} · ${col.title} · ${tone.label}`}
                      className="grid size-[13px] shrink-0 place-items-center"
                    >
                      <span
                        className={cn("size-[11px] rounded-[3px] border", status === "jamaah" && "ring-1 ring-inset")}
                        style={{
                          background: tone.fill,
                          borderColor: tone.border,
                          // Jamaah is a filled square with a hollow centre — a
                          // different shape, not just a different green.
                          boxShadow: status === "jamaah" ? "inset 0 0 0 2px var(--raised)" : undefined,
                        }}
                      />
                    </span>
                  );
                }
                const done = col.days.filter((d) => {
                  const s = byDate.get(d)?.statuses[name];
                  return s === "prayed" || s === "jamaah" || s === "late";
                }).length;
                const ratio = col.days.length ? done / col.days.length : 0;
                return (
                  <span
                    key={col.key}
                    title={`${PRAYER_LABELS[name]} · ${col.title} · ${done} of ${col.days.length}`}
                    className="grid size-[13px] shrink-0 place-items-center"
                  >
                    <span
                      className="size-[11px] rounded-[3px] border"
                      style={{
                        background: ratio > 0 ? "var(--success)" : "transparent",
                        opacity: ratio > 0 ? 0.28 + ratio * 0.72 : 1,
                        borderColor: ratio > 0 ? "transparent" : "var(--line-strong)",
                      }}
                    />
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SalahLegend() {
  const items: PrayerStatus[] = ["jamaah", "prayed", "late", "qadha", "none"];
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 text-[11px] text-ink-4">
          <span
            className="size-[9px] rounded-[2px] border"
            style={{
              background: PRAYER_TONE[s].fill,
              borderColor: PRAYER_TONE[s].border,
              boxShadow: s === "jamaah" ? "inset 0 0 0 2px var(--raised)" : undefined,
            }}
          />
          {PRAYER_TONE[s].label}
        </span>
      ))}
    </div>
  );
}

// =========================================================
// Goals + books
// =========================================================
function GoalsPanel({ advanced, untouched }: { advanced: GoalEvidence[]; untouched: number }) {
  const router = useRouter();
  return (
    <Panel
      title="Goals advanced"
      meta={advanced.length ? `${advanced.length} of ${advanced.length + untouched} active` : undefined}
    >
      {advanced.length === 0 ? (
        <MiniEmpty action={<Button size="xs" variant="secondary" onClick={() => router.push("/goals")}>Open goals</Button>}>
          No completed task pointed at a goal. Link a task to a goal and it shows up here.
        </MiniEmpty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {advanced.slice(0, 5).map(({ goal, closed, titles, progress }) => (
            <div key={goal.id} className={cn(`tint-${goal.color}`, "min-w-0")}>
              <div className="flex items-baseline gap-2">
                <Flag className="size-3 shrink-0 translate-y-px" style={{ color: "var(--tint)" }} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{goal.title}</span>
                <span className="shrink-0 text-[11.5px] text-ink-3 tnum">
                  {closed} {plural(closed, "task")}
                </span>
              </div>
              <p className="mt-0.5 truncate pl-5 text-[11.5px] text-ink-4">{titles.join(" · ")}</p>
              {progress != null && (
                <div className="mt-1.5 flex items-center gap-2 pl-5">
                  <Progress value={progress} tint={goal.color} height={3} className="flex-1" />
                  <span className="shrink-0 text-[11px] text-ink-4 tnum">{progress}%</span>
                </div>
              )}
            </div>
          ))}
          {untouched > 0 && (
            <p className="pt-0.5 text-[11.5px] text-ink-4">
              {untouched} active {plural(untouched, "goal")} got nothing this period.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function BooksPanel({ books }: { books: BookEvidence[] }) {
  const router = useRouter();
  return (
    <Panel title="Books progressed" meta={books.length ? `${books.length} ${plural(books.length, "book")}` : undefined}>
      {books.length === 0 ? (
        <MiniEmpty action={<Button size="xs" variant="secondary" onClick={() => router.push("/consumption/books")}>Open books</Button>}>
          Nothing was read, logged or finished. Move a bookmark or log a sitting and it lands here.
        </MiniEmpty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {books.slice(0, 5).map(({ book, pages, minutes, progress, finishedOn, settled }) => (
            <div key={book.id} className={cn(`tint-${book.color}`, "min-w-0")}>
              <div className="flex items-baseline gap-2">
                <BookOpen className="size-3 shrink-0 translate-y-px" style={{ color: "var(--tint)" }} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{book.title}</span>
                {finishedOn && <Badge tint={book.color}>Finished</Badge>}
                <span className="shrink-0 text-[11.5px] text-ink-3 tnum">{pages} pp</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-5">
                <Progress value={progress} tint={book.color} height={3} className="flex-1" />
                <span className="shrink-0 text-[11px] text-ink-4 tnum">
                  {progress}%
                  {minutes > 0 && ` · ${formatHours(minutes)}`}
                  {settled > 0 && ` · ${settled} pp carried`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// =========================================================
// Time
// =========================================================
function TagsPanel({ slices, total }: { slices: TimeSlice[]; total: number }) {
  if (!slices.length) {
    return (
      <Panel title="Focus by tag">
        <MiniEmpty>No focus sessions ran. Tag a session or a task and the split appears here.</MiniEmpty>
      </Panel>
    );
  }
  return (
    <Panel title="Focus by tag" meta={`${formatHours(total)} tracked`}>
      <div className="flex flex-col gap-2">
        {slices.slice(0, 6).map((s) => (
          <div key={s.key} className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{s.label}</span>
              <span className="shrink-0 text-[12px] font-medium text-ink tnum">{formatHours(s.minutes)}</span>
              <span className="w-9 shrink-0 text-right text-[11px] text-ink-4 tnum">
                {Math.round(s.share * 100)}%
              </span>
            </div>
            <ShareBar share={s.share} className="mt-1" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SinksPanel({ sinks }: { sinks: ReturnType<typeof timeSinks> }) {
  const top = sinks.slices.slice(0, 3);
  const rest = sinks.slices.slice(3, 8);
  const restMinutes = sinks.slices.slice(3).reduce((sum, s) => sum + s.minutes, 0);

  return (
    <Panel
      title="Biggest time sinks"
      meta={
        sinks.total
          ? `${formatHours(sinks.total)} ${sinks.basis === "tracked" ? "tracked" : "booked"}`
          : undefined
      }
    >
      {!sinks.slices.length ? (
        <MiniEmpty>Nothing was timed or booked, so there is no time to account for.</MiniEmpty>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {top.map((s, i) => (
              <div key={s.key} className={cn(s.tint ? `tint-${s.tint}` : "", "min-w-0")}>
                <div className="flex items-baseline gap-2">
                  <span className="w-4 shrink-0 text-[12.5px] leading-none text-ink-4 tnum">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink" title={s.label}>{s.label}</span>
                  <span className="shrink-0 text-[12.5px] font-medium text-ink tnum">{formatHours(s.minutes)}</span>
                  <span className="w-9 shrink-0 text-right text-[11px] text-ink-4 tnum">
                    {Math.round(s.share * 100)}%
                  </span>
                </div>
                <ShareBar share={s.share} className="mt-1 ml-6 w-[calc(100%-1.5rem)]" />
              </div>
            ))}
          </div>
          {rest.length > 0 && (
            <div className="mt-3 hairline-t pt-2">
              <p className="text-[11.5px] leading-relaxed text-ink-4">
                Then {rest.map((s) => s.label).join(", ")} — {formatHours(restMinutes)} between them.
              </p>
            </div>
          )}
          {sinks.basis === "booked" && (
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-ink-4">
              <Timer className="size-3" />
              No timer ran, so this is what the calendar had booked.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

// =========================================================
// The section
// =========================================================
export function Evidence({
  period, weekStartDay,
}: {
  period: Period;
  weekStartDay: number;
}) {
  const src = useMetricSource();
  // A fresh array every render would defeat every memo below it.
  const days = React.useMemo(() => measuredDays(period), [period]);

  const data = React.useMemo(() => {
    const columns = buildColumns(days, weekStartDay);
    return {
      columns,
      perDay: columns.length > 0 && columns[0].days.length === 1,
      goals: goalEvidence(days, src.tasks, src.goals),
      untouched: goalsUntouched(days, src.tasks, src.goals).length,
      books: bookEvidence(days, src),
      habits: habitRows(days, src.habits, src.habitLogs, weekStartDay),
      salah: salahDays(days, src.prayers),
      tags: focusByTag(days, src.focusSessions, src.tasks),
      sinks: timeSinks(days, src.focusSessions, src.tasks),
    };
  }, [days, src, weekStartDay]);

  const tagTotal = data.tags.reduce((sum, s) => sum + s.minutes, 0);

  if (!days.length) {
    return (
      <Section
        id="review-evidence"
        label="Evidence"
        note={`What the ${SCOPE_NOUN[period.scope]} actually contained`}
      >
        <MiniEmpty>
          Nothing has happened in this {SCOPE_NOUN[period.scope]} yet, so there is no evidence to show.
          Come back once it has started.
        </MiniEmpty>
      </Section>
    );
  }

  return (
    <Section
      id="review-evidence"
      label="Evidence"
      note={`What the ${SCOPE_NOUN[period.scope]} actually contained`}
    >
      {/* One grid, no cards — the panels are told apart by space, not by edges. */}
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
        <GoalsPanel advanced={data.goals} untouched={data.untouched} />
        <BooksPanel books={data.books} />

        <Panel
          title="Habits by day"
          meta={
            data.habits.length
              ? `${data.habits.reduce((s, r) => s + r.hit, 0)} of ${data.habits.reduce((s, r) => s + r.due, 0)} due`
              : undefined
          }
        >
          {data.habits.length === 0 ? (
            <MiniEmpty>No habit was due in this stretch.</MiniEmpty>
          ) : (
            <>
              <HabitMatrix rows={data.habits} columns={data.columns} perDay={data.perDay} />
              <p className="mt-2 text-[11px] text-ink-4">
                {data.perDay
                  ? `Columns are days, ${dayName(days[0], "short")} to ${dayName(days[days.length - 1], "short")}.`
                  : "Columns are weeks — shade shows how much of each week landed."}
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="Salah by day"
          meta={`${data.salah.reduce((s, d) => s + d.done, 0)} of ${days.length * 5}`}
        >
          <SalahGrid rows={data.salah} columns={data.columns} />
          <SalahLegend />
        </Panel>

        <TagsPanel slices={data.tags} total={tagTotal} />
        <SinksPanel sinks={data.sinks} />
      </div>
    </Section>
  );
}

/** Reused by the plain-text summary so the page and the paste never diverge. */
export function evidenceLines(
  days: string[], src: MetricSource, weekStartDay: number,
): string[] {
  const lines: string[] = [];
  const goals = goalEvidence(days, src.tasks, src.goals);
  if (goals.length) {
    lines.push("Goals advanced:");
    goals.slice(0, 5).forEach((g) => lines.push(`  - ${g.goal.title} — ${g.closed} ${plural(g.closed, "task")}`));
  }
  const books = bookEvidence(days, src);
  if (books.length) {
    lines.push("Books:");
    books.slice(0, 5).forEach((b) =>
      lines.push(`  - ${b.book.title} — ${b.pages} pages, now ${b.progress}%${b.finishedOn ? " (finished)" : ""}`));
  }
  const habits = habitRows(days, src.habits, src.habitLogs, weekStartDay);
  if (habits.length) {
    lines.push("Habits:");
    habits.forEach((h) =>
      lines.push(`  - ${h.habit.name} — ${h.hit}/${h.due} (${pct(h.hit, h.due)}%) · ${cadenceLabel(h.habit, (i) => dayNameOf(i))}`));
  }
  const sinks = timeSinks(days, src.focusSessions, src.tasks);
  if (sinks.slices.length) {
    lines.push(`Biggest time sinks (${sinks.basis}):`);
    sinks.slices.slice(0, 3).forEach((s, i) =>
      lines.push(`  ${i + 1}. ${s.label} — ${formatHours(s.minutes)} (${Math.round(s.share * 100)}%)`));
  }
  const tags = focusByTag(days, src.focusSessions, src.tasks);
  if (tags.length) {
    lines.push(`Focus by tag: ${tags.slice(0, 5).map((t) => `${t.label} ${formatHours(t.minutes)}`).join(", ")}`);
  }
  return lines;
}
