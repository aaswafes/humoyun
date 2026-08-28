"use client";

import * as React from "react";
import { CalendarDays, Clock, Hash, Flag, Timer as TimerIcon, CornerDownLeft } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseTask } from "@/lib/parse";
import { formatDuration, formatTime, friendlyDate } from "@/lib/date";
import { Modal } from "@/components/ui/overlays";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const PRIORITY_TINT = ["", "text-ink-2", "text-warn", "text-danger"];

/**
 * One field. Type a sentence, get a scheduled task.
 * "gym tomorrow 7am for 45m #health !high"
 */
export function QuickAdd() {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const addTask = useStore((s) => s.addTask);
  const selectedDate = useStore((s) => s.selectedDate);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const hour12 = useStore((s) => s.hour12);
  const toast = useStore((s) => s.toast);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("humoyun:quick-add", onOpen);
    return () => window.removeEventListener("humoyun:quick-add", onOpen);
  }, []);

  const parsed = React.useMemo(() => parseTask(value, weekStart), [value, weekStart]);

  function submit(keepOpen = false) {
    const title = parsed.title.trim();
    if (!title) return;
    addTask({
      title,
      date: parsed.date ?? selectedDate,
      start_min: parsed.start_min,
      end_min: parsed.end_min,
      all_day: parsed.start_min == null,
      duration_min: parsed.duration_min,
      priority: parsed.priority,
      tags: parsed.tags,
    });
    toast({ title: "Task added", description: `${title} · ${friendlyDate(parsed.date ?? selectedDate)}` });
    setValue("");
    if (!keepOpen) setOpen(false);
  }

  const chips: { icon: React.ComponentType<{ className?: string }>; text: string; className?: string }[] = [];
  if (parsed.date) chips.push({ icon: CalendarDays, text: friendlyDate(parsed.date) });
  if (parsed.start_min != null) {
    chips.push({
      icon: Clock,
      text: parsed.end_min != null
        ? `${formatTime(parsed.start_min, hour12)} – ${formatTime(parsed.end_min, hour12)}`
        : formatTime(parsed.start_min, hour12),
    });
  }
  if (parsed.duration_min) chips.push({ icon: TimerIcon, text: formatDuration(parsed.duration_min) });
  if (parsed.priority) {
    chips.push({
      icon: Flag,
      text: ["", "Low", "Medium", "High"][parsed.priority],
      className: PRIORITY_TINT[parsed.priority],
    });
  }
  parsed.tags.forEach((t) => chips.push({ icon: Hash, text: t }));

  return (
    <Modal open={open} onClose={() => { setOpen(false); setValue(""); }} width={560} className="!rounded-2xl">
      <div className="p-4">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(e.shiftKey); }
          }}
          placeholder="Read 30 pages tomorrow 9am for 45m #deep !high"
          className="w-full bg-transparent text-[17px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-4"
        />

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip, i) => {
              const Icon = chip.icon;
              return (
                <span
                  key={i}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md bg-hover px-1.5 py-1 text-[11.5px] font-medium text-ink-2",
                    chip.className,
                  )}
                >
                  <Icon className="size-3" />
                  {chip.text}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-line px-4 py-2.5 text-[11.5px] text-ink-4">
        <span>
          Try <span className="text-ink-3">tomorrow</span>, <span className="text-ink-3">friday 9am</span>,{" "}
          <span className="text-ink-3">#tag</span>, <span className="text-ink-3">!high</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Kbd>⇧</Kbd><Kbd>↵</Kbd> add another
          <span className="mx-1 text-ink-4">·</span>
          <Kbd><CornerDownLeft className="size-2.5" /></Kbd> add
        </span>
      </div>
    </Modal>
  );
}

export function openQuickAdd() {
  window.dispatchEvent(new CustomEvent("humoyun:quick-add"));
}
