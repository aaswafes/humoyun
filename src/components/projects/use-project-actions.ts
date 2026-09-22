"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import type { Project, ProjectStatus, Task } from "@/lib/types";
import { STATUS_LABEL } from "./project-model";

export interface CreateProjectSeed {
  name?: string;
  status?: ProjectStatus;
  due_date?: string | null;
  start_date?: string | null;
  goal_id?: string | null;
}

/**
 * Every write a project surface makes. Multi-row actions are wrapped in one
 * undo step, so ⌘Z takes back "deleted the project" rather than the last of
 * fourteen unlinks.
 */
export function useProjectActions() {
  const projects = useStore((s) => s.projects);
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const batchUndo = useStore((s) => s.batchUndo);
  const toast = useStore((s) => s.toast);

  const createProject = React.useCallback(
    (seed: CreateProjectSeed = {}): Project => {
      const status = seed.status ?? "active";
      const siblings = projects.filter((p) => p.status === status);
      return insert("projects", {
        name: seed.name ?? "",
        status,
        start_date: seed.start_date ?? (status === "active" ? todayISO() : null),
        due_date: seed.due_date ?? null,
        goal_id: seed.goal_id ?? null,
        order_index: siblings.length ? Math.max(...siblings.map((p) => p.order_index)) + 1 : 0,
      });
    },
    [insert, projects],
  );

  const setStatus = React.useCallback(
    (project: Project, status: ProjectStatus) => {
      if (project.status === status) return;
      patch("projects", project.id, { status });
      toast({
        title: STATUS_LABEL[status],
        description: project.name || "Untitled project",
        tone: status === "done" ? "success" : "default",
      });
    },
    [patch, toast],
  );

  /**
   * Deleting the container must not delete the work. Tasks are unlinked and
   * stay where they are — on the calendar, in the inbox, on the shelf they
   * came from.
   */
  const deleteProject = React.useCallback(
    (project: Project) => {
      const { tasks } = useStore.getState();
      const ownTasks = tasks.filter((t) => t.project_id === project.id);

      batchUndo("Delete project", () => {
        ownTasks.forEach((t) => patch("tasks", t.id, { project_id: null }));
        remove("projects", project.id);
      });

      toast({
        title: "Project deleted",
        description: ownTasks.length
          ? `${ownTasks.length} task${ownTasks.length === 1 ? "" : "s"} kept, now unlinked`
          : project.name || undefined,
      });
    },
    [batchUndo, patch, remove, toast],
  );

  /** A milestone is a dated task inside the project — no second table. */
  const addMilestone = React.useCallback(
    (project: Project, title: string, date: string | null): Task => {
      return insert("tasks", {
        title: title.trim() || "Milestone",
        kind: "milestone",
        date,
        all_day: true,
        project_id: project.id,
        goal_id: project.goal_id,
        color: project.color,
      });
    },
    [insert],
  );

  /** Move every open task of a project onto a new date — replanning, in one step. */
  const duplicateProject = React.useCallback(
    (project: Project): Project => {
      const { tasks } = useStore.getState();
      const source = tasks.filter((t) => t.project_id === project.id && !t.parent_id);

      return batchUndo("Duplicate project", () => {
        const copy = insert("projects", {
          name: `${project.name || "Untitled project"} copy`,
          description: project.description,
          status: "idea",
          color: project.color,
          icon: project.icon,
          start_date: project.start_date,
          due_date: project.due_date,
          goal_id: project.goal_id,
          order_index: project.order_index + 0.5,
        });
        // The plan copies over; what was already finished does not.
        source.forEach((t) => {
          insert("tasks", {
            title: t.title,
            kind: t.kind,
            date: t.date,
            all_day: t.all_day,
            start_min: t.start_min,
            end_min: t.end_min,
            duration_min: t.duration_min,
            priority: t.priority,
            color: t.color,
            tags: t.tags,
            notes: t.notes,
            project_id: copy.id,
            goal_id: t.goal_id,
            order_index: t.order_index,
          });
        });
        return copy;
      });
    },
    [batchUndo, insert],
  );

  return { createProject, setStatus, deleteProject, addMilestone, duplicateProject };
}
