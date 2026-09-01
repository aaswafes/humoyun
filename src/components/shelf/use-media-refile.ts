"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import type { Media } from "@/lib/types";

// =========================================================
// Dropping a title on another shelf.
//
// Films & Anime and YouTube are the same `media` rows behind two shelves, so
// they refile the same way. Only the facets differ, and those arrive as the
// caller's fallback map.
// =========================================================

type Status = Media["status"];

const STATUS_LABEL: Record<Status, string> = {
  watching: "Watching",
  planned: "Planned",
  finished: "Finished",
  paused: "Paused",
  dropped: "Dropped",
};

const STATUSES = new Set<string>(Object.keys(STATUS_LABEL));

/**
 * Groupings a drop can honestly change. Creator and channel are facts about the
 * title, not shelves you choose, so dragging never rewrites them.
 */
export const MEDIA_REFILABLE = ["status", "kind", "genre", "topic", "series"];

export function useMediaRefile(
  group: string,
  /** the catch-all bucket name per facet, so a drop there clears the label */
  fallbacks: Record<string, string>,
) {
  const media = useStore((s) => s.media);
  const patch = useStore((s) => s.patch);
  const logWatch = useStore((s) => s.logWatch);
  const toast = useStore((s) => s.toast);

  return React.useCallback((itemId: string, groupKey: string) => {
    const item = media.find((m) => m.id === itemId);
    if (!item) return;
    const title = item.title || "Untitled";

    if (group === "status") {
      if (!STATUSES.has(groupKey)) return;
      const status = groupKey as Status;
      // Finishing moves the counter to the last episode, exactly as the sheet's
      // status menu does — a drag and a menu pick must never disagree.
      if (status === "finished") {
        logWatch(item.id, Math.max(1, item.total_episodes));
        toast({ title: `Finished ${title}`, tone: "success" });
        return;
      }
      patch("media", item.id, { status });
      toast({ title: STATUS_LABEL[status], description: title });
      return;
    }

    if (group === "kind") {
      patch("media", item.id, { kind: groupKey as Media["kind"] });
      toast({ title: `Moved to ${groupKey}`, description: title });
      return;
    }

    const facet = group as "genre" | "topic" | "series";
    const value = groupKey === fallbacks[facet] ? null : groupKey;
    patch("media", item.id, { [facet]: value });
    toast({
      title: value ? `Filed under ${value}` : `${facet[0].toUpperCase()}${facet.slice(1)} cleared`,
      description: title,
    });
  }, [media, group, fallbacks, patch, logWatch, toast]);
}
