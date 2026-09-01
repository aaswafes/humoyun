"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/date";
import type { Project } from "@/lib/types";
import { Progress } from "@/components/ui/primitives";
import { ProjectDot, ProjectMenu } from "./project-card";
import {
  dueLabel, projectAttention, sortProjects, STATUS_LABEL, type ProjectIndex,
} from "./project-model";

/** Rows past this stay behind one click — the contract's windowing floor. */
const PAGE = 60;

function Row({
  project, index, onOpen,
}: {
  project: Project;
  index: ProjectIndex;
  onOpen: (id: string) => void;
}) {
  const goals = useStore((s) => s.goals);
  const stats = index.stats(project.id);
  const goal = project.goal_id ? goals.find((g) => g.id === project.goal_id) : null;
  const flags = projectAttention(project, stats);
  const late = flags.some((f) => f.key === "late");
  const soon = flags.some((f) => f.key === "soon");
  const due = dueLabel(project);

  return (
    <tr className="group/row border-b border-line last:border-0 hover:bg-hover">
      <td className="py-1.5 pl-2 pr-3">
        <span className="flex min-w-0 items-center gap-2">
          <ProjectDot project={project} />
          <button
            onClick={() => onOpen(project.id)}
            className={cn(
              "min-w-0 flex-1 truncate text-left text-[13px] cursor-pointer",
              project.name ? "text-ink" : "text-ink-4",
            )}
          >
            {project.name || "Untitled project"}
          </button>
        </span>
      </td>

      <td className="px-3 py-1.5 text-[12px] text-ink-3">{STATUS_LABEL[project.status]}</td>

      <td className="px-3 py-1.5">
        {stats.total > 0 ? (
          <span className="flex items-center gap-2">
            <Progress
              value={stats.done}
              max={stats.total}
              tint={project.color}
              className="w-[68px]"
            />
            <span className="text-[12px] text-ink-3 tnum">
              {stats.done}/{stats.total}
            </span>
          </span>
        ) : (
          <span className="text-[12px] text-ink-4">—</span>
        )}
      </td>

      <td
        className={cn(
          "px-3 py-1.5 text-[12px] tnum",
          late ? "font-medium text-danger" : soon ? "text-warn" : "text-ink-3",
        )}
      >
        {due ?? (project.due_date ? formatDate(project.due_date, { weekday: false }) : "—")}
      </td>

      <td className="max-w-[180px] truncate px-3 py-1.5 text-[12px] text-ink-4">
        {goal?.title ?? "—"}
      </td>

      <td className="w-8 pr-2">
        <span className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/row:opacity-100">
          <ProjectMenu project={project} onOpen={onOpen} />
        </span>
      </td>
    </tr>
  );
}

/**
 * Every project on one screen, in the order you would triage them: what is
 * running, then what is due soonest. The board answers "what stage is this
 * at"; this answers "what is the state of everything".
 */
export function ProjectList({
  projects, index, onOpen,
}: {
  projects: Project[];
  index: ProjectIndex;
  onOpen: (id: string) => void;
}) {
  const [limit, setLimit] = React.useState(PAGE);
  const ordered = React.useMemo(() => sortProjects(projects), [projects]);
  const shown = ordered.slice(0, limit);

  return (
    <div className="max-w-[1000px]">
      <div className="overflow-x-auto surface">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-left">
              {["Project", "Status", "Progress", "Due", "Goal"].map((head) => (
                <th
                  key={head}
                  scope="col"
                  className={cn(
                    "py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4",
                    head === "Project" ? "pl-2 pr-3" : "px-3",
                  )}
                >
                  {head}
                </th>
              ))}
              <th scope="col" className="w-8">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((project) => (
              <Row key={project.id} project={project} index={index} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      </div>

      {ordered.length > limit && (
        <button
          onClick={() => setLimit((n) => n + PAGE)}
          className="mt-2 h-7 rounded-md px-2 text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
        >
          Show {Math.min(PAGE, ordered.length - limit)} more
        </button>
      )}
    </div>
  );
}
