"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/cn";
import { todayISO, addDays } from "@/lib/date";
import { MiniEmpty } from "@/components/ui/form";
import { useT, type MsgKey } from "@/lib/i18n";
import { TriageRow } from "./triage-dnd";
import { useDisclosure } from "./use-disclosure";

// =========================================================
// The Eisenhower matrix.
//
// No new columns: `priority` has always been 0–3 and `date` has always been
// there. Crossing the two is what makes a long list legible — a hundred rows
// sorted by date still reads as a hundred rows, where four quadrants read as
// a decision.
//
// Urgent means the clock is already on it: overdue, today, or tomorrow. A
// task with no date is never urgent, which is the honest reading — nothing
// about it is due.
//
// Important means priority Medium or High. That is the line the priority
// control already draws, so the matrix cannot disagree with the badge on
// the row.
// =========================================================

export type Quadrant = "do" | "plan" | "quick" | "let-go";

export interface QuadrantSpec {
  key: Quadrant;
  /** Looked up at render, so the grid follows the chosen language. */
  titleKey: MsgKey;
  hintKey: MsgKey;
  /** The stripe colour. Semantic, not the accent — these mean urgency. */
  tone: "danger" | "accent" | "warn" | "muted";
}

export const QUADRANTS: QuadrantSpec[] = [
  { key: "do", titleKey: "matrix.do", hintKey: "matrix.do.hint", tone: "danger" },
  { key: "plan", titleKey: "matrix.plan", hintKey: "matrix.plan.hint", tone: "accent" },
  { key: "quick", titleKey: "matrix.quick", hintKey: "matrix.quick.hint", tone: "warn" },
  { key: "let-go", titleKey: "matrix.letGo", hintKey: "matrix.letGo.hint", tone: "muted" },
];

export function quadrantOf(task: Task, today: string): Quadrant {
  const soon = addDays(today, 1);
  const urgent = task.date != null && task.date <= soon;
  const important = task.priority >= 2;
  if (urgent && important) return "do";
  if (important) return "plan";
  if (urgent) return "quick";
  return "let-go";
}

export function splitByQuadrant(tasks: Task[], today: string): Record<Quadrant, Task[]> {
  const out: Record<Quadrant, Task[]> = { do: [], plan: [], quick: [], "let-go": [] };
  for (const task of tasks) out[quadrantOf(task, today)].push(task);
  return out;
}

const STRIPE: Record<QuadrantSpec["tone"], string> = {
  danger: "bg-danger",
  accent: "bg-accent",
  warn: "bg-warn",
  muted: "bg-line-strong",
};

export function MatrixView({ tasks, order }: { tasks: Task[]; order: string[] }) {
  const today = todayISO();
  const { t } = useT();
  const groups = React.useMemo(() => splitByQuadrant(tasks, today), [tasks, today]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {QUADRANTS.map((q) => (
        <QuadrantCard
          key={q.key}
          spec={q}
          title={t(q.titleKey)}
          hint={t(q.hintKey)}
          empty={t("matrix.nothing")}
          items={groups[q.key]}
          order={order}
        />
      ))}
    </div>
  );
}

/**
 * One quadrant. On a phone the four stack into one column, and the first can
 * hold a hundred rows — the other three were a long scroll away. So below md
 * each folds behind its header (title, hint, count: the summary a fold owes),
 * "Do first" open by default, and remembers. The desktop grid shows all four
 * in full, always: the toggle and the chevron do not exist there.
 */
function QuadrantCard({
  spec, title, hint, empty, items, order,
}: {
  spec: QuadrantSpec;
  title: string;
  hint: string;
  empty: string;
  items: Task[];
  order: string[];
}) {
  const [open, setOpen] = useDisclosure(`matrix.${spec.key}`, spec.key === "do");

  return (
    <section
      aria-label={`${title} — ${hint}, ${items.length}`}
      className="surface min-w-0 overflow-hidden"
    >
      <header className={cn("relative flex items-baseline gap-2 px-3 py-2.5 hairline-b max-md:py-3", !open && "max-md:shadow-none")}>
        <span className={cn("h-3.5 w-[3px] shrink-0 rounded-full", STRIPE[spec.tone])} aria-hidden />
        <h3 className="text-[13px] font-semibold tracking-[-0.008em] text-ink">{title}</h3>
        <span className="text-[11.5px] text-ink-3 max-md:min-w-0 max-md:truncate">{hint}</span>
        <span className="ml-auto text-[11.5px] tnum text-ink-3">{items.length}</span>
        <ChevronRight
          aria-hidden
          className={cn(
            "hidden size-3.5 shrink-0 self-center text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)] max-md:block",
            open && "rotate-90",
          )}
        />
        {/* The whole header is the fold's button on a phone; it carries no
            other control, so nothing interactive ends up nested in it. */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={`${title}, ${items.length} ${items.length === 1 ? "task" : "tasks"}`}
          className="absolute inset-0 hidden cursor-pointer rounded-t-lg transition-colors duration-150 active:bg-hover max-md:block"
        />
      </header>

      <div className={cn("px-1 py-1", !open && "max-md:hidden")}>
        {items.length === 0
          ? <MiniEmpty>{empty}</MiniEmpty>
          : items.map((task) => <TriageRow key={task.id} task={task} order={order} />)}
      </div>
    </section>
  );
}
