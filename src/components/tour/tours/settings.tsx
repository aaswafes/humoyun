import type { TourStep } from "@/components/tour/tour";

export const SETTINGS_TOUR: TourStep[] = [
  {
    title: "Settings",
    body: "How Qalamchi looks, when it reminds you, where prayer times come from, and what happens to your data. Most changes apply the moment you make them.",
  },
  {
    anchor: "settings.tabs",
    title: "Pick a section",
    body: <><b>Click</b> a section to open it, and the page remembers the last one you had open. On a phone this row scrolls sideways.</>,
  },
  {
    anchor: "settings.tab-appearance",
    title: "Look and clock",
    body: "Appearance holds the light or dark theme, the accent colour, and whether times show as 12 or 24 hour.",
  },
  {
    anchor: "settings.tab-notifications",
    title: "Reminders and Telegram",
    body: "Browser reminders, push that reaches you with the app closed, and the Telegram bot that drops your messages into the Inbox.",
  },
  {
    anchor: "settings.tab-data",
    title: "Your data",
    body: <>Export, import, sample data and the Trash live here. Groups shown as one line, like Export, <b>open</b> when you click their header.</>,
  },
  {
    anchor: "settings.guides",
    title: "See these guides again",
    body: <>This button clears which guides you have seen. The <b>?</b> at the top of any page replays its guide whenever you like.</>,
  },
  {
    anchor: "settings.shortcuts",
    title: "Keyboard shortcuts",
    body: <><b>Click</b> to unfold the full list. ⌘K opens the command palette anywhere, and G then a letter jumps to a page, like G then C for Calendar.</>,
    side: "top",
  },
];
