"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardCopy, Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/primitives";
import { Modal, useMounted } from "@/components/ui/overlays";
import { metricsFor, plural } from "./metrics";
import { statLines, useMetricSource } from "./recap";
import { evidenceLines } from "./evidence";
import { logLines } from "./period-log";
import { historySeries, measuredDays, measurementNote, SCOPE_LABEL, type Period } from "./period";
import { draftOf, findReview, type ReviewDraft } from "./review-doc";
import type { MetricSource } from "./metrics";
import type { Review } from "@/lib/types";

const RATING_LABELS = ["Rough", "Hard", "Steady", "Strong", "Excellent"];

const SECTION_TITLES: { key: keyof Omit<ReviewDraft, "rating">; label: string }[] = [
  { key: "went_well", label: "What went well" },
  { key: "went_bad", label: "What didn't" },
  { key: "learned", label: "What I learned" },
  { key: "stop", label: "What to stop" },
  { key: "grateful", label: "Grateful for" },
  { key: "next_week", label: "Next focus" },
];

/**
 * The whole period as plain text — the thing you paste into a message, a
 * journal or an email. No markdown tricks, so it survives anywhere.
 */
export function buildSummaryText(
  period: Period, src: MetricSource, weekStartDay: number, reviews: Review[],
): string {
  const days = measuredDays(period);
  const series = historySeries(period, 2);
  const current = metricsFor(days, src, weekStartDay);
  const previous = metricsFor(series[0].days, src, weekStartDay);
  const review = findReview(reviews, period.start, period.scope);
  const draft = review ? draftOf(review) : null;

  const out: string[] = [];
  out.push(`${SCOPE_LABEL[period.scope]} review — ${period.title}`);
  out.push(period.rangeLabel);
  if (draft?.rating) out.push(`Rating: ${draft.rating}/5 (${RATING_LABELS[draft.rating - 1]})`);
  out.push("");

  if (!days.length) {
    out.push("This period has not started, so there is nothing to measure yet.");
    return out.join("\n");
  }

  out.push(`RECAP — ${measurementNote(period).toLowerCase()}`);
  out.push(...statLines(current, previous));
  out.push("");

  const evidence = evidenceLines(days, src, weekStartDay);
  if (evidence.length) {
    out.push("EVIDENCE");
    out.push(...evidence);
    out.push("");
  }

  out.push("LOG");
  out.push(...logLines(period, src.tasks));
  out.push("");

  if (draft) {
    out.push("REFLECTION");
    for (const s of SECTION_TITLES) {
      const value = draft[s.key];
      if (value.trim()) {
        out.push(`${s.label}:`);
        out.push(...value.trim().split("\n").map((l) => `  ${l}`));
      }
    }
  } else {
    out.push("REFLECTION — not written yet.");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function useSummaryText(period: Period, weekStartDay: number): string {
  const src = useMetricSource();
  const reviews = useStore((s) => s.reviews);
  return React.useMemo(
    () => buildSummaryText(period, src, weekStartDay, reviews),
    [period, src, weekStartDay, reviews],
  );
}

/**
 * A print root outside the app's scroll containers. Hidden on screen, and the
 * only thing left standing on paper.
 */
function PrintRoot({ text }: { text: string }) {
  const mounted = useMounted();
  if (!mounted) return null;

  return createPortal(
    <div id="review-print-root" style={{ display: "none" }}>
      <style>{`
        @media print {
          body > *:not(#review-print-root) { display: none !important; }
          #review-print-root { display: block !important; padding: 24px; }
          #review-print-root pre {
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 11px;
            line-height: 1.55;
          }
        }
      `}</style>
      <pre>{text}</pre>
    </div>,
    document.body,
  );
}

/** Mounted only while open — building the text is as expensive as the recap. */
export function SummaryDialog({
  period, weekStartDay, open, onClose,
}: {
  period: Period;
  weekStartDay: number;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <SummaryContent period={period} weekStartDay={weekStartDay} onClose={onClose} />;
}

function SummaryContent({
  period, weekStartDay, onClose,
}: {
  period: Period;
  weekStartDay: number;
  onClose: () => void;
}) {
  const text = useSummaryText(period, weekStartDay);
  const toast = useStore((s) => s.toast);
  const [copied, setCopied] = React.useState(false);
  const preRef = React.useRef<HTMLPreElement>(null);

  const lines = text.split("\n").length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "Summary copied", description: `${lines} ${plural(lines, "line")} on the clipboard.`, tone: "success" });
    } catch {
      // Clipboard access can be refused outright; selecting the text keeps the
      // action possible with one keystroke instead of failing silently.
      const node = preRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      toast({ title: "Couldn't copy", description: "The text is selected — press ⌘C.", tone: "danger" });
    }
  }

  return (
    <>
      <PrintRoot text={text} />
      <Modal open onClose={onClose} width={620} title={`${period.title} as plain text`}>
        <div className="max-h-[62vh] overflow-y-auto px-4 py-3">
          <pre
            ref={preRef}
            className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-ink-2"
          >
            {text}
          </pre>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <span className="text-[11.5px] text-ink-4 tnum">
            {lines} {plural(lines, "line")}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer className="size-3.5" />
              Print
            </Button>
            <Button size="sm" variant="primary" onClick={copy}>
              {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
