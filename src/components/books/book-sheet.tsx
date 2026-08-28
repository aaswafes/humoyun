"use client";

import * as React from "react";
import {
  CalendarX, Check, ChevronDown, ChevronRight, Gauge, MoreHorizontal, Palette,
  PauseCircle, PlayCircle, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, diffDays, formatDate, friendlyDate, startOfWeek, todayISO } from "@/lib/date";
import type { Book, Task } from "@/lib/types";
import {
  AutoTextarea, Button, Checkbox, IconButton, InlineInput, Input, Progress, SectionLabel,
} from "@/components/ui/primitives";
import {
  ConfirmDialog, MenuItem, MenuSeparator, Popover, Sheet, TintPicker,
} from "@/components/ui/overlays";
import { BookCover } from "./book-cover";
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

// ---------------------------------------------------------
function Section({
  title, action, children, className, count, collapsible, defaultOpen = true,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  count?: number;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const shown = collapsible ? open : true;

  return (
    <section className={cn("hairline-t px-4 py-4", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="-my-1 flex cursor-pointer items-center gap-1.5 py-1 text-left"
          >
            <ChevronRight
              className={cn("size-3 text-ink-4 transition-transform duration-200", open && "rotate-90")}
              aria-hidden
            />
            <SectionLabel>{title}</SectionLabel>
            {count !== undefined && <span className="text-[11px] text-ink-4 tnum">{count}</span>}
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <SectionLabel>{title}</SectionLabel>
            {count !== undefined && <span className="text-[11px] text-ink-4 tnum">{count}</span>}
          </div>
        )}
        {action}
      </div>
      {shown && children}
    </section>
  );
}

// =========================================================
export function BookSheet({ bookId, onClose }: { bookId: string | null; onClose: () => void }) {
  const book = useStore((s) => s.books.find((b) => b.id === bookId) ?? null);

  return (
    <Sheet open={!!book} onClose={onClose} width={470}>
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
  const logReading = useStore((s) => s.logReading);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const library = useLibraryPrefs();

  const today = todayISO();
  const total = Math.max(1, book.total_pages);
  const read = Math.max(0, Math.min(book.current_page, total));
  const pct = Math.round((read / total) * 100);

  // ---- local drafts: text commits on blur, numbers follow the store ----
  const [title, setTitle] = React.useState(book.title);
  const [author, setAuthor] = React.useState(book.author ?? "");
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
  const visibleWeeks = showAllWeeks ? weeks : weeks.slice(0, 5);
  const resumeDate = library.paused[book.id];
  const paused = book.status === "paused";

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

        <IconButton label="Close" size="sm" onClick={onClose}><X /></IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {/* ---- identity ---- */}
        <div className="flex gap-4 px-4 pb-4 pt-4">
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
              className="mt-0.5 text-[13px] text-ink-2"
            />

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
                    <ChevronDown className="size-3 text-ink-3" />
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
                          else if (s === "finished") logReading(book.id, total);
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
                    <Palette className="size-3 text-ink-3" />
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

        {/* ---- paused banner ---- */}
        {paused && (
          <div className="mx-4 mb-4 rounded-lg border border-line bg-warn-soft px-3 py-2.5">
            <div className="flex items-start gap-2">
              <PauseCircle className="mt-px size-4 shrink-0 text-warn" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-ink">
                  {resumeDate
                    ? resumeDate <= today
                      ? "Ready to pick back up"
                      : `Paused until ${formatDate(resumeDate)}`
                    : "Paused"}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-2 tnum">
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

        {/* ---- progress + bookmark ---- */}
        <Section title="Progress">
          <div className="flex items-baseline justify-between gap-3">
            <span className="display-serif text-[32px] leading-none text-ink tnum">{pct}%</span>
            <span className="text-[12.5px] text-ink-3 tnum">
              p.{read} <span className="text-ink-4">/ {total}</span>
              {read < total && <span className="text-ink-4"> · {total - read} left</span>}
            </span>
          </div>
          <Progress value={read} max={total} tint={book.color} height={5} className="mt-2.5" />

          <div className="mt-3.5 flex items-end gap-2">
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
                logReading(book.id, pageDraft);
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
                onClick={() => { logReading(book.id, total); toast({ title: "Marked as finished", tone: "success" }); }}
              >
                <Check className="size-3.5" />
                Finish
              </Button>
            )}
          </div>

          {/* the honest forecast, built from history rather than the plan */}
          <div className="mt-3 rounded-md bg-hover px-2.5 py-2">
            {projection.finish && pace.perDay > 0 ? (
              <>
                <p className="text-[12.5px] leading-relaxed text-ink-2 tnum">
                  At <span className="font-medium text-ink">{ratePhrase(pace.perDay)}</span> you finish{" "}
                  <span className="font-medium text-ink">{shortDate(projection.finish)}</span>.
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-4 tnum">
                  {pace.activeDays} {pace.activeDays === 1 ? "day" : "days"} read out of the last {pace.spanDays}
                  {pace.minutesPerPage ? ` · ${Math.round(pace.minutesPerPage * 10) / 10} min a page` : ""}
                  {pace.lastRead ? ` · last read ${friendlyDate(pace.lastRead).toLowerCase()}` : ""}
                </p>
                {projection.vsPlan != null && (
                  <p
                    className={cn(
                      "mt-1 text-[11.5px] font-medium tnum",
                      projection.vsPlan >= 0 ? "text-success" : "text-warn",
                    )}
                  >
                    {projection.vsPlan === 0
                      ? "Dead on the plan."
                      : projection.vsPlan > 0
                        ? `${daysPhrase(projection.vsPlan)} ahead of the plan.`
                        : `${daysPhrase(projection.vsPlan)} behind the plan.`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                No pace yet. Tick a reading block or log a session below and a real finish date
                appears here — one built on what you read, not what you planned.
              </p>
            )}
          </div>
        </Section>

        {/* ---- reschedule, with the damage shown first ---- */}
        <Section
          title="Plan"
          action={
            book.pages_per_day ? (
              <span className="text-[11.5px] text-ink-4 tnum">
                now {book.pages_per_day} pp/day{book.end_date ? ` · ends ${shortDate(book.end_date)}` : ""}
              </span>
            ) : null
          }
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
        </Section>

        {/* ---- the plan as a calendar ---- */}
        {(blocks.length > 0 || history.length > 0) && (
          <Section title="Reading calendar" collapsible defaultOpen>
            <BookCalendarStrip
              blocks={blocks}
              readDays={history}
              tint={book.color}
              weekStart={weekStart}
              onToggle={(t) => toggleTask(t.id)}
            />
          </Section>
        )}

        {/* ---- blocks by week ---- */}
        <Section
          title="Reading blocks"
          count={blocks.length}
          collapsible
          defaultOpen={false}
        >
          {weeks.length === 0 ? (
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              No blocks on the calendar yet. Pick a pace above and hit Schedule — Humoyun will lay
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
        </Section>

        {/* ---- sittings ---- */}
        <Section
          title="Sessions"
          count={sessions.length}
          collapsible
          defaultOpen={sessions.length > 0}
          action={
            pace.pages > 0 ? (
              <span className="text-[11.5px] text-ink-4 tnum">
                {pace.pages} pp{pace.minutes > 0 ? ` · ${Math.round(pace.minutes / 60 * 10) / 10}h` : ""} in {pace.spanDays} days
              </span>
            ) : null
          }
        >
          <SessionLog book={book} sessions={sessions} weekStart={weekStart} />
        </Section>

        {/* ---- marginalia ---- */}
        <Section title="Highlights" count={marginalia.length} collapsible defaultOpen={marginalia.length > 0}>
          <BookNotes
            bookId={book.id}
            notes={marginalia}
            totalPages={total}
            currentPage={read}
            tint={book.color}
          />
        </Section>

        {/* ---- rating ---- */}
        {book.status === "finished" && (
          <Section title="Rating">
            <div className="flex items-center gap-3">
              <RatingStars value={book.rating} onChange={(r) => commit("rating", r)} />
              <span className="text-[12px] text-ink-4">
                {book.rating ? `${book.rating} of 5` : "Not rated"}
              </span>
            </div>
          </Section>
        )}

        {/* ---- notes ---- */}
        <Section title="Notes">
          <AutoTextarea
            aria-label="Notes"
            value={notes}
            onChange={setNotes}
            onBlur={() => commit("notes", notes.trim() || null)}
            minRows={3}
            placeholder="What stayed with you?"
            className="text-[13px] text-ink placeholder:text-ink-4"
          />
        </Section>

        {/* ---- details ---- */}
        <Section title="Details">
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
        </Section>
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
