import type { Media } from "@/lib/types";

export type MediaFacet = "genre" | "topic" | "series" | "creator";

export const MEDIA_FACET_LABELS: Record<MediaFacet, string> = {
  genre: "Genre",
  topic: "Topic",
  series: "Series",
  creator: "Creator",
};

/**
 * What an empty facet is called on the shelf. A bucket with a name reads as a
 * shelf of its own; a blank heading reads as a bug.
 */
export const MEDIA_FACET_FALLBACKS: Record<MediaFacet, string> = {
  genre: "Unfiled",
  topic: "No topic",
  series: "Standalone",
  creator: "Unknown creator",
};

/**
 * Every value already used for a facet, so the inputs suggest what the shelf
 * calls things instead of letting "Sci-fi", "sci fi" and "Science fiction"
 * become three shelves.
 */
export function mediaFacetValues(items: Media[], facet: MediaFacet): string[] {
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

/** How many titles sit under each value of a facet, biggest shelf first. */
export function mediaFacetCounts(
  items: Media[], facet: MediaFacet,
): { value: string; count: number }[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const item of items) {
    const raw = item[facet]?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { value: raw, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
