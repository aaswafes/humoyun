"use client";

import * as React from "react";
import { ChevronDown, Circle, Crosshair, History, Search, Tag, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { friendlyDate, todayISO } from "@/lib/date";
import type { Task } from "@/lib/types";
import { Popover, MenuItem, MenuSeparator, MenuLabel } from "@/components/ui/overlays";
import type { FocusSubject } from "./focus-engine";

const PILL =
  "inline-flex h-7 max-w-[300px] items-center gap-1.5 rounded-full border border-line px-2.5 text-[12.5px]";

const FIELD =
  "flex h-8 w-full items-center gap-1.5 rounded-md border border-line bg-raised px-2 text-left text-[13px]";

/** Overdue and today first, then what is coming, then the inbox. */
function rankOf(task: Task, today: string): number {
  if (task.date === today) return 0;
  if (task.date && task.date < today) return 1;
  if (!task.date) return 2;
  return 3;
}

export function SubjectPicker({
  value,
  onChange,
  locked,
  variant = "pill",
  id,
  className,
  emptyLabel = "Open focus",
  "aria-describedby": describedBy,
}: {
  value: FocusSubject;
  onChange: (next: FocusSubject) => void;
  locked?: boolean;
  variant?: "pill" | "field";
  id?: string;
  className?: string;
  emptyLabel?: string;
  "aria-describedby"?: string;
}) {
  const tasks = useStore((s) => s.tasks);
  const sessions = useStore((s) => s.focusSessions);
  const [query, setQuery] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);

  const task = value.taskId ? tasks.find((t) => t.id === value.taskId) ?? null : null;
  const title = task?.title || value.label || emptyLabel;

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

  /** Labels focused on before, so a recurring subject never has to be retyped. */
  const recent = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const seen: string[] = [];
    for (let i = sessions.length - 1; i >= 0 && seen.length < 4; i--) {
      const s = sessions[i];
      const label = (s.label ?? "").trim();
      if (!label || s.task_id || s.mode === "break") continue;
      if (q && !label.toLowerCase().includes(q)) continue;
      if (label.toLowerCase() === value.label.trim().toLowerCase()) continue;
      if (!seen.some((l) => l.toLowerCase() === label.toLowerCase())) seen.push(label);
    }
    return seen;
  }, [sessions, query, value.label]);

  if (locked) {
    return (
      <span className={cn(PILL, "text-ink-2", className)} title="The subject is fixed while a session runs">
        <Crosshair className="size-3.5 shrink-0 text-ink-3" />
        <span className="truncate">{title}</span>
      </span>
    );
  }

  const commit = (next: FocusSubject, close: () => void) => {
    onChange(next);
    close();
  };

  return (
    <Popover
      align={variant === "pill" ? "center" : "start"}
      className="w-[300px]"
      onOpenChange={(open) => { if (!open) setQuery(""); }}
      trigger={
        <button
          type="button"
          id={id}
          aria-describedby={describedBy}
          aria-haspopup="dialog"
          className={cn(
            variant === "pill" ? PILL : FIELD,
            "cursor-pointer text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink",
            variant === "field" && "hover:border-line-strong",
            className,
          )}
        >
          <Crosshair className="size-3.5 shrink-0 text-ink-3" />
          <span className={cn("min-w-0 flex-1 truncate", !task && !value.label && "text-ink-4")}>{title}</span>
          <ChevronDown className="size-3 shrink-0 text-ink-4" />
        </button>
      }
    >
      {(close) => (
        <>
          <div className="flex items-center gap-1.5 px-1.5 py-1">
            <Search className="size-3.5 shrink-0 text-ink-4" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  listRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
                  return;
                }
                if (e.key !== "Enter") return;
                e.preventDefault();
                const first = results[0];
                if (first) commit({ taskId: first.id, label: first.title }, close);
                else if (query.trim()) commit({ taskId: null, label: query.trim() }, close);
              }}
              placeholder="Search tasks, or type a label"
              aria-label="Search tasks, or type a label"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
            />
          </div>
          <MenuSeparator />

          <div ref={listRef} className="max-h-[264px] overflow-y-auto">
            {results.map((t) => (
              <MenuItem
                key={t.id}
                icon={Circle}
                checked={t.id === value.taskId}
                shortcut={t.date ? friendlyDate(t.date) : "Inbox"}
                onClick={() => commit({ taskId: t.id, label: t.title }, close)}
              >
                {t.title || "Untitled"}
              </MenuItem>
            ))}

            {!results.length && (
              <p className="px-2 py-2 text-[12.5px] text-ink-4">
                {query ? "No open task matches." : "No open tasks — focus on a label instead."}
              </p>
            )}

            {recent.length > 0 && (
              <>
                <MenuSeparator />
                <MenuLabel>Recent labels</MenuLabel>
                {recent.map((label) => (
                  <MenuItem
                    key={label}
                    icon={History}
                    onClick={() => commit({ taskId: null, label }, close)}
                  >
                    {label}
                  </MenuItem>
                ))}
              </>
            )}
          </div>

          {query.trim() && (
            <>
              <MenuSeparator />
              <MenuItem icon={Tag} onClick={() => commit({ taskId: null, label: query.trim() }, close)}>
                Focus on “{query.trim()}”
              </MenuItem>
            </>
          )}

          {(value.taskId || value.label) && (
            <>
              <MenuSeparator />
              <MenuItem icon={X} onClick={() => commit({ taskId: null, label: "" }, close)}>
                Clear subject
              </MenuItem>
            </>
          )}
        </>
      )}
    </Popover>
  );
}
