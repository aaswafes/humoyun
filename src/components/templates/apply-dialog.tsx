"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, dayNameOf, formatDate, friendlyDate, startOfWeek } from "@/lib/date";
import type { Template, TemplateItem } from "@/lib/types";
import { Button, Checkbox } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { TemplateIcon } from "./icons";
import { SCOPE_LABELS, itemLead, plural } from "./util";

/** Times first, then everything else in the order the template lists it. */
function sortItems(items: TemplateItem[]) {
  return [...items].sort((a, b) => {
    const as = a.start_min ?? Infinity;
    const bs = b.start_min ?? Infinity;
    return as - bs;
  });
}

export function ApplyDialog({
  template, open, onClose,
}: {
  template: Template;
  open: boolean;
  onClose: () => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const selectedDate = useStore((s) => s.selectedDate);
  const applyTemplate = useStore((s) => s.applyTemplate);
  const patch = useStore((s) => s.patch);
  const removeWhere = useStore((s) => s.removeWhere);
  const toast = useStore((s) => s.toast);

  const [date, setDate] = React.useState(selectedDate);
  const [snap, setSnap] = React.useState(true);

  const target = template.scope === "week" && snap ? startOfWeek(date, weekStart) : date;

  const markers = React.useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t) => {
      if (!t.date || t.parent_id || t.status === "done") return;
      map.set(t.date, (map.get(t.date) ?? 0) + 1);
    });
    return map;
  }, [tasks]);

  const groups = React.useMemo(() => {
    const map = new Map<string, TemplateItem[]>();
    template.items.forEach((item) => {
      const iso = addDays(target, item.day_offset ?? 0);
      map.set(iso, [...(map.get(iso) ?? []), item]);
    });
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([iso, items]) => ({ iso, items: sortItems(items) }));
  }, [template.items, target]);

  const total = template.items.length;
  const first = groups[0]?.iso ?? target;
  const last = groups[groups.length - 1]?.iso ?? target;

  const headline = groups.length > 1
    ? `${plural(total, "task")} across ${formatDate(first)} – ${formatDate(last)}`
    : `${plural(total, "task")} on ${friendlyDate(target)}`;

  function apply() {
    const before = new Set(useStore.getState().tasks.map((t) => t.id));
    const count = applyTemplate(template.id, target);
    const created = new Set(
      useStore.getState().tasks.filter((t) => !before.has(t.id)).map((t) => t.id),
    );

    toast({
      title: `Applied ${template.name}`,
      description: groups.length > 1
        ? `${plural(count, "task")} across ${formatDate(first)} – ${formatDate(last)}.`
        : `${plural(count, "task")} on ${friendlyDate(target)}.`,
      tone: "success",
      action: {
        label: "Undo",
        run: () => {
          // Guarded twice over: only rows this apply created, and only ones still tagged to it.
          removeWhere("tasks", (t) => created.has(t.id) && t.template_id === template.id);
          const current = useStore.getState().templates.find((t) => t.id === template.id);
          if (current) patch("templates", template.id, { use_count: Math.max(0, current.use_count - 1) });
          toast({ title: "Undone", description: `${plural(created.size, "task")} removed.` });
        },
      },
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} width={620} title={`Apply “${template.name}”`}>
      <div className="grid max-h-[70vh] grid-cols-1 sm:grid-cols-[236px_1fr]">
        <div className="border-line p-3.5 sm:border-r">
          <MiniCalendar
            value={date}
            onChange={setDate}
            weekStart={weekStart}
            markers={markers}
          />
          {template.scope === "week" && (
            <div className="mt-3 flex items-start gap-2 border-t border-line pt-3">
              <Checkbox
                checked={snap}
                onChange={setSnap}
                size="sm"
                label="Start on the first day of the week"
                className="mt-px"
              />
              <button
                onClick={() => setSnap(!snap)}
                className="cursor-pointer text-left text-[12px] leading-snug text-ink-2 hover:text-ink"
              >
                Start on {dayNameOf(weekStart, "long")}
                <span className="block text-[11.5px] text-ink-4">
                  Otherwise day one lands on {formatDate(date)}.
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="flex items-start gap-2.5 border-b border-line px-4 py-3">
            <span
              className={cn(
                `tint-${template.color}`,
                "grid size-8 shrink-0 place-items-center rounded-[9px] bg-[var(--tint-soft)] text-[var(--tint-ink)]",
              )}
            >
              <TemplateIcon name={template.icon} className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-ink">{headline}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {SCOPE_LABELS[template.scope]} template · {plural(groups.length, "day")}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {groups.map(({ iso, items }) => {
              const existing = tasks.filter((t) => t.date === iso && !t.parent_id).length;
              return (
                <section key={iso} className="mb-3.5 last:mb-0">
                  <div className="mb-1 flex items-baseline gap-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                      {formatDate(iso)}
                    </h3>
                    <span className="text-[11px] text-ink-4 tnum">
                      {items.length} new
                      {existing > 0 && ` · ${existing} already there`}
                    </span>
                  </div>
                  <div className="space-y-[3px]">
                    {items.map((item, i) => (
                      <div key={`${item.title}-${i}`} className="flex items-baseline gap-2">
                        <span
                          className={cn(`tint-${item.color ?? template.color}`, "size-1.5 shrink-0 translate-y-[-1px] rounded-full")}
                          style={{ background: "var(--tint)" }}
                          aria-hidden
                        />
                        <span className="w-[62px] shrink-0 text-[11.5px] text-ink-4 tnum">
                          {itemLead(item, hour12)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{item.title}</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <p className="text-[12px] text-ink-3">
          {friendlyDate(target)} · {formatDate(target, { year: true })}
        </p>
        <div className="flex-1" />
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={apply} disabled={total === 0}>
          <CalendarPlus className="size-3.5" />
          Apply {plural(total, "task")}
        </Button>
      </div>
    </Modal>
  );
}
