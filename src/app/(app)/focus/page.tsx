"use client";

import * as React from "react";
import { Moon, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDuration, nowMinutes, todayISO } from "@/lib/date";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { PageHeader, PageBody } from "@/components/shell/page-header";
import { Button, EmptyState, IconButton } from "@/components/ui/primitives";
import { useFocusEngine } from "@/components/focus/focus-engine";
import { FocusDial } from "@/components/focus/focus-dial";
import { WrapNote } from "@/components/focus/wrap-note";
import { DeepWork } from "@/components/focus/deep-work";
import { FocusStats } from "@/components/focus/focus-stats";
import { FocusGoals } from "@/components/focus/focus-goals";
import { DayTimeline, type LiveBlock } from "@/components/focus/day-timeline";
import { SessionEditor } from "@/components/focus/session-editor";
import { FocusSettings } from "@/components/focus/focus-settings";
import { SessionSetup } from "@/components/focus/session-setup";
import { Fold, useFold, useStickyChoice } from "@/components/focus/fold";
import {
  SessionsPanel, SESSIONS_TAB_VALUES, type SessionsTab,
} from "@/components/focus/sessions-panel";
import { computeStats, groupSessions, type SessionView } from "@/components/focus/focus-data";
import type { FocusSession } from "@/lib/types";

const NO_SESSIONS: SessionView[] = [];

export default function FocusPage() {
  const engine = useFocusEngine();
  const sessions = useStore((s) => s.focusSessions);
  const timer = useStore((s) => s.timer);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const hour12 = useStore((s) => s.hour12);

  const [deep, setDeep] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [setupOpen, setSetupOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [pickedDay, setPickedDay] = React.useState<string | null>(null);

  // The dial is the whole page at rest. Everything else opens on request and
  // stays the way it was left.
  const [todayOpen, setTodayOpen] = useFold("humoyun.focus.todayOpen");
  const [sessionsOpen, setSessionsOpen] = useFold("humoyun.focus.sessionsOpen");
  const [totalsOpen, setTotalsOpen] = useFold("humoyun.focus.totalsOpen");
  const [tab, setTab] = useStickyChoice<SessionsTab>(
    "humoyun.focus.sessionsTab", SESSIONS_TAB_VALUES, "history",
  );

  const groups = React.useMemo(() => groupSessions(sessions), [sessions]);
  const stats = React.useMemo(() => computeStats(groups, weekStart), [groups, weekStart]);
  const today = groups.find((g) => g.date === todayISO());
  const todayMinutes = today?.minutes ?? 0;
  const { dailyGoal, weeklyGoal } = engine.prefs;

  const lastSessionId = React.useMemo(() => {
    for (const group of groups) {
      const item = group.items[group.items.length - 1];
      if (item) return item.session.id;
    }
    return null;
  }, [groups]);

  /**
   * The block running right now, drawn on the timeline before it is logged.
   * Keyed off whole minutes so the timeline redraws once a minute, not twice a second.
   */
  const liveMinutes = Math.max(1, Math.round(engine.seconds / 60));
  const live: LiveBlock | null = React.useMemo(() => {
    if (!engine.active || !timer.sessionStart) return null;
    const started = new Date(timer.sessionStart);
    if (started.toDateString() !== new Date().toDateString()) return null;
    return {
      startMin: started.getHours() * 60 + started.getMinutes(),
      minutes: liveMinutes,
      label: engine.subject.label || (engine.onBreak ? "Break" : "Focus"),
      onBreak: engine.onBreak,
    };
  }, [engine.active, liveMinutes, engine.subject.label, engine.onBreak, timer.sessionStart]);

  const { start, toggle, logInterrupt } = engine;

  const resume = React.useCallback(
    (session: FocusSession) =>
      start({
        taskId: session.task_id,
        label: session.label ?? "",
        mode: session.mode === "stopwatch" ? "stopwatch" : "pomodoro",
      }),
    [start],
  );

  /** A day picked out of the six-month grid belongs under History, so it goes there. */
  const pickDay = React.useCallback(
    (date: string | null) => {
      setPickedDay(date);
      if (!date) return;
      setSessionsOpen(true);
      setTab("history");
    },
    [setSessionsOpen, setTab],
  );

  // Only keys the app shell leaves alone: b and s are the tails of its
  // "g then b" / "g then s" chords and would fire twice.
  useHotkeys(
    {
      " ": () => toggle(),
      d: () => setDeep((v) => !v),
      x: () => logInterrupt(),
    },
    { enabled: !settingsOpen && !setupOpen && !editing },
  );

  // Today, said once. Each folded row below states something this does not.
  const headline =
    todayMinutes > 0
      ? `${formatDuration(todayMinutes)} of ${formatDuration(dailyGoal)} today`
      : `Nothing logged yet · ${formatDuration(dailyGoal)} target`;

  const todaySummary = [
    today?.items.length
      ? `${today.items.length} ${today.items.length === 1 ? "session" : "sessions"}`
      : "Nothing logged today",
    today?.breakMinutes ? `${formatDuration(today.breakMinutes)} rest` : null,
    today?.interruptions ? `${today.interruptions} interrupted` : null,
    "daily and weekly targets",
  ]
    .filter(Boolean)
    .join(" · ");

  const logged = React.useMemo(
    () => groups.reduce((n, g) => n + g.items.length, 0),
    [groups],
  );
  const sessionsSummary = `${logged} logged · history, tags, time of day, six months`;

  const totalsSummary = [
    stats.streak ? `${stats.streak}-day streak` : "No streak yet",
    `${formatDuration(stats.weekMinutes)} this week`,
    "averages, finish rate, distractions",
  ].join(" · ");

  return (
    <>
      <PageHeader
        title="Focus"
        subtitle={headline}
        actions={
          <div className="flex items-center gap-1">
            <SessionSetup
              engine={engine}
              onManage={() => setSettingsOpen(true)}
              onOpenChange={setSetupOpen}
            />
            <IconButton label="Deep work (D)" active={deep} onClick={() => setDeep(true)}>
              <Moon />
            </IconButton>
          </div>
        }
      />

      <PageBody wide className="pb-24">
        <div className="py-6">
          <FocusDial
            engine={engine}
            onEditLast={() => engine.last?.sessionId && setEditing(engine.last.sessionId)}
          />
          <WrapNote engine={engine} onExpand={setEditing} />
        </div>

        {/* Once the clock is running the room gets quieter, not busier. */}
        <div
          className={cn(
            "mt-10 transition-opacity duration-300 ease-[var(--ease-out-apple)]",
            engine.phase === "focus" && "opacity-40 focus-within:opacity-100 hover:opacity-100",
          )}
        >
          {groups.length === 0 ? (
            <EmptyState
              icon={Timer}
              title="No sessions logged yet"
              description="Choose a kind of living on the dial — Taʼlim, Ibodat, Xordiq, Dam or Inson — and every finished timer lands here under it, so you can see where the hours actually went."
              action={
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => start()}>
                    Start {engine.minutes} minutes
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                    Set a daily target
                  </Button>
                </div>
              }
              className="border-t border-line"
            />
          ) : (
            <>
              <Fold
                label="Today"
                summary={todaySummary}
                open={todayOpen}
                onOpenChange={setTodayOpen}
              >
                <div className="space-y-9">
                  <DayTimeline
                    items={today?.items ?? NO_SESSIONS}
                    breaks={today?.breaks ?? NO_SESSIONS}
                    nowMin={nowMinutes()}
                    live={live}
                    onOpen={setEditing}
                  />

                  <FocusGoals
                    groups={groups}
                    weekStart={weekStart}
                    dailyGoal={dailyGoal}
                    weeklyGoal={weeklyGoal}
                    onEdit={() => setSettingsOpen(true)}
                  />
                </div>
              </Fold>

              <Fold
                label="Sessions"
                summary={sessionsSummary}
                open={sessionsOpen}
                onOpenChange={setSessionsOpen}
              >
                <SessionsPanel
                  groups={groups}
                  weekStart={weekStart}
                  dailyGoal={dailyGoal}
                  hour12={hour12}
                  tab={tab}
                  onTab={setTab}
                  pickedDay={pickedDay}
                  onPickDay={pickDay}
                  onResume={resume}
                  onOpen={setEditing}
                  onTagLast={lastSessionId ? () => setEditing(lastSessionId) : null}
                />
              </Fold>

              <Fold
                label="Totals"
                summary={totalsSummary}
                open={totalsOpen}
                onOpenChange={setTotalsOpen}
              >
                <FocusStats groups={groups} weekStart={weekStart} />
              </Fold>
            </>
          )}
        </div>
      </PageBody>

      <DeepWork
        open={deep}
        onClose={() => setDeep(false)}
        ambient={engine.prefs.ambient}
        onToggleAmbient={() => engine.setPrefs({ ambient: !engine.prefs.ambient })}
        todayMinutes={todayMinutes}
        dailyGoal={dailyGoal}
      >
        <FocusDial engine={engine} ambient />
      </DeepWork>

      <FocusSettings engine={engine} open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <SessionEditor sessionId={editing} onClose={() => setEditing(null)} />
    </>
  );
}
