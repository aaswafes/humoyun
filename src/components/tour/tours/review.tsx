import type { TourStep } from "@/components/tour/tour";

export const REVIEW_TOUR: TourStep[] = [
  {
    title: "Your review",
    body: (
      <>
        A look back at a week, month or year. The numbers are gathered from what you already
        logged; the reflection is yours to write. <b>G</b> then <b>R</b> brings you here.
      </>
    ),
  },
  {
    anchor: "review.periods",
    title: "Pick a period",
    body: (
      <>
        Choose week, month or year, then step back with the arrows or <b>click</b> the date to jump
        to any period. The ← → keys work too, and <b>W</b> returns to now.
      </>
    ),
  },
  {
    anchor: "review.title",
    title: "Where you are",
    body: "The period you are reviewing, and whether its review has been written yet.",
  },
  {
    anchor: "review.layout",
    title: "Guided or everything",
    body: (
      <>
        Guided walks through one part at a time. Everything puts the whole review on one page.
        Press <b>V</b> to switch.
      </>
    ),
  },
  {
    anchor: "review.steps",
    title: "The five parts",
    body: (
      <>
        Recap, Evidence, the log, Reflection and past reviews. <b>Click</b> a chip to jump, or
        press <b>J</b> and <b>K</b>; a tick means that part is settled.
      </>
    ),
  },
  {
    anchor: "review.copy",
    title: "Take it with you",
    body: (
      <>
        Copy or print the review as plain text. Shortcut: <b>P</b>.
      </>
    ),
  },
  {
    title: "Start with Reflection",
    body: "Six short prompts are the only thing here you write. Write quickly; the point is that it exists.",
  },
];
