"use client";

import * as React from "react";
import { Check, Minus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, IconButton, Kbd, Ring } from "@/components/ui/primitives";
import { Select } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlays";
import { CATEGORY_LABELS, groupNumber, type ZikrDef } from "./zikr-data";

/**
 * Arabic needs a face the system actually has. next/font is a compile-time
 * transform and the app's own stack is Latin, so this is a plain stack rather
 * than a thirteenth loaded family for one line of text.
 */
export const ARABIC_STACK =
  '"Scheherazade New", "Amiri", "Noto Naskh Arabic", "Traditional Arabic", "Geeza Pro", "Segoe UI", serif';

const STEPS = [1, 3, 7, 10, 33, 100];

/**
 * The counter.
 *
 * One tap target, one number, and the ring closing around it — the only
 * 44px numeral on the surface. Everything that could interrupt a count
 * (picking a different zikr, changing the target, correcting a slip) sits
 * outside the ring where a thumb will not find it by accident.
 */
export function ZikrCounter({
  def, catalog, count, target, lifetime, onPick, onAdd, onSet, onTarget,
}: {
  def: ZikrDef;
  catalog: ZikrDef[];
  /** Counted today, for this zikr. */
  count: number;
  target: number;
  /** Every one of this zikr ever counted. */
  lifetime: number;
  onPick: (id: string) => void;
  onAdd: (by: number) => void;
  onSet: (value: number) => void;
  onTarget: (value: number) => void;
}) {
  const [confirmReset, setConfirmReset] = React.useState(false);

  const sets = target > 0 ? Math.floor(count / target) : 0;
  const inSet = target > 0 ? count % target : count;
  const justFinished = target > 0 && count > 0 && inSet === 0;
  const ringValue = justFinished ? target : inSet;

  // A set size the user already has is kept in the list, so an odd number
  // typed in the library does not silently become one of the six.
  const setOptions = React.useMemo(() => {
    const values = STEPS.includes(target) ? STEPS : [...STEPS, target].sort((a, b) => a - b);
    return values.map((s) => ({ value: String(s), label: <span className="tnum">{s}</span> }));
  }, [target]);

  const options = React.useMemo(
    () => catalog.map((z) => ({
      value: z.id,
      label: z.label,
      description: CATEGORY_LABELS[z.category],
    })),
    [catalog],
  );

  return (
    <section className="surface p-5">
      <header className="flex flex-wrap items-center gap-2">
        <Select
          value={def.id}
          options={options}
          onChange={onPick}
          label="Zikr being counted"
          className="min-w-0 flex-1"
        />
        <div className="flex items-center gap-1">
          <IconButton label="Take one back" disabled={count === 0} onClick={() => onAdd(-1)}>
            <Minus />
          </IconButton>
          <IconButton label="Reset today" disabled={count === 0} onClick={() => setConfirmReset(true)}>
            <RotateCcw />
          </IconButton>
        </div>
      </header>

      {def.arabic && (
        <p
          dir="rtl"
          lang="ar"
          style={{ fontFamily: ARABIC_STACK }}
          className="mt-5 text-center text-[24px] leading-[1.9] text-ink"
        >
          {def.arabic}
        </p>
      )}
      <p className="mt-2 text-center text-[12.5px] leading-relaxed text-ink-3">{def.translit}</p>
      {def.meaning && (
        <p className="mt-1 text-center text-[11.5px] leading-relaxed text-ink-4">{def.meaning}</p>
      )}

      {/* The ring is the button. A thumb on a phone hits a 200px circle. */}
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => onAdd(1)}
          aria-label={`Count ${def.label}. ${count} today.`}
          className={cn(
            "group relative cursor-pointer rounded-full",
            "transition-transform duration-150 ease-[var(--ease-out-apple)] active:scale-[0.97]",
          )}
        >
          <Ring value={ringValue} max={target || 1} size={208} stroke={6} tint={def.tint}>
            <span className="flex flex-col items-center">
              {/* Polite, so a screen reader hears the count climb without the
                  button's own label being read again on every tap. */}
              <span
                role="status"
                aria-live="polite"
                className="display-serif tnum text-[44px] leading-none text-ink"
              >
                {count}
              </span>
              <span className="mt-2 text-[11.5px] text-ink-3">
                {target > 1 ? (
                  <>
                    <span className="tnum">{inSet || (justFinished ? target : 0)}</span> of{" "}
                    <span className="tnum">{target}</span>
                  </>
                ) : (
                  "tap to count"
                )}
              </span>
              {sets > 0 && (
                <span className="anim-fade mt-1.5 inline-flex items-center gap-1 text-[11px] text-ink-4">
                  <Check aria-hidden className="size-3" />
                  <span className="tnum">{sets}</span> {sets === 1 ? "set" : "sets"} done
                </span>
              )}
            </span>
          </Ring>
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
        {[1, 10, 33].map((by) => (
          <Button key={by} size="sm" variant="ghost" onClick={() => onAdd(by)}>
            +{by}
          </Button>
        ))}
      </div>

      <footer className="hairline-t mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
        <p className="flex-1 text-[11.5px] text-ink-4">
          <span className="tnum text-ink-3">{groupNumber(lifetime)}</span> in all, since you started counting
          this one.
        </p>
        <div className="flex items-center gap-1.5 text-[11.5px] text-ink-4">
          Set of
          <Select
            size="sm"
            align="end"
            value={String(target)}
            label={`Set size for ${def.label}`}
            options={setOptions}
            onChange={(value) => onTarget(Number(value))}
            className="w-[76px]"
          />
        </div>
        <p className="text-[11px] text-ink-4">
          <Kbd>Space</Kbd> counts while the ring has focus
        </p>
      </footer>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={`Reset ${def.label} for today?`}
        description="Today's count for this zikr goes back to zero. The lifetime total keeps every other day."
        confirmLabel="Reset"
        tone="danger"
        onConfirm={() => onSet(0)}
      />
    </section>
  );
}
