"use client";

import * as React from "react";
import { Check, Copy, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/date";
import { Button, IconButton, Input, SectionLabel } from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/overlays";
import { Field } from "@/components/ui/form";
import { PRESET_LIMITS, presetRhythm, type SessionPreset } from "./focus-prefs";
import type { FocusEngine } from "./focus-engine";

interface Draft {
  id?: string;
  name: string;
  focus: number;
  short: number;
  long: number;
  cycles: number;
}

function StepperField({
  label, description, value, onChange, step, bounds, suffix,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (next: number) => void;
  step: number;
  bounds: readonly [number, number];
  suffix?: string;
}) {
  const clamp = (n: number) => Math.min(bounds[1], Math.max(bounds[0], Math.round(n)));
  return (
    <Field label={label} description={description}>
      {(wiring) => (
        <div className="flex items-center gap-1.5">
          <IconButton
            label={`Decrease ${label.toLowerCase()}`}
            disabled={value <= bounds[0]}
            onClick={() => onChange(clamp(value - step))}
          >
            <Minus />
          </IconButton>
          <Input
            id={wiring.id}
            aria-describedby={wiring["aria-describedby"]}
            type="number"
            inputMode="numeric"
            min={bounds[0]}
            max={bounds[1]}
            value={value}
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
            className="w-[74px] text-center tnum"
          />
          <IconButton
            label={`Increase ${label.toLowerCase()}`}
            disabled={value >= bounds[1]}
            onClick={() => onChange(clamp(value + step))}
          >
            <Plus />
          </IconButton>
          {suffix && <span className="ml-0.5 text-[12px] text-ink-4">{suffix}</span>}
        </div>
      )}
    </Field>
  );
}

function PresetRow({
  preset, active, onUse, onEdit, onDuplicate, onDelete,
}: {
  preset: SessionPreset;
  active: boolean;
  onUse: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group/preset flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
        active ? "bg-selected" : "hover:bg-hover",
      )}
    >
      <button
        type="button"
        onClick={onUse}
        aria-pressed={active}
        className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 text-left"
      >
        <span className="truncate text-[13px] text-ink">{preset.name}</span>
        <span className="shrink-0 text-[11.5px] text-ink-3 tnum">{presetRhythm(preset)}</span>
        <span className="shrink-0 text-[11.5px] text-ink-4 tnum">
          ×{preset.cycles} · {preset.long}m long
        </span>
      </button>

      {active && <Check className="size-3.5 shrink-0 text-accent" aria-hidden />}

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/preset:opacity-100">
        <IconButton label={`Duplicate ${preset.name}`} size="sm" onClick={onDuplicate}>
          <Copy />
        </IconButton>
        {!preset.builtIn && (
          <>
            <IconButton label={`Edit ${preset.name}`} size="sm" onClick={onEdit}>
              <Pencil />
            </IconButton>
            <IconButton label={`Delete ${preset.name}`} size="sm" tone="danger" onClick={onDelete}>
              <Trash2 />
            </IconButton>
          </>
        )}
      </div>
    </div>
  );
}

/** Presets, targets and the two automation switches — all in one place. */
export function FocusSettings({
  engine, open, onClose,
}: {
  engine: FocusEngine;
  open: boolean;
  onClose: () => void;
}) {
  const { prefs, presets, preset, setPrefs, selectPreset, savePreset, deletePreset } = engine;
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<SessionPreset | null>(null);

  const startDraft = (from: SessionPreset, copy: boolean) =>
    setDraft({
      id: copy ? undefined : from.id,
      name: copy ? `${from.name} copy` : from.name,
      focus: from.focus,
      short: from.short,
      long: from.long,
      cycles: from.cycles,
    });

  if (!open) return null;

  return (
    <>
      <Modal open onClose={onClose} title="Targets and presets" width={520}>
        <div className="max-h-[70vh] space-y-6 overflow-y-auto p-4">
          {/* ---- targets ---- */}
          <div>
            <SectionLabel className="mb-2.5">Targets</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <StepperField
                label="Daily focus"
                description={formatDuration(prefs.dailyGoal)}
                value={prefs.dailyGoal}
                bounds={PRESET_LIMITS.dailyGoal}
                step={15}
                suffix="min"
                onChange={(dailyGoal) => setPrefs({ dailyGoal })}
              />
              <StepperField
                label="Weekly focus"
                description={formatDuration(prefs.weeklyGoal)}
                value={prefs.weeklyGoal}
                bounds={PRESET_LIMITS.weeklyGoal}
                step={30}
                suffix="min"
                onChange={(weeklyGoal) => setPrefs({ weeklyGoal })}
              />
            </div>
            <button
              type="button"
              onClick={() => setPrefs({ weeklyGoal: Math.min(PRESET_LIMITS.weeklyGoal[1], prefs.dailyGoal * 5) })}
              className="mt-2 cursor-pointer text-[11.5px] text-ink-4 underline-offset-2 transition-colors hover:text-ink-2 hover:underline"
            >
              Set the week to five days at the daily target
            </button>
          </div>

          {/* ---- presets ---- */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <SectionLabel>Session presets</SectionLabel>
              <Button variant="ghost" size="xs" onClick={() => startDraft(preset, true)}>
                <Plus className="size-3" />
                New preset
              </Button>
            </div>

            <div className="-mx-1">
              {presets.map((p) => (
                <PresetRow
                  key={p.id}
                  preset={p}
                  active={p.id === prefs.activePresetId}
                  onUse={() => selectPreset(p.id)}
                  onEdit={() => startDraft(p, false)}
                  onDuplicate={() => startDraft(p, true)}
                  onDelete={() => setPendingDelete(p)}
                />
              ))}
            </div>

            {draft && (
              <div className="mt-3 rounded-lg border border-line p-3 anim-pop">
                <Field label="Name">
                  {(wiring) => (
                    <Input
                      {...wiring}
                      autoFocus
                      value={draft.name}
                      maxLength={32}
                      placeholder="Deep work"
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  )}
                </Field>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StepperField
                    label="Focus" value={draft.focus} step={5} bounds={PRESET_LIMITS.focus}
                    onChange={(focus) => setDraft({ ...draft, focus })}
                  />
                  <StepperField
                    label="Break" value={draft.short} step={1} bounds={PRESET_LIMITS.short}
                    onChange={(short) => setDraft({ ...draft, short })}
                  />
                  <StepperField
                    label="Long break" value={draft.long} step={5} bounds={PRESET_LIMITS.long}
                    onChange={(long) => setDraft({ ...draft, long })}
                  />
                  <StepperField
                    label="Blocks" value={draft.cycles} step={1} bounds={PRESET_LIMITS.cycles}
                    onChange={(cycles) => setDraft({ ...draft, cycles })}
                  />
                </div>

                <p className="mt-3 text-[11.5px] leading-snug text-ink-4 tnum">
                  {draft.cycles} × {draft.focus} min with {draft.short} min between, then {draft.long} min off —
                  {" "}{formatDuration(draft.cycles * draft.focus)} of focus per set.
                </p>

                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => { savePreset(draft); setDraft(null); }}
                  >
                    Save preset
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* The three automation switches live in the gear popover this
              modal is opened from, so they are not repeated here. */}
        </div>

        <div className="flex justify-end border-t border-line px-4 py-3">
          <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { if (pendingDelete) deletePreset(pendingDelete.id); }}
        title={`Delete “${pendingDelete?.name ?? ""}”?`}
        description="The preset goes; nothing you have already logged changes."
      />
    </>
  );
}
