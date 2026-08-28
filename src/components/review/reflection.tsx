"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Review } from "@/lib/types";
import { AutoTextarea } from "@/components/ui/primitives";
import { Section } from "./section";

const RATING_LABELS = ["Rough", "Hard", "Steady", "Strong", "Excellent"];

const FIELDS = [
  {
    key: "went_well",
    id: "review-went-well",
    label: "What went well",
    hint: "The wins, however small. What would you happily repeat?",
  },
  {
    key: "went_bad",
    id: "review-went-bad",
    label: "What didn't",
    hint: "Where did the week leak? Be specific rather than harsh.",
  },
  {
    key: "learned",
    id: "review-learned",
    label: "What I learned",
    hint: "One thing you know now that you didn't on Monday.",
  },
  {
    key: "next_week",
    id: "review-next-week",
    label: "Next week's focus",
    hint: "The single thing that has to be true by next Sunday.",
  },
] as const;

type TextKey = (typeof FIELDS)[number]["key"];

interface Draft {
  went_well: string;
  went_bad: string;
  learned: string;
  next_week: string;
  rating: number | null;
}

const trimmed = (s: string) => (s.trim() ? s : null);

function draftOf(review: Review | undefined): Draft {
  return {
    went_well: review?.went_well ?? "",
    went_bad: review?.went_bad ?? "",
    learned: review?.learned ?? "",
    next_week: review?.next_week ?? "",
    rating: review?.rating ?? null,
  };
}

function snapshot(d: Draft): Partial<Review> {
  return {
    went_well: trimmed(d.went_well),
    went_bad: trimmed(d.went_bad),
    learned: trimmed(d.learned),
    next_week: trimmed(d.next_week),
    rating: d.rating,
  };
}

function hasContent(d: Draft): boolean {
  return d.rating != null || [d.went_well, d.went_bad, d.learned, d.next_week].some((v) => v.trim().length > 0);
}

function withText(d: Draft, key: TextKey, value: string): Draft {
  switch (key) {
    case "went_well": return { ...d, went_well: value };
    case "went_bad": return { ...d, went_bad: value };
    case "learned": return { ...d, learned: value };
    case "next_week": return { ...d, next_week: value };
  }
}

/** Mount with `key={weekStart}` — every week gets its own draft. */
export function Reflection({ weekStart }: { weekStart: string }) {
  const review = useStore((s) => s.reviews.find((r) => r.week_start === weekStart));
  const setReview = useStore((s) => s.setReview);

  const [draft, setDraft] = React.useState<Draft>(() => draftOf(review));
  const [status, setStatus] = React.useState<"idle" | "pending" | "saved">(() =>
    hasContent(draftOf(review)) ? "saved" : "idle",
  );

  const pending = React.useRef<Partial<Review> | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = React.useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const changes = pending.current;
    pending.current = null;
    if (changes) setReview(weekStart, changes);
  }, [setReview, weekStart]);

  // Leaving the page or switching weeks mid-sentence must not drop the sentence,
  // so the unmount flush has to reach the newest closure.
  const commitRef = React.useRef(commit);
  commitRef.current = commit;
  React.useEffect(() => () => commitRef.current(), []);

  function apply(next: Draft, immediate = false) {
    setDraft(next);

    // Never create a review row for a week the user only glanced at.
    if (!hasContent(next) && !review) return;

    pending.current = snapshot(next);
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    if (immediate) { commit(); setStatus("saved"); return; }
    timer.current = setTimeout(() => { commit(); setStatus("saved"); }, 650);
  }

  return (
    <Section
      label="Reflection"
      note="Saves itself as you type"
      action={
        status === "pending" ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-4">
            <span className="size-1.5 rounded-full bg-ink-4" />
            Saving…
          </span>
        ) : status === "saved" ? (
          <span className="anim-fade inline-flex items-center gap-1 text-[11.5px] text-ink-3">
            <Check className="size-3" strokeWidth={2.5} />
            Saved
          </span>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
        <span className="text-[13.5px] text-ink-2">How was the week?</span>
        <div role="radiogroup" aria-label="Week rating" className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = draft.rating === n;
            return (
              <button
                key={n}
                role="radio"
                aria-checked={active}
                aria-label={`${n} out of 5 — ${RATING_LABELS[n - 1]}`}
                onClick={() => apply({ ...draft, rating: active ? null : n }, true)}
                className={cn(
                  "size-8 rounded-full text-[13px] font-medium tnum cursor-pointer",
                  "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)] active:scale-[0.94]",
                  active ? "bg-accent text-accent-ink" : "bg-hover text-ink-2 hover:bg-active hover:text-ink",
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
        <span className="text-[12.5px] text-ink-3">
          {draft.rating ? RATING_LABELS[draft.rating - 1] : "Pick a number, then write."}
        </span>
      </div>

      {FIELDS.map((field) => (
        <div key={field.key} className="hairline-t py-4">
          <label
            htmlFor={field.id}
            className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3"
          >
            {field.label}
          </label>
          <AutoTextarea
            id={field.id}
            minRows={2}
            value={draft[field.key]}
            onChange={(v) => apply(withText(draft, field.key, v))}
            placeholder={field.hint}
            className={cn(
              "mt-1.5 -mx-1.5 rounded-md px-1.5 py-1 text-[13.5px] text-ink",
              "placeholder:text-ink-4 hover:bg-hover focus:bg-hover transition-colors duration-150",
            )}
          />
        </div>
      ))}
    </Section>
  );
}
