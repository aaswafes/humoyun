"use client";

import * as React from "react";
import { Settings2, SlidersHorizontal } from "lucide-react";
import { formatDuration } from "@/lib/date";
import { IconButton, Segmented } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
import { Toggle } from "@/components/ui/form";
import { presetRhythm, presetSummary } from "./focus-prefs";
import type { FocusEngine, FocusMode } from "./focus-engine";

const MODES: { value: FocusMode; label: string }[] = [
  { value: "pomodoro", label: "Pomodoro" },
  { value: "stopwatch", label: "Stopwatch" },
];

/**
 * One gear. Mode, preset and the automation switches used to sit on the page
 * around the dial; they live here now, and the fuller editor — targets, making
 * and deleting presets — is one item further in.
 */
export function SessionSetup({
  engine, onManage, onOpenChange,
}: {
  engine: FocusEngine;
  /** Opens the full settings modal. */
  onManage: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { mode, active, presets, preset, prefs, setPrefs, selectPreset, setMode } = engine;

  return (
    <Popover
      align="end"
      className="max-h-[70vh] w-[292px] overflow-y-auto"
      onOpenChange={onOpenChange}
      trigger={
        <IconButton label="Session settings">
          <Settings2 />
        </IconButton>
      }
    >
      {(close) => (
        <>
          <MenuLabel>Timer</MenuLabel>
          <div className="px-1 pb-1.5">
            {active ? (
              <p className="px-1 text-[12.5px] leading-snug text-ink-3">
                {mode === "stopwatch" ? "Counting up" : `${preset.name} · ${presetRhythm(preset)}`}
                <span className="text-ink-4"> — locked until this block ends.</span>
              </p>
            ) : (
              <Segmented<FocusMode>
                size="sm"
                value={mode}
                onChange={setMode}
                options={MODES}
              />
            )}
          </div>

          {mode === "pomodoro" && !active && (
            <>
              <MenuSeparator />
              <MenuLabel>Preset</MenuLabel>
              <div className="max-h-[196px] overflow-y-auto">
                {presets.map((p) => (
                  <MenuItem
                    key={p.id}
                    checked={p.id === preset.id}
                    shortcut={presetRhythm(p)}
                    onClick={() => selectPreset(p.id)}
                  >
                    {p.name}
                  </MenuItem>
                ))}
              </div>
              <p className="px-2 pb-1 pt-0.5 text-[11px] leading-snug text-ink-4">
                {presetSummary(preset)}
              </p>
            </>
          )}

          <MenuSeparator />
          <div className="space-y-2.5 px-2 py-1.5">
            <Toggle
              label="Start breaks automatically"
              description="The break clock begins the moment a block ends."
              checked={prefs.autoStartBreaks}
              onChange={(autoStartBreaks) => setPrefs({ autoStartBreaks })}
            />
            <Toggle
              label="Start the next block automatically"
              description="When a break runs out, focus picks up again by itself."
              checked={prefs.autoStartFocus}
              onChange={(autoStartFocus) => setPrefs({ autoStartFocus })}
            />
            <Toggle
              label="Breathing ring in deep work"
              description="A very slow ring to breathe with. Hidden when the system asks for reduced motion."
              checked={prefs.ambient}
              onChange={(ambient) => setPrefs({ ambient })}
            />
          </div>

          <MenuSeparator />
          <MenuItem
            icon={SlidersHorizontal}
            shortcut={`${formatDuration(prefs.dailyGoal)} a day`}
            onClick={() => { close(); onManage(); }}
          >
            Targets and presets…
          </MenuItem>
        </>
      )}
    </Popover>
  );
}
