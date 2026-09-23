"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, EmptyState, IconButton } from "@/components/ui/primitives";
import { groupNumber, setTotal, type ZikrCounts, type ZikrItem, type ZikrSet } from "./zikr-data";

/**
 * The board.
 *
 * One press records the whole count — the tasbih happens in the hand, this
 * only keeps the record of it. A set presses several at once, which is why
 * its tile shows what it is made of underneath the number it adds.
 */
export function ZikrBoard({
  items, sets, counts, onPressItem, onPressSet, onAddZikr, onAddSet,
}: {
  items: ZikrItem[];
  sets: ZikrSet[];
  counts: ZikrCounts;
  onPressItem: (item: ZikrItem) => void;
  onPressSet: (set: ZikrSet) => void;
  onAddZikr: () => void;
  onAddSet: () => void;
}) {
  const byId = React.useMemo(
    () => Object.fromEntries(items.map((i) => [i.id, i])) as Record<string, ZikrItem>,
    [items],
  );

  if (items.length === 0) {
    return (
      <EmptyState
        title="No zikr yet"
        description="Make a button for each one you keep — the name and how many a press records. Nothing is here until you put it here."
        action={<Button variant="primary" onClick={onAddZikr}>Add a zikr</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {sets.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Sets</p>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {sets.map((set) => (
              <PressTile
                key={set.id}
                tint={set.tint}
                label={set.label}
                amount={setTotal(set)}
                note={composition(set, byId)}
                onPress={() => onPressSet(set)}
              />
            ))}
            <GhostTile label="Add set" onClick={onAddSet} />
          </div>
        </section>
      )}

      <section>
        {sets.length > 0 && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Zikr</p>
        )}
        <div className={cn("grid gap-2 sm:grid-cols-3", sets.length > 0 && "mt-2.5")}>
          {items.map((item) => (
            <PressTile
              key={item.id}
              tint={item.tint}
              label={item.label}
              amount={item.step}
              note={
                counts[item.id]
                  ? `${groupNumber(counts[item.id])} today`
                  : undefined
              }
              onPress={() => onPressItem(item)}
            />
          ))}
          <GhostTile label="Add zikr" onClick={onAddZikr} />
          {sets.length === 0 && <GhostTile label="Add set" onClick={onAddSet} />}
        </div>
      </section>
    </div>
  );
}

function composition(set: ZikrSet, byId: Record<string, ZikrItem>): string | undefined {
  const parts = set.entries
    .filter((e) => e.count > 0)
    .map((e) => `${byId[e.zikrId]?.label ?? "removed"} ${e.count}`);
  return parts.length ? parts.join(" · ") : "empty — nothing to record";
}

/**
 * A tile is a single button with nothing nested inside it, so a press can
 * never land on the wrong thing. Editing lives in Manage, below.
 */
function PressTile({
  tint, label, amount, note, onPress,
}: {
  tint: string;
  label: string;
  amount: number;
  note?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`${label}, add ${amount}`}
      className={cn(
        `tint-${tint}`,
        "flex min-h-[84px] cursor-pointer flex-col justify-between rounded-lg p-3 text-left",
        "transition-transform duration-150 ease-[var(--ease-out-apple)] active:scale-[0.97]",
        "hover:brightness-[0.98] dark:hover:brightness-110",
      )}
      style={{ background: "var(--tint-soft)" }}
    >
      <span className="text-[13px] font-medium leading-snug text-ink">{label}</span>
      <span className="flex items-baseline justify-between gap-2">
        <span className="tnum text-[17px] font-semibold" style={{ color: "var(--tint-ink)" }}>
          +{groupNumber(amount)}
        </span>
        {note && <span className="min-w-0 truncate text-[11px] text-ink-3">{note}</span>}
      </span>
    </button>
  );
}

function GhostTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[84px] cursor-pointer items-center justify-center gap-1.5 rounded-lg",
        "border border-dashed border-line text-[12.5px] text-ink-3",
        "transition-colors duration-150 ease-[var(--ease-out-apple)] hover:border-line-strong hover:text-ink-2",
      )}
    >
      <Plus aria-hidden className="size-3.5" />
      {label}
    </button>
  );
}

/**
 * What today holds, and the only place a number can be taken back.
 *
 * A press is easy to make twice; the row that shows the count is where it is
 * corrected, rather than a second gesture on a tile whose whole job is to add.
 */
export function ZikrToday({
  items, counts, onAdjust, emptyLabel = "Nothing recorded today yet.",
}: {
  items: ZikrItem[];
  counts: ZikrCounts;
  onAdjust: (item: ZikrItem, by: number) => void;
  /** The board can be pointed at an older day, and then "today" is a lie. */
  emptyLabel?: string;
}) {
  const rows = items
    .map((item) => ({ item, count: counts[item.id] ?? 0 }))
    .filter((row) => row.count > 0);

  if (rows.length === 0) {
    return <p className="text-[12.5px] text-ink-4">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {rows.map(({ item, count }) => (
        <li
          key={item.id}
          className={`tint-${item.tint} inline-flex h-8 items-center gap-2 rounded-full pl-3 pr-1`}
          style={{ background: "var(--tint-soft)" }}
        >
          <span className="text-[12px] text-ink-2">{item.label}</span>
          <span className="tnum text-[12px] font-medium text-ink">{groupNumber(count)}</span>
          <IconButton
            size="sm"
            label={`Take ${item.step} off ${item.label}`}
            onClick={() => onAdjust(item, -item.step)}
          >
            <Minus />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}
