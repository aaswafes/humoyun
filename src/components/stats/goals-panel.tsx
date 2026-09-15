"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";
import { Button, EmptyState, Progress } from "@/components/ui/primitives";
import { Panel, PanelNote, pctOf, type TableSpec } from "./chart-kit";
import type { GoalSummary } from "./derive";

const SHOWN = 6;

export function GoalsPanel({ data, days }: { data: GoalSummary; days: number }) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);

  const moved = data.rows.filter((r) => r.closed > 0);
  const stalled = data.rows.filter((r) => r.goal.status === "active" && r.closed === 0);
  const visible = expanded ? data.rows : data.rows.slice(0, SHOWN);

  const summary = data.active || data.done
    ? [
        `${data.advanced} of ${data.active} active ${data.active === 1 ? "goal" : "goals"} moved in these ${days} days.`,
        stalled.length ? `${stalled.length} saw no work at all.` : "",
        data.projectsActive ? `${data.projectsActive} ${data.projectsActive === 1 ? "project is" : "projects are"} open.` : "",
        data.unattached ? `${data.unattached} closed ${data.unattached === 1 ? "task served" : "tasks served"} neither.` : "",
      ].filter(Boolean).join(" ")
    : "No goals are being tracked yet.";

  const table: TableSpec = {
    caption: "Goals, the work that moved them, and how far along they are.",
    columns: ["Goal", "Tasks closed", "Progress"],
    rows: data.rows.map((r) => [
      r.goal.title,
      r.closed,
      r.pct == null ? `${r.goal.current}${r.goal.unit ? ` ${r.goal.unit}` : ""}` : `${r.pct}%`,
    ]),
  };

  if (!data.rows.length) {
    return (
      <Panel id="panel-goals" title="Goals and projects" subtitle={summary}>
        <EmptyState
          className="py-8"
          icon={Target}
          title="Nothing to aim at yet"
          description="Set a goal, then point tasks at it. This panel then shows which goals your week actually moved and which ones have gone quiet."
          action={
            <Button variant="primary" size="sm" onClick={() => router.push("/goals")}>
              Add a goal
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <Panel id="panel-goals" title="Goals and projects" subtitle={summary} table={table}>
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          { label: "Moved", value: String(moved.length), sub: `of ${data.active} active` },
          { label: "Gone quiet", value: String(stalled.length), sub: stalled.length ? "no task closed" : "all in motion" },
          { label: "Projects open", value: String(data.projectsActive), sub: `${data.projectsDone} finished` },
          { label: "Unattached", value: String(data.unattached), sub: "closed tasks serving nothing" },
        ].map((cell) => (
          <div key={cell.label} className="min-w-0">
            <div className="text-[11.5px] text-ink-3">{cell.label}</div>
            <div className="display-serif mt-1 text-[22px] leading-none text-ink tnum">{cell.value}</div>
            <p className="mt-1 truncate text-[11px] text-ink-4 tnum">{cell.sub}</p>
          </div>
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {visible.map((r) => (
          <li key={r.goal.id} className={cn(`tint-${r.goal.color}`, "min-w-0")}>
            <div className="flex items-baseline gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--tint)" }} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{r.goal.title}</span>
              {/* Quiet, not alarming: a goal nothing touched is information. */}
              <span className="shrink-0 text-[11.5px] text-ink-3 tnum">
                {r.closed ? `${r.closed} closed` : "no work"}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 pl-4">
              <Progress
                value={r.pct ?? pctOf(r.closed, Math.max(1, r.closed))}
                max={100}
                tint={r.goal.color}
                height={3}
                className="flex-1"
              />
              <span className="shrink-0 text-[11px] text-ink-4 tnum">
                {r.pct != null
                  ? `${r.pct}%`
                  : r.goal.unit
                    ? `${r.goal.current} ${r.goal.unit}`
                    : r.goal.horizon}
                {r.overdue && r.goal.end_date && ` · due ${formatDate(r.goal.end_date, { weekday: false })}`}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {data.rows.length > SHOWN && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-3"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show fewer" : `Show all ${data.rows.length} goals`}
        </Button>
      )}

      <PanelNote>
        A goal counts as moved when a top-level task pointing at it was closed inside this window.
        Progress is whatever the goal itself carries, so a goal with no target shows its own count
        rather than a percentage invented for the chart.
      </PanelNote>
    </Panel>
  );
}
