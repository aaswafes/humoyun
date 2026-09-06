"use client";

import * as React from "react";
import {
  ArrowRight, CalendarRange, CalendarX, Check, ChevronDown, Dot, Gauge, Lightbulb,
  Minus, MoreHorizontal, Palette, Plus, Quote, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, formatDate, formatDuration, friendlyDate, startOfWeek, todayISO } from "@/lib/date";
import type { Media, NoteKind, Task } from "@/lib/types";
import { MEDIA_KIND_LABELS, NOTE_KIND_LABELS } from "@/lib/types";
import {
  AutoTextarea, Button, Checkbox, IconButton, InlineInput, Input, SectionLabel, Segmented,
} from "@/components/ui/primitives";
import { MiniEmpty, Toggle, VisuallyHidden } from "@/components/ui/form";
import {
  ConfirmDialog, MenuItem, MenuSeparator, Popover, Sheet, TintPicker,
} from "@/components/ui/overlays";
import { noteText } from "@/components/notes/rich-text";
import { MediaCover } from "./media-cover";
import { mediaFacetValues } from "./facets";
import { EpisodeLog } from "./episode-log";
import {
  DateField, Disclosure, Field, InlineFacet, NumberField, RatingStars,
} from "./watch-fields";
import {
  computeWatchPlan, diffWatchPlan, episodeRangeLabel, projectWatchBlocks, rateLabel,
  shortDate, skipWeekdaysOf, watchDiffSummary, watchPlanSentence,
  type WatchDiff, type WatchDiffKind, type WatchDiffRow, type WatchPlanDraft,
  type WatchPlanMode,
} from "./watch-plan";

type MediaStatus = Media["status"];

const STATUS_ORDER: MediaStatus[] = ["watching", "planned", "paused", "finished", "dropped"];

// A dot never carries the state on its own — the label sits right beside it —
// so none of these needs to shout. Only the title you are on gets the accent.
const STATUS_DOT: Record<MediaStatus, string> = {
  watching: "var(--accent)",
  planned: "var(--ink-4)",
  finished: "var(--success)",
  paused: "var(--ink-2)",
  dropped: "var(--ink-4)",
};

/** A film is watched, not finished. Everything else reads the same either way. */
function statusLabel(status: MediaStatus, single: boolean): string {
  if (status === "finished") return single ? "Watched" : "Finished";
  if (status === "watching") return "Watching";
  if (status === "planned") return "Planned";
  if (status === "paused") return "Paused";
  return "Dropped";
}

/** One group of the sheet: a hairline, a label, a summary, and room. */
function Group({
  storageKey, label, summary, defaultOpen, children,
}: {
  storageKey: string;
  label: string;
  summary: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Disclosure
      storageKey={storageKey}
      label={label}
      summary={summary}
      defaultOpen={defaultOpen}
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
export function MediaSheet({ mediaId, onClose }: { mediaId: string; onClose: () => void }) {
  const item = useStore((s) => s.media.find((m) => m.id === mediaId) ?? null);

  return (
    <Sheet open={!!item} onClose={onClose} width={470} resizeKey="media">
      {item && <MediaSheetBody key={item.id} item={item} onClose={onClose} />}
    </Sheet>
  );
}

function MediaSheetBody({ item, onClose }: { item: Media; onClose: () => void }) {
  const media = useStore((s) => s.media);
  const tasks = useStore((s) => s.tasks);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const removeWhere = useStore((s) => s.removeWhere);
  const toggleTask = useStore((s) => s.toggleTask);
  const scheduleMedia = useStore((s) => s.scheduleMedia);
  const unscheduleMedia = useStore((s) => s.unscheduleMedia);
  const logWatch = useStore((s) => s.logWatch);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const noteCount = useStore((s) => s.notes.reduce((n, x) => n + (x.media_id === item.id ? 1 : 0), 0));

  const today = todayISO();
  const total = Math.max(1, item.total_episodes);
  const seen = Math.max(0, Math.min(item.current_episode, total));
  const pct = Math.round((seen / total) * 100);

  /** The one fact the whole surface bends around. */
  const single = total <= 1;

  // ---- local drafts: text commits on blur, numbers follow the store ----
  const [title, setTitle] = React.useState(item.title);
  const [creator, setCreator] = React.useState(item.creator ?? "");
  const [genre, setGenre] = React.useState(item.genre ?? "");
  const [topic, setTopic] = React.useState(item.topic ?? "");
  const [seriesName, setSeriesName] = React.useState(item.series ?? "");
  const [episodesField, setEpisodesField] = React.useState(String(item.total_episodes));
  const [runtimeField, setRuntimeField] = React.useState(
    item.runtime_min == null ? "" : String(item.runtime_min));
  const [cover, setCover] = React.useState(item.cover_url ?? "");
  const [notes, setNotes] = React.useState(item.notes ?? "");
  const [episodeDraft, setEpisodeDraft] = React.useState(seen);
  const [seenEpisode, setSeenEpisode] = React.useState(seen);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [showAllWeeks, setShowAllWeeks] = React.useState(false);

  // Ticking a block advances the bookmark — the "on episode" field has to follow.
  if (seenEpisode !== seen) {
    setSeenEpisode(seen);
    setEpisodeDraft(seen);
  }

  const [plan, setPlan] = React.useState<WatchPlanDraft>(() => ({
    mode: "perDay",
    startDate: today,
    perDay: item.episodes_per_day ?? 1,
    endDate: item.end_date && item.end_date > today ? item.end_date : addDays(today, 14),
    skipWeekends: false,
  }));
  const planResult = computeWatchPlan(plan, total, seen);

  // ---- blocks, grouped by week ----
  const blocks = React.useMemo(
    () => tasks
      .filter((t) => t.media_id === item.id && t.kind === "watching")
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999")),
    [tasks, item.id],
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
      episodes: items.reduce(
        (n, t) => n + Math.max(0, (t.episode_to ?? 0) - (t.episode_from ?? 0) + 1), 0),
    }));
  }, [blocks, weekStart]);

  // ---- what the reschedule would do ----
  const projected = React.useMemo(
    () => projectWatchBlocks(plan, total, seen), [plan, total, seen]);
  const diff = React.useMemo(
    () => diffWatchPlan(blocks, projected, plan.startDate), [blocks, projected, plan.startDate]);

  const pending = blocks.filter((t) => t.status !== "done" && (t.date ?? "") >= today);
  const upcoming = pending.length;
  // A film hides the whole plan panel, so the sheet has to say somewhere that
  // an evening is already booked for it.
  const nextBlock = pending[0] ?? null;
  const doneBlocks = blocks.filter((t) => t.status === "done").length;
  const visibleWeeks = showAllWeeks ? weeks : weeks.slice(0, 5);
  const watched = seen >= total;

  // ---- the one line each folded group leads with ----
  const progressSummary = single
    ? watched ? "Watched" : "Not watched yet"
    : `ep. ${seen} of ${total}`;

  const planSummary = item.episodes_per_day
    ? `${rateLabel(item.episodes_per_day)}${item.end_date ? ` · ends ${shortDate(item.end_date)}` : ""}${upcoming ? ` · ${upcoming} ahead` : ""}`
    : upcoming
      ? `${upcoming} unfinished ${upcoming === 1 ? "block" : "blocks"} ahead`
      : "Not on the calendar yet";

  const notesSummary = [
    item.rating ? `${item.rating} of 5` : null,
    item.notes?.trim() ? "your verdict written" : null,
    noteCount ? `${noteCount} kept` : null,
  ].filter(Boolean).join(" · ") || "Rate it, and say what stayed with you";

  // The film's runtime is already stated, editable, in the header — repeating it
  // here would be the same number said twice.
  const detailsSummary = single
    ? item.cover_url ? "Poster set" : "Add a poster image"
    : [
        item.runtime_min ? `${formatDuration(item.runtime_min)} an episode` : "No episode length set",
        item.cover_url ? "poster set" : null,
      ].filter(Boolean).join(" · ");

  function commit<K extends keyof Media>(field: K, value: Media[K]) {
    if (item[field] === value) return;
    const changes: Partial<Media> = {};
    changes[field] = value;
    patch("media", item.id, changes);
  }

  function commitEpisodes() {
    const n = Math.max(1, Math.round(Number(episodesField) || item.total_episodes));
    setEpisodesField(String(n));
    if (n === item.total_episodes) return;
    // Shrinking the season below the bookmark would leave "ep. 20 of 12" on screen.
    patch("media", item.id, {
      total_episodes: n,
      ...(item.current_episode > n ? { current_episode: n } : {}),
    });
  }

  function commitRuntime() {
    const raw = runtimeField.trim();
    const n = raw === "" ? null : Math.max(0, Math.round(Number(raw) || 0));
    const next = n && n > 0 ? n : null;
    setRuntimeField(next == null ? "" : String(next));
    commit("runtime_min", next);
  }

  function apply() {
    if (!planResult.valid) return;
    const created = scheduleMedia(item.id, {
      startDate: plan.startDate,
      episodesPerDay: planResult.perDay,
      skipWeekdays: skipWeekdaysOf(plan.skipWeekends),
      replace: true,
    });
    toast({
      title: created ? "Plan updated" : "Nothing left to schedule",
      description: created
        ? `${created} ${created === 1 ? "block" : "blocks"} · ${rateLabel(planResult.perDay)} · done by ${shortDate(planResult.endDate)}`
        : "Every episode is watched.",
      tone: created ? "success" : "default",
    });
  }

  /** A film never gets a pace — it gets an evening. */
  function watchToday() {
    const created = scheduleMedia(item.id, { startDate: today, replace: true });
    toast({
      title: created ? "On today" : "Nothing to schedule",
      description: created
        ? `${item.title} is on your calendar for today.`
        : "You have already watched it.",
      tone: created ? "success" : "default",
    });
  }

  return (
    <>
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2 px-3 hairline-b">
        <SectionLabel className="flex-1 truncate">{MEDIA_KIND_LABELS[item.kind]}</SectionLabel>

        <Popover
          align="end"
          className="w-[210px]"
          trigger={<IconButton label="Title options" size="sm"><MoreHorizontal /></IconButton>}
        >
          {(close) => (
            <>
              <MenuItem
                icon={CalendarX}
                disabled={!upcoming}
                onClick={() => { setConfirmClear(true); close(); }}
              >
                Clear upcoming blocks
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={Trash2} danger onClick={() => { setConfirmDelete(true); close(); }}>
                Delete {single ? "film" : "title"}
              </MenuItem>
            </>
          )}
        </Popover>

        <IconButton label="Close" size="sm" onClick={onClose}><X /></IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        {/* ---- identity ---- */}
        <div className="flex gap-4 px-4 pb-5 pt-4">
          <div className="w-[88px] shrink-0">
            {/* The draft title, so the poster keeps up while you retype it. */}
            <MediaCover item={{ ...item, title }} />
          </div>

          <div className="min-w-0 flex-1">
            <InlineInput
              aria-label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const next = title.trim();
                if (next) commit("title", next);
                else setTitle(item.title);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="text-[17px] font-semibold tracking-[-0.01em] text-ink"
            />
            <InlineInput
              aria-label={single ? "Director" : "Studio"}
              placeholder={single ? "Director" : "Studio"}
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              onBlur={() => commit("creator", creator.trim() || null)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="mt-0.5 text-[13px] text-ink-3"
            />

            {/* How the title is filed, and how long it is. Each commits on blur
                like the title above, so there is nothing extra to save — and
                nothing editable hidden behind a disclosure. */}
            <div className="mt-2 grid grid-cols-4 gap-2">
              <InlineFacet
                label="Genre"
                value={genre}
                onChange={setGenre}
                onCommit={() => commit("genre", genre.trim() || null)}
                suggestions={mediaFacetValues(media, "genre")}
              />
              <InlineFacet
                label="Topic"
                value={topic}
                onChange={setTopic}
                onCommit={() => commit("topic", topic.trim() || null)}
                suggestions={mediaFacetValues(media, "topic")}
              />
              <InlineFacet
                label="Series"
                value={seriesName}
                onChange={setSeriesName}
                onCommit={() => commit("series", seriesName.trim() || null)}
                suggestions={mediaFacetValues(media, "series")}
              />
              {single ? (
                <InlineFacet
                  label="Runtime"
                  value={runtimeField}
                  onChange={setRuntimeField}
                  onCommit={commitRuntime}
                  numeric
                  placeholder="min"
                />
              ) : (
                <InlineFacet
                  label="Episodes"
                  value={episodesField}
                  onChange={setEpisodesField}
                  onCommit={commitEpisodes}
                  numeric
                />
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Popover
                className="w-[168px]"
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-[24px] cursor-pointer items-center gap-1.5 rounded-full border border-line px-2 text-[12px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                  >
                    <span className="size-1.5 rounded-full" style={{ background: STATUS_DOT[item.status] }} />
                    {statusLabel(item.status, single)}
                    <ChevronDown className="size-3 text-ink-4" />
                  </button>
                }
              >
                {(close) => (
                  <>
                    {STATUS_ORDER.map((s) => (
                      <MenuItem
                        key={s}
                        checked={item.status === s}
                        onClick={() => {
                          // Finishing is a progress fact, not a label — it has to
                          // move the bookmark or the two disagree.
                          if (s === "finished") logWatch(item.id, total);
                          else commit("status", s);
                          close();
                        }}
                      >
                        {statusLabel(s, single)}
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
                    aria-label="Colour"
                    className={cn(
                      `tint-${item.color}`,
                      "inline-flex h-[24px] cursor-pointer items-center gap-1.5 rounded-full border border-line px-2 text-[12px] text-ink-2 transition-colors hover:bg-hover hover:text-ink",
                    )}
                  >
                    <Palette className="size-3 text-ink-4" />
                    <span className="size-2.5 rounded-full" style={{ background: "var(--tint)" }} />
                  </button>
                }
              >
                <TintPicker value={item.color} onChange={(t) => { if (t) commit("color", t); }} />
              </Popover>
            </div>
          </div>
        </div>

        {/* ---- Progress: a film answers yes or no, a series counts ---- */}
        <Group
          storageKey="humoyun.watch.sheet.progress"
          label="Progress"
          summary={progressSummary}
          defaultOpen
        >
          {single ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Seen it?" plain>
                  <Segmented<"yes" | "no">
                    value={watched ? "yes" : "no"}
                    onChange={(v) => {
                      logWatch(item.id, v === "yes" ? 1 : 0);
                      toast({
                        title: v === "yes" ? "Marked as watched" : "Back on the list",
                        tone: v === "yes" ? "success" : "default",
                      });
                    }}
                    options={[
                      { value: "yes", label: "Watched" },
                      { value: "no", label: "Not yet" },
                    ]}
                  />
                </Field>

                {!watched && !upcoming && (
                  <Button size="sm" variant="secondary" onClick={watchToday}>
                    Put it on today
                  </Button>
                )}
              </div>

              {!watched && nextBlock?.date && (
                <p className="mt-3 text-[12px] text-ink-3 tnum">
                  On your calendar for {friendlyDate(nextBlock.date).toLowerCase()}.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="display-serif text-[32px] leading-none text-ink tnum">{pct}%</p>

              <div className="mt-4 flex items-end gap-2">
                <Field label="I'm on episode" className="w-[136px]">
                  <NumberField
                    label="Current episode"
                    value={episodeDraft}
                    min={0}
                    max={total}
                    step={1}
                    onChange={setEpisodeDraft}
                  />
                </Field>
                <Button
                  size="sm"
                  variant={episodeDraft === seen ? "secondary" : "primary"}
                  disabled={episodeDraft === seen}
                  onClick={() => {
                    logWatch(item.id, episodeDraft);
                    toast({
                      title: episodeDraft >= total ? "Finished — nice." : `Now on ep. ${episodeDraft}`,
                      tone: "success",
                    });
                  }}
                >
                  Save
                </Button>
                {item.status !== "finished" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      logWatch(item.id, total);
                      toast({ title: "Marked as finished", tone: "success" });
                    }}
                  >
                    <Check className="size-3.5" />
                    Finish
                  </Button>
                )}
              </div>
            </>
          )}

          <EpisodeLog item={item} />
        </Group>

        {/* ---- Plan: episodes a day, the way a book gets pages a day.
                A film has one sitting, so there is nothing here to decide. ---- */}
        {!single && (
          <Group
            storageKey="humoyun.watch.sheet.plan"
            label="Plan"
            summary={planSummary}
          >
            <div className="space-y-3">
              <Segmented<WatchPlanMode>
                value={plan.mode}
                onChange={(mode) => setPlan((p) => ({ ...p, mode }))}
                options={[
                  { value: "perDay", label: <span className="inline-flex items-center gap-1.5"><Gauge className="size-3.5" />Episodes per day</span> },
                  { value: "finishBy", label: <span className="inline-flex items-center gap-1.5"><CalendarRange className="size-3.5" />Finish by</span> },
                ]}
                className="w-full [&>button]:flex-1"
              />

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start">
                  <DateField
                    label="Start date"
                    value={plan.startDate}
                    weekStart={weekStart}
                    onChange={(startDate) => setPlan((p) => ({ ...p, startDate }))}
                  />
                </Field>

                {plan.mode === "perDay" ? (
                  <Field label="Pace">
                    <NumberField
                      label="Episodes per day"
                      value={plan.perDay}
                      min={1}
                      max={100}
                      step={1}
                      suffix="ep"
                      onChange={(perDay) => setPlan((p) => ({ ...p, perDay }))}
                    />
                  </Field>
                ) : (
                  <Field label="Finish by">
                    <DateField
                      label="Finish date"
                      value={plan.endDate}
                      weekStart={weekStart}
                      onChange={(endDate) => setPlan((p) => ({ ...p, endDate }))}
                    />
                  </Field>
                )}
              </div>

              <Toggle
                label="Skip weekends"
                description="Watch blocks land Monday to Friday only."
                checked={plan.skipWeekends}
                onChange={(skipWeekends) => setPlan((p) => ({ ...p, skipWeekends }))}
              />

              {/* A working plan is information, not an announcement — only a plan
                  that cannot be scheduled earns a colour. */}
              <p
                className={cn(
                  "rounded-md bg-hover px-2.5 py-2 text-[12.5px] leading-relaxed tnum",
                  planResult.valid ? "text-ink-2" : "text-warn",
                )}
                aria-live="polite"
              >
                {watchPlanSentence(plan, planResult)}
              </p>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {plan.startDate !== today && (
                <QuickChip onClick={() => setPlan((p) => ({ ...p, startDate: today }))}>
                  Start today
                </QuickChip>
              )}
              {item.episodes_per_day != null && plan.mode === "perDay"
                && item.episodes_per_day !== plan.perDay && (
                <QuickChip onClick={() => setPlan((p) => ({ ...p, perDay: item.episodes_per_day as number }))}>
                  Back to {rateLabel(item.episodes_per_day)}
                </QuickChip>
              )}
            </div>

            {planResult.valid && <WatchDiffView diff={diff} className="mt-3" />}

            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={!planResult.valid || (!diff.touched && !!blocks.length)}
                onClick={apply}
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
              storageKey="humoyun.watch.sheet.blocks"
              label="Watch blocks"
              summary={blocks.length
                ? `${doneBlocks} of ${blocks.length} done · ${weeks.length} ${weeks.length === 1 ? "week" : "weeks"}`
                : "Nothing on the calendar yet"}
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
                          {w.done}/{w.items.length} · {w.episodes} ep
                        </span>
                      </div>
                      <div className="rounded-md border border-line">
                        {w.items.map((t, i) => {
                          const isToday = t.date === today;
                          const done = t.status === "done";
                          const range = t.episode_from != null && t.episode_to != null
                            ? { from: t.episode_from, to: t.episode_to }
                            : null;
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
                                tint={item.color}
                                onChange={() => toggleTask(t.id)}
                                label={done ? `Mark ${t.title} as not watched` : `Mark ${t.title} as watched`}
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
                                {range ? episodeRangeLabel(range) : t.title}
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
        )}

        {/* ---- Notes: the verdict, and the stars ---- */}
        <Group
          storageKey="humoyun.watch.sheet.notes"
          label="Notes"
          summary={notesSummary}
        >
          <div className="flex items-center gap-3">
            <RatingStars value={item.rating} onChange={(r) => commit("rating", r)} />
            <span className="text-[11.5px] text-ink-4 tnum">
              {item.rating ? `${item.rating} of 5` : "Not rated"}
            </span>
          </div>

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

          <MediaNotes item={item} single={single} />
        </Group>

        {/* ---- Details ---- */}
        <Group
          storageKey="humoyun.watch.sheet.details"
          label="Details"
          summary={detailsSummary}
        >
          {!single && (
            <Field label="Each episode" hint="optional" className="w-[168px]">
              <NumberField
                label="Minutes per episode"
                value={item.runtime_min ?? 0}
                min={0}
                max={600}
                step={5}
                suffix="min"
                onChange={(v) => commit("runtime_min", v > 0 ? v : null)}
              />
            </Field>
          )}
          <Field label="Poster image" hint="optional" className={single ? "" : "mt-3"}>
            <Input
              aria-label="Poster image URL"
              placeholder="https://…"
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              onBlur={() => commit("cover_url", cover.trim() || null)}
            />
          </Field>
        </Group>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          unscheduleMedia(item.id, today);
          toast({
            title: "Upcoming blocks cleared",
            description: `${item.title} is off the calendar from today.`,
          });
        }}
        title="Clear upcoming blocks?"
        description={`${upcoming} unfinished watch ${upcoming === 1 ? "block" : "blocks"} from today onward will be removed. Ticked-off blocks stay.`}
        confirmLabel="Clear"
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          removeWhere("tasks", (t) => t.media_id === item.id);
          // What you wrote outlives the title: the notes detach rather than
          // disappear, so a delete never silently takes them with it.
          for (const n of useStore.getState().notes) {
            if (n.media_id === item.id) patch("notes", n.id, { media_id: null });
          }
          remove("media", item.id);
          toast({
            title: "Deleted",
            description: `${item.title} and every watch block it put on your calendar are gone.`,
          });
          onClose();
        }}
        title={`Delete ${item.title}?`}
        description={`The title and every watch block it put on your calendar will be removed. This cannot be undone.${
          noteCount ? ` The ${noteCount === 1 ? "note" : `${noteCount} notes`} you kept stay in Notes.` : ""
        }`}
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

// =========================================================
// The trail a title leaves — the same marginalia the books surface keeps, with
// the mark that fits the medium: an episode for a series, a minute for a film.
// Every line lands in the `notes` collection, so it also shows up on the Notes
// page with this title as its source.
// =========================================================
type Marginal = "highlight" | "thought";

const MARGINAL_OPTIONS: { value: Marginal; label: React.ReactNode }[] = [
  { value: "highlight", label: <span className="inline-flex items-center gap-1.5"><Quote className="size-3" />Quote</span> },
  { value: "thought", label: <span className="inline-flex items-center gap-1.5"><Lightbulb className="size-3" />Thought</span> },
];

const NOTE_PREVIEW = 5;

const markLabel = (n: number, single: boolean) => (single ? `${n} min` : `ep. ${n}`);
const markNoun = (single: boolean) => (single ? "minute" : "episode");

/** The chip states the mark and edits it — one control, not two. */
function MarkChip({
  mark, max, single, onChange,
}: {
  mark: number | null;
  max: number;
  single: boolean;
  onChange: (next: number | null) => void;
}) {
  const [draft, setDraft] = React.useState(mark ?? 1);
  const [seen, setSeen] = React.useState(mark);

  // The mark can change from the list while this popover is mounted.
  if (seen !== mark) {
    setSeen(mark);
    setDraft(mark ?? 1);
  }

  return (
    <Popover
      align="start"
      className="w-[184px] p-2"
      trigger={
        <button
          type="button"
          aria-label={mark == null
            ? `Add the ${markNoun(single)} this note came from`
            : `${markLabel(mark, single)}. Change it`}
          className={cn(
            "inline-flex h-6 shrink-0 cursor-pointer items-center rounded-full border border-line px-2",
            "text-[11.5px] tnum transition-colors hover:bg-hover",
            mark == null ? "text-ink-4" : "text-ink-2",
          )}
        >
          {mark == null ? `no ${markNoun(single)}` : markLabel(mark, single)}
        </button>
      }
    >
      {(close) => (
        <div className="space-y-2">
          <NumberField
            label={single ? "Minute" : "Episode"}
            value={draft}
            min={0}
            max={Math.max(1, max)}
            step={1}
            suffix={single ? "min" : undefined}
            onChange={setDraft}
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" className="flex-1" onClick={() => { onChange(draft); close(); }}>
              Set
            </Button>
            {mark != null && (
              <Button size="sm" variant="ghost" onClick={() => { onChange(null); close(); }}>
                Clear
              </Button>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

function NoteRow({
  id, kind, mark, body, max, single, tint,
}: {
  id: string;
  kind: NoteKind;
  mark: number | null;
  body: string;
  max: number;
  single: boolean;
  tint: Media["color"];
}) {
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const [text, setText] = React.useState(body);
  const [seen, setSeen] = React.useState(body);

  // Another edit of the same note (or a reload) has to show through the draft.
  if (seen !== body) {
    setSeen(body);
    setText(body);
  }

  const quote = kind === "highlight";

  return (
    <div className={cn(`tint-${tint}`, "group/note flex gap-2 py-2")}>
      <span
        aria-hidden
        className={cn("mt-[3px] w-[3px] shrink-0 rounded-full", quote ? "bg-[var(--tint)]" : "bg-line-strong")}
      />
      <div className="min-w-0 flex-1">
        <AutoTextarea
          value={text}
          onChange={setText}
          aria-label={NOTE_KIND_LABELS[kind]}
          onBlur={() => {
            const next = text.trim();
            if (!next) { setText(body); return; }
            if (next !== body) patch("notes", id, { body: next });
          }}
          className={cn("text-[13px] text-ink placeholder:text-ink-4", quote && "italic")}
        />
        <div className="mt-1 flex items-center gap-1.5">
          <MarkChip
            mark={mark}
            max={max}
            single={single}
            onChange={(locator) => patch("notes", id, { locator })}
          />
          <span className="text-[11px] text-ink-4">{NOTE_KIND_LABELS[kind]}</span>
          <IconButton
            label="Delete this note"
            tone="danger"
            className="ml-auto opacity-0 transition-opacity focus-visible:opacity-100 group-hover/note:opacity-100"
            onClick={() => remove("notes", id)}
          >
            <Trash2 />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function MediaNotes({ item, single }: { item: Media; single: boolean }) {
  const stored = useStore((s) => s.notes);
  const insert = useStore((s) => s.insert);

  const total = Math.max(1, item.total_episodes);
  const max = single ? Math.max(1, item.runtime_min ?? 600) : total;

  const [kind, setKind] = React.useState<Marginal>("thought");
  const [mark, setMark] = React.useState(() =>
    single ? 0 : Math.max(1, Math.min(item.current_episode || 1, total)));
  const [text, setText] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);

  const rows = React.useMemo(
    () => stored
      .filter((n) => n.media_id === item.id)
      .sort((a, b) =>
        (a.locator ?? Number.MAX_SAFE_INTEGER) - (b.locator ?? Number.MAX_SAFE_INTEGER)
        || a.created_at.localeCompare(b.created_at)),
    [stored, item.id],
  );

  const visible = expanded ? rows : rows.slice(0, NOTE_PREVIEW);
  const canAdd = text.trim().length > 0;

  function add() {
    const body = text.trim();
    if (!body) return;
    insert("notes", { media_id: item.id, kind, locator: mark > 0 ? mark : null, body });
    setText("");
  }

  return (
    <SubGroup
      storageKey="humoyun.watch.sheet.marginalia"
      label="Quotes & thoughts"
      summary={rows.length
        ? `${rows.length} kept from it`
        : `Keep a line, with the ${markNoun(single)} it came from`}
    >
      <div className="rounded-md border border-line p-2">
        <div className="flex items-center gap-2">
          <Segmented<Marginal> size="sm" value={kind} onChange={setKind} options={MARGINAL_OPTIONS} />
          <div className="ml-auto w-[112px]">
            <NumberField
              label={single ? "Minute this note came from" : "Episode this note came from"}
              value={mark}
              min={0}
              max={max}
              step={1}
              suffix={single ? "min" : "ep"}
              onChange={setMark}
              className="h-7"
            />
          </div>
        </div>

        <AutoTextarea
          value={text}
          onChange={setText}
          minRows={2}
          aria-label={kind === "highlight" ? "A line worth keeping" : "Your thought"}
          placeholder={kind === "highlight" ? "The line worth keeping…" : "What did it make you think?"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); }
          }}
          className="mt-2 text-[13px] text-ink placeholder:text-ink-4"
        />

        <div className="mt-1.5 flex items-center gap-2">
          <Button size="sm" variant="primary" disabled={!canAdd} onClick={add}>
            <Plus className="size-3.5" />
            Add
          </Button>
          <span className="text-[11px] text-ink-4">⌘↵ saves</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <MiniEmpty className="mt-1">Nothing kept from this one yet.</MiniEmpty>
      ) : (
        <div className="mt-1 divide-y divide-line">
          {visible.map((n) => (
            <NoteRow
              key={n.id}
              id={n.id}
              kind={n.kind}
              mark={n.locator}
              body={noteText(n)}
              max={max}
              single={single}
              tint={item.color}
            />
          ))}
          {rows.length > NOTE_PREVIEW && (
            <div className="pt-1.5">
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Show fewer" : `Show all ${rows.length}`}
              </Button>
            </div>
          )}
        </div>
      )}
    </SubGroup>
  );
}

// =========================================================
// The live before/after for a reschedule, rendered under the plan controls so
// the calendar damage is visible while the pace is still being dialled in.
// =========================================================
const PREVIEW_ROWS = 7;

const KIND_META: Record<WatchDiffKind, {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  verb: string;
}> = {
  added:   { icon: Plus,       tone: "text-success", verb: "New block" },
  removed: { icon: Minus,      tone: "text-ink-3",   verb: "Block removed" },
  changed: { icon: ArrowRight, tone: "text-ink-2",   verb: "Episodes change" },
  same:    { icon: Dot,        tone: "text-ink-4",   verb: "Unchanged" },
};

function DiffChip({ n, mark, word, tone }: { n: number; mark: string; word: string; tone: string }) {
  if (!n) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11.5px] font-medium tnum", tone)}>
      <span aria-hidden>{mark}</span>
      <span aria-hidden>{n}</span>
      <VisuallyHidden>{`${n} ${word}`}</VisuallyHidden>
    </span>
  );
}

function DiffRow({ row, divided }: { row: WatchDiffRow; divided: boolean }) {
  const meta = KIND_META[row.kind];
  const Icon = meta.icon;
  return (
    <div className={cn("flex items-center gap-2 px-2 py-[5px]", divided && "hairline-t")}>
      <Icon className={cn("size-3 shrink-0", meta.tone)} aria-hidden />
      <VisuallyHidden>{`${meta.verb}. `}</VisuallyHidden>
      <span className={cn("w-[78px] shrink-0 text-[12px] tnum", row.kind === "same" ? "text-ink-4" : "text-ink-2")}>
        {formatDate(row.date)}
      </span>
      {row.kind === "changed" ? (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] tnum">
          <span className="truncate text-ink-4 line-through">{episodeRangeLabel(row.before)}</span>
          <ArrowRight className="size-3 shrink-0 text-ink-4" aria-hidden />
          <span className="truncate text-ink">{episodeRangeLabel(row.after)}</span>
        </span>
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[12px] tnum",
            row.kind === "removed" ? "text-ink-4 line-through" : row.kind === "added" ? "text-ink" : "text-ink-4",
          )}
        >
          {episodeRangeLabel(row.after ?? row.before)}
        </span>
      )}
    </div>
  );
}

function WatchDiffView({ diff, className }: { diff: WatchDiff; className?: string }) {
  const [expanded, setExpanded] = React.useState(false);

  // Unchanged days are noise while scanning a diff — show them only on request.
  const interesting = diff.rows.filter((r) => r.kind !== "same");
  const source = interesting.length ? interesting : diff.rows;
  const visible = expanded ? source : source.slice(0, PREVIEW_ROWS);

  return (
    <div className={cn("rounded-md border border-line", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-2">
        <p className="text-[12px] text-ink-2 tnum" aria-live="polite">{watchDiffSummary(diff)}</p>
        <span className="flex items-center gap-2.5">
          <DiffChip n={diff.added} mark="+" word="days added" tone="text-success" />
          <DiffChip n={diff.changed} mark="~" word="days re-cut" tone="text-ink-2" />
          <DiffChip n={diff.removed} mark="−" word="days dropped" tone="text-ink-3" />
        </span>
      </div>

      {/* No inner scroll: the sheet already scrolls, and a second scroll region
          inside it traps the wheel. The show-more button governs the length. */}
      {visible.length > 0 && (
        <div>
          {visible.map((row, i) => <DiffRow key={row.date} row={row} divided={i > 0} />)}
        </div>
      )}

      {source.length > PREVIEW_ROWS && (
        <div className="hairline-t p-1">
          <Button size="sm" variant="ghost" className="w-full" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show fewer days" : `Show all ${source.length} days`}
          </Button>
        </div>
      )}

      {diff.kept > 0 && (
        <p className="hairline-t px-2 py-1.5 text-[11.5px] text-ink-4 tnum">
          {diff.kept} watched {diff.kept === 1 ? "block stays" : "blocks stay"} where {diff.kept === 1 ? "it is" : "they are"}.
        </p>
      )}
    </div>
  );
}
