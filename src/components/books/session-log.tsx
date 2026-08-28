"use client";

import * as React from "react";
import { Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, formatDuration, todayISO } from "@/lib/date";
import type { Book } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/primitives";
import { DateField, Field, NumberField } from "./fields";
import { addSession, removeSession, type ReadingSession } from "./library-prefs";

const PREVIEW = 5;

/**
 * A sitting is the honest record: what day, how many pages, how long. It is
 * what the projected finish date is built from, so logging one is worth a
 * three-field form of its own rather than a bookmark nudge.
 */
export function SessionLog({
  book, sessions, weekStart, className,
}: {
  book: Book;
  sessions: ReadingSession[];
  weekStart: number;
  className?: string;
}) {
  const logReading = useStore((s) => s.logReading);
  const toast = useStore((s) => s.toast);

  const total = Math.max(1, book.total_pages);
  const read = Math.max(0, Math.min(book.current_page, total));
  const left = total - read;

  const [date, setDate] = React.useState(todayISO);
  const [pages, setPages] = React.useState(() =>
    Math.max(1, Math.min(left || 1, book.pages_per_day ?? 20)));
  const [minutes, setMinutes] = React.useState(30);
  const [expanded, setExpanded] = React.useState(false);

  const endPage = Math.min(total, read + pages);
  const canLog = pages > 0 && left > 0;
  const visible = expanded ? sessions : sessions.slice(0, PREVIEW);

  function log() {
    if (!canLog) return;
    addSession({ bookId: book.id, date, pages, minutes, endPage });
    // Backdating a sitting must never drag the bookmark backwards.
    if (endPage > read) logReading(book.id, endPage);
    toast({
      title: `${pages} ${pages === 1 ? "page" : "pages"} logged`,
      description: `${formatDate(date)} · ${minutes ? `${formatDuration(minutes)} · ` : ""}now on p.${endPage}`,
      tone: "success",
    });
    setPages(Math.max(1, Math.min(total - endPage || 1, book.pages_per_day ?? 20)));
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_84px_84px] items-end gap-2">
        <Field label="Day">
          <DateField label="Session date" value={date} weekStart={weekStart} onChange={setDate} />
        </Field>
        <Field label="Pages">
          <NumberField
            label="Pages read"
            value={pages}
            min={0}
            max={total}
            step={5}
            onChange={setPages}
          />
        </Field>
        <Field label="Minutes">
          <NumberField
            label="Minutes spent"
            value={minutes}
            min={0}
            max={1440}
            step={5}
            onChange={setMinutes}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" disabled={!canLog} onClick={log}>
          Log session
        </Button>
        <p className="text-[11.5px] text-ink-4 tnum">
          {left > 0
            ? `Takes you to p.${endPage}${minutes > 0 && pages > 0 ? ` · ${Math.round(minutes / pages * 10) / 10} min a page` : ""}`
            : "Every page is already read."}
        </p>
      </div>

      {sessions.length > 0 && (
        <div className="rounded-md border border-line">
          {visible.map((s, i) => (
            <div
              key={s.id}
              className={cn("group/session flex items-center gap-2 px-2 py-[6px]", i > 0 && "hairline-t")}
            >
              <span className="w-[78px] shrink-0 text-[12px] text-ink-2 tnum">{formatDate(s.date)}</span>
              <span className="shrink-0 text-[12px] font-medium text-ink tnum">
                {s.pages} pp
              </span>
              {s.minutes > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-ink-3 tnum">
                  <Clock className="size-3" aria-hidden />
                  {formatDuration(s.minutes)}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-right text-[11.5px] text-ink-4 tnum">
                to p.{s.end_page}
              </span>
              <IconButton
                label={`Delete the ${formatDate(s.date)} session`}
                size="sm"
                tone="danger"
                className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/session:opacity-100"
                onClick={() => removeSession(s.id)}
              >
                <Trash2 />
              </IconButton>
            </div>
          ))}

          {sessions.length > PREVIEW && (
            <div className="hairline-t p-1">
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Show fewer sessions" : `Show all ${sessions.length} sessions`}
              </Button>
            </div>
          )}
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed text-ink-4">
        Deleting a sitting removes it from your pace history. It never rewinds the bookmark —
        that number is yours to set.
      </p>
    </div>
  );
}
