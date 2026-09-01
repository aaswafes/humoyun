"use client";

import * as React from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Project, ProjectStatus } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { ProjectCard } from "./project-card";
import { useProjectActions } from "./use-project-actions";
import {
  BOARD_STATUSES, STATUS_BLURB, STATUS_LABEL, type ProjectIndex,
} from "./project-model";

const COL = "status:";

function BoardCard({
  project, index, onOpen, activeId,
}: {
  project: Project;
  index: ProjectIndex;
  onOpen: (id: string) => void;
  activeId: string | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: project.id });

  return (
    <div ref={setNodeRef} className={cn("relative", isDragging && "opacity-40")}>
      <ProjectCard
        project={project}
        stats={index.stats(project.id)}
        onOpen={onOpen}
        dragging={activeId === project.id}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            aria-label={`Move ${project.name || "project"} to another status`}
            className="grid size-5 cursor-grab place-items-center rounded text-ink-4 hover:text-ink-2 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        }
      />
    </div>
  );
}

function BoardColumn({
  status, projects, index, onOpen, onCreate, activeId,
}: {
  status: ProjectStatus;
  projects: Project[];
  index: ProjectIndex;
  onOpen: (id: string) => void;
  onCreate: (status: ProjectStatus) => void;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL}${status}` });

  return (
    <section className="group/col relative w-[250px] shrink-0">
      <div className="mb-3 flex items-baseline gap-1.5 px-0.5">
        <h2 className="text-[12.5px] font-medium text-ink-2">{STATUS_LABEL[status]}</h2>
        <span className="text-[11px] text-ink-4 tnum">{projects.length}</span>
        <div className="flex-1" />
        <IconButton
          label={`New ${STATUS_LABEL[status].toLowerCase()} project`}
          size="sm"
          className="opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/col:opacity-100"
          onClick={() => onCreate(status)}
        >
          <Plus />
        </IconButton>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "-m-1 min-h-[72px] space-y-2 rounded-lg p-1 transition-colors duration-150",
          isOver && activeId && "bg-hover ring-1 ring-accent-line",
        )}
      >
        {projects.map((project) => (
          <BoardCard
            key={project.id}
            project={project}
            index={index}
            onOpen={onOpen}
            activeId={activeId}
          />
        ))}

        {projects.length === 0 && (
          <p className="px-1.5 py-2 text-[12px] leading-relaxed text-ink-4">
            {STATUS_BLURB[status]}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Projects filed by what stage they are at. Dragging a card to another column
 * is the whole status model — there is no separate form for it, and the ⋯ menu
 * on every card does the same move from the keyboard.
 */
export function ProjectBoard({
  projects, index, onOpen, onCreate,
}: {
  projects: Project[];
  index: ProjectIndex;
  onOpen: (id: string) => void;
  onCreate: (status: ProjectStatus) => void;
}) {
  const { setStatus } = useProjectActions();
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = React.useMemo(() => {
    const map = new Map<ProjectStatus, Project[]>(BOARD_STATUSES.map((s) => [s, []]));
    for (const project of projects) map.get(project.status)?.push(project);
    for (const [status, list] of map) {
      list.sort((a, b) => (
        // Done reads newest first — it is a record, not a queue.
        status === "done"
          ? (b.due_date ?? b.updated_at).localeCompare(a.due_date ?? a.updated_at)
          : (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
            || a.order_index - b.order_index
      ));
    }
    return map;
  }, [projects]);

  const dragged = activeId ? projects.find((p) => p.id === activeId) ?? null : null;

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId.startsWith(COL)) return;

    const status = overId.slice(COL.length) as ProjectStatus;
    const project = projects.find((p) => p.id === String(event.active.id));
    if (project) setStatus(project, status);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-5 overflow-x-auto pb-4 pl-[26px]">
        {BOARD_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            projects={columns.get(status) ?? []}
            index={index}
            onOpen={onOpen}
            onCreate={onCreate}
            activeId={activeId}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="w-[250px] rounded-lg border border-line bg-raised px-2.5 py-2 shadow-pop">
            <p className="truncate text-[13.5px] font-medium text-ink">
              {dragged.name || "Untitled project"}
            </p>
            <p className="mt-0.5 text-[11.5px] text-ink-4 tnum">
              {index.stats(dragged.id).done} of {index.stats(dragged.id).total} done
            </p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
