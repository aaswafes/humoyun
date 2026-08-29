"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, NotebookPen, NotebookText } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, formatDate } from "@/lib/date";
import { AutoTextarea, Button } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { Fold, useFold } from "./fold";
import { useAutosave } from "./use-autosave";

export const MOOD_LABELS = ["Rough", "Low", "OK", "Good", "Great"];
export const ENERGY_LABELS = ["Empty", "Low", "Steady", "High", "Full"];

/** A 1–5 scale that reads as text, not as five shades of the same colour. */
function Scale({
  label, options, value, onChange,
}: {
  label: string;
  options: string[];
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const id = React.useId();
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span id={id} className="text-[12px] font-medium text-ink-2">{label}</span>
        <span className="text-[11.5px] text-ink-4">{value ? options[value - 1] : "not set"}</span>
      </div>
      <div role="group" aria-labelledby={id} className="flex gap-1">
        {options.map((option, i) => {
          const step = i + 1;
          const active = value === step;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              aria-label={`${label}: ${option}`}
              onClick={() => onChange(active ? null : step)}
              className={cn(
                "h-7 min-w-0 flex-1 cursor-pointer truncate rounded-md px-1 text-[12px]",
                "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)]",
                "active:scale-[0.97]",
                active
                  ? "bg-accent-soft font-semibold text-accent"
                  : "bg-hover text-ink-3 hover:bg-active hover:text-ink",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The evening surface: mood, energy and the note. Nothing here is needed at
 * 9am, so it rests folded behind what it already holds.
 */
export function DayLogPanel({ date, className }: { date: string; className?: string }) {
  const log = useStore((s) => s.dayLogs.find((d) => d.date === date));
  const yesterday = useStore((s) => s.dayLogs.find((d) => d.date === addDays(date, -1)));
  const setDayLog = useStore((s) => s.setDayLog);
  const daily = useStore((s) => s.notes.find((n) => n.kind === "daily" && n.date === date));
  const insert = useStore((s) => s.insert);
  const router = useRouter();
  const { open, toggle } = useFold("logOpen", false);

  const [note, setNote] = React.useState(log?.note ?? "");
  const { status, flush } = useAutosave(
    note,
    React.useCallback((v: string) => setDayLog(date, { note: v.trim() ? v : null }), [date, setDayLog]),
  );

  const yesterdayLine = [
    yesterday?.mood ? MOOD_LABELS[yesterday.mood - 1] : null,
    yesterday?.energy ? ENERGY_LABELS[yesterday.energy - 1] : null,
  ].filter(Boolean).join(" · ");

  const summary =
    [
      log?.mood ? MOOD_LABELS[log.mood - 1] : null,
      log?.energy ? `${ENERGY_LABELS[log.energy - 1]} energy` : null,
      note.trim() ? "note written" : null,
      daily ? "daily note started" : null,
    ].filter(Boolean).join(" · ") || "not logged yet";

  /**
   * The long form of the day. It is a `notes` row, not a second copy of the
   * field above — so it is written on the Notes page, where it can be read
   * back beside every other day.
   */
  function openDailyNote() {
    flush(); // leaving the page mid-sentence must not lose the sentence
    const row = daily ?? insert("notes", {
      kind: "daily",
      date,
      title: formatDate(date, { year: true }),
    });
    router.push(`/notes?note=${row.id}`);
  }

  return (
    <Fold
      icon={NotebookPen}
      title="How today felt"
      summary={summary}
      open={open}
      onToggle={toggle}
      className={className}
    >
      <div className="pb-1 pt-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-5">
          <Scale
            label="Mood"
            options={MOOD_LABELS}
            value={log?.mood ?? null}
            onChange={(mood) => setDayLog(date, { mood })}
          />
          <Scale
            label="Energy"
            options={ENERGY_LABELS}
            value={log?.energy ?? null}
            onChange={(energy) => setDayLog(date, { energy })}
          />
        </div>

        <div className="mt-3.5">
          <Field
            label="Note"
            hint={
              status === "saved" ? (
                <span className="inline-flex items-center gap-1 text-ink-3">
                  <Check className="size-3 text-success" aria-hidden />
                  Saved
                </span>
              ) : status === "pending" ? (
                "Saving…"
              ) : (
                "Autosaves"
              )
            }
          >
            {(wiring) => (
              <div
                className={cn(
                  "rounded-md border border-line px-2.5 py-2 transition-[border-color,box-shadow] duration-150",
                  "hover:border-line-strong focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft",
                )}
              >
                <AutoTextarea
                  {...wiring}
                  value={note}
                  onChange={setNote}
                  onBlur={flush}
                  minRows={2}
                  placeholder="What actually happened, what got in the way, what you want to remember."
                  className="text-[13.5px] text-ink placeholder:text-ink-4"
                />
              </div>
            )}
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Button size="sm" variant="ghost" className="-ml-2" onClick={openDailyNote}>
            <NotebookText className="size-3.5" aria-hidden />
            {daily ? "Open the daily note" : "Start a daily note"}
            <ArrowRight className="size-3" aria-hidden />
          </Button>
          <span className="min-w-0 text-[11.5px] text-ink-4">
            A line or two stays here; the long write-up lives in Notes.
          </span>
        </div>

        {yesterdayLine && (
          <p className="mt-2 text-[11.5px] text-ink-4">Yesterday: {yesterdayLine}</p>
        )}
      </div>
    </Fold>
  );
}
