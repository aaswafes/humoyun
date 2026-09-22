"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, Clapperboard, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { YOUTUBE_KINDS } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";

// =========================================================
// Books, films and YouTube used to be three sidebar entries and three pages.
// They are one section now — Consumption — because they answer the same
// question: what is going into your head, and how much of it is waiting.
//
// The shelves themselves are untouched. Only the chrome merged: one nav
// entry, one title, and this strip to move between them. Each shelf keeps
// its own toolbar, its own views and its own add button.
// =========================================================

export type ConsumptionTab = "books" | "films" | "youtube";

export const CONSUMPTION_TABS: {
  tab: ConsumptionTab;
  href: string;
  key: MsgKey;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { tab: "books", href: "/consumption/books", key: "nav.books", icon: BookOpen },
  { tab: "films", href: "/consumption/films", key: "nav.watch", icon: Clapperboard },
  { tab: "youtube", href: "/consumption/youtube", key: "nav.youtube", icon: MonitorPlay },
];

/**
 * How many titles sit on each shelf. Drawn beside the tab so switching is an
 * informed choice rather than a guess — the same reason the Inbox badges.
 */
function useShelfCounts(): Record<ConsumptionTab, number> {
  const books = useStore((s) => s.books);
  const media = useStore((s) => s.media);
  return React.useMemo(() => {
    let films = 0;
    let youtube = 0;
    for (const m of media) {
      if (YOUTUBE_KINDS.includes(m.kind)) youtube += 1;
      else films += 1;
    }
    return { books: books.length, films, youtube };
  }, [books, media]);
}

/** Sits directly under the page header, above the shelf. */
export function ConsumptionTabs({ active }: { active: ConsumptionTab }) {
  const { t } = useT();
  const counts = useShelfCounts();

  return (
    <div className="flex shrink-0 items-center gap-0.5 bg-canvas px-3 py-1.5 hairline-b" role="tablist">
      {CONSUMPTION_TABS.map(({ tab, href, key, icon: Icon }) => {
        const selected = tab === active;
        const count = counts[tab];
        return (
          <Link
            key={tab}
            href={href}
            role="tab"
            aria-selected={selected}
            className={cn(
              "group flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] cursor-pointer",
              "transition-colors duration-120",
              selected
                ? "bg-active font-medium text-ink"
                : "text-ink-3 hover:bg-hover hover:text-ink",
            )}
          >
            <Icon className={cn("size-3.5 shrink-0", selected ? "text-ink" : "text-ink-4")} />
            <span>{t(key)}</span>
            {count > 0 && (
              <span className={cn("text-[11px] tnum", selected ? "text-ink-3" : "text-ink-4")}>
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
