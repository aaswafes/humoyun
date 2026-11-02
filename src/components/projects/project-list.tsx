"use client";

import * as React from "react";
import { Target } from "lucide-react";
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

// =========================================================
// Below md the table is not a table. Five columns in 360px leave the due date
// and the goal off the right-hand edge, so each row folds into lines: the
// name, then "status · progress · due", then the goal. The header row goes —
// the values say what they are — and a cell with nothing to say ("—") is
// dropped instead of drawn. One DOM for both, so every row still has exactly
// one menu.
//
// Each cell carries `md:touch:py-2.5` too: on an iPad the table stays, and its
// rows grow to a fingertip instead.
// =========================================================

/** A phone row's second-line cells, after the first: a quiet "·" before each. */
const PHONE_FOLLOWER =
  "max-md:flex max-md:items-center max-md:before:px-1.5 max-md:before:text-ink-4 max-md:before:content-['·']";

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
  const dueText = due ?? (project.due_date ? formatDate(project.due_date, { weekday: false }) : null);

  return (
    <tr
      className={cn(
        "group/row border-b border-line last:border-0 hover:bg-hover",
        "max-md:relative max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-y-1 max-md:py-2.5 max-md:pl-3 max-md:pr-12",
        "touch:active:bg-hover",
      )}
    >
      <td className="py-1.5 pl-2 pr-3 max-md:basis-full max-md:p-0 md:touch:relative md:touch:py-2.5">
        <span className="flex min-w-0 items-center gap-2 max-md:items-start">
          {/* On a phone the mark sits on the name's first line, which may not
              be its only one. `contents` leaves the desktop's box tree as it was. */}
          <span className="contents max-md:flex max-md:h-5 max-md:shrink-0 max-md:items-center">
            <ProjectDot project={project} />
          </span>
          <button
            onClick={() => onOpen(project.id)}
            className={cn(
              "min-w-0 flex-1 truncate text-left text-[13px] cursor-pointer",
              // A phone row is the name's alone: a long one wraps, like the
              // board's cards, instead of losing its end to an ellipsis.
              "max-md:whitespace-normal",
              // On touch the name answers for its whole row — for its cell
              // on an iPad, whose table rows cannot anchor it. The menu sits
              // above it (z-[1]).
              "touch:after:absolute touch:after:inset-0",
              project.name ? "text-ink" : "text-ink-4",
            )}
          >
            {project.name || "Untitled project"}
          </button>
        </span>
      </td>

      <td className="px-3 py-1.5 text-[12px] text-ink-3 max-md:p-0 max-md:pl-[22px] md:touch:py-2.5">
        {STATUS_LABEL[project.status]}
      </td>

      <td className={cn("px-3 py-1.5 max-md:p-0 md:touch:py-2.5", PHONE_FOLLOWER, stats.total === 0 && "max-md:hidden")}>
        {stats.total > 0 ? (
          <span className="flex items-center gap-2">
            <Progress
              value={stats.done}
              max={stats.total}
              tint={project.color}
              className="w-[68px] max-md:w-12"
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
          "px-3 py-1.5 text-[12px] tnum max-md:p-0 md:touch:py-2.5",
          PHONE_FOLLOWER,
          late ? "font-medium text-danger" : soon ? "text-warn" : "text-ink-3",
          !dueText && "max-md:hidden",
        )}
      >
        {dueText ?? "—"}
      </td>

      <td
        className={cn(
          "max-w-[180px] truncate px-3 py-1.5 text-[12px] text-ink-4 md:touch:py-2.5",
          "max-md:max-w-none max-md:basis-full max-md:p-0 max-md:pl-[22px]",
          !goal && "max-md:hidden",
        )}
      >
        {/* Without its column header the goal needs its own mark. */}
        <Target aria-hidden className="mr-1 hidden size-3 align-[-1.5px] max-md:inline-block" />
        {goal?.title ?? "—"}
      </td>

      <td className="w-8 pr-2 max-md:absolute max-md:right-2.5 max-md:top-2 max-md:w-auto max-md:p-0">
        <span className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/row:opacity-100 touch:opacity-100">
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
      <div className="overflow-x-auto overscroll-x-contain surface">
        <table className="w-full border-collapse max-md:block">
          <thead className="max-md:hidden">
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
          <tbody className="max-md:block">
            {shown.map((project) => (
              <Row key={project.id} project={project} index={index} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      </div>

      {ordered.length > limit && (
        <button
          onClick={() => setLimit((n) => n + PAGE)}
          className="relative mt-2 h-7 rounded-md px-2 text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors touch-hit"
        >
          Show {Math.min(PAGE, ordered.length - limit)} more
        </button>
      )}
    </div>
  );
}
