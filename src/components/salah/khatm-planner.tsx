"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { addDays, formatDate } from "@/lib/date";
import { Button, Checkbox, Input, SectionLabel, Segmented } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { KHATM_PAGES, QURAN_TAG, isQuranReading } from "./quran";

const PRESETS = [30, 60, 90, 180];

/** Mounted only while open, so the form starts clean every time. */
export function KhatmPlanner({ onClose, today }: { onClose: () => void; today: string }) {
  const tasks = useStore((s) => s.tasks);
  const addTask = useStore((s) => s.addTask);
  const removeWhere = useStore((s) => s.removeWhere);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const [daysText, setDaysText] = React.useState("30");
  const [start, setStart] = React.useState(today);
  const [replace, setReplace] = React.useState(true);

  const days = Math.min(365, Math.max(1, Number(daysText) || 30));
  const perDay = Math.max(1, Math.ceil(KHATM_PAGES / days));

  const entries = React.useMemo(() => {
    const out: { date: string; from: number; to: number }[] = [];
    let page = 0;
    for (let i = 0; page < KHATM_PAGES; i++) {
      const from = page + 1;
      const to = Math.min(KHATM_PAGES, page + perDay);
      out.push({ date: addDays(start, i), from, to });
      page = to;
    }
    return out;
  }, [perDay, start]);

  const existing = tasks.filter(
    (t) => isQuranReading(t) && t.status !== "done" && !!t.date && t.date >= start,
  );

  function schedule() {
    if (replace && existing.length) {
      removeWhere("tasks", (t) => isQuranReading(t) && t.status !== "done" && !!t.date && t.date >= start);
    }
    entries.forEach((entry) => {
      addTask({
        title: `Quran — p.${entry.from}–${entry.to}`,
        kind: "reading",
        date: entry.date,
        tags: [QURAN_TAG],
        color: "emerald",
        page_from: entry.from,
        page_to: entry.to,
        duration_min: Math.max(10, Math.round((entry.to - entry.from + 1) * 1.5)),
      });
    });
    toast({
      title: "Khatm scheduled",
      description: `${entries.length} days · ${perDay} pages a day · finishes ${formatDate(entries[entries.length - 1].date)}.`,
      tone: "success",
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Plan a khatm" width={460}>
      <div className="max-h-[74vh] overflow-y-auto p-5">
        <p className="text-[13px] leading-relaxed text-ink-2">
          A khatm is {KHATM_PAGES} pages. Choose how long you want to take and every day is
          scheduled as a reading task carrying its own page range.
        </p>

        <div className="mt-5">
          <SectionLabel>Finish in</SectionLabel>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Segmented
              value={daysText}
              onChange={setDaysText}
              options={PRESETS.map((d) => ({ value: String(d), label: `${d} days` }))}
            />
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                max={365}
                value={daysText}
                onChange={(e) => setDaysText(e.target.value)}
                aria-label="Number of days"
                className="tnum w-[68px]"
              />
              <span className="text-[12.5px] text-ink-3">days</span>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <SectionLabel>Starting</SectionLabel>
          <div className="mt-2 rounded-lg border border-line p-2">
            <MiniCalendar value={start} onChange={setStart} weekStart={weekStart} />
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-hover px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
          <span className="tnum font-medium text-ink">{perDay}</span> pages a day ·{" "}
          <span className="tnum font-medium text-ink">{entries.length}</span> readings · finishes{" "}
          <span className="font-medium text-ink">{formatDate(entries[entries.length - 1].date, { year: true })}</span>
        </div>

        {existing.length > 0 && (
          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <Checkbox
              checked={replace}
              onChange={setReplace}
              size="sm"
              label="Replace the Quran readings already scheduled"
              className="mt-[1px]"
            />
            <span className="text-[12.5px] leading-relaxed text-ink-2">
              Replace the {existing.length} Quran reading{existing.length > 1 ? "s" : ""} already
              scheduled from this date.
            </span>
          </label>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={schedule}>
            Schedule {entries.length} readings
          </Button>
        </div>
      </div>
    </Modal>
  );
}
