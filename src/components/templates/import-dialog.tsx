"use client";

import * as React from "react";
import { AlertTriangle, Download, FileJson, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Template } from "@/lib/types";
import { Badge, Button, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { Field } from "@/components/ui/form";
import { TemplateIcon } from "./icons";
import type { RichItem } from "./model";
import { countItems, parseFile, type PortableItem, type PortableTemplate } from "./transfer";
import { SCOPE_LABELS, nextOrder, plural } from "./util";

function toRichItem(item: PortableItem): RichItem {
  return {
    title: item.title,
    kind: item.kind ?? "task",
    day_offset: item.day_offset ?? 0,
    start_min: item.start_min ?? null,
    end_min: item.end_min ?? null,
    duration_min: item.duration_min ?? null,
    priority: item.priority ?? 0,
    color: item.color ?? null,
    icon: null,
    tags: item.tags ?? [],
    notes: item.notes ?? null,
    checklist: [],
    rule: item.rule ?? null,
    ref_template_id: null,
  };
}

export function ImportDialog({
  open, onClose, onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (created: Template[]) => void;
}) {
  const templates = useStore((s) => s.templates);
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  const [text, setText] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);

  const result = React.useMemo(() => (text.trim() ? parseFile(text) : null), [text]);
  const parsed = result?.templates ?? [];

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  function runImport() {
    if (!parsed.length) return;
    const base = nextOrder(templates);
    const created: Template[] = parsed.map((draft: PortableTemplate, i) =>
      insert("templates", {
        name: draft.name,
        description: draft.description,
        icon: draft.icon,
        color: draft.color,
        scope: draft.scope,
        items: draft.items.map(toRichItem),
        order_index: base + i,
      }),
    );

    // Second pass: nested references travel by name, so they can only be
    // resolved once every template in the bundle exists.
    const byName = new Map<string, string>();
    for (const t of templates) byName.set(t.name.trim().toLowerCase(), t.id);
    for (const t of created) byName.set(t.name.trim().toLowerCase(), t.id);

    let linked = 0;
    created.forEach((row, i) => {
      const source = parsed[i];
      if (!source.items.some((item) => item.ref_template)) return;
      const items = source.items.map((item) => {
        const rich = toRichItem(item);
        if (!item.ref_template) return rich;
        const id = byName.get(item.ref_template.trim().toLowerCase());
        if (id) linked += 1;
        return { ...rich, ref_template_id: id ?? null, title: item.title || `Runs ${item.ref_template}` };
      });
      patch("templates", row.id, { items });
    });

    toast({
      title: `${plural(created.length, "template")} imported`,
      description: linked > 0
        ? `${plural(countItems(parsed), "item")} · ${plural(linked, "link")} reconnected.`
        : plural(countItems(parsed), "item"),
      tone: "success",
    });
    setText("");
    setFileName(null);
    onImported(created);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} width={620} title="Import templates">
      <div className="max-h-[70vh] overflow-y-auto p-4">
        <p className="mb-3 max-w-[68ch] text-[12.5px] leading-relaxed text-ink-3">
          Drop in a file exported from here, or paste the JSON straight in. Nothing is written until you
          press Import, and every field is checked on the way in.
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/*
            A file picker is the one control that cannot be a plain <button>.
            The label carries the styling, the input keeps the keyboard path.
          */}
          <label
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-raised px-3",
              "text-[13.5px] font-medium text-ink transition-colors duration-150 hover:bg-hover",
              "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft",
            )}
          >
            <Upload className="size-3.5" aria-hidden />
            Choose a .json file
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }}
              className="sr-only"
            />
          </label>
          {fileName && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
              <FileJson className="size-3.5" aria-hidden />
              {fileName}
            </span>
          )}
        </div>

        <Field label="Or paste JSON">
          <Textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setFileName(null); }}
            rows={6}
            placeholder='{ "kind": "humoyun.templates", "templates": [ … ] }'
            className="font-mono text-[12px]"
          />
        </Field>

        {result && result.errors.length > 0 && (
          <div className="mt-3 rounded-md border border-line bg-warn-soft px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-warn">
              <AlertTriangle className="size-3.5" aria-hidden />
              {plural(result.errors.length, "problem")}
            </p>
            <ul className="mt-1 space-y-0.5">
              {result.errors.map((error) => (
                <li key={error} className="text-[11.5px] leading-snug text-ink-2">{error}</li>
              ))}
            </ul>
          </div>
        )}

        {parsed.length > 0 && (
          <section className="mt-4">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Ready to import
            </h3>
            <div className="space-y-1">
              {parsed.map((draft, i) => (
                <div
                  key={`${draft.name}-${i}`}
                  className={cn(`tint-${draft.color}`, "flex items-center gap-2.5 rounded-md border border-line px-2.5 py-2")}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--tint-soft)] text-[var(--tint-ink)]">
                    <TemplateIcon name={draft.icon} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{draft.name}</p>
                    {draft.description && (
                      <p className="truncate text-[11.5px] text-ink-3">{draft.description}</p>
                    )}
                  </div>
                  <Badge tint={draft.color} dot>{SCOPE_LABELS[draft.scope]}</Badge>
                  <span className="shrink-0 text-[11.5px] text-ink-4 tnum">
                    {plural(draft.items.length, "item")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <p className="text-[12px] text-ink-3 tnum">
          {parsed.length > 0
            ? `${plural(parsed.length, "template")} · ${plural(countItems(parsed), "item")}`
            : "Nothing loaded yet"}
        </p>
        <div className="flex-1" />
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={runImport} disabled={parsed.length === 0}>
          <Download className="size-3.5" />
          Import {parsed.length > 0 ? plural(parsed.length, "template") : ""}
        </Button>
      </div>
    </Modal>
  );
}
