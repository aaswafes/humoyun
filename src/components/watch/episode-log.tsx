"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, formatDuration, friendlyDate } from "@/lib/date";
import type { Media } from "@/lib/types";
import { Button } from "@/components/ui/primitives";
import { Disclosure } from "./watch-fields";
import { episodeRangeLabel } from "./watch-plan";

const PREVIEW = 6;

/**
 * What was actually watched, and when. Built from ticked-off watch blocks
 * rather than a second store of its own, so the log and the calendar can never
 * tell different stories.
 *
 * A film has one row and no episode numbers — "1 of 1 episodes" is a fact
 * nobody needs.
 */
export function EpisodeLog({ item, className }: { item: Media; className?: string }) {
  const tasks = useStore((s) => s.tasks);
  const [expanded, setExpanded] = React.useState(false);

  const single = item.total_episodes <= 1;

  const watched = React.useMemo(
    () => tasks
      .filter((t) => t.media_id === item.id && t.kind === "watching" && t.status === "done")
      // Newest first: the last thing watched is the thing being looked for.
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    [tasks, item.id],
  );

  const episodes = watched.reduce(
    (n, t) => n + Math.max(0, (t.episode_to ?? 0) - (t.episode_from ?? 0) + 1), 0);
  const lastDate = watched.find((t) => t.date)?.date ?? null;

  const summary = watched.length
    ? single
      ? lastDate ? `Watched ${friendlyDate(lastDate).toLowerCase()}` : "Watched"
      : `${watched.length} ${watched.length === 1 ? "sitting" : "sittings"} · ${episodes} watched`
    : "Nothing ticked off yet";

  const visible = expanded ? watched : watched.slice(0, PREVIEW);

  return (
    <Disclosure
      storageKey="humoyun.watch.sheet.log"
      label="Log"
      summary={summary}
      className={cn("mt-4 hairline-t", className)}
      bodyClassName="pb-1 pt-2"
    >
      {watched.length === 0 ? (
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Tick a watch block off on your calendar and it lands here, with the day you watched it.
        </p>
      ) : (
        <div className="rounded-md border border-line">
          {visible.map((t, i) => {
            const range = t.episode_from != null && t.episode_to != null
              ? { from: t.episode_from, to: t.episode_to }
              : null;
            return (
              <div
                key={t.id}
                className={cn("flex items-center gap-2 px-2 py-[6px]", i > 0 && "hairline-t")}
              >
                <span className="w-[78px] shrink-0 text-[12px] text-ink-2 tnum">
                  {t.date ? formatDate(t.date) : "No date"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink tnum">
                  {single ? "Watched" : episodeRangeLabel(range)}
                </span>
                {t.duration_min ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-ink-4 tnum">
                    <Clock className="size-3" aria-hidden />
                    {formatDuration(t.duration_min)}
                  </span>
                ) : null}
              </div>
            );
          })}

          {watched.length > PREVIEW && (
            <div className="hairline-t p-1">
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Show fewer" : `Show all ${watched.length}`}
              </Button>
            </div>
          )}
        </div>
      )}
    </Disclosure>
  );
}
