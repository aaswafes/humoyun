"use client";

import * as React from "react";
import { ArrowLeft, CalendarDays, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import { MEDIA_KINDS, YOUTUBE_KINDS, type Note } from "@/lib/types";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { SOURCE_ICONS } from "./note-fields";
import type { SourceRef } from "./note-model";

/**
 * Every link a note can carry, cleared in one go. A note belongs to one place,
 * so attaching it somewhere new detaches it from wherever it was — including
 * the day, which is a source like any other. That is what keeps the chip on
 * the card and the source filter from disagreeing about where a note lives.
 */
export const CLEARED_SOURCE = {
  book_id: null, media_id: null, task_id: null, goal_id: null, date: null,
} satisfies Partial<Note>;

/** Long shelves stay usable by asking you to type rather than scrolling forever. */
const PREVIEW = 6;
const MATCHES = 14;

export function SourcePicker({
  refer, onChange, className,
}: {
  refer: SourceRef;
  onChange: (changes: Partial<Note>) => void;
  className?: string;
}) {
  const Icon = SOURCE_ICONS[refer.kind];

  return (
    <Popover
      align="start"
      className="w-[288px] p-0"
      trigger={
        <button
          type="button"
          aria-label={`Filed under ${refer.label}. Change where this note is filed`}
          className={cn(
            "inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5",
            "text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink",
            className,
          )}
        >
          <Icon className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          <span className="min-w-0 truncate">{refer.label}</span>
        </button>
      }
    >
      {(close) => <PickerPanel refer={refer} onChange={onChange} close={close} />}
    </Popover>
  );
}

function PickerPanel({
  refer, onChange, close,
}: {
  refer: SourceRef;
  onChange: (changes: Partial<Note>) => void;
  close: () => void;
}) {
  const books = useStore((s) => s.books);
  const media = useStore((s) => s.media);
  const goals = useStore((s) => s.goals);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const [mode, setMode] = React.useState<"list" | "day">("list");
  const [query, setQuery] = React.useState("");
  const searchId = React.useId();

  const pick = (changes: Partial<Note>) => {
    onChange({ ...CLEARED_SOURCE, ...changes });
    close();
  };

  if (mode === "day") {
    return (
      <div className="p-2">
        <button
          type="button"
          onClick={() => setMode("list")}
          className={cn(
            "mb-1 flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[12.5px] text-ink-2",
            "transition-colors duration-150 hover:bg-hover hover:text-ink",
          )}
        >
          <ArrowLeft className="size-3.5 text-ink-3" aria-hidden />
          Back to everything
        </button>
        <MiniCalendar
          value={refer.kind === "day" && refer.id ? refer.id : todayISO()}
          weekStart={weekStart}
          onChange={(iso) => pick({ date: iso })}
        />
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const hit = (text: string | null) => !q || (text ?? "").toLowerCase().includes(q);

  const bookHits = books.filter((b) => hit(b.title) || hit(b.author));
  const watchHits = media.filter(
    (m) => (MEDIA_KINDS as string[]).includes(m.kind) && (hit(m.title) || hit(m.creator)));
  const tubeHits = media.filter(
    (m) => (YOUTUBE_KINDS as string[]).includes(m.kind) && (hit(m.title) || hit(m.channel)));
  const goalHits = goals.filter((g) => g.status !== "dropped" && hit(g.title));

  const limit = q ? MATCHES : PREVIEW;
  const nothing = !bookHits.length && !watchHits.length && !tubeHits.length && !goalHits.length;

  return (
    <div className="flex max-h-[62vh] flex-col">
      <div className="relative shrink-0 p-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-4"
          aria-hidden
        />
        <input
          id={searchId}
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search books, titles and goals"
          placeholder="Search books, titles, goals"
          className={cn(
            "h-8 w-full rounded-md bg-transparent pl-7 pr-2 text-[13px] text-ink",
            "placeholder:text-ink-4 focus:outline-none",
            "[&::-webkit-search-cancel-button]:appearance-none",
          )}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line p-1">
        <MenuItem
          icon={SOURCE_ICONS.none}
          checked={refer.kind === "none"}
          onClick={() => pick({})}
        >
          Standalone
        </MenuItem>

        <MenuSeparator />
        <MenuLabel>A day</MenuLabel>
        <MenuItem
          icon={SOURCE_ICONS.day}
          checked={refer.kind === "day" && refer.id === todayISO()}
          onClick={() => pick({ date: todayISO() })}
        >
          Today
        </MenuItem>
        <MenuItem icon={CalendarDays} onClick={() => setMode("day")}>
          Pick a day…
        </MenuItem>

        <Group label="Books" items={bookHits} limit={limit}>
          {(book) => (
            <MenuItem
              key={book.id}
              icon={SOURCE_ICONS.book}
              checked={refer.kind === "book" && refer.id === book.id}
              onClick={() => pick({ book_id: book.id })}
            >
              {book.title}
            </MenuItem>
          )}
        </Group>

        <Group label="Films, anime & series" items={watchHits} limit={limit}>
          {(item) => (
            <MenuItem
              key={item.id}
              icon={SOURCE_ICONS.media}
              checked={refer.kind === "media" && refer.id === item.id}
              onClick={() => pick({ media_id: item.id })}
            >
              {item.title}
            </MenuItem>
          )}
        </Group>

        <Group label="YouTube" items={tubeHits} limit={limit}>
          {(item) => (
            <MenuItem
              key={item.id}
              icon={SOURCE_ICONS.media}
              checked={refer.kind === "media" && refer.id === item.id}
              onClick={() => pick({ media_id: item.id })}
            >
              {item.title}
            </MenuItem>
          )}
        </Group>

        <Group label="Goals" items={goalHits} limit={limit}>
          {(goal) => (
            <MenuItem
              key={goal.id}
              icon={SOURCE_ICONS.goal}
              checked={refer.kind === "goal" && refer.id === goal.id}
              onClick={() => pick({ goal_id: goal.id })}
            >
              {goal.title}
            </MenuItem>
          )}
        </Group>

        {q && nothing && (
          <p className="px-2 py-3 text-center text-[12px] text-ink-4">
            Nothing on your shelves matches “{query.trim()}”.
          </p>
        )}
      </div>
    </div>
  );
}

/** One shelf inside the picker, with an honest line when it is longer than shown. */
function Group<T extends { id: string }>({
  label, items, limit, children,
}: {
  label: string;
  items: T[];
  limit: number;
  children: (item: T) => React.ReactNode;
}) {
  if (!items.length) return null;
  const shown = items.slice(0, limit);
  const hidden = items.length - shown.length;

  return (
    <>
      <MenuSeparator />
      <MenuLabel>{label}</MenuLabel>
      {shown.map(children)}
      {hidden > 0 && (
        <p className="px-2 pb-1 pt-0.5 text-[11px] text-ink-4 tnum">
          {hidden} more — keep typing
        </p>
      )}
    </>
  );
}
