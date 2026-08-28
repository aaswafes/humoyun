"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, weekdayHeaders } from "@/lib/date";
import { Button, Input, SectionLabel, Segmented } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import {
  JUZ_COUNT, KHATM_PAGES, buildPlan, isQuranReading, juzOfPage, planRate,
  type PlanInput, type PlanMode,
} from "./quran";
import { useQuranPlan } from "./plan-actions";
import { TickRow } from "./prayer-panel";

const DAY_PRESETS = [30, 60, 90, 180];
const JUZ_PRESETS = [
  { value: "0.5", label: "Half a juz" },
  { value: "1", label: "1 juz" },
  { value: "2", label: "2 juz" },
  { value: "3", label: "3 juz" },
];
const PAGE_PRESETS = [4, 10, 20, 40];

const clampInt = (raw: string, min: number, max: number, fallback: number) => {
  const value = Math.round(Number(raw));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

/** Mounted only while open, so the form starts clean every time. */
export function KhatmPlanner({
  onClose, today, currentPage = 0,
}: {
  onClose: () => void;
  today: string;
  /** Pages already read in the current khatm, so the plan can resume. */
  currentPage?: number;
}) {
  const tasks = useStore((s) => s.tasks);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const { clearFrom, schedule } = useQuranPlan();

  const [mode, setMode] = React.useState<PlanMode>("days");
  const [daysText, setDaysText] = React.useState("30");
  const [juzText, setJuzText] = React.useState("1");
  const [pagesText, setPagesText] = React.useState("20");
  const [startPageText, setStartPageText] = React.useState(String(Math.min(KHATM_PAGES, currentPage + 1)));
  const [start, setStart] = React.useState(today);
  const [skip, setSkip] = React.useState<number[]>([]);
  const [replace, setReplace] = React.useState(true);

  const startPage = clampInt(startPageText, 1, KHATM_PAGES, 1);

  const { entries, perDay } = React.useMemo(() => {
    const input: PlanInput = {
      mode,
      days: clampInt(daysText, 1, 365, 30),
      juzPerDay: Number(juzText) || 1,
      pagesPerDay: clampInt(pagesText, 1, KHATM_PAGES, 20),
      startDate: start,
      startPage: clampInt(startPageText, 1, KHATM_PAGES, 1),
      endPage: KHATM_PAGES,
      skipWeekdays: skip,
    };
    return { entries: buildPlan(input), perDay: planRate(input) };
  }, [mode, daysText, juzText, pagesText, start, startPageText, skip]);

  const last = entries[entries.length - 1];
  const headers = React.useMemo(() => weekdayHeaders(weekStart, "min"), [weekStart]);

  const existing = tasks.filter(
    (t) => isQuranReading(t) && t.status !== "done" && !!t.date && t.date >= start,
  );

  function commit() {
    if (!entries.length) return;
    if (replace && existing.length) clearFrom(start);
    schedule(entries);
    toast({
      title: "Khatm scheduled",
      description: `${entries.length} readings · about ${perDay} pages a day · finishes ${formatDate(last.date)}.`,
      tone: "success",
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Plan a khatm" width={480}>
      <div className="max-h-[74vh] overflow-y-auto p-5">
        <p className="text-[13px] leading-relaxed text-ink-2">
          A khatm is {KHATM_PAGES} pages, thirty juz. Choose how you want to carve it up and every
          reading day is scheduled as a task carrying its own page range.
        </p>

        <div className="mt-5">
          <SectionLabel>Plan by</SectionLabel>
          <Segmented
            className="mt-2"
            value={mode}
            onChange={setMode}
            options={[
              { value: "days", label: "Finish date", title: "Spread it over a number of days" },
              { value: "juz", label: "Juz a day", title: "Cut every reading on a juz boundary" },
              { value: "pages", label: "Pages a day", title: "A flat page count each day" },
            ]}
          />
        </div>

        {mode === "days" && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Segmented
              value={daysText}
              onChange={setDaysText}
              options={DAY_PRESETS.map((d) => ({ value: String(d), label: `${d} days` }))}
            />
            <Field label="Custom" className="w-[104px]" hint="1–365">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  max={365}
                  value={daysText}
                  onChange={(e) => setDaysText(e.target.value)}
                  className="tnum"
                />
              )}
            </Field>
          </div>
        )}

        {mode === "juz" && (
          <div className="mt-4">
            <Segmented
              value={juzText}
              onChange={setJuzText}
              options={JUZ_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            />
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-4">
              Every reading ends on a juz boundary, so the plan lines up with how the mushaf is divided
              rather than with round page numbers.
            </p>
          </div>
        )}

        {mode === "pages" && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Segmented
              value={pagesText}
              onChange={setPagesText}
              options={PAGE_PRESETS.map((p) => ({ value: String(p), label: `${p} pages` }))}
            />
            <Field label="Custom" className="w-[104px]" hint="pages">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  max={KHATM_PAGES}
                  value={pagesText}
                  onChange={(e) => setPagesText(e.target.value)}
                  className="tnum"
                />
              )}
            </Field>
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-[152px_minmax(0,1fr)]">
          <Field
            label="Start from page"
            description={currentPage > 0 ? `You are on page ${currentPage}.` : "Page 1 starts a fresh khatm."}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                max={KHATM_PAGES}
                value={startPageText}
                onChange={(e) => setStartPageText(e.target.value)}
                className="tnum"
              />
            )}
          </Field>

          <div>
            <SectionLabel>Rest days</SectionLabel>
            <div className="mt-2 flex gap-1">
              {headers.map((label, i) => {
                const index = (i + weekStart) % 7;
                const off = skip.includes(index);
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={off}
                    aria-label={`${off ? "Read on" : "Skip"} ${label}`}
                    onClick={() => setSkip(off ? skip.filter((d) => d !== index) : [...skip, index])}
                    className={cn(
                      "h-7 flex-1 cursor-pointer rounded-md border text-[11.5px] font-medium",
                      "transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-apple)]",
                      off
                        ? "border-transparent bg-hover text-ink-4 line-through"
                        : "border-line text-ink-2 hover:border-line-strong",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11.5px] text-ink-4">Days marked here are left empty.</p>
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
          <span className="font-medium text-ink">{last ? formatDate(last.date, { year: true }) : "—"}</span>
          <span className="mt-1 block text-[11.5px] text-ink-3">
            From p.<span className="tnum">{startPage}</span> (juz{" "}
            <span className="tnum">{juzOfPage(startPage)}</span>) to p.
            <span className="tnum">{KHATM_PAGES}</span> — about{" "}
            <span className="tnum">{(perDay / (KHATM_PAGES / JUZ_COUNT)).toFixed(1)}</span> juz a day.
          </span>
          {entries.length > 200 && (
            <span className="mt-1 block text-[11.5px] text-warn">
              That is {entries.length} rows on your calendar. A larger daily portion keeps it lighter.
            </span>
          )}
        </div>

        {existing.length > 0 && (
          <TickRow
            className="mt-3 -ml-2"
            checked={replace}
            onToggle={() => setReplace(!replace)}
            title={`Replace the ${existing.length} Quran reading${existing.length > 1 ? "s" : ""} already scheduled from this date`}
            detail="Anything already ticked stays where it is."
          />
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={commit} disabled={!entries.length}>
            Schedule {entries.length} readings
          </Button>
        </div>
      </div>
    </Modal>
  );
}
