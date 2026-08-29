import type { Media } from "@/lib/types";

/**
 * The YouTube shelf files a title by its channel, never by a "creator" — so it
 * cannot borrow the films facet type, which has no channel in it. Everything
 * else (genre, topic, series) means exactly what it means on the films shelf.
 */
export type YoutubeFacet = "genre" | "topic" | "series" | "channel";

export const YOUTUBE_FACET_LABELS: Record<YoutubeFacet, string> = {
  genre: "Genre",
  topic: "Topic",
  series: "Series",
  channel: "Channel",
};

/**
 * What an empty facet is called on the shelf. A bucket with a name reads as a
 * shelf of its own; a blank heading reads as a bug.
 */
export const YOUTUBE_FACET_FALLBACKS: Record<YoutubeFacet, string> = {
  genre: "Unfiled",
  topic: "No topic",
  series: "Standalone",
  channel: "No channel",
};

/**
 * Every value already used for a facet, so the inputs suggest what the shelf
 * calls things instead of letting "Fireship", "fireship" and "Fireship."
 * become three channels.
 */
export function youtubeFacetValues(items: Media[], facet: YoutubeFacet): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    const raw = item[facet];
    if (!raw) continue;
    const value = raw.trim();
    if (!value) continue;
    // First spelling wins, so suggestions stay stable as the shelf grows.
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
