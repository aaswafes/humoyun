"use client";

import * as React from "react";
import { Check, Moon, Pencil } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, completionOn, focusMinutesOn } from "@/lib/store";
import { formatDuration, formatTime } from "@/lib/date";
import { buildLogIndex, habitScheduledOn, isHabitComplete, NO_COUNTS } from "@/lib/habits";
import { Button, Textarea } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlays";

const COUNTED = ["prayed", "jamaah", "late"];
/** From this hour on, the day is close enough to over to be worth closing. */
export const CLOSING_HOUR = 20;

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="display-serif tnum select-none text-[22px] leading-none text-ink">{value}</p>
      <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</p>
    </div>
  );
}

/**
 * The masthead's end-of-day state: an offer to close the day once the last task
 * is done or the evening has arrived, and a two-field reflection written to the
 * day log. Reopening is always possible — a closed day is a note, not a lock.
 */
export function CloseDay({ date, now }: { date: string; now: number }) {
  const tasks = useStore((s) => s.tasks);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const prayers = useStore((s) => s.prayers);
  const focusSessions = useStore((s) => s.focusSessions);
  const log = useStore((s) => s.dayLogs.find((d) => d.date === date));
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const hour12 = useStore((s) => s.hour12);
  const setDayLog = useStore((s) => s.setDayLog);
  const toast = useStore((s) => s.toast);

  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState("");
  const [gratitude, setGratitude] = React.useState("");

  const closedAt = typeof log?.data?.closed_at === "string" ? (log.data.closed_at as string) : null;
  const { done, total } = completionOn(tasks, date);
  const hour = new Date(now).getHours();
  const eligible = !!closedAt || hour >= CLOSING_HOUR || (total > 0 && done === total);

  const focusMinutes = focusMinutesOn(focusSessions, date);
  const prayed = prayers.filter((p) => p.date === date && COUNTED.includes(p.status)).length;

  const logIndex = React.useMemo(() => buildLogIndex(habitLogs), [habitLogs]);
  const habitStat = React.useMemo(() => {
    const due = habits.filter((h) => habitScheduledOn(h, date, logIndex.get(h.id) ?? NO_COUNTS, weekStart));
    const hit = due.filter((h) => isHabitComplete(h, logIndex.get(h.id)?.get(date))).length;
    return { due: due.length, hit };
  }, [habits, date, logIndex, weekStart]);

  function start() {
    setHighlight(log?.highlight ?? "");
    setGratitude(log?.gratitude ?? "");
    setOpen(true);
  }

  function save() {
    setDayLog(date, {
      highlight: highlight.trim() || null,
      gratitude: gratitude.trim() || null,
      data: { ...(log?.data ?? {}), closed_at: closedAt ?? new Date().toISOString() },
    });
    setOpen(false);
    toast({
      title: closedAt ? "Reflection updated" : "Day closed",
      description: closedAt ? undefined : "Rest well — tomorrow is already on the calendar.",
      tone: "success",
    });
  }

  function reopen() {
    const rest = { ...(log?.data ?? {}) };
    delete rest.closed_at;
    setDayLog(date, { data: rest });
    toast({ title: "Day reopened" });
  }

  if (!eligible) return null;

  const closedTime = closedAt ? new Date(closedAt) : null;

  return (
    <>
      {closedAt ? (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-[12px] font-medium text-success tnum">
            <Check className="size-3.5" aria-hidden />
            Closed
            {closedTime && (
              <span className="font-normal">
                {formatTime(closedTime.getHours() * 60 + closedTime.getMinutes(), hour12)}
              </span>
            )}
          </span>
          <Button size="sm" variant="ghost" onClick={start}>
            <Pencil className="size-3.5" />
            Reflection
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={start}>
          <Moon className="size-3.5" />
          Close the day
        </Button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Close the day" width={460}>
        <div className="px-5 pb-5 pt-4">
          <div className="grid grid-cols-4 gap-3 rounded-lg bg-hover px-3.5 py-3">
            <Stat value={total ? `${done}/${total}` : "—"} label="Tasks" />
            <Stat value={focusMinutes ? formatDuration(focusMinutes) : "0m"} label="Focus" />
            <Stat value={`${prayed}/5`} label="Salah" />
            <Stat value={habitStat.due ? `${habitStat.hit}/${habitStat.due}` : "—"} label="Habits" />
          </div>

          <div className="mt-4 flex flex-col gap-3.5">
            <Field label="What went well" description="One line is enough. It is for the you who reads this in a month.">
              {(wiring) => (
                <Textarea
                  {...wiring}
                  autoFocus
                  rows={2}
                  value={highlight}
                  onChange={(e) => setHighlight(e.target.value)}
                  placeholder="The thing worth keeping from today"
                />
              )}
            </Field>

            <Field label="Grateful for">
              {(wiring) => (
                <Textarea
                  {...wiring}
                  rows={2}
                  value={gratitude}
                  onChange={(e) => setGratitude(e.target.value)}
                  placeholder="Something you did not earn"
                />
              )}
            </Field>
          </div>

          <div className={cn("mt-5 flex items-center gap-2", closedAt ? "justify-between" : "justify-end")}>
            {closedAt && (
              <Button size="sm" variant="ghost" onClick={() => { reopen(); setOpen(false); }}>
                Reopen the day
              </Button>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={save}>
                {closedAt ? "Save reflection" : "Close the day"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
