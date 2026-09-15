"use client";

import * as React from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tint } from "@/lib/types";
import { Button, IconButton, Input } from "@/components/ui/primitives";
import { Field, Select } from "@/components/ui/form";
import { ConfirmDialog, Modal, TintPicker } from "@/components/ui/overlays";
import { ARABIC_STACK } from "./zikr-counter";
import {
  CATEGORY_LABELS, CATEGORY_ORDER, groupNumber,
  type ZikrCategory, type ZikrDef,
} from "./zikr-data";
import { makeCustomZikr } from "./zikr-prefs";

/**
 * Every zikr the app knows, plus anything the user has written.
 *
 * The library is where a count is *chosen* and where its set size is set —
 * the counter itself stays a single tap target with nothing to read.
 */
export function ZikrLibrary({
  catalog, lifetime, goals, activeId, onPick, onTarget, onAddCustom, onRemoveCustom,
}: {
  catalog: ZikrDef[];
  /** Everything ever counted, by id, for the number at the end of each row. */
  lifetime: Record<string, number>;
  goals: Record<string, number>;
  activeId: string;
  onPick: (id: string) => void;
  onTarget: (id: string, target: number) => void;
  onAddCustom: (def: ZikrDef) => void;
  onRemoveCustom: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<ZikrDef | null>(null);

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((z) =>
      [z.label, z.translit, z.meaning].some((field) => field.toLowerCase().includes(q)));
  }, [catalog, query]);

  const grouped = React.useMemo(
    () => CATEGORY_ORDER
      .map((category) => ({ category, items: matches.filter((z) => z.category === category) }))
      .filter((group) => group.items.length > 0),
    [matches],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search zikr"
            aria-label="Search zikr"
            className="pl-8"
          />
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus aria-hidden className="size-3.5" />
          Add your own
        </Button>
      </div>

      {grouped.length === 0 ? (
        <p className="mt-6 text-[12.5px] text-ink-3">Nothing matches “{query.trim()}”.</p>
      ) : (
        grouped.map((group) => (
          <section key={group.category} className="mt-5">
            {/* Sentence case, not a micro-label: six uppercase headers in one
                fold would be shouting a taxonomy at someone reading a list. */}
            <p className="text-[12px] font-medium text-ink-2">{CATEGORY_LABELS[group.category]}</p>
            <ul className="mt-1">
              {group.items.map((def) => (
                <Row
                  key={def.id}
                  def={def}
                  active={def.id === activeId}
                  lifetime={lifetime[def.id] ?? 0}
                  target={goals[def.id] ?? def.target}
                  onPick={() => onPick(def.id)}
                  onTarget={(n) => onTarget(def.id, n)}
                  onRemove={def.custom ? () => setRemoving(def) : undefined}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Mounted only while open, so every visit starts on an empty form
          without an effect reaching in to clear one. */}
      {adding && (
        <CustomZikrModal
          onClose={() => setAdding(false)}
          onSave={(def) => { onAddCustom(def); setAdding(false); }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Delete ${removing.label}?` : ""}
        description="The counts already recorded for it stay in the record; only the entry goes."
        confirmLabel="Delete"
        onConfirm={() => { if (removing) onRemoveCustom(removing.id); }}
      />
    </div>
  );
}

function Row({
  def, active, lifetime, target, onPick, onTarget, onRemove,
}: {
  def: ZikrDef;
  active: boolean;
  lifetime: number;
  target: number;
  onPick: () => void;
  onTarget: (target: number) => void;
  onRemove?: () => void;
}) {
  // Uncontrolled on purpose: the field is a draft until it is committed, so
  // typing "1" on the way to "100" never briefly rewrites the saved target.
  // The key re-seeds it if the target changes from somewhere else.
  const inputRef = React.useRef<HTMLInputElement>(null);

  function commit() {
    const n = Number(inputRef.current?.value);
    if (Number.isFinite(n) && n > 0) onTarget(Math.floor(n));
    else if (inputRef.current) inputRef.current.value = String(target);
  }

  return (
    <li className="hairline-t flex items-start gap-3 py-3">
      <button
        type="button"
        onClick={onPick}
        aria-pressed={active}
        className={cn(
          "-mx-1.5 min-w-0 flex-1 cursor-pointer rounded-md px-1.5 py-1 text-left",
          "transition-colors duration-150 ease-[var(--ease-out-apple)] hover:bg-hover",
        )}
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn("text-[13px]", active ? "font-medium text-ink" : "text-ink-2")}>
            {def.label}
          </span>
          {def.arabic && (
            <span
              dir="rtl"
              lang="ar"
              style={{ fontFamily: ARABIC_STACK }}
              className="min-w-0 truncate text-[13px] text-ink-3"
            >
              {def.arabic}
            </span>
          )}
        </span>
        {def.meaning && (
          <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-4">{def.meaning}</span>
        )}
        {def.virtue && (
          <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-3">
            {def.virtue}
            {def.source && <span className="text-ink-4"> — {def.source}</span>}
          </span>
        )}
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <span className="tnum hidden w-16 text-right text-[11.5px] text-ink-4 sm:block">
          {lifetime > 0 ? groupNumber(lifetime) : "—"}
        </span>
        <Input
          key={target}
          ref={inputRef}
          defaultValue={String(target)}
          inputMode="numeric"
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          aria-label={`Set size for ${def.label}`}
          className="tnum h-7 w-14 text-center text-[12px]"
        />
        {onRemove && (
          <IconButton label={`Delete ${def.label}`} tone="danger" onClick={onRemove}>
            <Trash2 />
          </IconButton>
        )}
      </div>
    </li>
  );
}

const CATEGORY_OPTIONS = CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));

/** Somewhere to put a wird the library does not carry. */
function CustomZikrModal({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (def: ZikrDef) => void;
}) {
  const [label, setLabel] = React.useState("");
  const [arabic, setArabic] = React.useState("");
  const [translit, setTranslit] = React.useState("");
  const [meaning, setMeaning] = React.useState("");
  const [target, setTarget] = React.useState("33");
  const [category, setCategory] = React.useState<ZikrCategory>("anytime");
  const [tint, setTint] = React.useState<Tint>("slate");

  const valid = label.trim().length > 0;

  return (
    <Modal open onClose={onClose} title="Add a zikr" width={460}>
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave(makeCustomZikr({
            label, arabic, translit, meaning, category, tint,
            target: Number(target) || 33,
          }));
        }}
      >
        <Field label="Name" required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What you call it" autoFocus />
        </Field>

        <Field label="Arabic" description="Optional — shown above the counter.">
          <Input
            value={arabic}
            onChange={(e) => setArabic(e.target.value)}
            dir="rtl"
            lang="ar"
            style={{ fontFamily: ARABIC_STACK }}
            className="text-[15px]"
          />
        </Field>

        <Field label="Transliteration">
          <Input value={translit} onChange={(e) => setTranslit(e.target.value)} />
        </Field>

        <Field label="Meaning">
          <Input value={meaning} onChange={(e) => setMeaning(e.target.value)} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Set of">
            <Input
              value={target}
              inputMode="numeric"
              onChange={(e) => setTarget(e.target.value)}
              className="tnum"
            />
          </Field>
          <Field label="When">
            {(wiring) => (
              <Select
                {...wiring}
                value={category}
                options={CATEGORY_OPTIONS}
                onChange={setCategory}
                label="When it is said"
              />
            )}
          </Field>
        </div>

        <fieldset>
          <legend className="text-[12px] font-medium text-ink-2">Colour</legend>
          {/* The kit's picker, so a selected swatch is marked the same way here
              as everywhere else in the app. */}
          <TintPicker value={tint} onChange={(t) => setTint(t ?? "slate")} />
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid}>Add</Button>
        </div>
      </form>
    </Modal>
  );
}
