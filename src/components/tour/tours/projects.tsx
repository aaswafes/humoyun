import type { TourStep } from "@/components/tour/tour";

export const PROJECTS_TOUR: TourStep[] = [
  {
    title: "Your projects",
    body: "A project is the thing you build to reach a goal. It holds its tasks and milestones, and it ends.",
  },
  {
    anchor: "projects.views",
    title: "Three ways to look",
    body: (
      <>
        <b>Board</b> files projects by stage, <b>List</b> puts everything on one screen, and{" "}
        <b>Timeline</b> lays them across the year.
      </>
    ),
  },
  {
    anchor: "projects.board",
    title: "Drag between stages",
    body: (
      <>
        <b>Drag</b> a card into another column to change its stage. On a phone, press and hold the
        card first. Each column&apos;s + adds a project straight into it.
      </>
    ),
  },
  {
    anchor: "projects.card",
    title: "Open a project",
    body: (
      <>
        Click a card to open its tasks, milestones and dates. Double-click the name to rename it,
        or use the ⋯ menu to move, duplicate or delete it.
      </>
    ),
  },
  {
    anchor: "projects.new",
    title: "Start one",
    body: (
      <>
        <b>New project</b> creates one and opens it, ready for a name and tasks. Press G then P to
        come back here from anywhere.
      </>
    ),
  },
];
