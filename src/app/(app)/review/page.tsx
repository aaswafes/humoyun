"use client";

import * as React from "react";
import { Check, FileText } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { todayISO } from "@/lib/date";
import { Button, IconButton, Segmented } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { PeriodNav } from "@/components/review/period-nav";
import { Recap } from "@/components/review/recap";
import { Evidence } from "@/components/review/evidence";
import { PeriodLog } from "@/components/review/period-log";
import { Reflection } from "@/components/review/reflection";
import { PastReviews, focusReflection } from "@/components/review/past-reviews";
import { SummaryDialog } from "@/components/review/summary";
import { Guided, type GuidedStep } from "@/components/review/guided";
import { useReviewPrefs } from "@/components/review/prefs";
import { answeredCount, draftOf, findReview, isWritten } from "@/components/review/review-doc";
import {
  buildPeriod, measurementNote, periodStart, SCOPES, SCOPE_LABEL, SCOPE_NOUN, shiftPeriod,
  type ReviewScope,
} from "@/components/review/period";

export default function ReviewPage() {
  const weekStartDay = useStore((s) => s.profile?.week_start ?? 1);
  const selectedDate = useStore((s) => s.selectedDate);
  const reviews = useStore((s) => s.reviews);
  const tasks = useStore((s) => s.tasks);
  const toast = useStore((s) => s.toast);

  const [prefs, setPrefs] = useReviewPrefs();

  // The anchor is any day inside the period being reviewed; the period itself
  // is derived, so a change to week_start or scope can never leave the page
  // half-aligned. A selected date in the future would open a period that has
  // not happened — reviewing starts from today and steps backwards.
  const [anchor, setAnchor] = React.useState(() => {
    const today = todayISO();
    return selectedDate > today ? today : selectedDate;
  });
  const [step, setStep] = React.useState(0);
  const [summaryOpen, setSummaryOpen] = React.useState(false);

  const scope = prefs.scope;
  const period = React.useMemo(
    () => buildPeriod(scope, anchor, weekStartDay),
    [scope, anchor, weekStartDay],
  );
  const currentStart = periodStart(scope, todayISO(), weekStartDay);
  const atCurrent = period.start === currentStart;
  const canGoForward = period.start <= currentStart;

  const review = findReview(reviews, period.start, scope);
  const written = !!review && isWritten(review);
  const answered = review ? answeredCount(draftOf(review)) : 0;

  const slippedCount = React.useMemo(() => {
    const inRange = new Set(period.days);
    return tasks.filter(
      (t) => !!t.date && inRange.has(t.date) && !t.parent_id
        && t.status !== "dropped" && t.status !== "done",
    ).length;
  }, [tasks, period.days]);

  function goto(nextAnchor: string) {
    setAnchor(nextAnchor);
    setStep(0);
  }

  function setScope(next: ReviewScope) {
    setPrefs({ scope: next });
    setStep(0);
  }

  const steps: GuidedStep[] = [
    {
      id: "recap",
      label: "Recap",
      // The step hint carries what the section header used to repeat.
      hint: measurementNote(period),
      done: period.phase !== "future",
      content: <Recap period={period} weekStartDay={weekStartDay} onGoToCurrent={() => goto(currentStart)} />,
    },
    {
      id: "evidence",
      label: "Evidence",
      hint: "Behind every number: the goals that moved, the pages read, the days you kept, and where the hours actually went.",
      done: period.phase !== "future",
      content: <Evidence period={period} weekStartDay={weekStartDay} />,
    },
    {
      id: "log",
      label: "The log",
      hint: `What closed, day by day — then everything dated this ${SCOPE_NOUN[scope]} that did not. Open either list to work through it.`,
      done: slippedCount === 0,
      content: <PeriodLog period={period} weekStartDay={weekStartDay} />,
    },
    {
      id: "reflection",
      label: "Reflection",
      hint: "Six prompts. Write badly and quickly — the point is that it exists, not that it is polished.",
      done: answered > 0,
      content: <Reflection key={`${period.start}-${scope}`} period={period} />,
    },
    {
      id: "past",
      label: "Past reviews",
      hint: "Search what you have written before, or put two periods side by side.",
      done: reviews.some(isWritten),
      content: (
        <PastReviews
          period={period}
          weekStartDay={weekStartDay}
          onOpenPeriod={(start, nextScope) => {
            if (nextScope !== scope) setPrefs({ scope: nextScope });
            goto(start);
          }}
          onStartWriting={() => {
            if (prefs.layout === "guided") setStep(3);
            // In guided mode the prompts only exist after the step switch paints.
            setTimeout(focusReflection, 0);
          }}
        />
      ),
    },
  ];

  // The shell already owns n, c, t and every "g then …" chord, so the page
  // sticks to keys nothing else claims.
  useHotkeys({
    arrowleft: () => goto(shiftPeriod(scope, period.start, -1)),
    arrowright: () => { if (canGoForward) goto(shiftPeriod(scope, period.start, 1)); },
    w: () => goto(currentStart),
    v: () => setPrefs({ layout: prefs.layout === "guided" ? "full" : "guided" }),
    p: () => setSummaryOpen(true),
    j: () => { if (prefs.layout === "guided") setStep((i) => Math.min(steps.length - 1, i + 1)); },
    k: () => { if (prefs.layout === "guided") setStep((i) => Math.max(0, i - 1)); },
    1: () => { if (prefs.layout === "guided") setStep(0); },
    2: () => { if (prefs.layout === "guided") setStep(1); },
    3: () => { if (prefs.layout === "guided") setStep(2); },
    4: () => { if (prefs.layout === "guided") setStep(3); },
    5: () => { if (prefs.layout === "guided") setStep(4); },
  });

  return (
    <>
      <PageHeader
        title="Review"
        actions={
          <>
            <Segmented
              size="sm"
              value={prefs.layout}
              onChange={(layout) => setPrefs({ layout })}
              options={[
                { value: "guided", label: "Guided", title: "Step through it one part at a time (V)" },
                { value: "full", label: "Everything", title: "See everything at once (V)" },
              ]}
            />
            <IconButton label="Copy or print this review as plain text (P)" onClick={() => setSummaryOpen(true)}>
              <FileText />
            </IconButton>
            <Button size="sm" variant="secondary" disabled={atCurrent} onClick={() => goto(currentStart)}>
              This {SCOPE_NOUN[scope]}
            </Button>
          </>
        }
      >
        <Segmented
          size="sm"
          value={scope}
          onChange={setScope}
          options={SCOPES.map((s) => ({
            value: s,
            label: SCOPE_LABEL[s].replace("ly", ""),
            title: `${SCOPE_LABEL[s]} review`,
          }))}
        />
        <PeriodNav
          period={period}
          weekStartDay={weekStartDay}
          canGoForward={canGoForward}
          onPrev={() => goto(shiftPeriod(scope, period.start, -1))}
          onNext={() => goto(shiftPeriod(scope, period.start, 1))}
          onJump={goto}
        />
      </PageHeader>

      <PageBody>
        {/* The one hero on this screen. Everything under it is grey until you
            reach the prompts, which are the only thing here you actually write. */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="display-serif text-[44px] leading-none text-ink tnum">
              {period.title}
            </h2>
            <p className="mt-2.5 text-[12.5px] text-ink-4 tnum">
              {period.rangeLabel} · {period.relative}
            </p>
          </div>

          {written ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
              <Check className="size-3.5 text-ink-4" strokeWidth={2.5} />
              Reviewed
            </span>
          ) : (
            <span className="text-[12px] text-ink-4">Not written yet</span>
          )}
        </div>

        <div className="mt-10">
          {prefs.layout === "guided" ? (
            <Guided
              steps={steps}
              index={step}
              onIndex={setStep}
              onFinish={() =>
                toast({
                  title: `${period.title} reviewed`,
                  description: `${answered} of 6 prompts written.`,
                  tone: "success",
                  action: { label: "Copy it", run: () => setSummaryOpen(true) },
                })
              }
            />
          ) : (
            <div>
              {steps.map((s) => (
                <React.Fragment key={s.id}>{s.content}</React.Fragment>
              ))}
            </div>
          )}
        </div>
      </PageBody>

      <SummaryDialog
        period={period}
        weekStartDay={weekStartDay}
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
      />
    </>
  );
}
