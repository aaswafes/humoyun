"use client";

import * as React from "react";
import { ChevronRight, PenLine } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { weekNumber } from "@/lib/date";
import type { Review } from "@/lib/types";
import { Button, EmptyState } from "@/components/ui/primitives";
import { Section } from "./section";
import { formatWeekRange, plural } from "./metrics";

const PREVIEW_COUNT = 10;

const ENTRIES = [
  { key: "went_well", label: "What went well" },
  { key: "went_bad", label: "What didn't" },
  { key: "learned", label: "What I learned" },
  { key: "next_week", label: "Next week's focus" },
] as const;

const written = (r: Review) =>
  r.rating != null || !!(r.went_well || r.went_bad || r.learned || r.next_week);

export function PastReviews({
  weekStart, onOpenWeek,
}: {
  weekStart: string;
  onOpenWeek: (iso: string) => void;
}) {
  const reviews = useStore((s) => s.reviews);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  const list = React.useMemo(
    () => reviews.filter(written).sort((a, b) => b.week_start.localeCompare(a.week_start)),
    [reviews],
  );
  const visible = showAll ? list : list.slice(0, PREVIEW_COUNT);

  return (
    <Section
      label="Past reviews"
      note={list.length ? `${list.length} ${plural(list.length, "week")} written` : undefined}
    >
      {list.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title="No reviews written yet"
          description="Once you write your first reflection it lands here, so you can read the last three months of your own advice in one scroll."
          action={
            <Button size="sm" variant="primary" onClick={focusReflection}>
              Start this week's review
            </Button>
          }
        />
      ) : (
        <div>
          {visible.map((review, i) => (
            <PastReviewRow
              key={review.id}
              review={review}
              divided={i > 0}
              viewing={review.week_start === weekStart}
              open={openId === review.id}
              onToggle={() => setOpenId((id) => (id === review.id ? null : review.id))}
              onOpenWeek={onOpenWeek}
            />
          ))}

          {list.length > visible.length && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-2 px-1.5 py-1.5 text-[12.5px] text-ink-3 hover:text-ink cursor-pointer transition-colors"
            >
              Show {list.length - visible.length} older {plural(list.length - visible.length, "review")}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------
function PastReviewRow({
  review, open, viewing, divided, onToggle, onOpenWeek,
}: {
  review: Review;
  open: boolean;
  viewing: boolean;
  divided: boolean;
  onToggle: () => void;
  onOpenWeek: (iso: string) => void;
}) {
  const preview = review.next_week || review.went_well || review.learned || review.went_bad || "";

  return (
    <div className={cn(divided && "hairline-t")}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-2.5 text-left cursor-pointer transition-colors duration-150 hover:bg-hover"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
            open && "rotate-90",
          )}
        />
        <span className={cn("w-[62px] shrink-0 text-[13px] font-medium tnum", viewing ? "text-accent" : "text-ink")}>
          Week {weekNumber(review.week_start)}
        </span>
        <span className="hidden w-[104px] shrink-0 text-[12px] text-ink-3 tnum sm:block">
          {formatWeekRange(review.week_start)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-4">{preview}</span>
        <RatingDots value={review.rating} />
      </button>

      {open && (
        <div className="anim-fade space-y-3.5 pb-4 pl-7 pr-1 pt-0.5">
          {ENTRIES.map((entry) =>
            review[entry.key] ? (
              <div key={entry.key}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  {entry.label}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">
                  {review[entry.key]}
                </p>
              </div>
            ) : null,
          )}
          {!viewing && (
            <Button size="xs" variant="secondary" onClick={() => onOpenWeek(review.week_start)}>
              Open this week
            </Button>
          )}
        </div>
      )}
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
 * of the form that is already on screen rather than routing anywhere.
 */
function focusReflection() {
  const el = document.getElementById("review-went-well") as HTMLTextAreaElement | null;
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.focus({ preventScroll: true });
}
