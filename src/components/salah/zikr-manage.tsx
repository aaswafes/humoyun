"use client";

import * as React from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tint } from "@/lib/types";
import { Button, IconButton, Input } from "@/components/ui/primitives";
import { Field, MiniEmpty, Select } from "@/components/ui/form";
import { ConfirmDialog, Modal, TintPicker } from "@/components/ui/overlays";
import { groupNumber, setTotal, type ZikrItem, type ZikrSet } from "./zikr-data";
import { newZikrItem, newZikrSet } from "./zikr-prefs";

/**
 * Manage — where a button is made, renamed, recoloured or thrown away.
 *
 * It is deliberately not on the board: the board is for pressing, and a
 * pencil sitting inside a tile whose whole job is to add a hundred is a
 * misclick waiting to happen.
 */
export function ZikrManage({
  items, sets, lifetime, onSaveItem, onDeleteItem, onSaveSet, onDeleteSet,
  editing, onEditingChange,
}: {
  items: ZikrItem[];
  sets: ZikrSet[];
  /** Everything ever recorded, by id, so a delete can say what it is leaving. */
  lifetime: Record<string, number>;
  onSaveItem: (item: ZikrItem) => void;
  onDeleteItem: (id: string) => void;
  onSaveSet: (set: ZikrSet) => void;
  onDeleteSet: (id: string) => void;
  /** Opened from the board's empty state and its ghost tiles, too. */
  editing: Editing;
  onEditingChange: (next: Editing) => void;
}) {
  const [removing, setRemoving] = React.useState<
    { kind: "item" | "set"; id: string; label: string; counted: number } | null
  >(null);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-ink-2">Zikr</p>
          <Button size="sm" variant="ghost" onClick={() => onEditingChange({ kind: "item", item: null })}>
            <Plus aria-hidden className="size-3.5" />
            Add zikr
          </Button>
        </div>
        {items.length === 0 ? (
          <MiniEmpty className="py-5">Nothing yet.</MiniEmpty>
        ) : (
          <ul className="mt-1">
            {items.map((item) => (
              <li key={item.id} className="hairline-t flex items-center gap-3 py-2.5">
                <span
                  aria-hidden
                  className={`tint-${item.tint} size-2.5 shrink-0 rounded-full`}
                  style={{ background: "var(--tint)" }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{item.label}</span>
                <span className="tnum shrink-0 text-[11.5px] text-ink-3">+{groupNumber(item.step)}</span>
                <span className="tnum hidden w-20 shrink-0 text-right text-[11.5px] text-ink-4 sm:block">
                  {lifetime[item.id] ? groupNumber(lifetime[item.id]) : "—"}
                </span>
                <IconButton label={`Edit ${item.label}`} onClick={() => onEditingChange({ kind: "item", item })}>
                  <Pencil />
                </IconButton>
                <IconButton
                  label={`Delete ${item.label}`}
                  tone="danger"
                  onClick={() => setRemoving({
                    kind: "item", id: item.id, label: item.label, counted: lifetime[item.id] ?? 0,
                  })}
                >
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-ink-2">Sets</p>
          <Button
            size="sm"
            variant="ghost"
            disabled={items.length === 0}
            onClick={() => onEditingChange({ kind: "set", set: null })}
          >
            <Plus aria-hidden className="size-3.5" />
            Add set
          </Button>
        </div>
        {sets.length === 0 ? (
          <MiniEmpty className="py-5">
            {items.length === 0
              ? "A set is made of zikr, so add one of those first."
              : "None yet. A set records several zikr in one press."}
          </MiniEmpty>
        ) : (
          <ul className="mt-1">
            {sets.map((set) => (
              <li key={set.id} className="hairline-t flex items-center gap-3 py-2.5">
                <span
                  aria-hidden
                  className={`tint-${set.tint} size-2.5 shrink-0 rounded-full`}
                  style={{ background: "var(--tint)" }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{set.label}</span>
                <span className="tnum shrink-0 text-[11.5px] text-ink-3">+{groupNumber(setTotal(set))}</span>
                <IconButton label={`Edit ${set.label}`} onClick={() => onEditingChange({ kind: "set", set })}>
                  <Pencil />
                </IconButton>
                <IconButton
                  label={`Delete ${set.label}`}
                  tone="danger"
                  onClick={() => setRemoving({ kind: "set", id: set.id, label: set.label, counted: 0 })}
                >
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing.kind === "item" && (
        <ItemModal
          item={editing.item}
          onClose={() => onEditingChange({ kind: null })}
          onSave={(item) => { onSaveItem(item); onEditingChange({ kind: null }); }}
        />
      )}

      {editing.kind === "set" && (
        <SetModal
          set={editing.set}
          items={items}
          onClose={() => onEditingChange({ kind: null })}
          onSave={(set) => { onSaveSet(set); onEditingChange({ kind: null }); }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Delete ${removing.label}?` : ""}
        description={
          removing?.counted
            ? `The ${groupNumber(removing.counted)} already recorded stay in the history; only the button goes.`
            : "Only the button goes — nothing already recorded is touched."
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (!removing) return;
          if (removing.kind === "item") onDeleteItem(removing.id);
          else onDeleteSet(removing.id);
        }}
      />
    </div>
  );
}

/** Which editor is open, if any. Held by the view so the board can open one. */
export type Editing =
  | { kind: null }
  | { kind: "item"; item: ZikrItem | null }
  | { kind: "set"; set: ZikrSet | null };

// ---------------------------------------------------------
// Editors
// ---------------------------------------------------------

function ItemModal({
  item, onClose, onSave,
}: {
  item: ZikrItem | null;
  onClose: () => void;
  onSave: (item: ZikrItem) => void;
}) {
  const [label, setLabel] = React.useState(item?.label ?? "");
  const [step, setStep] = React.useState(String(item?.step ?? 33));
  const [tint, setTint] = React.useState<Tint>(item?.tint ?? "slate");

  const amount = Number(step);
  const valid = label.trim().length > 0 && Number.isFinite(amount) && amount > 0;

  return (
    <Modal open onClose={onClose} title={item ? "Edit zikr" : "Add zikr"} width={420}>
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave(item
            ? { ...item, label: label.trim(), step: Math.floor(amount), tint }
            : newZikrItem({ label, step: Math.floor(amount), tint }));
        }}
      >
        <Field label="Name" required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="SubhanAllah" autoFocus />
        </Field>

        <Field label="One press records" description="The whole count, added in a single press.">
          <Input
            value={step}
            inputMode="numeric"
            onChange={(e) => setStep(e.target.value)}
            className="tnum"
          />
        </Field>

        <fieldset>
          <legend className="text-[12px] font-medium text-ink-2">Colour</legend>
          <TintPicker value={tint} onChange={(t) => setTint(t ?? "slate")} />
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid}>{item ? "Save" : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function SetModal({
  set, items, onClose, onSave,
}: {
  set: ZikrSet | null;
  items: ZikrItem[];
  onClose: () => void;
  onSave: (set: ZikrSet) => void;
}) {
  const [label, setLabel] = React.useState(set?.label ?? "");
  const [tint, setTint] = React.useState<Tint>(set?.tint ?? "slate");
  const [entries, setEntries] = React.useState(
    set?.entries ?? (items[0] ? [{ zikrId: items[0].id, count: items[0].step }] : []),
  );

  const options = items.map((i) => ({ value: i.id, label: i.label }));
  const total = entries.reduce((sum, e) => sum + (e.count > 0 ? e.count : 0), 0);
  const valid = label.trim().length > 0 && total > 0;

  function update(index: number, changes: Partial<{ zikrId: string; count: number }>) {
    setEntries(entries.map((e, i) => (i === index ? { ...e, ...changes } : e)));
  }

  return (
    <Modal open onClose={onClose} title={set ? "Edit set" : "Add set"} width={460}>
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const clean = entries.filter((entry) => entry.count > 0);
          onSave(set
            ? { ...set, label: label.trim(), tint, entries: clean }
            : newZikrSet({ label, tint, entries: clean }));
        }}
      >
        <Field label="Name" required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="After the fard" autoFocus />
        </Field>

        <div>
          <p className="mb-1 text-[12px] font-medium text-ink-2">What one press records</p>
          <ul className="space-y-1.5">
            {entries.map((entry, index) => (
              <li key={index} className="flex items-center gap-2">
                <Select
                  className="min-w-0 flex-1"
                  size="sm"
                  value={entry.zikrId}
                  options={options}
                  onChange={(zikrId) => update(index, { zikrId })}
                  label={`Zikr ${index + 1}`}
                />
                <Input
                  value={String(entry.count)}
                  inputMode="numeric"
                  onChange={(e) => update(index, { count: Number(e.target.value) || 0 })}
                  aria-label={`How many, line ${index + 1}`}
                  className="tnum h-7 w-16 text-center text-[12px]"
                />
                <IconButton
                  label={`Remove line ${index + 1}`}
                  onClick={() => setEntries(entries.filter((_, i) => i !== index))}
                >
                  <X />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-1.5"
            disabled={items.length === 0}
            onClick={() => {
              const next = items[0];
              if (next) setEntries([...entries, { zikrId: next.id, count: next.step }]);
            }}
          >
            <Plus aria-hidden className="size-3.5" />
            Add a line
          </Button>
          <p className={cn("mt-2 text-[11.5px]", total > 0 ? "text-ink-3" : "text-ink-4")}>
            One press records <span className="tnum">{groupNumber(total)}</span> in all.
          </p>
        </div>

        <fieldset>
          <legend className="text-[12px] font-medium text-ink-2">Colour</legend>
          <TintPicker value={tint} onChange={(t) => setTint(t ?? "slate")} />
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid}>{set ? "Save" : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}
