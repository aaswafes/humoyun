"use client";

import * as React from "react";
import {
  Ban, CircleCheck, Copy, Ellipsis, Lightbulb, Pause, Play, Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Project, ProjectStatus } from "@/lib/types";
import { Progress } from "@/components/ui/primitives";
import { DRAG_OK, DRAG_BODY_CLASS } from "@/components/ui/drag";
import {
  ConfirmDialog, MenuItem, MenuLabel, MenuSeparator, Popover, TintPicker,
} from "@/components/ui/overlays";
import { ProjectIcon, ProjectIconPicker } from "./project-icons";
import { useProjectActions } from "./use-project-actions";
import {
  dueLabel, formatRange, pct, projectAttention, STATUS_LABEL,
  type Flag, type ProjectStats,
} from "./project-model";

const STATUS_ICON: Record<ProjectStatus, React.ComponentType<{ className?: string }>> = {
  idea: Lightbulb, active: Play, paused: Pause, done: CircleCheck, dropped: Ban,
};

/** The mark that stands in for a project everywhere on this surface. */
export function ProjectDot({ project, className }: { project: Project; className?: string }) {
  if (project.status === "done") {
    return <CircleCheck className={cn("size-3.5 shrink-0 text-success", className)} />;
  }
  if (project.status === "paused") {
    return <Pause className={cn("size-3.5 shrink-0 text-ink-3", className)} />;
  }
  if (project.status === "dropped") {
    return <Ban className={cn("size-3.5 shrink-0 text-ink-4", className)} />;
  }
  if (project.icon) {
    return (
      <span className={cn(`tint-${project.color}`, "shrink-0", className)}>
        <ProjectIcon name={project.icon} className="size-3.5 text-[var(--tint)]" />
      </span>
    );
  }
  return (
    <span
      className={cn(`tint-${project.color}`, "size-2.5 shrink-0 rounded-full", className)}
      style={{ background: "var(--tint)" }}
      aria-hidden
    />
  );
}

/**
 * The identity of a thing is edited from the thing itself, not from a form
 * somewhere else.
 */
export function IdentityPicker({ project }: { project: Project }) {
  const patch = useStore((s) => s.patch);
  return (
    <Popover
      align="start"
      className="w-[236px]"
      trigger={
        <button
          type="button"
          aria-label={`Icon and colour for ${project.name || "project"}`}
          title="Icon and colour"
          className="relative z-[1] -m-1 grid size-6 place-items-center rounded-md p-1 cursor-pointer transition-colors hover:bg-hover"
        >
          <ProjectDot project={project} />
        </button>
      }
    >
      <>
        <MenuLabel>Icon</MenuLabel>
        <ProjectIconPicker
          value={project.icon}
          onChange={(icon) => patch("projects", project.id, { icon })}
        />
        <MenuSeparator />
        <MenuLabel>Colour</MenuLabel>
        <TintPicker
          value={project.color}
          onChange={(t) => { if (t) patch("projects", project.id, { color: t }); }}
        />
      </>
    </Popover>
  );
}

/**
 * State as a line of text rather than a wall of pills. Only a date that has
 * already passed spends colour — everything else is information, and
 * information is grey.
 */
export function FlagLine({ flags, className }: { flags: Flag[]; className?: string }) {
  if (!flags.length) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]", className)}>
      {flags.map((flag) => (
        <span
          key={flag.key}
          className={cn(
            "tnum",
            flag.tone === "danger" ? "font-medium text-danger"
              : flag.tone === "warn" ? "text-warn"
                : "text-ink-4",
          )}
        >
          {flag.label}
        </span>
      ))}
    </p>
  );
}

/** Status moves, duplicate and delete — the same menu on every surface. */
export function ProjectMenu({
  project, onOpen, onDeleted, extra,
}: {
  project: Project;
  onOpen?: (id: string) => void;
  onDeleted?: () => void;
  extra?: (close: () => void) => React.ReactNode;
}) {
  const { setStatus, deleteProject, duplicateProject } = useProjectActions();
  const [confirming, setConfirming] = React.useState(false);
  const taskCount = useStore(
    (s) => s.tasks.filter((t) => t.project_id === project.id && !t.parent_id).length,
  );

  return (
    <>
      <Popover
        align="end"
        className="w-[212px]"
        trigger={
          <button
            aria-label={`Actions for ${project.name || "project"}`}
            className="relative z-[1] grid size-6 place-items-center rounded-md text-ink-4 cursor-pointer transition-colors hover:bg-hover hover:text-ink-2"
          >
            <Ellipsis className="size-4" />
          </button>
        }
      >
        {(close) => (
          <>
            <MenuLabel>Move to</MenuLabel>
            {(["idea", "active", "paused", "done", "dropped"] as ProjectStatus[]).map((status) => {
              const Icon = STATUS_ICON[status];
              return (
                <MenuItem
                  key={status}
                  icon={Icon}
                  checked={project.status === status}
                  onClick={() => { setStatus(project, status); close(); }}
                >
                  {STATUS_LABEL[status]}
                </MenuItem>
              );
            })}
            <MenuSeparator />
            {extra?.(close)}
            <MenuItem
              icon={Copy}
              onClick={() => {
                const copy = duplicateProject(project);
                close();
                onOpen?.(copy.id);
              }}
            >
              Duplicate
            </MenuItem>
            <MenuItem icon={Trash2} danger onClick={() => { setConfirming(true); close(); }}>
              Delete
            </MenuItem>
          </>
        )}
      </Popover>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => { deleteProject(project); onDeleted?.(); }}
        title={`Delete ${project.name || "this project"}?`}
        description={
          taskCount
            ? `Its ${taskCount} task${taskCount === 1 ? "" : "s"} stay where they are — only the project goes.`
            : "Nothing else is affected."
        }
      />
    </>
  );
}

export interface ProjectCardProps {
  project: Project;
  stats: ProjectStats;
  onOpen: (id: string) => void;
  dragHandle?: React.ReactNode;
  /** pointer-only drag activation, so the card can be grabbed by the card */
  dragProps?: { onPointerDown?: React.PointerEventHandler<HTMLElement> };
  dragging?: boolean;
  className?: string;
}

/**
 * What a column of projects is scanned for: the name, how far along, and
 * whether it is in trouble. The bar is the gauge and the count is the fact —
 * the percentage that would state it a third time lives in the tooltip.
 */
export function ProjectCard({
  project, stats, onOpen, dragHandle, dragProps, dragging, className,
}: ProjectCardProps) {
  const patch = useStore((s) => s.patch);
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState(project.name);
  const renameRef = React.useRef<HTMLInputElement>(null);

  // The name can be edited from the sheet while this card is mounted. Adjusting
  // during render is React's own answer to derived state — an effect here would
  // paint the stale name first, then correct it.
  const [seen, setSeen] = React.useState(project.name);
  if (seen !== project.name) {
    setSeen(project.name);
    setDraft(project.name);
  }

  React.useEffect(() => {
    if (renaming) { renameRef.current?.focus(); renameRef.current?.select(); }
  }, [renaming]);

  const commitRename = React.useCallback(() => {
    setRenaming(false);
    const next = draft.trim();
    if (next !== project.name) patch("projects", project.id, { name: next });
  }, [draft, patch, project.id, project.name]);

  const flags = React.useMemo(() => projectAttention(project, stats), [project, stats]);
  const due = dueLabel(project);
  // The line below the bar already carries the date, and stands in for the
  // task count when there is none — so neither is repeated as a flag.
  const rest = flags.filter((f) => (
    f.key !== "late" && f.key !== "soon"
    && !(f.key === "empty" && !due)
  ));
  const dueTone = flags.find((f) => f.key === "late")
    ? "text-danger"
    : flags.find((f) => f.key === "soon") ? "text-warn" : "";
  const range = formatRange(stats.start, stats.end);

  const summary = [
    STATUS_LABEL[project.status],
    stats.total ? `${stats.done} of ${stats.total} tasks · ${pct(stats.progress)}` : "no tasks yet",
    range,
    stats.nextMilestone ? `next: ${stats.nextMilestone.title}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      data-project-card={project.id}
      title={summary}
      {...dragProps}
      className={cn(
        "group/project relative rounded-lg border border-line bg-raised p-3",
        "transition-[background-color,border-color,opacity] duration-200 ease-[var(--ease-out-apple)]",
        "hover:border-line-strong hover:bg-hover focus-within:border-line-strong",
        dragProps?.onPointerDown && DRAG_BODY_CLASS,
        project.status === "dropped" && "opacity-60",
        dragging && "opacity-40",
        className,
      )}
    >
      {dragHandle && <div className="absolute -left-[26px] top-2 z-[2]">{dragHandle}</div>}

      <div className="flex items-start gap-2">
        <span className="mt-[2px]"><IdentityPicker project={project} /></span>

        {renaming ? (
          <input
            ref={renameRef}
            value={draft}
            aria-label="Project name"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { setDraft(project.name); setRenaming(false); }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="relative z-[1] min-w-0 flex-1 rounded-sm bg-hover px-1 -mx-1 text-[13.5px] font-medium leading-[1.35] text-ink outline-none"
          />
        ) : (
          <button
            {...DRAG_OK}
            onClick={() => onOpen(project.id)}
            onDoubleClick={(e) => { e.preventDefault(); setRenaming(true); }}
            className={cn(
              "min-w-0 flex-1 text-left text-[13.5px] font-medium leading-[1.35] cursor-pointer",
              project.name ? "text-ink" : "text-ink-4",
              project.status === "done" && "text-ink-2",
            )}
          >
            {project.name || "Untitled project"}
          </button>
        )}

        <span className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/project:opacity-100">
          <ProjectMenu project={project} onOpen={onOpen} />
        </span>
      </div>

      <div className="mt-2.5 pl-[22px]">
        {stats.total > 0 ? (
          <>
            <Progress
              value={stats.done}
              max={stats.total}
              tint={project.color}
              className="mb-1.5"
            />
            <p className="flex items-baseline gap-1.5 text-[11.5px] text-ink-4">
              <span className="tnum">
                <span className="font-medium text-ink-3">{stats.done}</span> of {stats.total}
              </span>
              {due && <span className={cn("tnum", dueTone)}>· {due}</span>}
            </p>
          </>
        ) : (
          <p className={cn("text-[11.5px] text-ink-4", due && dueTone)}>{due ?? "No tasks yet"}</p>
        )}

        <FlagLine flags={rest} className="mt-1" />
      </div>
    </div>
  );
}
