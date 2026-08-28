// =========================================================
// Export and import templates as JSON.
//
// The file is deliberately id-free: nested references travel by template
// *name*, so a bundle can be re-imported into any account and re-link itself.
// Import validates everything — an unknown tint, a string where a number
// belongs, a missing title — rather than trusting the file.
// =========================================================

import { TINTS, type TaskKind, type Template, type Tint } from "@/lib/types";
import { KINDS } from "./util";
import { itemsOf, type ItemRule, type RichItem } from "./model";

export const FILE_KIND = "humoyun.templates";
export const FILE_VERSION = 1;

export interface PortableItem {
  title: string;
  kind?: TaskKind;
  day_offset?: number;
  start_min?: number | null;
  end_min?: number | null;
  duration_min?: number | null;
  priority?: number;
  color?: Tint | null;
  tags?: string[];
  notes?: string | null;
  rule?: ItemRule | null;
  /** Name of the template this item applies, resolved to an id on import. */
  ref_template?: string | null;
}

export interface PortableTemplate {
  name: string;
  description: string | null;
  icon: string;
  color: Tint;
  scope: Template["scope"];
  items: PortableItem[];
}

export interface TemplateFile {
  kind: typeof FILE_KIND;
  version: number;
  exported_at: string;
  templates: PortableTemplate[];
}

const SCOPES: Template["scope"][] = ["day", "week", "block"];

// ---------------------------------------------------------
// Export
// ---------------------------------------------------------

function portableItem(item: RichItem, nameOf: (id: string) => string | null): PortableItem {
  const out: PortableItem = { title: item.title };
  if (item.kind && item.kind !== "task") out.kind = item.kind;
  if (item.day_offset) out.day_offset = item.day_offset;
  if (item.start_min != null) out.start_min = item.start_min;
  if (item.end_min != null) out.end_min = item.end_min;
  if (item.duration_min != null) out.duration_min = item.duration_min;
  if (item.priority) out.priority = item.priority;
  if (item.color) out.color = item.color;
  if (item.tags?.length) out.tags = item.tags;
  if (item.notes) out.notes = item.notes;
  if (item.rule) out.rule = item.rule;
  if (item.ref_template_id) out.ref_template = nameOf(item.ref_template_id);
  return out;
}

export function toFile(templates: Template[], all: Template[]): TemplateFile {
  const nameOf = (id: string) => all.find((t) => t.id === id)?.name ?? null;
  return {
    kind: FILE_KIND,
    version: FILE_VERSION,
    exported_at: new Date().toISOString(),
    templates: templates.map((t) => ({
      name: t.name,
      description: t.description,
      icon: t.icon,
      color: t.color,
      scope: t.scope,
      items: itemsOf(t).map((i) => portableItem(i, nameOf)),
    })),
  };
}

export function serialize(templates: Template[], all: Template[]): string {
  return `${JSON.stringify(toFile(templates, all), null, 2)}\n`;
}

/** Filesystem-safe filename for one template or a whole bundle. */
export function fileNameFor(templates: Template[]): string {
  const stamp = new Date().toISOString().slice(0, 10);
  if (templates.length === 1) {
    const slug = templates[0].name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${slug || "template"}-${stamp}.json`;
  }
  return `humoyun-templates-${stamp}.json`;
}

export function downloadJson(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can race the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------
// Import
// ---------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

function num(v: unknown, fallback: number | null = null): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

function tint(v: unknown, fallback: Tint | null): Tint | null {
  return typeof v === "string" && (TINTS as string[]).includes(v) ? (v as Tint) : fallback;
}

function clampMinutes(v: number | null): number | null {
  if (v == null) return null;
  return Math.max(0, Math.min(1439, Math.round(v)));
}

function parseRule(v: unknown): ItemRule | null {
  if (!isRecord(v)) return null;
  const rule: ItemRule = {};
  if (Array.isArray(v.weekdays)) {
    const days = v.weekdays
      .map((d) => num(d))
      .filter((d): d is number => d != null && d >= 0 && d <= 6)
      .map((d) => Math.round(d));
    if (days.length && days.length < 7) rule.weekdays = [...new Set(days)].sort((a, b) => a - b);
  }
  if (typeof v.skip_if_tag === "string" && v.skip_if_tag.trim()) {
    rule.skip_if_tag = v.skip_if_tag.trim().replace(/^#/, "");
  }
  if (v.skip_if_duplicate === true) rule.skip_if_duplicate = true;
  const busy = num(v.skip_if_busier_than);
  if (busy != null && busy > 0) rule.skip_if_busier_than = Math.round(busy);
  return Object.keys(rule).length ? rule : null;
}

function parseItem(v: unknown): PortableItem | null {
  if (!isRecord(v)) return null;
  const title = str(v.title).trim();
  const ref = typeof v.ref_template === "string" ? v.ref_template.trim() : null;
  if (!title && !ref) return null;

  const start = clampMinutes(num(v.start_min));
  const end = clampMinutes(num(v.end_min));
  const duration = num(v.duration_min);
  const priority = num(v.priority, 0) ?? 0;
  const offset = num(v.day_offset, 0) ?? 0;

  return {
    title: title || ref || "Untitled",
    kind: typeof v.kind === "string" && (KINDS as string[]).includes(v.kind) ? (v.kind as TaskKind) : "task",
    day_offset: Math.max(0, Math.min(6, Math.round(offset))),
    start_min: start,
    end_min: end != null && start != null && end > start ? end : null,
    duration_min: duration != null && duration > 0 ? Math.min(1440, Math.round(duration)) : null,
    priority: Math.max(0, Math.min(3, Math.round(priority))),
    color: tint(v.color, null),
    tags: Array.isArray(v.tags)
      ? v.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim().replace(/^#/, "")).filter(Boolean)
      : [],
    notes: typeof v.notes === "string" && v.notes.trim() ? v.notes : null,
    rule: parseRule(v.rule),
    ref_template: ref || null,
  };
}

export interface ParseResult {
  templates: PortableTemplate[];
  errors: string[];
}

export function parseFile(text: string): ParseResult {
  const errors: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { templates: [], errors: ["That is not valid JSON. Check for a stray comma or a missing brace."] };
  }

  // A single exported template pastes just as happily as a whole bundle.
  const raw = isRecord(data) && Array.isArray(data.templates)
    ? data.templates
    : Array.isArray(data)
      ? data
      : isRecord(data) && typeof data.name === "string"
        ? [data]
        : null;

  if (!raw) {
    return { templates: [], errors: ["No templates in that file — expected a `templates` array."] };
  }

  if (isRecord(data) && typeof data.kind === "string" && data.kind !== FILE_KIND) {
    errors.push(`This file says it is “${data.kind}”. Importing it anyway.`);
  }

  const templates: PortableTemplate[] = [];
  raw.forEach((entry, i) => {
    if (!isRecord(entry)) { errors.push(`Entry ${i + 1} is not a template.`); return; }
    const name = str(entry.name).trim();
    if (!name) { errors.push(`Entry ${i + 1} has no name.`); return; }

    const items = Array.isArray(entry.items)
      ? entry.items.map(parseItem).filter((x): x is PortableItem => x !== null)
      : [];
    if (Array.isArray(entry.items) && items.length < entry.items.length) {
      errors.push(`“${name}”: ${entry.items.length - items.length} item(s) were unreadable and skipped.`);
    }

    templates.push({
      name,
      description: typeof entry.description === "string" && entry.description.trim() ? entry.description : null,
      icon: str(entry.icon, "layout-template"),
      color: tint(entry.color, "violet") ?? "violet",
      scope: typeof entry.scope === "string" && SCOPES.includes(entry.scope as Template["scope"])
        ? (entry.scope as Template["scope"])
        : "day",
      items,
    });
  });

  if (!templates.length && !errors.length) errors.push("The file held no templates.");
  return { templates, errors };
}

/** Total items across a parsed bundle — the number the import dialog quotes. */
export function countItems(templates: PortableTemplate[]): number {
  return templates.reduce((sum, t) => sum + t.items.length, 0);
}
