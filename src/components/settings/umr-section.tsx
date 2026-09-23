"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import {
  DEFAULT_UMR, UMR_CATEGORIES, UMR_META, ratioPhrase, talimNeededFor,
  type DamWindow, type UmrCategory,
} from "@/lib/umr";
import type { TaskKind } from "@/lib/types";
import { Input, Segmented } from "@/components/ui/primitives";
import { CategoryPicker } from "@/components/umr/category-picker";
import { useSetUmrPrefs, useUmrLedger } from "@/components/umr/use-umr";
import { fmtMin } from "@/components/umr/derive";
import { Callout, Group, Pane, Row, SelectField, ToggleRow } from "./ui";

// =========================================================
// The rules behind Umr.
//
// None of this needs a migration — it all lives in `profiles.prefs.umr` — so a
// rule can be changed as often as it needs to be without the database caring.
// =========================================================

/** Ten to one is the rule he set; the rest are the neighbouring sensible ones. */
const RATIOS: { value: string; label: string }[] = [
  { value: "0", label: "No cap" },
  { value: "0.05", label: "1 : 20" },
  { value: "0.1", label: "1 : 10" },
  { value: "0.2", label: "1 : 5" },
  { value: "0.25", label: "1 : 4" },
  { value: "0.5", label: "1 : 2" },
];

/** The kinds a task can be, and whether a default category makes sense for one. */
const KINDS: { kind: TaskKind; label: string }[] = [
  { kind: "task", label: "Plain task" },
  { kind: "event", label: "Event" },
  { kind: "reading", label: "Reading block" },
  { kind: "watching", label: "Watching block" },
  { kind: "habit", label: "Habit block" },
  { kind: "prayer", label: "Prayer block" },
  { kind: "block", label: "Time block" },
  { kind: "milestone", label: "Milestone" },
];

export function UmrSection() {
  const setPrefs = useSetUmrPrefs();
  const habits = useStore((s) => s.habits);
  const tags = useStore((s) => s.tags);
  const setHabitUmr = useStore((s) => s.setHabitUmr);

  // One day is enough — this pane only needs the settings, not a window.
  const { prefs } = useUmrLedger(React.useMemo(() => [], []));

  // Adjusted during render rather than in an effect: a value changed elsewhere
  // — reset rules, a second tab — should never be painted stale for a frame.
  const [prayerDraft, setPrayerDraft] = React.useState(String(prefs.prayerMinutes));
  const [seenPrayer, setSeenPrayer] = React.useState(prefs.prayerMinutes);
  if (seenPrayer !== prefs.prayerMinutes) {
    setSeenPrayer(prefs.prayerMinutes);
    setPrayerDraft(String(prefs.prayerMinutes));
  }

  const liveHabits = habits.filter((h) => !h.archived && !h.deleted_at);

  function setTagRule(tag: string, category: UmrCategory | null) {
    const next = { ...prefs.tagRules };
    if (category) next[tag.toLowerCase()] = category;
    else delete next[tag.toLowerCase()];
    setPrefs({ tagRules: next });
  }

  function setKindRule(kind: TaskKind, category: UmrCategory | null) {
    const next = { ...prefs.kindRules };
    if (category) next[kind] = category;
    else delete next[kind];
    setPrefs({ kindRules: next });
  }

  function setHabitMinutes(habitId: string, minutes: number) {
    const next = { ...prefs.habitMinutes };
    if (minutes > 0) next[habitId] = minutes;
    else delete next[habitId];
    setPrefs({ habitMinutes: next });
  }

  return (
    <Pane
      title="Umr"
      description="Six kinds of living, and the rule that keeps one of them in check. These settings decide how the app reads your own records — none of them change a single row, so you can retune them as often as you like."
    >
      {/* ---- the five ---- */}
      <Group
        title="The kinds of living"
        description="These words are fixed; what goes in each one is yours. Where a task or a habit says nothing itself, the rules below answer for it."
      >
        <ul className="divide-y divide-line">
          {UMR_CATEGORIES.map((c) => {
            const meta = UMR_META[c];
            return (
              <li key={c} className="flex items-start gap-3 py-3">
                <span className={`tint-${meta.tint} mt-1 shrink-0`}>
                  <span className="block size-2.5 rounded-full" style={{ background: "var(--tint)" }} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-ink">
                    {meta.label}
                    <span className="ml-2 font-normal text-ink-3">{meta.gloss}</span>
                  </p>
                  <p className="mt-0.5 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-3">
                    {meta.examples}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Group>

      {/* ---- the cap ---- */}
      <Group
        title="The Dam cap"
        description="Amusement is rationed against learning. Nothing is ever blocked — the app warns and keeps counting, because a ledger you lie to is worth nothing."
      >
        <Row
          label="How much Dam a minute of Taʼlim earns"
          hint={`${ratioPhrase(prefs)}. ${
            prefs.damRatio > 0
              ? `Ten minutes of Dam would cost ${fmtMin(talimNeededFor(10, prefs))} of Taʼlim.`
              : "With no cap, Dam is still counted — it just is not measured against anything."
          }`}
        >
          <SelectField
            label="Dam ratio"
            value={String(prefs.damRatio)}
            options={RATIOS}
            onChange={(v) => setPrefs({ damRatio: Number(v) })}
            width={160}
          />
        </Row>

        <Row
          label="When the budget settles"
          hint="Each day is the strict reading and the one that is felt. Across the week lets a heavy Saturday pay for a quiet Wednesday — easier to live with, easier to drift with."
        >
          <Segmented<DamWindow>
            size="sm"
            value={prefs.damWindow}
            onChange={(v) => setPrefs({ damWindow: v })}
            options={[
              { value: "day", label: "Each day" },
              { value: "week", label: "Across the week" },
            ]}
          />
        </Row>
      </Group>

      {/* ---- declared figures ---- */}
      <Group
        title="What cannot be measured"
        description="Almost every minute in Umr was measured by a timer or written down by you. These two are declared, and the pages say so wherever they appear."
      >
        <Row
          label="Minutes a prayer is worth"
          hint="Nobody stopwatches salah. Every prayer marked prayed, in jamaah, late — and qadha, if you count it — contributes this much to Ibodat."
        >
          <Input
            aria-label="Minutes a prayer is worth"
            inputMode="numeric"
            value={prayerDraft}
            onChange={(e) => setPrayerDraft(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={() => {
              const n = Math.max(0, Math.min(120, Math.round(Number(prayerDraft) || 0)));
              setPrayerDraft(String(n));
              setPrefs({ prayerMinutes: n });
            }}
            className="h-8 w-[80px] text-[13px] tnum"
          />
        </Row>

        <ToggleRow
          checked={prefs.countQadha}
          onChange={(v) => setPrefs({ countQadha: v })}
          label="Count qadha prayers"
          description="A prayer made up late is still a prayer prayed. Turn this off to count only those prayed in their time."
        />

        <Row
          label="Where sleep goes"
          hint="Read from the hours you record on the day log. Sleep is the largest single block in most lives, so leaving it out changes every share on the page — which is why it can be turned off rather than quietly dropped."
          stacked
        >
          <CategoryPicker
            size="sm"
            allowNone
            value={prefs.sleepCategory}
            onChange={(c) => setPrefs({ sleepCategory: c })}
            label="Where sleep goes"
          />
        </Row>
      </Group>

      {/* ---- rules ---- */}
      <Group
        title="Rules by kind"
        description="The fallback when a task says nothing about itself. A task's own category always wins, and a tag rule beats a kind rule."
      >
        <ul className="divide-y divide-line">
          {KINDS.map(({ kind, label }) => (
            <li key={kind} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <span className="w-[120px] shrink-0 text-[13px] text-ink">{label}</span>
              <CategoryPicker
                size="sm"
                allowNone
                value={prefs.kindRules[kind] ?? null}
                onChange={(c) => setKindRule(kind, c)}
                label={`Default kind of living for ${label}`}
              />
            </li>
          ))}
        </ul>
      </Group>

      <Group
        title="Rules by tag"
        description="The sharpest rule there is: one tag on a task answers for it for ever. A tag rule beats a kind rule and is beaten only by a category set on the task itself."
      >
        {tags.length === 0 ? (
          <Callout tone="info">
            No tags yet. Tag a few tasks and they will appear here, ready to be pointed at a kind of
            living.
          </Callout>
        ) : (
          <ul className="divide-y divide-line">
            {tags.map((tag) => (
              <li key={tag.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                <span className={`tint-${tag.color} w-[120px] shrink-0 truncate text-[13px] text-ink`}>
                  #{tag.name}
                </span>
                <CategoryPicker
                  size="sm"
                  allowNone
                  value={prefs.tagRules[tag.name.toLowerCase()] ?? null}
                  onChange={(c) => setTagRule(tag.name, c)}
                  label={`Kind of living for #${tag.name}`}
                />
              </li>
            ))}
          </ul>
        )}
      </Group>

      {/* ---- habits ---- */}
      <Group
        title="Habits"
        description="A habit tick is a fact, not a duration — the app has no idea how long it took. Give one a length and every tick starts contributing that many minutes; leave it at zero and it stays out of the ledger."
      >
        {liveHabits.length === 0 ? (
          <Callout tone="info">No habits yet.</Callout>
        ) : (
          <ul className="divide-y divide-line">
            {liveHabits.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                <span className={`tint-${h.color} w-[120px] shrink-0 truncate text-[13px] text-ink`}>
                  {h.name}
                </span>
                <Input
                  aria-label={`Minutes per tick for ${h.name}`}
                  inputMode="numeric"
                  placeholder="min"
                  defaultValue={prefs.habitMinutes[h.id] ? String(prefs.habitMinutes[h.id]) : ""}
                  onBlur={(e) => setHabitMinutes(h.id, Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  className="h-7 w-[64px] text-[12.5px] tnum"
                />
                <CategoryPicker
                  size="sm"
                  allowNone
                  value={h.umr}
                  onChange={(c) => setHabitUmr(h.id, c)}
                  label={`Kind of living for ${h.name}`}
                />
              </li>
            ))}
          </ul>
        )}
      </Group>

      <Group title="Start over">
        <Row
          label="Reset every Umr rule"
          hint="Puts the ratio, the window, the prayer length and every kind and tag rule back to their defaults. Categories written onto tasks and habits are left alone, and nothing in the ledger is touched."
        >
          <button
            type="button"
            onClick={() => setPrefs(DEFAULT_UMR)}
            className="h-8 rounded-md border border-line bg-raised px-3 text-[13px] font-medium text-ink hover:bg-hover cursor-pointer transition-colors"
          >
            Reset rules
          </button>
        </Row>
      </Group>
    </Pane>
  );
}
