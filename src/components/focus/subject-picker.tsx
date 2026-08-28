"use client";

import * as React from "react";
import { ChevronDown, Circle, Crosshair, Search, Tag, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { friendlyDate, todayISO } from "@/lib/date";
import type { Task } from "@/lib/types";
import { Popover, MenuItem, MenuSeparator } from "@/components/ui/overlays";
import type { FocusSubject } from "./focus-engine";

const PILL =
  "inline-flex h-7 max-w-[300px] items-center gap-1.5 rounded-full border border-line px-2.5 text-[12.5px]";

/** Overdue and today first, then what is coming, then the inbox. */
function rankOf(task: Task, today: string): number {
  if (task.date === today) return 0;
  if (task.date && task.date < today) return 1;
  if (!task.date) return 2;
  return 3;
}

export function SubjectPicker({
  value, onChange, locked,
}: {
  value: FocusSubject;
  onChange: (next: FocusSubject) => void;
  locked?: boolean;
}) {
  const tasks = useStore((s) => s.tasks);
  const [query, setQuery] = React.useState("");

  const task = value.taskId ? tasks.find((t) => t.id === value.taskId) ?? null : null;
  const title = task?.title || value.label || "Open focus";

  const results = React.useMemo(() => {
    const today = todayISO();
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) =>
        t.status !== "done" && t.status !== "dropped" &&
        t.kind !== "habit" && t.kind !== "prayer" &&
        (!q || t.title.toLowerCase().includes(q)))
      .sort((a, b) => {
        const diff = rankOf(a, today) - rankOf(b, today);
        if (diff !== 0) return diff;
        return (a.date ?? "9999").localeCompare(b.date ?? "9999");
      })
      .slice(0, 8);
  }, [tasks, query]);

  if (locked) {
    return (
      <span className={cn(PILL, "text-ink-2")} title="The subject is fixed while a session runs">
        <Crosshair className="size-3.5 shrink-0 text-ink-3" />
        <span className="truncate">{title}</span>
      </span>
    );
  }

  return (
    <Popover
      align="center"
      className="w-[300px]"
      onOpenChange={(open) => { if (!open) setQuery(""); }}
      trigger={
        <button
          className={cn(
            PILL,
            "cursor-pointer text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink",
          )}
        >
          <Crosshair className="size-3.5 shrink-0 text-ink-3" />
          <span className="truncate">{title}</span>
          <ChevronDown className="size-3 shrink-0 text-ink-4" />
        </button>
      }
    >
      {(close) => (
        <>
          <div className="flex items-center gap-1.5 px-1.5 py-1">
            <Search className="size-3.5 shrink-0 text-ink-4" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const first = results[0];
                if (first) onChange({ taskId: first.id, label: first.title });
                else if (query.trim()) onChange({ taskId: null, label: query.trim() });
                close();
              }}
              placeholder="Search tasks, or type a label"
              aria-label="Search tasks, or type a label"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
            />
          </div>
          <MenuSeparator />

          <div className="max-h-[264px] overflow-y-auto">
            {results.map((t) => (
              <MenuItem
                key={t.id}
                icon={Circle}
                shortcut={t.date ? friendlyDate(t.date) : "Inbox"}
                onClick={() => { onChange({ taskId: t.id, label: t.title }); close(); }}
              >
                {t.title || "Untitled"}
              </MenuItem>
            ))}

            {!results.length && (
              <p className="px-2 py-2 text-[12.5px] text-ink-4">
                {query ? "No open task matches." : "No open tasks — focus on a label instead."}
              </p>
            )}
          </div>

          {query.trim() && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={Tag}
                onClick={() => { onChange({ taskId: null, label: query.trim() }); close(); }}
              >
                Focus on “{query.trim()}”
              </MenuItem>
            </>
          )}

          {(value.taskId || value.label) && (
            <>
              <MenuSeparator />
              <MenuItem icon={X} onClick={() => { onChange({ taskId: null, label: "" }); close(); }}>
                Clear subject
              </MenuItem>
            </>
          )}
        </>
      )}
    </Popover>
  );
}
