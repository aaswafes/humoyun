import type { TourStep } from "@/components/tour/tour";

export const COMMUNITY_TOUR: TourStep[] = [
  {
    title: "Your communities",
    body: "A community is a small group who can see each other's day: today's plan, salah, joint habits and recommendations. You choose what to share.",
  },
  {
    anchor: "community.join",
    title: "Join with a code",
    body: <>Got an invite code from someone? <b>Join</b> opens a box for it. Joining shares nothing on its own.</>,
    side: "bottom",
  },
  {
    anchor: "community.new",
    title: "Start your own",
    body: <><b>New</b> creates a community with a name and colour. You get an invite code to hand to the people you want in it.</>,
    side: "bottom",
  },
  {
    anchor: "community.list",
    title: "Open a community",
    body: <><b>Tap</b> any row to go inside. Under each name you see the group&apos;s description, or what you share there.</>,
    side: "bottom",
  },
  {
    title: "Inside a community",
    body: "Four tabs sit at the top: Today shows members' day, Habits holds joint habits, Recs collects recommendations, and Members holds the invite code.",
  },
  {
    title: "Sharing is off by default",
    body: <>In <b>Members</b>, three switches decide what this group sees: today&apos;s plan, salah, and your shelf. Each community has its own switches.</>,
  },
];
