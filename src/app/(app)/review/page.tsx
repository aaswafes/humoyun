"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { addDays, startOfWeek, todayISO, weekNumber } from "@/lib/date";
import { Button } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { WeekNav } from "@/components/review/week-nav";
import { Recap } from "@/components/review/recap";
import { WeekLog } from "@/components/review/week-log";
import { Reflection } from "@/components/review/reflection";
import { PastReviews } from "@/components/review/past-reviews";
import { formatWeekRange, relativeWeek } from "@/components/review/metrics";

export default function ReviewPage() {
  const weekStartDay = useStore((s) => s.profile?.week_start ?? 1);
  const selectedDate = useStore((s) => s.selectedDate);
  const reviews = useStore((s) => s.reviews);

  // The anchor is any day inside the week being reviewed; the week itself is
  // derived so a change to week_start can never leave the page half-aligned.
  const [anchor, setAnchor] = React.useState(selectedDate);
  const week = startOfWeek(anchor, weekStartDay);
  const currentWeek = startOfWeek(todayISO(), weekStartDay);
  const canGoForward = week < currentWeek;

  const review = reviews.find((r) => r.week_start === week);
  const written =
    !!review && (review.rating != null || !!(review.went_well || review.went_bad || review.learned || review.next_week));

  useHotkeys({
    arrowleft: () => setAnchor(addDays(week, -7)),
    arrowright: () => { if (canGoForward) setAnchor(addDays(week, 7)); },
    w: () => setAnchor(currentWeek),
  });

  return (
    <>
      <PageHeader
        title="Weekly Review"
        actions={
          <Button
            size="sm"
            variant="secondary"
            disabled={week === currentWeek}
            onClick={() => setAnchor(currentWeek)}
          >
            This week
          </Button>
        }
      >
        <WeekNav
          weekStart={week}
          canGoForward={canGoForward}
          onPrev={() => setAnchor(addDays(week, -7))}
          onNext={() => setAnchor(addDays(week, 7))}
        />
      </PageHeader>

      <PageBody>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="display-serif text-[44px] leading-none text-ink tnum">
              Week {weekNumber(week)}
            </h2>
            <p className="mt-2.5 text-[13px] text-ink-3 tnum">
              {formatWeekRange(week)} · {relativeWeek(week, weekStartDay)}
            </p>
          </div>

          {written ? (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-success">
              <Check className="size-3.5" strokeWidth={2.5} />
              Reviewed
            </span>
          ) : (
            <span className="text-[12.5px] text-ink-4">Not written yet</span>
          )}
        </div>

        <Recap weekStart={week} weekStartDay={weekStartDay} />
        <WeekLog weekStart={week} />
        <Reflection key={week} weekStart={week} />
        <PastReviews weekStart={week} onOpenWeek={setAnchor} />
      </PageBody>
    </>
  );
}
