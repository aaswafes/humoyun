"use client";

import * as React from "react";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/cn";
import { todayISO, addDays } from "@/lib/date";
import { MiniEmpty } from "@/components/ui/form";
import { useT, type MsgKey } from "@/lib/i18n";
import { TriageRow } from "./triage-dnd";

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
      {QUADRANTS.map((q) => {
        const items = groups[q.key];
        const title = t(q.titleKey);
        const hint = t(q.hintKey);
        return (
          <section
            key={q.key}
            aria-label={`${title} — ${hint}, ${items.length}`}
            className="surface min-w-0 overflow-hidden"
          >
            <header className="flex items-baseline gap-2 px-3 py-2.5 hairline-b">
              <span className={cn("h-3.5 w-[3px] shrink-0 rounded-full", STRIPE[q.tone])} aria-hidden />
              <h3 className="text-[13px] font-semibold tracking-[-0.008em] text-ink">{title}</h3>
              <span className="text-[11.5px] text-ink-3">{hint}</span>
              <span className="ml-auto text-[11.5px] tnum text-ink-3">{items.length}</span>
            </header>

            <div className="px-1 py-1">
              {items.length === 0
                ? <MiniEmpty>{t("matrix.nothing")}</MiniEmpty>
                : items.map((task) => <TriageRow key={task.id} task={task} order={order} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
