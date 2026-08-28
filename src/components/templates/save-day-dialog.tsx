"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, tasksOn } from "@/lib/store";
import {
  addDays, dayName, formatDate, formatDuration, formatTime, friendlyDate, startOfWeek,
} from "@/lib/date";
import type { Task, Template } from "@/lib/types";
import { Button, Input, Segmented } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { Field, Toggle } from "@/components/ui/form";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import type { RichItem } from "./model";
import { nextOrder, offsetLabel, plural } from "./util";

type Capture = "day" | "week";

const suggestName = (iso: string, capture: Capture) =>
  capture === "week" ? `Week of ${formatDate(iso, { weekday: false })}` : `${dayName(iso)} plan`;

/** A real task, flattened into the shape a template stores. */
function toItem(task: Task, offset: number, keepTimes: boolean): RichItem {
  const span =
    task.duration_min ??
    (task.start_min != null && task.end_min != null && task.end_min > task.start_min
      ? task.end_min - task.start_min
      : null);

  return {
    title: task.title,
    kind: task.kind,
    day_offset: offset,
    start_min: keepTimes ? task.start_min : null,
    end_min: keepTimes ? task.end_min : null,
    duration_min: span,
    priority: task.priority,
    color: task.color,
    icon: task.icon,
    tags: task.tags,
    notes: task.notes,
    checklist: task.checklist,
    rule: null,
    ref_template_id: null,
  };
}

export function SaveDayDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (t: Template) => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const templates = useStore((s) => s.templates);
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const selectedDate = useStore((s) => s.selectedDate);
  const insert = useStore((s) => s.insert);
  const toast = useStore((s) => s.toast);

  const [date, setDate] = React.useState(selectedDate);
  const [capture, setCapture] = React.useState<Capture>("day");
  const [includeDone, setIncludeDone] = React.useState(true);
  const [keepTimes, setKeepTimes] = React.useState(true);
  const [name, setName] = React.useState(() => suggestName(selectedDate, "day"));
  const [renamed, setRenamed] = React.useState(false);

  const start = capture === "week" ? startOfWeek(date, weekStart) : date;
  const dates = React.useMemo(
    () => (capture === "week" ? Array.from({ length: 7 }, (_, i) => addDays(start, i)) : [start]),
    [capture, start],
  );

  const groups = React.useMemo(
    () =>
      dates.map((iso, offset) => ({
        iso,
        offset,
        tasks: tasksOn(tasks, iso).filter((t) => (includeDone ? true : t.status !== "done")),
      })),
    [dates, tasks, includeDone],
  );

  const total = groups.reduce((sum, g) => sum + g.tasks.length, 0);

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
    if (!renamed) setName(suggestName(capture === "week" ? startOfWeek(iso, weekStart) : iso, capture));
  }

  function pickCapture(next: Capture) {
    setCapture(next);
    if (!renamed) {
      setName(suggestName(next === "week" ? startOfWeek(date, weekStart) : date, next));
    }
  }

  function save() {
    const items = groups.flatMap((group) =>
      group.tasks.map((task) => toItem(task, group.offset, keepTimes)),
    );
    if (!items.length) return;

    const created = insert("templates", {
      name: name.trim() || suggestName(start, capture),
      description:
        capture === "week"
          ? `Captured from the week of ${formatDate(start)}.`
          : `Captured from ${formatDate(start)}.`,
      scope: capture,
      items,
      order_index: nextOrder(templates),
    });

    toast({
      title: "Template created",
      description: `${plural(items.length, "item")} captured from ${
        capture === "week" ? `the week of ${formatDate(start)}` : friendlyDate(start)
      }.`,
      tone: "success",
    });
    onClose();
    onCreated(created);
  }

  return (
    <Modal open={open} onClose={onClose} width={620} title="Create a template from what you planned">
      <div className="grid max-h-[72vh] grid-cols-1 sm:grid-cols-[236px_1fr]">
        <div className="overflow-y-auto border-line p-3.5 sm:border-r">
          <MiniCalendar value={date} onChange={pickDate} weekStart={weekStart} markers={markers} />

          <div className="mt-3 space-y-2.5 border-t border-line pt-3">
            <Segmented
              size="sm"
              value={capture}
              onChange={pickCapture}
              options={[
                { value: "day" as Capture, label: "One day" },
                { value: "week" as Capture, label: "Whole week" },
              ]}
              className="w-full"
            />
            <Toggle
              checked={includeDone}
              onChange={setIncludeDone}
              label="Include finished tasks"
              description="A day is usually worth keeping because of what you finished."
            />
            <Toggle
              checked={keepTimes}
              onChange={setKeepTimes}
              label="Keep the clock times"
              description={
                keepTimes
                  ? "Items land at the same hour they ran."
                  : "Only durations are kept, so it drops anywhere."
              }
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="border-b border-line px-4 py-3">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => { setRenamed(true); setName(e.target.value); }}
                placeholder={suggestName(start, capture)}
              />
            </Field>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
              Every top-level task becomes an item, keeping its
              {keepTimes ? " time, " : " "}duration, priority, tags, notes and colour. The tasks
              themselves stay exactly where they are.
            </p>
          </div>

          <div className="max-h-[42vh] min-h-[120px] flex-1 overflow-y-auto px-4 py-3">
            {total === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                Nothing is scheduled {capture === "week" ? `that week` : `on ${formatDate(start)}`}.
                Pick a stretch you already planned well — that is the one worth keeping.
              </p>
            ) : (
              groups.map((group) => {
                if (!group.tasks.length) return null;
                return (
                  <section key={group.iso} className="mb-3 last:mb-0">
                    <div className="mb-1 flex items-baseline gap-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                        {capture === "week"
                          ? `${offsetLabel(group.offset, weekStart, "long")} · ${formatDate(group.iso, { weekday: false })}`
                          : friendlyDate(group.iso)}
                      </h3>
                      <span className="text-[11px] text-ink-4 tnum">{plural(group.tasks.length, "task")}</span>
                    </div>
                    <div className="space-y-[3px]">
                      {group.tasks.map((task) => (
                        <div key={task.id} className="flex items-baseline gap-2">
                          <span className="w-[62px] shrink-0 text-[11.5px] text-ink-4 tnum">
                            {keepTimes && task.start_min != null
                              ? formatTime(task.start_min, hour12)
                              : task.duration_min
                                ? formatDuration(task.duration_min)
                                : "—"}
                          </span>
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-[13px]",
                              task.status === "done" ? "text-ink-4" : "text-ink-2",
                            )}
                          >
                            {task.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <p className="text-[12px] text-ink-3 tnum">{plural(total, "item")} will be captured</p>
        <div className="flex-1" />
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={save} disabled={total === 0}>
          <CalendarPlus className="size-3.5" />
          Save as template
        </Button>
      </div>
    </Modal>
  );
}
