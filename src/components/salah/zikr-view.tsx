"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { Fold, useFold, useRemembered } from "./fold";
import { groupNumber, type ZikrDef } from "./zikr-data";
import { buzz, useZikrCatalog, useZikrPrefs, useZikrToday } from "./zikr-prefs";
import { buildZikrStats } from "./zikr-stats";
import { momentFor } from "./zikr-moment";
import { ZikrCounter } from "./zikr-counter";
import { ZikrCompanion, ZikrLifetime } from "./zikr-companion";
import { ZikrLibrary } from "./zikr-library";
import { RecentStrip, ZikrReport } from "./zikr-report";
import type { TimesTriple } from "./windows";

const RAIL = "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_296px] lg:gap-8";

/**
 * Zikr.
 *
 * The counter is the surface; everything else answers a question the counter
 * raises. What am I meant to be saying — the companion, from the clock. What
 * has this come to — the record, folded but open, because it is half the
 * reason the tab exists. What else is there — the library, folded away.
 */
export function ZikrView({ today, t, nowMin }: { today: string; t: TimesTriple; nowMin: number }) {
  const dayLogs = useStore((s) => s.dayLogs);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const [prefs, setPrefs] = useZikrPrefs();
  const { all, byId } = useZikrCatalog();
  const { counts, add, setCount } = useZikrToday(today);

  const ids = React.useMemo(() => all.map((z) => z.id), [all]);
  const [activeId, setActiveId] = useRemembered("zikr.active", "subhanallah", ids);

  const stats = React.useMemo(() => buildZikrStats(dayLogs, today), [dayLogs, today]);
  const moment = React.useMemo(() => momentFor(t, nowMin), [t, nowMin]);

  const [recordOpen, setRecordOpen] = useFold("zikr.record", true);
  const [libraryOpen, setLibraryOpen] = useFold("zikr.library", false);

  const active: ZikrDef = byId[activeId] ?? all[0];
  const targetOf = React.useCallback(
    (def: ZikrDef) => prefs.goals[def.id] ?? def.target,
    [prefs.goals],
  );

  const targets = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const def of all) map[def.id] = targetOf(def);
    return map;
  }, [all, targetOf]);

  const momentDefs = React.useMemo(
    () => moment.ids.map((id) => byId[id]).filter((d): d is ZikrDef => Boolean(d)),
    [moment.ids, byId],
  );

  /** One place to count, so the buzz on a completed set cannot be forgotten. */
  const count = React.useCallback(
    (id: string, by: number) => {
      add(id, by);
      const def = byId[id];
      if (!def || by <= 0) return;
      const target = prefs.goals[id] ?? def.target;
      const before = counts[id] ?? 0;
      if (target > 1 && Math.floor((before + by) / target) > Math.floor(before / target)) {
        buzz([14, 40, 14]);
      }
    },
    [add, byId, counts, prefs.goals],
  );

  const todayTotal = React.useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + n, 0),
    [counts],
  );

  const todayRows = React.useMemo(
    () => Object.entries(counts)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ id, n, def: byId[id] })),
    [counts, byId],
  );

  return (
    <div className={RAIL}>
      <div className="flex flex-col gap-6">
        <ZikrCounter
          def={active}
          catalog={all}
          count={counts[active.id] ?? 0}
          target={targetOf(active)}
          lifetime={stats.perZikr[active.id] ?? 0}
          onPick={setActiveId}
          onAdd={(by) => count(active.id, by)}
          onSet={(value) => setCount(active.id, value)}
          onTarget={(value) => setPrefs({ goals: { ...prefs.goals, [active.id]: value } })}
        />

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] text-ink">
              Today ·{" "}
              <span className="tnum font-medium">{groupNumber(todayTotal)}</span>{" "}
              <span className="text-ink-3">counted</span>
            </p>
            <p className="text-[11.5px] text-ink-4">last two weeks</p>
          </div>
          <div className="mt-2.5">
            <RecentStrip perDay={stats.perDay} today={today} />
          </div>
          {todayRows.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {todayRows.map((row) => (
                <li
                  key={row.id}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full bg-hover px-2.5 text-[11.5px] text-ink-2"
                >
                  {row.def?.label ?? row.id}
                  <span className="tnum text-ink-4">{groupNumber(row.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Fold
          id="zikr-record"
          title="The record"
          summary={
            stats.total > 0
              ? `${groupNumber(stats.total)} in all · ${stats.streak} day${stats.streak === 1 ? "" : "s"} running`
              : "Nothing counted yet"
          }
          open={recordOpen}
          onOpenChange={setRecordOpen}
        >
          <ZikrReport stats={stats} today={today} byId={byId} weekStart={weekStart} />
        </Fold>

        <Fold
          id="zikr-library"
          title="All zikr"
          summary={`${all.length} to choose from · add your own`}
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
        >
          <ZikrLibrary
            catalog={all}
            lifetime={stats.perZikr}
            goals={prefs.goals}
            activeId={active.id}
            onPick={setActiveId}
            onTarget={(id, value) => setPrefs({ goals: { ...prefs.goals, [id]: value } })}
            onAddCustom={(def) => {
              setPrefs({ custom: [...prefs.custom, def] });
              setActiveId(def.id);
            }}
            onRemoveCustom={(id) => {
              setPrefs({ custom: prefs.custom.filter((z) => z.id !== id) });
              if (id === activeId) setActiveId("subhanallah");
            }}
          />
        </Fold>
      </div>

      <div className="flex flex-col gap-6">
        <ZikrCompanion
          moment={moment}
          defs={momentDefs}
          counts={counts}
          targets={targets}
          activeId={active.id}
          onPick={setActiveId}
          onAdd={count}
        />
        <ZikrLifetime stats={stats} />
      </div>
    </div>
  );
}
