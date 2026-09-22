"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { UMR_META, type UmrCategory, type UmrEntry } from "@/lib/umr";
import { MiniEmpty } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";
import { CategoryPicker } from "./category-picker";
import { fmtMin } from "./derive";

// =========================================================
// Time that was recorded but that nothing has said the kind of.
//
// This list is the reason `taskCategory` returns null instead of guessing. A
// guess would look settled and be wrong; a null shows up here, is fixed in one
// click, and — because the click writes the category onto the task or the
// habit itself — never has to be fixed again.
// =========================================================

interface Row {
  key: string;
  label: string;
  minutes: number;
  entries: UmrEntry[];
  /** the task or habit to write the answer onto, when there is one */
  target: { kind: "task" | "habit"; id: string } | null;
}

function groupRows(entries: UmrEntry[]): Row[] {
  const by = new Map<string, Row>();
  for (const e of entries) {
    if (e.category) continue;
    // Sessions answer through their task, so a task and its sittings are one
    // row — fixing it once fixes both.
    const target: Row["target"] =
      e.source === "task" || e.source === "session"
        ? e.sourceId && e.source === "task" ? { kind: "task", id: e.sourceId } : null
        : e.source === "habit" && e.sourceId ? { kind: "habit", id: e.sourceId } : null;

    const key = target ? `${target.kind}:${target.id}` : `label:${e.label.toLowerCase()}`;
    const hit = by.get(key);
    if (hit) {
      hit.minutes += e.minutes;
      hit.entries.push(e);
    } else {
      by.set(key, { key, label: e.label, minutes: e.minutes, entries: [e], target });
    }
  }
  return [...by.values()].sort((a, b) => b.minutes - a.minutes);
}

/**
 * A session inherits from its task, so an untargeted session row has to find
 * the task behind it before it can be answered.
 */
function targetOf(row: Row, taskIdOf: (sessionId: string) => string | null): Row["target"] {
  if (row.target) return row.target;
  for (const e of row.entries) {
    if (e.source === "session" && e.sourceId) {
      const taskId = taskIdOf(e.sourceId);
      if (taskId) return { kind: "task", id: taskId };
    }
  }
  return null;
}

export function UmrTriage({
  entries, className, limit = 6,
}: {
  entries: UmrEntry[];
  className?: string;
  limit?: number;
}) {
  const sessions = useStore((s) => s.focusSessions);
  const setTaskUmr = useStore((s) => s.setTaskUmr);
  const setHabitUmr = useStore((s) => s.setHabitUmr);
  const toast = useStore((s) => s.toast);
  const [expanded, setExpanded] = React.useState(false);

  const taskIdOf = React.useCallback(
    (sessionId: string) => sessions.find((s) => s.id === sessionId)?.task_id ?? null,
    [sessions],
  );

  const rows = React.useMemo(() => groupRows(entries), [entries]);
  const total = rows.reduce((n, r) => n + r.minutes, 0);
  const visible = expanded ? rows : rows.slice(0, limit);

  function assign(row: Row, category: UmrCategory) {
    const target = targetOf(row, taskIdOf);
    if (!target) {
      toast({
        title: "Nothing to write it on",
        description: "This time came from a source that carries no category of its own. Set a rule in Settings → Umr instead.",
      });
      return;
    }
    if (target.kind === "task") setTaskUmr(target.id, category);
    else setHabitUmr(target.id, category);
    toast({
      title: `${row.label} is ${UMR_META[category].label}`,
      description: `${fmtMin(row.minutes)} moved, and it will answer the same way next time.`,
      tone: "success",
    });
  }

  if (rows.length === 0) {
    return (
      <div className={cn("surface p-3.5", className)}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
          <p className="text-[12.5px] text-ink-2">Every recorded minute has a kind.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("surface p-3.5", className)}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-[12.5px] font-medium text-ink">Uncategorised</h2>
        <p className="min-w-0 flex-1 truncate text-[11.5px] text-ink-4 tnum">
          {fmtMin(total)} across {rows.length} {rows.length === 1 ? "thing" : "things"} · answering once
          teaches it
        </p>
      </div>

      {visible.length === 0 ? (
        <MiniEmpty className="mt-2">Nothing waiting.</MiniEmpty>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {visible.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{row.label}</p>
                <p className="text-[11px] text-ink-4 tnum">
                  {fmtMin(row.minutes)} · {row.entries.length}{" "}
                  {row.entries.length === 1 ? "entry" : "entries"}
                </p>
              </div>
              <CategoryPicker
                size="sm"
                value={null}
                onChange={(c) => { if (c) assign(row, c); }}
                label={`Kind of living for ${row.label}`}
              />
            </li>
          ))}
        </ul>
      )}

      {rows.length > limit && (
        <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </Button>
      )}
    </div>
  );
}
