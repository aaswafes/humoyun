"use client";

import * as React from "react";
import { CalendarPlus, LayoutTemplate, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Template } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button, EmptyState, Segmented } from "@/components/ui/primitives";
import { TemplateCard } from "@/components/templates/template-card";
import { TemplateEditor } from "@/components/templates/template-editor";
import { ApplyDialog } from "@/components/templates/apply-dialog";
import { SaveDayDialog } from "@/components/templates/save-day-dialog";
import { StarterGallery } from "@/components/templates/starter-gallery";
import { SCOPES, SCOPE_LABELS, nextOrder, plural } from "@/components/templates/util";

type Filter = "all" | Template["scope"];

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1 border-l border-line px-5 first:border-l-0 first:pl-0">
      <span className="display-serif text-[32px] leading-none text-ink tnum">{value}</span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</span>
    </div>
  );
}

export default function TemplatesPage() {
  const templates = useStore((s) => s.templates);
  const insert = useStore((s) => s.insert);

  const [filter, setFilter] = React.useState<Filter>("all");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [applying, setApplying] = React.useState<Template | null>(null);
  const [savingDay, setSavingDay] = React.useState(false);

  const sorted = React.useMemo(
    () => [...templates].sort((a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name)),
    [templates],
  );
  const visible = filter === "all" ? sorted : sorted.filter((t) => t.scope === filter);

  const editing = editingId ? templates.find((t) => t.id === editingId) ?? null : null;

  const totalItems = templates.reduce((sum, t) => sum + t.items.length, 0);
  const totalUses = templates.reduce((sum, t) => sum + t.use_count, 0);

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

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle={templates.length ? plural(templates.length, "plan") : "Reusable day, week and block plans"}
        actions={
          <Button variant="primary" size="sm" onClick={createBlank}>
            <Plus className="size-3.5" />
            New template
          </Button>
        }
      >
        <Button variant="ghost" size="sm" onClick={() => setSavingDay(true)}>
          <CalendarPlus className="size-3.5" />
          From a day
        </Button>
      </PageHeader>

      <PageBody wide>
        {templates.length === 0 ? (
          <div className="space-y-8">
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
                  <Button size="sm" onClick={() => setSavingDay(true)}>
                    <CalendarPlus className="size-3.5" />
                    Create from a day
                  </Button>
                </div>
              }
              className="py-10"
            />
            <StarterGallery onInstalled={(t) => setEditingId(t.id)} />
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-end">
                <Stat value={templates.length} label="Templates" />
                <Stat value={totalItems} label="Items" />
                <Stat value={totalUses} label="Applied" />
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
            </div>

            {visible.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onEdit={(t) => setEditingId(t.id)}
                    onApply={(t) => setApplying(t)}
                  />
                ))}
              </div>
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
                  <Button variant="primary" size="sm" onClick={createBlank}>
                    <Plus className="size-3.5" />
                    New template
                  </Button>
                }
              />
            )}
          </>
        )}
      </PageBody>

      {editing && (
        <TemplateEditor
          key={editing.id}
          template={editing}
          open
          onClose={() => setEditingId(null)}
          onApply={(t) => setApplying(t)}
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
    </>
  );
}
