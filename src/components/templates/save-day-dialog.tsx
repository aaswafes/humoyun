"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";
import { useStore, tasksOn } from "@/lib/store";
import { dayName, formatDate, formatDuration, formatTime, friendlyDate } from "@/lib/date";
import type { Template } from "@/lib/types";
import { Button, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { plural } from "./util";

const suggestName = (iso: string) => `${dayName(iso)} plan`;

export function SaveDayDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (t: Template) => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const selectedDate = useStore((s) => s.selectedDate);
  const saveDayAsTemplate = useStore((s) => s.saveDayAsTemplate);
  const toast = useStore((s) => s.toast);

  const [date, setDate] = React.useState(selectedDate);
  const [name, setName] = React.useState(() => suggestName(selectedDate));
  const [renamed, setRenamed] = React.useState(false);

  const dayTasks = tasksOn(tasks, date);

  const markers = React.useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t) => {
      if (!t.date || t.parent_id) return;
      map.set(t.date, (map.get(t.date) ?? 0) + 1);
    });
    return map;
  }, [tasks]);

  function pickDate(iso: string) {
    setDate(iso);
    if (!renamed) setName(suggestName(iso));
  }

  function save() {
    const created = saveDayAsTemplate(date, name.trim() || suggestName(date));
    if (!created) return;
    toast({
      title: "Template created",
      description: `${plural(created.items.length, "item")} captured from ${friendlyDate(date)}.`,
      tone: "success",
    });
    onClose();
    onCreated(created);
  }

  return (
    <Modal open={open} onClose={onClose} width={560} title="Create a template from a day">
      <div className="grid grid-cols-1 sm:grid-cols-[236px_1fr]">
        <div className="border-line p-3.5 sm:border-r">
          <MiniCalendar value={date} onChange={pickDate} weekStart={weekStart} markers={markers} />
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="border-b border-line px-4 py-3">
            <label htmlFor="template-name" className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Name
            </label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => { setRenamed(true); setName(e.target.value); }}
              placeholder={suggestName(date)}
            />
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
              Every top-level task on {formatDate(date)} becomes an item, keeping its time, duration,
              priority, tags and colour. Subtasks and the tasks themselves stay where they are.
            </p>
          </div>

          <div className="max-h-[46vh] min-h-[120px] flex-1 overflow-y-auto px-4 py-3">
            <div className="mb-1.5 flex items-baseline gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                {friendlyDate(date)}
              </h3>
              <span className="text-[11px] text-ink-4 tnum">{plural(dayTasks.length, "task")}</span>
            </div>

            {dayTasks.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                Nothing is scheduled on {formatDate(date)}. Pick a day you already planned well —
                that is the one worth keeping.
              </p>
            ) : (
              <div className="space-y-[3px]">
                {dayTasks.map((task) => (
                  <div key={task.id} className="flex items-baseline gap-2">
                    <span className="w-[62px] shrink-0 text-[11.5px] text-ink-4 tnum">
                      {task.start_min != null
                        ? formatTime(task.start_min, hour12)
                        : task.duration_min
                          ? formatDuration(task.duration_min)
                          : "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{task.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <div className="flex-1" />
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={save} disabled={dayTasks.length === 0}>
          <CalendarPlus className="size-3.5" />
          Save as template
        </Button>
      </div>
    </Modal>
  );
}
