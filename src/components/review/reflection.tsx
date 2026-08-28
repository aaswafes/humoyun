"use client";

import * as React from "react";
import { Check, CornerDownLeft, Quote } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { AutoTextarea, Button } from "@/components/ui/primitives";
import { Section } from "./section";
import { SCOPE_NOUN, shiftPeriod, type Period, type ReviewScope } from "./period";
import {
  answeredCount, draftOf, findReview, hasContent, useSaveReview,
  type ReviewDraft,
} from "./review-doc";

const RATING_LABELS = ["Rough", "Hard", "Steady", "Strong", "Excellent"];

type FieldKey = keyof Omit<ReviewDraft, "rating">;

interface FieldDef {
  key: FieldKey;
  id: string;
  label: string;
  hint: string;
}

/** The prompts change with the horizon — a year does not ask about Monday. */
function fieldsFor(scope: ReviewScope): FieldDef[] {
  const noun = SCOPE_NOUN[scope];
  const nextNoun = scope === "week" ? "next week" : scope === "month" ? "next month" : "next year";
  const horizon = scope === "week" ? "by next Sunday" : scope === "month" ? "by the end of next month" : "by this time next year";

  return [
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
      hint: `Where did the ${noun} leak? Be specific rather than harsh.`,
    },
    {
      key: "learned",
      id: "review-learned",
      label: "What I learned",
      hint: scope === "week"
        ? "One thing you know now that you didn't on Monday."
        : `One thing you know now that you didn't at the start of the ${noun}.`,
    },
    {
      key: "stop",
      id: "review-stop",
      label: "What to stop",
      hint: "One thing you will not carry into the next stretch.",
    },
    {
      key: "grateful",
      id: "review-grateful",
      label: "Grateful for",
      hint: "Name it plainly — this is the line you will reread in a year.",
    },
    {
      key: "next_week",
      id: "review-next-week",
      label: `${nextNoun[0].toUpperCase()}${nextNoun.slice(1)}'s focus`,
      hint: `The single thing that has to be true ${horizon}.`,
    },
  ];
}

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** A switch rather than a computed key, so the draft keeps its exact type. */
function withField(d: ReviewDraft, key: FieldKey, value: string): ReviewDraft {
  switch (key) {
    case "went_well": return { ...d, went_well: value };
    case "went_bad": return { ...d, went_bad: value };
    case "learned": return { ...d, learned: value };
    case "next_week": return { ...d, next_week: value };
    case "stop": return { ...d, stop: value };
    case "grateful": return { ...d, grateful: value };
  }
}

/** Mount with `key={period.start}` — every period gets its own draft. */
export function Reflection({ period }: { period: Period }) {
  const fields = React.useMemo(() => fieldsFor(period.scope), [period.scope]);
  const review = useStore((s) => findReview(s.reviews, period.start, period.scope));
  const previous = useStore((s) =>
    findReview(s.reviews, shiftPeriod(period.scope, period.start, -1), period.scope));
  const save = useSaveReview();

  const [draft, setDraft] = React.useState<ReviewDraft>(() => draftOf(review));
  const [status, setStatus] = React.useState<"idle" | "pending" | "saved">(() =>
    hasContent(draftOf(review)) ? "saved" : "idle",
  );

  const pending = React.useRef<ReviewDraft | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = React.useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const next = pending.current;
    pending.current = null;
    if (next) save(period.start, period.scope, next);
  }, [save, period.start, period.scope]);

  // Leaving the page or switching periods mid-sentence must not drop the
  // sentence, so the unmount flush has to reach the newest closure.
  const commitRef = React.useRef(commit);
  React.useEffect(() => { commitRef.current = commit; }, [commit]);
  React.useEffect(() => () => commitRef.current(), []);

  const apply = React.useCallback((next: ReviewDraft, immediate = false) => {
    setDraft(next);
    // Never create a review row for a period the user only glanced at.
    if (!hasContent(next) && !review) return;

    pending.current = next;
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    if (immediate) { commit(); setStatus("saved"); return; }
    timer.current = setTimeout(() => { commit(); setStatus("saved"); }, 650);
  }, [commit, review]);

  const answered = answeredCount(draft);
  const carried = previous?.next_week?.trim();

  return (
    <Section
      id="review-reflection"
      label="Reflection"
      note="Saves itself as you type"
      action={
        <>
          <span className="text-[11.5px] text-ink-4 tnum">
            {answered}/{fields.length} answered
          </span>
          {status === "pending" ? (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-4">
              <span className="size-1.5 rounded-full bg-ink-4" />
              Saving…
            </span>
          ) : status === "saved" ? (
            <span className="anim-fade inline-flex items-center gap-1 text-[11.5px] text-ink-3">
              <Check className="size-3" strokeWidth={2.5} />
              Saved
            </span>
          ) : null}
        </>
      }
    >
      {carried && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-hover px-3 py-2.5">
          <Quote className="mt-0.5 size-3.5 shrink-0 text-ink-4" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Last {SCOPE_NOUN[period.scope]} you promised
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{carried}</p>
          </div>
          <Button
            size="xs"
            variant="ghost"
            className="shrink-0"
            title="Append it to what went well, so you can answer it directly"
            onClick={() =>
              apply({
                ...draft,
                went_well: draft.went_well ? `${draft.went_well}\n\n“${carried}” — ` : `“${carried}” — `,
              }, true)
            }
          >
            <CornerDownLeft className="size-3" />
            Answer it
          </Button>
        </div>
      )}

      <RatingRow
        value={draft.rating}
        scope={period.scope}
        onChange={(n) => apply({ ...draft, rating: n }, true)}
      />

      {fields.map((field) => {
        const words = wordCount(draft[field.key]);
        return (
          <div key={field.key} className="hairline-t py-4">
            <div className="flex items-baseline gap-2">
              <label
                htmlFor={field.id}
                className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3"
              >
                {field.label}
              </label>
              {words > 0 && (
                <span className="ml-auto text-[11px] text-ink-4 tnum">
                  {words} {words === 1 ? "word" : "words"}
                </span>
              )}
            </div>
            <AutoTextarea
              id={field.id}
              minRows={2}
              value={draft[field.key]}
              onChange={(v) => apply(withField(draft, field.key, v))}
              onBlur={() => { if (pending.current) { commit(); setStatus("saved"); } }}
              placeholder={field.hint}
              className={cn(
                "mt-1.5 -mx-1.5 rounded-md px-1.5 py-1 text-[13.5px] text-ink",
                "placeholder:text-ink-4 hover:bg-hover focus:bg-hover transition-colors duration-150",
              )}
            />
          </div>
        );
      })}
    </Section>
  );
}

// ---------------------------------------------------------
// A real radiogroup: one tab stop, arrows move the selection.
// ---------------------------------------------------------
function RatingRow({
  value, scope, onChange,
}: {
  value: number | null;
  scope: ReviewScope;
  onChange: (next: number | null) => void;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [focused, setFocused] = React.useState(() => (value ? value - 1 : 0));

  function move(delta: number) {
    const next = Math.max(0, Math.min(4, focused + delta));
    setFocused(next);
    refs.current[next]?.focus();
    onChange(next + 1);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
      <span className="text-[13.5px] text-ink-2">How was the {SCOPE_NOUN[scope]}?</span>
      <div
        role="radiogroup"
        aria-label={`${SCOPE_NOUN[scope]} rating`}
        className="flex items-center gap-1.5"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
          if (e.key === "Home") { e.preventDefault(); setFocused(0); refs.current[0]?.focus(); onChange(1); }
          if (e.key === "End") { e.preventDefault(); setFocused(4); refs.current[4]?.focus(); onChange(5); }
        }}
      >
        {[1, 2, 3, 4, 5].map((n, i) => {
          const active = value === n;
          return (
            <button
              key={n}
              ref={(el) => { refs.current[i] = el; }}
              role="radio"
              aria-checked={active}
              // Exactly one tab stop, as the radiogroup role promises.
              tabIndex={i === (value ? value - 1 : focused) ? 0 : -1}
              aria-label={`${n} out of 5 — ${RATING_LABELS[n - 1]}`}
              onFocus={() => setFocused(i)}
              onClick={() => { setFocused(i); onChange(active ? null : n); }}
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
        {value ? RATING_LABELS[value - 1] : "Pick a number, then write."}
      </span>
    </div>
  );
}
