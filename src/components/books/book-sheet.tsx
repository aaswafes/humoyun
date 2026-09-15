"use client";

import * as React from "react";
import {
  CalendarX, Check, ChevronDown, Gauge, MoreHorizontal, Palette,
  PauseCircle, PlayCircle, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, diffDays, formatDate, friendlyDate, startOfWeek, todayISO } from "@/lib/date";
import type { Book, Task } from "@/lib/types";
import {
  AutoTextarea, Button, Checkbox, IconButton, InlineInput, Input, SectionLabel,
} from "@/components/ui/primitives";
import {
  ConfirmDialog, MenuItem, MenuSeparator, Popover, Sheet, TintPicker, SheetMaximize,
} from "@/components/ui/overlays";
import { facetValues } from "./facets";
import { BookCover } from "./book-cover";
import { Disclosure } from "./disclosure";
import { Field, NumberField, RatingStars, SuggestInput } from "./fields";
import { PlanEditor } from "./plan-editor";
import { PlanDiffView } from "./plan-diff-view";
import { BookCalendarStrip } from "./book-calendar-strip";
import { SessionLog } from "./session-log";
import { BookNotes } from "./book-notes";
import { PauseDialog } from "./pause-dialog";
import { computePlan, shortDate, skipWeekdaysOf, type PlanDraft } from "./plan";
import { diffPlan, projectBlocks } from "./plan-diff";
import { daysPhrase, paceStats, projectFinish, ratePhrase, readDays } from "./pace";
import {
  clearPause, forgetBook, notesFor, pauseUntil, seriesNames, sessionsFor, setSeries,
  useLibraryPrefs,
} from "./library-prefs";
import { recordReading } from "./reading-actions";

type BookStatus = Book["status"];

const STATUS_LABEL: Record<BookStatus, string> = {
  reading: "Reading",
  planned: "Planned",
  finished: "Finished",
  paused: "Paused",
  dropped: "Dropped",
};

const STATUS_DOT: Record<BookStatus, string> = {
  reading: "var(--accent)",
  planned: "var(--ink-3)",
  finished: "var(--success)",
  paused: "var(--warn)",
  dropped: "var(--ink-4)",
};

const STATUS_ORDER: BookStatus[] = ["reading", "planned", "paused", "finished", "dropped"];

/**
 * One group of the sheet. Only Reading is open when the sheet arrives; the
 * rest state their contents on one line and unfold when asked.
 */
function Group({
  storageKey, label, summary, defaultOpen, action, children,
}: {
  storageKey: string;
  label: string;
  summary: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Disclosure
      storageKey={storageKey}
      label={label}
      summary={summary}
      defaultOpen={defaultOpen}
      action={action}
      className="hairline-t px-4 py-2"
      bodyClassName="pb-4 pt-2"
    >
      {children}
    </Disclosure>
  );
}

/** A fold inside a group — spacing and a hairline, never a second card. */
function SubGroup({
  storageKey, label, summary, children,
}: {
  storageKey: string;
  label: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Disclosure
      storageKey={storageKey}
      label={label}
      summary={summary}
      className="mt-4 hairline-t"
      bodyClassName="pb-1 pt-2"
    >
      {children}
    </Disclosure>
  );
}

// =========================================================
export function BookSheet({ bookId, onClose }: { bookId: string | null; onClose: () => void }) {
  const book = useStore((s) => s.books.find((b) => b.id === bookId) ?? null);

  return (
    <Sheet open={!!book} onClose={onClose} width={470} resizeKey="book">
      {book && <BookSheetBody key={book.id} book={book} onClose={onClose} />}
    </Sheet>
  );
}

function BookSheetBody({ book, onClose }: { book: Book; onClose: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const removeWhere = useStore((s) => s.removeWhere);
  const toggleTask = useStore((s) => s.toggleTask);
  const scheduleBook = useStore((s) => s.scheduleBook);
  const unscheduleBook = useStore((s) => s.unscheduleBook);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const library = useLibraryPrefs();

  const today = todayISO();
  const total = Math.max(1, book.total_pages);
  const read = Math.max(0, Math.min(book.current_page, total));
  const pct = Math.round((read / total) * 100);

  // ---- local drafts: text commits on blur, numbers follow the store ----
  const [title, setTitle] = React.useState(book.title);
  const books = useStore((s) => s.books);
  const [author, setAuthor] = React.useState(book.author ?? "");
  const [genre, setGenre] = React.useState(book.genre ?? "");
  const [topic, setTopic] = React.useState(book.topic ?? "");
  const [seriesName, setSeriesName] = React.useState(book.series ?? "");
  const [pages, setPages] = React.useState(String(book.total_pages));
  const [cover, setCover] = React.useState(book.cover_url ?? "");
  const [notes, setNotes] = React.useState(book.notes ?? "");
  const [series, setSeriesDraft] = React.useState(library.series[book.id] ?? "");
  const [pageDraft, setPageDraft] = React.useState(read);
  const [seenPage, setSeenPage] = React.useState(read);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [pausing, setPausing] = React.useState(false);
  const [showAllWeeks, setShowAllWeeks] = React.useState(false);

  // Ticking a block advances the bookmark — the "on page" field has to follow.
  if (seenPage !== read) {
    setSeenPage(read);
    setPageDraft(read);
  }

  const [plan, setPlan] = React.useState<PlanDraft>(() => ({
    mode: "rate",
    startDate: today,
    pagesPerDay: book.pages_per_day ?? 30,
    endDate: book.end_date && book.end_date > today ? book.end_date : addDays(today, 21),
    skipWeekends: false,
  }));
  const planResult = computePlan(plan, total, read);

  // ---- blocks, grouped by week ----
  const blocks = React.useMemo(
    () => tasks
      .filter((t) => t.book_id === book.id && t.kind === "reading")
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999")),
    [tasks, book.id],
  );

  const weeks = React.useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const t of blocks) {
      const key = t.date ? startOfWeek(t.date, weekStart) : "";
      const bucket = groups.get(key);
      if (bucket) bucket.push(t);
      else groups.set(key, [t]);
    }
    return [...groups.entries()].map(([start, items]) => ({
      start,
      items,
      done: items.filter((t) => t.status === "done").length,
      pages: items.reduce((s, t) => s + Math.max(0, (t.page_to ?? 0) - (t.page_from ?? 0) + 1), 0),
    }));
  }, [blocks, weekStart]);

  // ---- what actually happened ----
  const sessions = React.useMemo(
    () => sessionsFor(library.sessions, book.id), [library.sessions, book.id]);
  const marginalia = React.useMemo(
    () => notesFor(library.notes, book.id), [library.notes, book.id]);
  const history = React.useMemo(
    () => readDays(book.id, tasks, library.sessions), [book.id, tasks, library.sessions]);
  const pace = React.useMemo(() => paceStats(history), [history]);
  const projection = projectFinish(book, pace, today);

  // ---- what the reschedule would do ----
  const projected = React.useMemo(
    () => projectBlocks(plan, total, read), [plan, total, read]);
  const diff = React.useMemo(
    () => diffPlan(blocks, projected, plan.startDate), [blocks, projected, plan.startDate]);

  const upcoming = blocks.filter((t) => t.status !== "done" && (t.date ?? "") >= today).length;
  const doneBlocks = blocks.filter((t) => t.status === "done").length;
  const visibleWeeks = showAllWeeks ? weeks : weeks.slice(0, 5);
  const resumeDate = library.paused[book.id];
  const paused = book.status === "paused";
  const projectedFinish = projection.finish;
  const hasPace = pace.perDay > 0 && projectedFinish != null;

  // ---- the one line each folded group leads with ----
  const planSummary = book.pages_per_day
    ? `${book.pages_per_day} pp/day${book.end_date ? ` · ends ${shortDate(book.end_date)}` : ""}${upcoming ? ` · ${upcoming} ahead` : ""}`
    : upcoming
      ? `${upcoming} unfinished ${upcoming === 1 ? "block" : "blocks"} ahead`
      : "Not on the calendar yet";

  const insightsSummary = hasPace && projectedFinish
    ? `At ${ratePhrase(pace.perDay)} you finish ${shortDate(projectedFinish)}`
    : "No pace yet — tick a block or log a session";

  const sessionsSummary = sessions.length
    ? `${sessions.length} ${sessions.length === 1 ? "sitting" : "sittings"} · ${pace.pages} pp in ${pace.spanDays} days`
    : "Log what you actually read";

  const notesSummary = [
    marginalia.length ? `${marginalia.length} kept` : null,
    book.notes?.trim() ? "your verdict written" : null,
  ].filter(Boolean).join(" · ") || "Quotes, thoughts and your verdict";

  const detailsSummary = [
    `${total.toLocaleString()} pages`,
    library.series[book.id] || null,
    book.cover_url ? "cover set" : null,
  ].filter(Boolean).join(" · ");

  function commit<K extends keyof Book>(field: K, value: Book[K]) {
    if (book[field] === value) return;
    const changes: Partial<Book> = {};
    changes[field] = value;
    patch("books", book.id, changes);
  }

  function reschedule() {
    if (!planResult.valid) return;
    const created = scheduleBook(book.id, {
      startDate: plan.startDate,
      pagesPerDay: planResult.perDay,
      skipWeekdays: skipWeekdaysOf(plan.skipWeekends),
      replace: true,
    });
    if (created && paused) clearPause(book.id);
    toast({
      title: created ? "Plan updated" : "Nothing left to schedule",
      description: created
        ? `${created} ${created === 1 ? "block" : "blocks"} · ${planResult.perDay} pages a day · done by ${shortDate(planResult.finish)}`
        : "Every page is already read.",
      tone: created ? "success" : "default",
    });
  }

  function pause(date: string) {
    unscheduleBook(book.id, today);
    patch("books", book.id, { status: "paused" });
    pauseUntil(book.id, date);
    toast({
      title: `${book.title} is paused`,
      description: `Back on ${formatDate(date)}. ${upcoming ? `${upcoming} upcoming ${upcoming === 1 ? "block" : "blocks"} cleared.` : ""}`.trim(),
    });
  }

  function resume(from: string) {
    const start = from < today ? today : from;
    // The pace the plan editor is currently showing is the one the user can see,
    // so resuming honours it rather than a rate saved weeks ago.
    const perDay = planResult.valid ? planResult.perDay : (book.pages_per_day ?? 30);
    patch("books", book.id, { status: "reading" });
    clearPause(book.id);
    const created = scheduleBook(book.id, {
      startDate: start,
      pagesPerDay: perDay,
      skipWeekdays: skipWeekdaysOf(plan.skipWeekends),
      replace: true,
    });
    setPlan((p) => ({ ...p, startDate: start }));
    toast({
      title: created ? "Back on the calendar" : "Nothing left to schedule",
      description: created
        ? `${created} ${created === 1 ? "block" : "blocks"} from ${formatDate(start)} · ${perDay} pages a day`
        : "Every page is already read.",
      tone: created ? "success" : "default",
    });
  }

  return (
    <>
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2 px-3 hairline-b">
        <SectionLabel className="flex-1 truncate">Book</SectionLabel>

        <Popover
          align="end"
          className="w-[210px]"
          trigger={<IconButton label="Book options" size="sm"><MoreHorizontal /></IconButton>}
        >
          {(close) => (
            <>
              {paused ? (
                <MenuItem icon={PlayCircle} onClick={() => { resume(today); close(); }}>
                  Resume today
                </MenuItem>
              ) : (
                <MenuItem
                  icon={PauseCircle}
                  disabled={book.status === "finished"}
                  onClick={() => { setPausing(true); close(); }}
                >
                  Pause until…
                </MenuItem>
              )}
              <MenuItem
                icon={CalendarX}
                disabled={!upcoming}
                onClick={() => { setConfirmClear(true); close(); }}
              >
                Clear upcoming blocks
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={Trash2} danger onClick={() => { setConfirmDelete(true); close(); }}>
                Delete book
              </MenuItem>
            </>
          )}
        </Popover>

        <SheetMaximize size="sm" />
        <IconButton label="Close" size="sm" onClick={onClose}><X /></IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        {/* ---- identity ---- */}
        <div className="flex gap-4 px-4 pb-5 pt-4">
          <div className="w-[88px] shrink-0">
            <BookCover
              title={title}
              tint={book.color}
              coverUrl={book.cover_url}
              titleClassName="text-[13px] line-clamp-4"
              dim={book.status === "paused" || book.status === "dropped"}
            />
          </div>

          <div className="min-w-0 flex-1">
            <InlineInput
              aria-label="Book title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const next = title.trim();
                if (next) commit("title", next);
                else setTitle(book.title);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="text-[17px] font-semibold tracking-[-0.01em] text-ink"
            />
            <InlineInput
              aria-label="Author"
              placeholder="Author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              onBlur={() => commit("author", author.trim() || null)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="mt-0.5 text-[13px] text-ink-3"
            />

            {/* How the book is filed. Each commits on blur like the title above,
                so there is nothing extra to save. */}
            <div className="mt-2 grid grid-cols-4 gap-2">
              {([
                ["Genre", genre, setGenre, "genre"],
                ["Topic", topic, setTopic, "topic"],
                ["Series", seriesName, setSeriesName, "series"],
              ] as const).map(([label, value, setValue, field]) => (
                <label key={field} className="min-w-0">
                  <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
                    {label}
                  </span>
                  <input
                    aria-label={label}
                    list={`book-${field}-options`}
                    placeholder="—"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={() => commit(field, value.trim() || null)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className="w-full rounded-sm bg-transparent px-1 -mx-1 py-0.5 text-[12.5px] text-ink-2 outline-none hover:bg-hover focus:bg-hover transition-colors placeholder:text-ink-4"
                  />
                  <datalist id={`book-${field}-options`}>
                    {facetValues(books, field).map((v) => <option key={v} value={v} />)}
                  </datalist>
                </label>
              ))}

              {/* Page count lived at the bottom of the sheet behind a disclosure,
                  which made it read as uneditable. It belongs with the other
                  facts about the book. */}
              <label className="min-w-0">
                <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
                  Pages
                </span>
                <input
                  aria-label="Total pages"
                  type="number"
                  min={1}
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                  onBlur={() => {
                    const n = Math.max(1, Math.round(Number(pages) || book.total_pages));
                    setPages(String(n));
                    if (n !== book.total_pages) commit("total_pages", n);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  className="w-full rounded-sm bg-transparent px-1 -mx-1 py-0.5 text-[12.5px] text-ink-2 tnum outline-none hover:bg-hover focus:bg-hover transition-colors"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Popover
                className="w-[168px]"
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-[24px] cursor-pointer items-center gap-1.5 rounded-full border border-line px-2 text-[12px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                  >
                    <span className="size-1.5 rounded-full" style={{ background: STATUS_DOT[book.status] }} />
                    {STATUS_LABEL[book.status]}
                    <ChevronDown className="size-3 text-ink-4" />
                  </button>
                }
              >
                {(close) => (
                  <>
                    {STATUS_ORDER.map((s) => (
                      <MenuItem
                        key={s}
                        checked={book.status === s}
                        onClick={() => {
                          // Pausing is a scheduling decision, so it asks for a date.
                          if (s === "paused" && book.status !== "paused") setPausing(true);
                          else if (s === "finished") recordReading(book.id, total);
                          else {
                            if (book.status === "paused") clearPause(book.id);
                            commit("status", s);
                          }
                          close();
                        }}
                      >
                        {STATUS_LABEL[s]}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Popover>

              <Popover
                className="w-auto"
                trigger={
                  <button
                    type="button"
                    aria-label="Book colour"
                    className={cn(
                      `tint-${book.color}`,
                      "inline-flex h-[24px] cursor-pointer items-center gap-1.5 rounded-full border border-line px-2 text-[12px] text-ink-2 transition-colors hover:bg-hover hover:text-ink",
                    )}
                  >
                    <Palette className="size-3 text-ink-4" />
                    <span className="size-2.5 rounded-full" style={{ background: "var(--tint)" }} />
                  </button>
                }
              >
                <TintPicker value={book.color} onChange={(t) => { if (t) commit("color", t); }} />
              </Popover>

              {library.series[book.id] && (
                <span className="inline-flex h-[24px] items-center rounded-full border border-line px-2 text-[12px] text-ink-3">
                  {library.series[book.id]}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ---- paused: a state to come back from, not an alarm ---- */}
        {paused && (
          <div className="mx-4 mb-5 rounded-lg bg-hover px-3 py-2.5">
            <div className="flex items-start gap-2">
              <PauseCircle className="mt-px size-4 shrink-0 text-ink-3" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-ink">
                  {resumeDate
                    ? resumeDate <= today
                      ? "Ready to pick back up"
                      : `Paused until ${formatDate(resumeDate)}`
                    : "Paused"}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3 tnum">
                  {resumeDate && resumeDate > today
                    ? `${daysPhrase(Math.max(0, diffDays(resumeDate, today)))} to go. Resuming re-lays the plan from that day.`
                    : "Resuming re-lays the plan from the day you choose."}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="primary" onClick={() => resume(today)}>
                <PlayCircle className="size-3.5" />
                Resume today
              </Button>
              {resumeDate && resumeDate > today && (
                <Button size="sm" variant="secondary" onClick={() => resume(resumeDate)}>
                  Resume on {shortDate(resumeDate)}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setPausing(true)}>
                Change date
              </Button>
            </div>
          </div>
        )}

        {/* ---- Reading: where you are, and moving the bookmark ---- */}
        <Group
          storageKey="humoyun.books.sheet.reading"
          label="Reading"
          summary={`p.${read} of ${total}`}
          defaultOpen
        >
          <p className="display-serif text-[32px] leading-none text-ink tnum">{pct}%</p>

          <div className="mt-4 flex items-end gap-2">
            <Field label="I'm on page" className="w-[132px]">
              <NumberField
                label="Current page"
                value={pageDraft}
                min={0}
                max={total}
                step={10}
                onChange={setPageDraft}
              />
            </Field>
            <Button
              size="sm"
              variant={pageDraft === read ? "secondary" : "primary"}
              disabled={pageDraft === read}
              onClick={() => {
                recordReading(book.id, pageDraft);
                toast({
                  title: pageDraft >= total ? "Finished — nice." : `Bookmark moved to p.${pageDraft}`,
                  tone: "success",
                });
              }}
            >
              Save
            </Button>
            {book.status !== "finished" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { recordReading(book.id, total); toast({ title: "Marked as finished", tone: "success" }); }}
              >
                <Check className="size-3.5" />
                Finish
              </Button>
            )}
          </div>

          {/* A finished book has one question left, so it is asked here. */}
          {book.status === "finished" && (
            <div className="mt-4 flex items-center gap-3">
              <RatingStars value={book.rating} onChange={(r) => commit("rating", r)} />
              <span className="text-[11.5px] text-ink-4">
                {book.rating ? `${book.rating} of 5` : "Not rated"}
              </span>
            </div>
          )}

          <SubGroup
            storageKey="humoyun.books.sheet.sessions"
            label="Sessions"
            summary={sessionsSummary}
          >
            <SessionLog book={book} sessions={sessions} weekStart={weekStart} />
          </SubGroup>
        </Group>

        {/* ---- Plan: the calendar side of this book ---- */}
        <Group
          storageKey="humoyun.books.sheet.plan"
          label="Plan"
          summary={planSummary}
        >
          <PlanEditor
            draft={plan}
            onChange={setPlan}
            totalPages={total}
            currentPage={read}
            weekStart={weekStart}
          />

          <div className="mt-2 flex flex-wrap gap-1.5">
            {plan.startDate !== today && (
              <QuickChip onClick={() => setPlan((p) => ({ ...p, startDate: today }))}>
                Start today
              </QuickChip>
            )}
            {pace.perDay >= 1 && plan.mode === "rate" && Math.round(pace.perDay) !== plan.pagesPerDay && (
              <QuickChip onClick={() => setPlan((p) => ({ ...p, pagesPerDay: Math.round(pace.perDay) }))}>
                <Gauge className="size-3" aria-hidden />
                Match my real pace ({Math.round(pace.perDay)} pp/day)
              </QuickChip>
            )}
            {book.pages_per_day != null && plan.mode === "rate" && book.pages_per_day !== plan.pagesPerDay && (
              <QuickChip onClick={() => setPlan((p) => ({ ...p, pagesPerDay: book.pages_per_day as number }))}>
                Back to {book.pages_per_day} pp/day
              </QuickChip>
            )}
          </div>

          {planResult.valid && (
            <PlanDiffView diff={diff} className="mt-3" />
          )}

          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={!planResult.valid || (!diff.touched && !!blocks.length)}
              onClick={reschedule}
            >
              {upcoming ? "Apply changes" : "Schedule"}
            </Button>
            {!!upcoming && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
                Clear {upcoming} upcoming
              </Button>
            )}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-4">
            Applying replaces every unfinished block from {shortDate(plan.startDate)} onward. Blocks you
            have already ticked off stay put.
          </p>

          <SubGroup
            storageKey="humoyun.books.sheet.blocks"
            label="Reading blocks"
            summary={blocks.length
              ? `${doneBlocks} of ${blocks.length} done · ${weeks.length} ${weeks.length === 1 ? "week" : "weeks"}`
              : "Nothing on the calendar yet"}
          >
            {weeks.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                No blocks on the calendar yet. Pick a pace above and hit Schedule — Qalamchi will lay
                them out day by day.
              </p>
            ) : (
              <div className="space-y-3">
                {visibleWeeks.map((w) => (
                  <div key={w.start || "unscheduled"}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-medium text-ink-2">
                        {w.start ? `Week of ${shortDate(w.start)}` : "Unscheduled"}
                      </span>
                      <span className="text-[11px] text-ink-4 tnum">
                        {w.done}/{w.items.length} · {w.pages} pp
                      </span>
                    </div>
                    <div className="rounded-md border border-line">
                      {w.items.map((t, i) => {
                        const isToday = t.date === today;
                        const done = t.status === "done";
                        return (
                          <div
                            key={t.id}
                            className={cn(
                              "flex items-center gap-2.5 px-2 py-[7px] transition-colors",
                              i > 0 && "hairline-t",
                              isToday && !done && "bg-selected",
                            )}
                          >
                            <Checkbox
                              size="sm"
                              checked={done}
                              tint={book.color}
                              onChange={() => toggleTask(t.id)}
                              label={done ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`}
                            />
                            <span
                              className={cn(
                                "w-[86px] shrink-0 text-[12px] tnum",
                                done ? "text-ink-4" : isToday ? "font-medium text-accent" : "text-ink-2",
                              )}
                            >
                              {t.date ? formatDate(t.date) : "No date"}
                            </span>
                            <span className={cn("flex-1 truncate text-[12px] tnum", done ? "text-ink-4 line-through" : "text-ink-3")}>
                              {t.page_from != null && t.page_to != null ? `p.${t.page_from}–${t.page_to}` : t.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {weeks.length > visibleWeeks.length && (
                  <Button size="sm" variant="ghost" className="w-full" onClick={() => setShowAllWeeks(true)}>
                    Show all {weeks.length} weeks
                  </Button>
                )}
              </div>
            )}
          </SubGroup>
        </Group>

        {/* ---- Insights: the projection, and the evidence behind it ---- */}
        <Group
          storageKey="humoyun.books.sheet.insights"
          label="Insights"
          summary={insightsSummary}
        >
          {hasPace ? (
            <p className="text-[11.5px] leading-relaxed text-ink-3 tnum">
                {pace.activeDays} {pace.activeDays === 1 ? "day" : "days"} read out of the last {pace.spanDays}
                {pace.minutesPerPage ? ` · ${Math.round(pace.minutesPerPage * 10) / 10} min a page` : ""}
                {pace.lastRead ? ` · last read ${friendlyDate(pace.lastRead).toLowerCase()}` : ""}
                {projection.vsPlan != null && (
                  projection.vsPlan === 0
                    ? " · dead on the plan"
                    : projection.vsPlan > 0
                      ? ` · ${daysPhrase(projection.vsPlan)} ahead of the plan`
                      : ` · ${daysPhrase(projection.vsPlan)} behind the plan`
              )}
            </p>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              Tick a reading block or log a session, and a real finish date appears here — one built
              on what you read, not what you planned.
            </p>
          )}

          {/* Renders nothing until this book has a day worth drawing. */}
          <BookCalendarStrip
            className="mt-4"
            blocks={blocks}
            readDays={history}
            tint={book.color}
            weekStart={weekStart}
            onToggle={(t) => toggleTask(t.id)}
          />
        </Group>

        {/* ---- Notes: the trail, and the verdict ---- */}
        <Group
          storageKey="humoyun.books.sheet.notes"
          label="Notes"
          summary={notesSummary}
        >
          <BookNotes
            bookId={book.id}
            notes={marginalia}
            totalPages={total}
            currentPage={read}
            tint={book.color}
          />

          <div className="mt-4">
            <p className="mb-1 text-[11.5px] font-medium text-ink-3">Your verdict</p>
            <AutoTextarea
              aria-label="Notes"
              value={notes}
              onChange={setNotes}
              onBlur={() => commit("notes", notes.trim() || null)}
              minRows={3}
              placeholder="What stayed with you?"
              className="text-[13px] text-ink placeholder:text-ink-4"
            />
          </div>
        </Group>

        {/* ---- Details ---- */}
        <Group
          storageKey="humoyun.books.sheet.details"
          label="Details"
          summary={detailsSummary}
        >
          <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-3">
            <Field label="Total pages">
              <NumberField
                label="Total pages"
                value={total}
                min={1}
                max={20000}
                step={10}
                onChange={(v) => commit("total_pages", Math.max(1, v))}
              />
            </Field>
            <Field label="Series" hint="optional">
              <SuggestInput
                label="Series or collection"
                placeholder="The Lord of the Rings"
                value={series}
                suggestions={seriesNames(library.series)}
                onChange={setSeriesDraft}
                onCommit={(v) => {
                  if (v.trim() !== (library.series[book.id] ?? "")) setSeries(book.id, v);
                }}
              />
            </Field>
          </div>
          <Field label="Cover image" hint="optional" className="mt-3">
            <Input
              aria-label="Cover image URL"
              placeholder="https://…"
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              onBlur={() => commit("cover_url", cover.trim() || null)}
            />
          </Field>
        </Group>
      </div>

      <PauseDialog
        open={pausing}
        onClose={() => setPausing(false)}
        onConfirm={pause}
        bookTitle={book.title}
        upcoming={upcoming}
        initialDate={resumeDate}
        weekStart={weekStart}
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          unscheduleBook(book.id, today);
          toast({ title: "Upcoming blocks cleared", description: `${book.title} is off the calendar from today.` });
        }}
        title="Clear upcoming blocks?"
        description={`${upcoming} unfinished reading ${upcoming === 1 ? "block" : "blocks"} from today onward will be removed. Ticked-off blocks stay.`}
        confirmLabel="Clear"
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          removeWhere("tasks", (t) => t.book_id === book.id);
          remove("books", book.id);
          forgetBook(book.id);
          toast({ title: "Book deleted", description: `${book.title}, its blocks, sessions and highlights are gone.` });
          onClose();
        }}
        title={`Delete ${book.title}?`}
        description="The book, every reading block it put on your calendar, and its sessions and highlights will be removed. This cannot be undone."
      />
    </>
  );
}

/** Small one-tap plan adjustment. */
function QuickChip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5",
        "text-[12px] text-ink-2 transition-colors hover:bg-hover hover:text-ink active:scale-[0.97]",
      )}
    >
      {children}
    </button>
  );
}
