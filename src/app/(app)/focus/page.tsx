"use client";

import * as React from "react";
import { Moon, Settings2, Timer } from "lucide-react";
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
import { FocusHeatmap } from "@/components/focus/focus-heatmap";
import { TimeOfDay } from "@/components/focus/time-of-day";
import { TagTotals } from "@/components/focus/tag-totals";
import { SessionHistory } from "@/components/focus/session-history";
import { SessionEditor } from "@/components/focus/session-editor";
import { FocusSettings } from "@/components/focus/focus-settings";
import { groupSessions, type SessionView } from "@/components/focus/focus-data";
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
  const [editing, setEditing] = React.useState<string | null>(null);
  const [pickedDay, setPickedDay] = React.useState<string | null>(null);

  const groups = React.useMemo(() => groupSessions(sessions), [sessions]);
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

  // Only keys the app shell leaves alone: b and s are the tails of its
  // "g then b" / "g then s" chords and would fire twice.
  useHotkeys(
    {
      " ": () => toggle(),
      d: () => setDeep((v) => !v),
      x: () => logInterrupt(),
    },
    { enabled: !settingsOpen && !editing },
  );

  const goalLine =
    todayMinutes > 0
      ? `${formatDuration(todayMinutes)} today · ${Math.round((todayMinutes / Math.max(1, dailyGoal)) * 100)}% of target`
      : `Nothing logged yet · ${formatDuration(dailyGoal)} target`;

  return (
    <>
      <PageHeader
        title="Focus"
        subtitle={goalLine}
        actions={
          <div className="flex items-center gap-1">
            <IconButton label="Presets and targets" onClick={() => setSettingsOpen(true)}>
              <Settings2 />
            </IconButton>
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
            onSettings={() => setSettingsOpen(true)}
            onEditLast={() => engine.last?.sessionId && setEditing(engine.last.sessionId)}
          />
          <WrapNote engine={engine} onExpand={setEditing} />
        </div>

        {groups.length === 0 ? (
          <EmptyState
            icon={Timer}
            title="No sessions logged yet"
            description="Every finished timer lands here — credited to the task you attached it to, so you can see where the hours actually went."
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
          <div className="space-y-11 pt-4">
            <FocusStats groups={groups} weekStart={weekStart} />

            <FocusGoals
              groups={groups}
              weekStart={weekStart}
              dailyGoal={dailyGoal}
              weeklyGoal={weeklyGoal}
              onEdit={() => setSettingsOpen(true)}
            />

            <DayTimeline
              items={today?.items ?? NO_SESSIONS}
              breaks={today?.breaks ?? NO_SESSIONS}
              minutes={todayMinutes}
              nowMin={nowMinutes()}
              live={live}
              onOpen={setEditing}
            />

            <div className="grid gap-x-10 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
              <div className="min-w-0 md:col-span-2 xl:col-span-1">
                <FocusHeatmap
                  groups={groups}
                  weekStart={weekStart}
                  dailyGoal={dailyGoal}
                  selected={pickedDay}
                  onSelect={setPickedDay}
                />
              </div>
              <div className="min-w-0">
                <TimeOfDay groups={groups} hour12={hour12} />
              </div>
              <div className="min-w-0">
                <TagTotals
                  groups={groups}
                  onTagLast={lastSessionId ? () => setEditing(lastSessionId) : null}
                />
              </div>
            </div>

            <SessionHistory
              groups={groups}
              onResume={resume}
              onOpen={setEditing}
              focusDate={pickedDay}
            />
          </div>
        )}
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
