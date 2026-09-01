"use client";

import * as React from "react";
import {
  Boxes, Check, ChartNoAxesGantt, Columns3, Plus, Rows3,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { ProjectStatus } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { ProjectBoard } from "@/components/projects/project-board";
import { ProjectList } from "@/components/projects/project-list";
import { ProjectSheet } from "@/components/projects/project-sheet";
import { ProjectTimeline } from "@/components/projects/project-timeline";
import { buildProjectIndex, isLive } from "@/components/projects/project-model";
import { useProjectActions } from "@/components/projects/use-project-actions";

type View = "board" | "list" | "timeline";

const VIEW_OPTIONS = [
  {
    value: "board" as const,
    label: <><Columns3 className="size-3.5" /><span className="ml-1.5 hidden sm:inline">Board</span></>,
    title: "Projects by what stage they are at",
  },
  {
    value: "list" as const,
    label: <><Rows3 className="size-3.5" /><span className="ml-1.5 hidden sm:inline">List</span></>,
    title: "Everything on one screen",
  },
  {
    value: "timeline" as const,
    label: <><ChartNoAxesGantt className="size-3.5" /><span className="ml-1.5 hidden sm:inline">Timeline</span></>,
    title: "Projects across the year",
  },
];

export default function ProjectsPage() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const ready = useStore((s) => s.ready);
  const { createProject } = useProjectActions();

  // Stages are how the work is actually thought about, so the board leads.
  const [view, setView] = React.useState<View>("board");
  const [includeClosed, setIncludeClosed] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const index = React.useMemo(
    () => buildProjectIndex(projects, tasks, notes),
    [projects, tasks, notes],
  );

  // The board draws its own Done column, so it always gets the whole set; the
  // other two views hide what is finished until asked.
  const visible = React.useMemo(
    () => (includeClosed || view === "board"
      ? projects
      : projects.filter((p) => isLive(p.status))),
    [projects, includeClosed, view],
  );

  const active = React.useMemo(() => projects.filter((p) => p.status === "active"), [projects]);
  const openTasks = React.useMemo(
    () => active.reduce((sum, p) => sum + index.stats(p.id).open, 0),
    [active, index],
  );

  const create = React.useCallback((status: ProjectStatus = "active") => {
    const project = createProject({ status });
    setOpenId(project.id);
  }, [createProject]);

  // Two facts, not five: how many are running, and how much work that is.
  const subtitle = projects.length
    ? `${active.length} active · ${openTasks} open ${openTasks === 1 ? "task" : "tasks"}`
    : "Idea · Active · Paused · Done";

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={ready ? subtitle : undefined}
        actions={
          <Button variant="primary" size="sm" onClick={() => create("active")}>
            <Plus className="size-3.5" />
            New project
          </Button>
        }
      >
        <Segmented value={view} options={VIEW_OPTIONS} onChange={setView} size="sm" className="mr-1" />
      </PageHeader>

      <PageBody wide>
        {!ready ? (
          <BoardSkeleton />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No projects yet"
            description="A goal says what you are aiming at. A project is the thing you actually build to get there — it holds the tasks, the milestones and the notes, and it ends."
            className="py-20"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="primary" onClick={() => create("active")}>
                  Start a project
                </Button>
                <Button size="sm" variant="secondary" onClick={() => create("idea")}>
                  Park an idea
                </Button>
              </div>
            }
          />
        ) : (
          <>
            {view !== "board" && (
              <div className="mb-3 flex justify-end">
                <Button
                  size="xs"
                  variant={includeClosed ? "subtle" : "ghost"}
                  onClick={() => setIncludeClosed((v) => !v)}
                  aria-pressed={includeClosed}
                >
                  <Check className={cn("size-3.5", !includeClosed && "opacity-0")} />
                  Show finished
                </Button>
              </div>
            )}

            {view === "board" && (
              <ProjectBoard
                projects={visible}
                index={index}
                onOpen={setOpenId}
                onCreate={create}
              />
            )}

            {view === "list" && (
              <ProjectList projects={visible} index={index} onOpen={setOpenId} />
            )}

            {view === "timeline" && (
              <ProjectTimeline
                projects={visible}
                index={index}
                openId={openId}
                onOpen={setOpenId}
              />
            )}
          </>
        )}
      </PageBody>

      <ProjectSheet projectId={openId} index={index} onClose={() => setOpenId(null)} />
    </>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-5 overflow-hidden pl-[26px]">
      {[0, 1, 2, 3].map((column) => (
        <div key={column} className="w-[250px] shrink-0 space-y-2">
          <Skeleton className="h-3 w-16" />
          {Array.from({ length: 3 - (column % 2) }, (_, i) => (
            <Skeleton key={i} className="h-[92px] w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
