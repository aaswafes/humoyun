"use client";

import * as React from "react";
import { ChevronRight, Columns2, PenLine, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import type { Review } from "@/lib/types";
import { Badge, Button, EmptyState, IconButton, Input, Segmented } from "@/components/ui/primitives";
import { Field, MiniEmpty } from "@/components/ui/form";
import { Section } from "./section";
import { Delta } from "./sparkline";
import { formatHours, metricsFor, plural, type Metrics } from "./metrics";
import { useMetricSource } from "./recap";
import {
  buildPeriod, SCOPES, SCOPE_LABEL, type Period, type ReviewScope,
} from "./period";
import { draftOf, isWritten, scopeOf, type ReviewDraft } from "./review-doc";

const PREVIEW_COUNT = 10;

const ENTRIES: { key: keyof Omit<ReviewDraft, "rating">; label: string }[] = [
  { key: "went_well", label: "What went well" },
  { key: "went_bad", label: "What didn't" },
  { key: "learned", label: "What I learned" },
  { key: "stop", label: "What to stop" },
  { key: "grateful", label: "Grateful for" },
  { key: "next_week", label: "Next focus" },
];

type ScopeFilter = ReviewScope | "all";

function haystack(r: Review, period: Period): string {
  const d = draftOf(r);
  return [
    period.title, period.rangeLabel,
    d.went_well, d.went_bad, d.learned, d.next_week, d.stop, d.grateful,
  ].join(" ").toLowerCase();
}

export function PastReviews({
  period, weekStartDay, onOpenPeriod, onStartWriting,
}: {
  period: Period;
  weekStartDay: number;
  onOpenPeriod: (start: string, scope: ReviewScope) => void;
  /** Guided mode may not have the reflection on screen, so the page decides. */
  onStartWriting: () => void;
}) {
  const reviews = useStore((s) => s.reviews);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<ScopeFilter>("all");
  const [compare, setCompare] = React.useState<string[]>([]);

  const rows = React.useMemo(() => {
    const today = todayISO();
    return reviews
      .filter(isWritten)
      .map((r) => ({ review: r, period: buildPeriod(scopeOf(r), r.week_start, weekStartDay, today) }))
      .sort((a, b) => b.review.week_start.localeCompare(a.review.week_start));
  }, [reviews, weekStartDay]);

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "all" && row.period.scope !== filter) return false;
      if (!q) return true;
      return haystack(row.review, row.period).includes(q);
    });
  }, [rows, query, filter]);

  const visible = showAll ? matches : matches.slice(0, PREVIEW_COUNT);
  const compared = compare
    .map((id) => rows.find((r) => r.review.id === id))
    .filter((r): r is (typeof rows)[number] => !!r);

  function toggleCompare(id: string) {
    setCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Two columns is the whole point — a third pushes the oldest out.
      return [...prev, id].slice(-2);
    });
  }

  return (
    <Section
      id="review-past"
      label="Past reviews"
      note={rows.length ? `${rows.length} written` : undefined}
      action={
        compare.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => setCompare([])}>
            <X className="size-3.5" />
            Clear comparison
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title="No reviews written yet"
          description="Once you write your first reflection it lands here, so you can read the last three months of your own advice in one scroll."
          action={
            <Button size="sm" variant="primary" onClick={onStartWriting}>
              Start this review
            </Button>
          }
        />
      ) : (
        <>
          {compared.length === 2 && (
            <ComparePanel
              left={compared[1]}
              right={compared[0]}
              weekStartDay={weekStartDay}
              onOpenPeriod={onOpenPeriod}
            />
          )}

          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Find a review" className="min-w-[200px] flex-1" hint={query ? `${matches.length} found` : undefined}>
              {(wiring) => (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
                  <Input
                    {...wiring}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setShowAll(true); }}
                    placeholder="A word you wrote, or a week number"
                    className="pl-7"
                  />
                </div>
              )}
            </Field>
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              className="mb-0.5"
              options={[
                { value: "all" as ScopeFilter, label: "All" },
                ...SCOPES.map((s) => ({ value: s as ScopeFilter, label: SCOPE_LABEL[s].replace("ly", "") })),
              ]}
            />
          </div>

          {matches.length === 0 ? (
            <MiniEmpty action={<Button size="xs" variant="secondary" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</Button>}>
              Nothing matches “{query}”.
            </MiniEmpty>
          ) : (
            <div>
              {visible.map((row, i) => (
                <PastReviewRow
                  key={row.review.id}
                  review={row.review}
                  period={row.period}
                  divided={i > 0}
                  viewing={row.review.week_start === period.start && row.period.scope === period.scope}
                  open={openId === row.review.id}
                  comparing={compare.includes(row.review.id)}
                  onToggle={() => setOpenId((id) => (id === row.review.id ? null : row.review.id))}
                  onCompare={() => toggleCompare(row.review.id)}
                  onOpenPeriod={onOpenPeriod}
                />
              ))}

              {matches.length > visible.length && (
                <div className="mt-3 flex justify-center">
                  <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                    Show {matches.length - visible.length} older {plural(matches.length - visible.length, "review")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------
function PastReviewRow({
  review, period, open, viewing, divided, comparing, onToggle, onCompare, onOpenPeriod,
}: {
  review: Review;
  period: Period;
  open: boolean;
  viewing: boolean;
  divided: boolean;
  comparing: boolean;
  onToggle: () => void;
  onCompare: () => void;
  onOpenPeriod: (start: string, scope: ReviewScope) => void;
}) {
  const draft = draftOf(review);
  const preview = draft.next_week || draft.went_well || draft.learned || draft.went_bad || draft.grateful || "";

  return (
    <div className={cn(divided && "hairline-t")}>
      <div className="flex items-center gap-1">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-2.5 text-left cursor-pointer transition-colors duration-150 hover:bg-hover"
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
              open && "rotate-90",
            )}
          />
          <span className={cn("w-[66px] shrink-0 text-[13px] font-medium tnum", viewing ? "text-accent" : "text-ink")}>
            {period.title}
          </span>
          {period.scope !== "week" && (
            <Badge tint={period.scope === "month" ? "violet" : "amber"}>{SCOPE_LABEL[period.scope]}</Badge>
          )}
          <span className="hidden w-[132px] shrink-0 truncate text-[12px] text-ink-3 tnum sm:block">
            {period.rangeLabel}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-4">{preview}</span>
          <RatingDots value={review.rating} />
        </button>

        <IconButton
          label={comparing ? `Stop comparing ${period.title}` : `Compare ${period.title} with another`}
          aria-pressed={comparing}
          active={comparing}
          onClick={onCompare}
        >
          <Columns2 />
        </IconButton>
      </div>

      {open && (
        <div className="anim-fade space-y-3.5 pb-4 pl-7 pr-1 pt-0.5">
          {ENTRIES.map((entry) =>
            draft[entry.key] ? (
              <div key={entry.key}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  {entry.label}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">
                  {draft[entry.key]}
                </p>
              </div>
            ) : null,
          )}
          {!viewing && (
            <Button size="xs" variant="secondary" onClick={() => onOpenPeriod(review.week_start, period.scope)}>
              Open this {period.scope}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Two periods, side by side — the numbers first, then the words.
// ---------------------------------------------------------
const COMPARE_STATS: { label: string; read: (m: Metrics) => number; format: (n: number) => string }[] = [
  { label: "Tasks done", read: (m) => m.tasksDone, format: (n) => String(n) },
  { label: "Focus", read: (m) => m.focusMinutes, format: formatHours },
  { label: "Habits hit", read: (m) => m.habitsHit, format: (n) => String(n) },
  { label: "Salah", read: (m) => m.salahDone, format: (n) => String(n) },
  { label: "Pages", read: (m) => m.pagesRead, format: (n) => String(n) },
];

function ComparePanel({
  left, right, weekStartDay, onOpenPeriod,
}: {
  left: { review: Review; period: Period };
  right: { review: Review; period: Period };
  weekStartDay: number;
  onOpenPeriod: (start: string, scope: ReviewScope) => void;
}) {
  const src = useMetricSource();
  const metrics = React.useMemo(() => ({
    left: metricsFor(left.period.days, src, weekStartDay),
    right: metricsFor(right.period.days, src, weekStartDay),
  }), [left.period.days, right.period.days, src, weekStartDay]);

  const leftDraft = draftOf(left.review);
  const rightDraft = draftOf(right.review);

  return (
    <div className="mb-5 surface overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-line">
        {[left, right].map((side) => (
          <div key={side.review.id} className="bg-raised px-3.5 py-3">
            <div className="flex items-baseline gap-2">
              <h3 className="text-[13px] font-semibold text-ink">{side.period.title}</h3>
              <span className="truncate text-[11.5px] text-ink-4 tnum">{side.period.rangeLabel}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <RatingDots value={side.review.rating} />
              <Button
                size="xs"
                variant="ghost"
                className="ml-auto"
                onClick={() => onOpenPeriod(side.review.week_start, side.period.scope)}
              >
                Open
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-px bg-line">
        <dl className="bg-canvas px-3.5 py-3">
          {COMPARE_STATS.map((s) => (
            <div key={s.label} className="flex items-baseline gap-2 py-0.5">
              <dt className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{s.label}</dt>
              <dd className="shrink-0 text-[12.5px] font-medium text-ink tnum">{s.format(s.read(metrics.left))}</dd>
            </div>
          ))}
        </dl>
        <dl className="bg-canvas px-3.5 py-3">
          {COMPARE_STATS.map((s) => {
            const value = s.read(metrics.right);
            const before = s.read(metrics.left);
            return (
              <div key={s.label} className="flex items-baseline gap-2 py-0.5">
                <dt className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{s.label}</dt>
                <dd className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-ink tnum">
                  {s.format(value)}
                  <Delta value={value - before} previous={before} format={s.format} />
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {ENTRIES.map((entry) => {
        if (!leftDraft[entry.key] && !rightDraft[entry.key]) return null;
        return (
          <div key={entry.key} className="hairline-t">
            <div className="px-3.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              {entry.label}
            </div>
            <div className="grid grid-cols-2 gap-px">
              {[leftDraft, rightDraft].map((d, i) => (
                <p
                  key={i}
                  className="whitespace-pre-wrap px-3.5 py-2 text-[13px] leading-relaxed text-ink-2"
                >
                  {d[entry.key] || <span className="text-ink-4">—</span>}
                </p>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RatingDots({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="w-[46px] shrink-0 text-right text-[11.5px] text-ink-4">—</span>;
  }
  return (
    <span className="flex w-[46px] shrink-0 justify-end gap-[3px]" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn("size-[5px] rounded-full", n <= value ? "bg-accent" : "bg-line-strong")}
        />
      ))}
    </span>
  );
}

/**
 * The empty state's job is to start the ritual, so it jumps to the first prompt
 * of the form that is already on screen rather than routing anywhere. The
 * global reduced-motion override cannot reach a scroll started from script, so
 * the preference is read here.
 */
export function focusReflection() {
  const el = document.getElementById("review-went-well") as HTMLTextAreaElement | null;
  const reduce = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  el?.focus({ preventScroll: true });
}
