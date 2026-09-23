"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, formatDate, friendlyDate } from "@/lib/date";
import { IconButton } from "@/components/ui/primitives";
import { Fold, useFold } from "./fold";
import { ZikrBoard, ZikrToday } from "./zikr-board";
import { groupNumber, setDeltas, setTotal, type ZikrItem, type ZikrSet } from "./zikr-data";
import { ZikrManage, type Editing } from "./zikr-manage";
import { buzz, useZikrLog, useZikrPrefs } from "./zikr-prefs";
import { ZikrLifetime, ZikrReport } from "./zikr-report";
import { buildZikrStats } from "./zikr-stats";

const RAIL = "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_296px] lg:gap-8";

/**
 * Zikr.
 *
 * The counting happens on a tasbih; this keeps the record. One press puts the
 * whole thirty-three down, a set puts several down at once, and everything
 * else on the surface answers what that has come to — this week, this month,
 * this year, and in all.
 *
 * The board records against a chosen day, not against now. A tasbih finished
 * last night and remembered this morning has to land on last night, or the
 * record is a record of when you opened the app.
 */
export function ZikrView({ today }: { today: string }) {
  const dayLogs = useStore((s) => s.dayLogs);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const toast = useStore((s) => s.toast);

  const [prefs, setPrefs] = useZikrPrefs();
  const [date, setDate] = React.useState(today);
  const { counts, add } = useZikrLog(date);
  const isToday = date === today;
  const [editing, setEditing] = React.useState<Editing>({ kind: null });

  const [recordOpen, setRecordOpen] = useFold("zikr.record", true);
  const [manageOpen, setManageOpen] = useFold("zikr.manage", false);

  const stats = React.useMemo(() => buildZikrStats(dayLogs, today), [dayLogs, today]);
  const dayTotal = React.useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + n, 0),
    [counts],
  );

  function pressItem(item: ZikrItem) {
    add({ [item.id]: item.step });
    buzz(12);
  }

  function pressSet(set: ZikrSet) {
    const deltas = setDeltas(set);
    if (!Object.keys(deltas).length) {
      toast({ title: `${set.label} has nothing in it`, description: "Add a line to it in Manage." });
      return;
    }
    add(deltas);
    buzz([12, 40, 12]);
  }

  return (
    <div className={RAIL}>
      <div className="flex flex-col gap-6">
        <section className="surface p-5">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-0.5">
              <IconButton label="Previous day" size="sm" onClick={() => setDate(addDays(date, -1))}>
                <ChevronLeft />
              </IconButton>
              <button
                type="button"
                onClick={() => setDate(today)}
                title={isToday ? formatDate(date, { weekday: true }) : "Back to today"}
                className={cn(
                  "h-7 rounded-md px-1.5 text-[13.5px] font-medium cursor-pointer transition-colors",
                  isToday ? "text-ink" : "text-ink hover:bg-hover",
                )}
              >
                {friendlyDate(date)}
              </button>
              <IconButton
                label="Next day"
                size="sm"
                disabled={date >= today}
                onClick={() => setDate(addDays(date, 1))}
              >
                <ChevronRight />
              </IconButton>
              <span className="ml-1 truncate text-[13.5px] text-ink-3">
                · <span className="tnum">{groupNumber(dayTotal)}</span> recorded
              </span>
            </div>
            {prefs.sets.length > 0 && (
              <p className="text-[11.5px] text-ink-4">
                a set records{" "}
                <span className="tnum">{groupNumber(setTotal(prefs.sets[0]))}</span> in one press
              </p>
            )}
          </header>

          {/* A press on an older day is a deliberate act, so the surface says
              so rather than letting it look like today's count. */}
          {!isToday && (
            <p className="mt-2 text-[11.5px] text-warn">
              Recording against {formatDate(date, { weekday: true })} — not today.
            </p>
          )}

          <div className="mt-4">
            <ZikrBoard
              items={prefs.items}
              sets={prefs.sets}
              counts={counts}
              onPressItem={pressItem}
              onPressSet={pressSet}
              onAddZikr={() => { setManageOpen(true); setEditing({ kind: "item", item: null }); }}
              onAddSet={() => { setManageOpen(true); setEditing({ kind: "set", set: null }); }}
            />
          </div>

          {prefs.items.length > 0 && (
            <div className="hairline-t mt-5 pt-4">
              <ZikrToday
                items={prefs.items}
                counts={counts}
                onAdjust={(item, by) => add({ [item.id]: by })}
                emptyLabel={
                  isToday
                    ? "Nothing recorded today yet."
                    : `Nothing recorded on ${formatDate(date, { weekday: true })} yet.`
                }
              />
            </div>
          )}
        </section>

        <Fold
          id="zikr-record"
          title="Statistics and history"
          summary={
            stats.total > 0
              ? `${groupNumber(stats.total)} in all · ${stats.streak} day${stats.streak === 1 ? "" : "s"} running`
              : "Nothing recorded yet"
          }
          open={recordOpen}
          onOpenChange={setRecordOpen}
        >
          <ZikrReport stats={stats} today={today} items={prefs.items} weekStart={weekStart} />
        </Fold>

        <Fold
          id="zikr-manage"
          title="Manage"
          summary={
            prefs.items.length === 0
              ? "Nothing yet — make your first button"
              : `${prefs.items.length} zikr · ${prefs.sets.length} ${prefs.sets.length === 1 ? "set" : "sets"}`
          }
          open={manageOpen}
          onOpenChange={setManageOpen}
        >
          <ZikrManage
            items={prefs.items}
            sets={prefs.sets}
            lifetime={stats.perZikr}
            editing={editing}
            onEditingChange={setEditing}
            onSaveItem={(item) => setPrefs({
              items: prefs.items.some((i) => i.id === item.id)
                ? prefs.items.map((i) => (i.id === item.id ? item : i))
                : [...prefs.items, item],
            })}
            onDeleteItem={(id) => setPrefs({
              items: prefs.items.filter((i) => i.id !== id),
              // A set pointing at a deleted zikr would press into nothing, so
              // the line goes with it. The counts already recorded stay.
              sets: prefs.sets.map((s) => ({ ...s, entries: s.entries.filter((e) => e.zikrId !== id) })),
            })}
            onSaveSet={(set) => setPrefs({
              sets: prefs.sets.some((s) => s.id === set.id)
                ? prefs.sets.map((s) => (s.id === set.id ? set : s))
                : [...prefs.sets, set],
            })}
            onDeleteSet={(id) => setPrefs({ sets: prefs.sets.filter((s) => s.id !== id) })}
          />
        </Fold>
      </div>

      <div className="flex flex-col gap-6">
        <ZikrLifetime stats={stats} today={today} />
      </div>
    </div>
  );
}
