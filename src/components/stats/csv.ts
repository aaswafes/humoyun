// =========================================================
// CSV export for whatever the Stats page is currently showing.
// One file, several titled sections — the same rows the charts
// drew, so the export never disagrees with the screen.
// =========================================================

export interface CsvSection {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

/** Quotes only what has to be quoted, and doubles any quote inside. */
function cell(value: string | number): string {
  const text = typeof value === "number" ? String(value) : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(sections: CsvSection[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    if (lines.length) lines.push("");
    lines.push(cell(`# ${section.title}`));
    lines.push(section.columns.map(cell).join(","));
    for (const row of section.rows) lines.push(row.map(cell).join(","));
  }
  return lines.join("\r\n");
}

/** Filesystem-safe, sortable, and it says what is inside. */
export function csvFilename(rangeLabel: string, tags: string[]): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const suffix = tags.length ? `-${slug(tags.join("-"))}` : "";
  return `humoyun-stats-${slug(rangeLabel) || "range"}${suffix}.csv`;
}

/**
 * Hands the file to the browser. Excel needs the BOM to read UTF-8, and the
 * object URL is released on the next frame so the click has already happened.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
