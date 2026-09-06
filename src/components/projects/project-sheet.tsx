"use client";

import * as React from "react";
import { Ban, CircleCheck, Lightbulb, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { daysBetween, diffDays, formatDate, todayISO } from "@/lib/date";
import type { Project, ProjectStatus } from "@/lib/types";
import {
  AutoTextarea, Button, IconButton, Progress, Segmented,
} from "@/components/ui/primitives";
import { Select } from "@/components/ui/form";
import { MenuItem, Popover, Sheet, SheetMaximize } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { TaskList } from "@/components/tasks/task-list";
import { Fold, useFold } from "./fold";
import { FlagLine, IdentityPicker, ProjectMenu } from "./project-card";
import { ProjectMilestones } from "./project-milestones";
import { ProjectNotes } from "./project-notes";
import {
  dueLabel, formatRange, pct, projectAttention, STATUS_LABEL,
  type ProjectIndex,
} from "./project-model";

const STATUS_TONE: Record<ProjectStatus, string> = {
  idea: "text-ink-2",
  active: "text-ink-2",
  paused: "text-ink-2",
  done: "text-success",
  dropped: "text-ink-4",
};

const STATUS_ICON: Record<ProjectStatus, React.ComponentType<{ className?: string }>> = {
  idea: Lightbulb, active: Play, paused: Pause, done: CircleCheck, dropped: Ban,
};

/** Only mark days when the range is short enough for dots to mean anything. */
function rangeMarkers(project: Project): Set<string> | undefined {
  const { start_date: start, due_date: end } = project;
  if (!start || !end || end < start) return undefined;
  if (diffDays(end, start) > 400) return undefined;
  return new Set(daysBetween(start, end));
}

export function ProjectSheet({
  projectId, index, onClose,
}: {
  projectId: string | null;
  index: ProjectIndex;
  onClose: () => void;
}) {
  const project = useStore(
    (s) => (projectId ? s.projects.find((p) => p.id === projectId) ?? null : null),
  );

  return (
    <Sheet open={!!project} onClose={onClose} width={520} resizeKey="project">
      {project && (
        <ProjectSheetBody key={project.id} project={project} index={index} onClose={onClose} />
      )}
    </Sheet>
  );
}

/**
 * Everything about one project, in the order it is asked about: what it is and
 * how far along, then when, then the work itself. Only the work is open on
 * arrival — the folds say their totals on the line, so nothing has to be
 * opened to be known.
 */
function ProjectSheetBody({
  project, index, onClose,
}: {
  project: Project;
  index: ProjectIndex;
  onClose: () => void;
}) {
  const patch = useStore((s) => s.patch);
  const goals = useStore((s) => s.goals);
  const allTasks = useStore((s) => s.tasks);
  const allNotes = useStore((s) => s.notes);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const stats = index.stats(project.id);
  const flags = React.useMemo(() => projectAttention(project, stats), [project, stats]);

  const [name, setName] = React.useState(project.name);
  const [brief, setBrief] = React.useState(project.description ?? "");
  const [dateMode, setDateMode] = React.useState<"start" | "due">("start");

  const plan = useFold("sheet.plan", false);
  const milestones = useFold("sheet.milestones", false);
  const notes = useFold("sheet.notes", false);

  // The list is the work; milestones are the checkpoints and have their own
  // panel, so showing them in both places would say the same thing twice.
  const tasks = React.useMemo(
    () => allTasks.filter((t) => t.project_id === project.id && !t.parent_id && t.kind !== "milestone"),
    [allTasks, project.id],
  );
  const milestoneTasks = React.useMemo(
    () => allTasks.filter((t) => t.project_id === project.id && t.kind === "milestone"),
    [allTasks, project.id],
  );
  const projectNotes = React.useMemo(
    () => allNotes.filter((n) => n.project_id === project.id),
    [allNotes, project.id],
  );

  const goalOptions = React.useMemo(() => [
    { value: "", label: <span className="text-ink-4">Not linked</span> },
    ...goals
      .filter((g) => g.status === "active" || g.id === project.goal_id)
      .map((g) => ({ value: g.id, label: g.title || "Untitled goal" })),
  ], [goals, project.goal_id]);

  const markers = React.useMemo(() => rangeMarkers(project), [project]);
  const due = dueLabel(project);

  function pickDate(iso: string) {
    if (dateMode === "start") {
      const due = project.due_date && project.due_date < iso ? iso : project.due_date;
      patch("projects", project.id, { start_date: iso, due_date: due ?? null });
      setDateMode("due");
    } else {
      const start = project.start_date && project.start_date > iso ? iso : project.start_date;
      patch("projects", project.id, { due_date: iso, start_date: start ?? null });
    }
  }

  const StatusIcon = STATUS_ICON[project.status];

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-1.5 px-3 hairline-b">
        <IdentityPicker project={project} />

        <Popover
          className="w-[176px]"
          trigger={
            <Button size="xs" variant="subtle" className={cn("gap-1.5", STATUS_TONE[project.status])}>
              <StatusIcon className="size-3" />
              {STATUS_LABEL[project.status]}
            </Button>
          }
        >
          {(close) => (
            <>
              {(["idea", "active", "paused", "done", "dropped"] as ProjectStatus[]).map((status) => {
                const Icon = STATUS_ICON[status];
                return (
                  <MenuItem
                    key={status}
                    icon={Icon}
                    checked={project.status === status}
                    onClick={() => { patch("projects", project.id, { status }); close(); }}
                  >
                    {STATUS_LABEL[status]}
                  </MenuItem>
                );
              })}
            </>
          )}
        </Popover>

        <div className="flex-1" />
        <ProjectMenu project={project} onDeleted={onClose} />
        <SheetMaximize />
        <IconButton label="Close project" onClick={onClose}>
          <X />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-6">
        {/* ================= What it is ================= */}
        <div className="space-y-5">
          <div>
            <AutoTextarea
              value={name}
              onChange={setName}
              aria-label="Project name"
              onBlur={() => {
                const next = name.trim();
                if (next !== project.name) patch("projects", project.id, { name: next });
              }}
              placeholder="Name this project"
              className="text-[19px] font-semibold leading-[1.28] tracking-[-0.01em] text-ink placeholder:text-ink-4"
            />
            <FlagLine flags={flags} className="mt-2" />
          </div>

          {/* The bar is the gauge and the line is the fact — the percentage that
              would state it a third time is only in the tooltip. */}
          <div title={`${pct(stats.progress)} complete`}>
            <Progress
              value={stats.done}
              max={Math.max(1, stats.total)}
              tint={project.color}
              height={5}
            />
            <p className="mt-1.5 text-[12.5px] text-ink-3 tnum">
              {stats.total === 0 ? (
                "Nothing to do yet"
              ) : (
                <>
                  <span className="font-medium text-ink">{stats.done}</span> of {stats.total} tasks done
                </>
              )}
              {due && <span className="text-ink-4"> · {due}</span>}
            </p>
          </div>

          <div>
            <span className="text-[12px] font-medium text-ink-3">What done looks like</span>
            <AutoTextarea
              value={brief}
              onChange={setBrief}
              aria-label="What done looks like"
              onBlur={() => {
                const next = brief.trim();
                if (next !== (project.description ?? "")) {
                  patch("projects", project.id, { description: next || null });
                }
              }}
              placeholder="The sentence you will be able to say when this project is finished."
              className="mt-1 text-[13.5px] text-ink-2 placeholder:text-ink-4"
            />
          </div>

          <Fold
            id="project-sheet-plan"
            label="Dates and goal"
            summary={
              [
                formatRange(project.start_date, project.due_date) ?? "no dates",
                project.goal_id
                  ? goals.find((g) => g.id === project.goal_id)?.title ?? null
                  : null,
              ].filter(Boolean).join(" · ")
            }
            open={plan.open}
            onToggle={plan.toggle}
          >
            <div className="space-y-3 pb-1">
              <div className="flex items-center gap-2">
                <Segmented
                  size="sm"
                  value={dateMode}
                  onChange={setDateMode}
                  options={[
                    {
                      value: "start" as const,
                      label: project.start_date
                        ? formatDate(project.start_date, { weekday: false })
                        : "Start",
                    },
                    {
                      value: "due" as const,
                      label: project.due_date
                        ? formatDate(project.due_date, { weekday: false })
                        : "Due",
                    },
                  ]}
                />
                {(project.start_date || project.due_date) && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => patch("projects", project.id, { start_date: null, due_date: null })}
                  >
                    Clear
                  </Button>
                )}
              </div>

              <MiniCalendar
                value={(dateMode === "start" ? project.start_date : project.due_date) ?? todayISO()}
                onChange={pickDate}
                weekStart={weekStart}
                markers={markers}
              />

              <Select
                label="Part of"
                size="sm"
                value={project.goal_id ?? ""}
                options={goalOptions}
                onChange={(id) => patch("projects", project.id, { goal_id: id || null })}
              />
            </div>
          </Fold>
        </div>

        {/* ================= The work ================= */}
        <section>
          <div className="mb-1 flex items-baseline gap-2">
            <h2 className="text-[12.5px] font-medium text-ink-2">Tasks</h2>
            {stats.open > 0 && (
              <span className="text-[12px] text-ink-4 tnum">{stats.open} open</span>
            )}
          </div>
          <TaskList
            tasks={tasks}
            showDate
            composer
            composerDefaults={{ project_id: project.id, color: project.color, goal_id: project.goal_id }}
            emptyTitle="No tasks yet"
            emptyDescription="Add the first thing that has to happen. Everything you add here shows up on the calendar and counts towards this project."
            controls={tasks.length >= 6}
          />
        </section>

        <Fold
          id="project-sheet-milestones"
          label="Milestones"
          summary={
            stats.milestoneTotal
              ? `${stats.milestoneDone} of ${stats.milestoneTotal} reached`
              : "none yet"
          }
          open={milestones.open}
          onToggle={milestones.toggle}
        >
          <ProjectMilestones project={project} milestones={milestoneTasks} />
        </Fold>

        <Fold
          id="project-sheet-notes"
          label="Notes"
          summary={
            projectNotes.length
              ? `${projectNotes.length} ${projectNotes.length === 1 ? "note" : "notes"}`
              : "nothing written down"
          }
          open={notes.open}
          onToggle={notes.toggle}
        >
          <ProjectNotes project={project} notes={projectNotes} />
        </Fold>
      </div>
    </div>
  );
}
