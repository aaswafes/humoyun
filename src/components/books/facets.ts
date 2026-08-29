import type { Book } from "@/lib/types";

export type Facet = "genre" | "topic" | "series" | "author";

export const FACET_LABELS: Record<Facet, string> = {
  genre: "Genre",
  topic: "Topic",
  series: "Series",
  author: "Author",
};

/**
 * Every value already used for a facet, so the inputs suggest what the library
 * calls things instead of letting "Sirah", "sirah" and "Seerah" become three
 * shelves.
 */
export function facetValues(books: Book[], facet: Facet): string[] {
  const seen = new Map<string, string>();
  for (const book of books) {
    const raw = book[facet];
    if (!raw) continue;
    const value = raw.trim();
    if (!value) continue;
    // First spelling wins, so suggestions stay stable as the library grows.
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** How many books sit under each value of a facet, biggest shelf first. */
export function facetCounts(books: Book[], facet: Facet): { value: string; count: number }[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const book of books) {
    const raw = book[facet]?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { value: raw, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
