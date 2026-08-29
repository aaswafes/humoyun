"use client";

import * as React from "react";
import {
  CalendarPlus, Download, LayoutTemplate, MoreHorizontal, Plus, Search,
  Sparkles, Upload,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { Template } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button, EmptyState, IconButton, Input, Segmented } from "@/components/ui/primitives";
import { MenuItem, MenuSeparator, Popover } from "@/components/ui/overlays";
import { Select } from "@/components/ui/form";
import { TemplateCard } from "@/components/templates/template-card";
import { TemplateEditor } from "@/components/templates/template-editor";
import { ApplyDialog } from "@/components/templates/apply-dialog";
import { SaveDayDialog } from "@/components/templates/save-day-dialog";
import { ImportDialog } from "@/components/templates/import-dialog";
import { StartersModal } from "@/components/templates/starter-gallery";
import { Fold } from "@/components/templates/fold";
import { STARTERS } from "@/components/templates/starters";
import { EMPTY_INSIGHT, buildInsights, percent } from "@/components/templates/insights";
import { collectVars, itemsOf } from "@/components/templates/model";
import { downloadJson, fileNameFor, serialize } from "@/components/templates/transfer";
import { SCOPES, SCOPE_LABELS, nextOrder, plural } from "@/components/templates/util";

type Filter = "all" | Template["scope"];
type Sort = "manual" | "used" | "recent" | "name" | "size";

const SORT_LABELS: Record<Sort, string> = {
  manual: "My order",
  used: "Most applied",
  recent: "Recently applied",
  name: "Name",
  size: "Most items",
};

const SORTS = Object.keys(SORT_LABELS) as Sort[];

const STARTER_COUNT = STARTERS.length;

function Stat({ value, label, hint }: { value: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="flex min-w-[104px] flex-col gap-0.5">
      <span className="display-serif text-[32px] leading-none text-ink tnum">{value}</span>
      <span className="text-[12px] text-ink-3">{label}</span>
      {hint && <span className="text-[11.5px] text-ink-4 tnum">{hint}</span>}
    </div>
  );
}

/** Everything a search box should look inside for a template. */
function haystack(template: Template): string {
  const items = itemsOf(template);
  return [
    template.name,
    template.description ?? "",
    ...items.map((i) => i.title),
    ...items.flatMap((i) => i.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

export default function TemplatesPage() {
  const templates = useStore((s) => s.templates);
  const tasks = useStore((s) => s.tasks);
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  const [filter, setFilter] = React.useState<Filter>("all");
  const [sort, setSort] = React.useState<Sort>("manual");
  const [query, setQuery] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [applying, setApplying] = React.useState<Template | null>(null);
  const [savingDay, setSavingDay] = React.useState(false);
  const [showStarters, setShowStarters] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const insights = React.useMemo(() => buildInsights(tasks, templates), [tasks, templates]);

  const manual = React.useMemo(
    () => [...templates].sort((a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name)),
    [templates],
  );

  const sorted = React.useMemo(() => {
    const list = [...manual];
    if (sort === "manual") return list;
    if (sort === "name") return list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "size") return list.sort((a, b) => b.items.length - a.items.length);
    if (sort === "used") return list.sort((a, b) => b.use_count - a.use_count || a.name.localeCompare(b.name));
    return list.sort((a, b) => {
      const av = insights.get(a.id)?.lastApplied ?? "";
      const bv = insights.get(b.id)?.lastApplied ?? "";
      return bv.localeCompare(av) || a.name.localeCompare(b.name);
    });
  }, [manual, sort, insights]);

  const needle = query.trim().toLowerCase();
  const visible = React.useMemo(() => {
    let list = sorted;
    if (filter !== "all") list = list.filter((t) => t.scope === filter);
    if (needle) list = list.filter((t) => haystack(t).includes(needle));
    return list;
  }, [sorted, filter, needle]);

  const editing = editingId ? templates.find((t) => t.id === editingId) ?? null : null;

  const totalItems = templates.reduce((sum, t) => sum + t.items.length, 0);
  const totalUses = templates.reduce((sum, t) => sum + t.use_count, 0);
  const totalCreated = [...insights.values()].reduce((sum, i) => sum + i.created, 0);
  const totalDone = [...insights.values()].reduce((sum, i) => sum + i.done, 0);
  const overallRate = totalCreated > 0 ? totalDone / totalCreated : null;
  const withVariables = templates.filter((t) => collectVars(itemsOf(t)).user.length > 0).length;

  function createBlank() {
    const created = insert("templates", {
      name: "Untitled template",
      description: null,
      icon: "layout-template",
      color: "violet",
      scope: "day",
      items: [],
      order_index: nextOrder(templates),
    });
    setEditingId(created.id);
  }

  function duplicateFrom(template: Template) {
    const copy = insert("templates", {
      name: `${template.name} copy`,
      description: template.description,
      icon: template.icon,
      color: template.color,
      scope: template.scope,
      items: template.items,
      order_index: nextOrder(templates),
    });
    toast({ title: "Template duplicated", description: copy.name });
    setEditingId(copy.id);
  }

  /** Manual ordering, normalised as it goes so equal indices cannot stall a move. */
  function move(template: Template, direction: -1 | 1) {
    const from = manual.findIndex((t) => t.id === template.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= manual.length) return;
    reorder(manual, from, to).forEach((row, index) => {
      if (row.order_index !== index) patch("templates", row.id, { order_index: index });
    });
  }

  function exportAll() {
    if (!templates.length) return;
    const name = fileNameFor(templates);
    downloadJson(name, serialize(templates, templates));
    toast({ title: `${plural(templates.length, "template")} exported`, description: name });
  }

  const headerActions = (
    <>
      <Button variant="primary" size="sm" onClick={createBlank}>
        <Plus className="size-3.5" />
        New template
      </Button>
      <Popover
        align="end"
        className="w-[224px]"
        trigger={<IconButton label="Template library actions"><MoreHorizontal /></IconButton>}
      >
        {(close) => (
          <>
            <MenuItem icon={Sparkles} onClick={() => { setShowStarters(true); close(); }}>
              Browse starters
            </MenuItem>
            <MenuItem icon={CalendarPlus} onClick={() => { setSavingDay(true); close(); }}>
              Capture a day or week
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Upload} onClick={() => { setImporting(true); close(); }}>
              Import from JSON…
            </MenuItem>
            <MenuItem
              icon={Download}
              disabled={templates.length === 0}
              onClick={() => { exportAll(); close(); }}
            >
              Export all as JSON
            </MenuItem>
          </>
        )}
      </Popover>
    </>
  );

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle={templates.length ? plural(templates.length, "plan") : "Reusable day, week and block plans"}
        actions={headerActions}
      />

      <PageBody wide>
        {templates.length === 0 ? (
          <EmptyState
            icon={LayoutTemplate}
            title="Plan it once, then drop it on any date"
            description="A template holds a shape — a deep work day, a study block, a weekly reset. Apply it and every task appears on the calendar with its times, priorities and tags already set."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="primary" size="sm" onClick={createBlank}>
                  <Plus className="size-3.5" />
                  New template
                </Button>
                <Button size="sm" onClick={() => setShowStarters(true)}>
                  <Sparkles className="size-3.5" />
                  Browse {STARTER_COUNT} starters
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSavingDay(true)}>
                  <CalendarPlus className="size-3.5" />
                  Capture a day
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setImporting(true)}>
                  <Upload className="size-3.5" />
                  Import JSON
                </Button>
              </div>
            }
            className="py-12"
          />
        ) : (
          <div className="space-y-6">
            <Fold
              label="Library"
              storageKey="humoyun.templates.statsOpen"
              summary={
                `${plural(totalItems, "item")} · applied ${totalUses}×` +
                (totalCreated > 0 ? ` · ${percent(overallRate)} of their tasks finished` : "")
              }
            >
              <div className="flex flex-wrap gap-x-10 gap-y-4 py-1">
                <Stat
                  value={templates.length}
                  label="Templates"
                  hint={withVariables > 0 ? `${withVariables} ask a question` : undefined}
                />
                <Stat value={totalItems} label="Items" />
                <Stat value={totalUses} label="Applied" />
                <Stat
                  value={percent(overallRate)}
                  label="Finished"
                  hint={totalCreated > 0 ? `${totalDone} of ${totalCreated} tasks` : "nothing to measure yet"}
                />
              </div>
            </Fold>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" aria-hidden />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search names, items and tags"
                  aria-label="Search templates"
                  className="pl-8"
                />
              </div>

              {templates.length > 1 && (
                <Segmented
                  size="sm"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all" as Filter, label: "All" },
                    ...SCOPES.map((s) => ({ value: s as Filter, label: SCOPE_LABELS[s] })),
                  ]}
                />
              )}

              <div className="flex-1" />

              <Select<Sort>
                size="sm"
                label="Sort templates"
                value={sort}
                onChange={setSort}
                align="end"
                className="w-[160px]"
                options={SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
              />
            </div>

            {visible.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((template) => {
                  const index = manual.findIndex((t) => t.id === template.id);
                  return (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      insight={insights.get(template.id) ?? EMPTY_INSIGHT}
                      onEdit={(t) => setEditingId(t.id)}
                      onApply={(t) => setApplying(t)}
                      onMove={sort === "manual" && !needle && filter === "all" ? move : undefined}
                      canMoveUp={index > 0}
                      canMoveDown={index < manual.length - 1}
                    />
                  );
                })}
              </div>
            ) : needle ? (
              <EmptyState
                icon={Search}
                title={`Nothing matches “${query}”`}
                description="Search looks at names, descriptions, item titles and tags. Try a shorter word, or clear the scope filter."
                action={
                  <Button size="sm" onClick={() => { setQuery(""); setFilter("all"); }}>
                    Clear the search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={LayoutTemplate}
                title={`No ${filter} templates yet`}
                description={
                  filter === "week"
                    ? "A week template spreads its items across seven days from the date you pick — a weekly reset, a training split, a revision cycle."
                    : filter === "block"
                      ? "A block template is a sequence of durations with no fixed clock times, so you can drop it wherever the afternoon allows."
                      : "A day template lands on one date with every item already on the clock."
                }
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="primary" size="sm" onClick={createBlank}>
                      <Plus className="size-3.5" />
                      New template
                    </Button>
                    <Button size="sm" onClick={() => setShowStarters(true)}>
                      <Sparkles className="size-3.5" />
                      Browse starters
                    </Button>
                  </div>
                }
              />
            )}
          </div>
        )}
      </PageBody>

      {editing && (
        <TemplateEditor
          key={editing.id}
          template={editing}
          open
          onClose={() => setEditingId(null)}
          onApply={(t) => setApplying(t)}
          onOpenTemplate={(id) => setEditingId(id)}
          onDuplicate={duplicateFrom}
        />
      )}

      {applying && (
        <ApplyDialog
          key={applying.id}
          template={applying}
          open
          onClose={() => setApplying(null)}
        />
      )}

      {/* mounted only while open so the date always opens on the current selection */}
      {savingDay && (
        <SaveDayDialog
          open
          onClose={() => setSavingDay(false)}
          onCreated={(t) => setEditingId(t.id)}
        />
      )}

      {showStarters && (
        <StartersModal
          open
          onClose={() => setShowStarters(false)}
          onInstalled={(t) => setEditingId(t.id)}
        />
      )}

      {importing && (
        <ImportDialog
          open
          onClose={() => setImporting(false)}
          onImported={(created) => { if (created.length === 1) setEditingId(created[0].id); }}
        />
      )}
    </>
  );
}
