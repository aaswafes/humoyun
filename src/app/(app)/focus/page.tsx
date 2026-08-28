"use client";

import * as React from "react";
import { Moon, Timer } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatDuration, nowMinutes, todayISO } from "@/lib/date";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { PageHeader, PageBody } from "@/components/shell/page-header";
import { Button, EmptyState, IconButton } from "@/components/ui/primitives";
import { useFocusEngine } from "@/components/focus/focus-engine";
import { FocusDial } from "@/components/focus/focus-dial";
import { DeepWork } from "@/components/focus/deep-work";
import { FocusStats } from "@/components/focus/focus-stats";
import { DayTimeline } from "@/components/focus/day-timeline";
import { SessionHistory } from "@/components/focus/session-history";
import { groupSessions, type SessionView } from "@/components/focus/focus-data";
import type { FocusSession } from "@/lib/types";

const NO_SESSIONS: SessionView[] = [];

export default function FocusPage() {
  const engine = useFocusEngine();
  const sessions = useStore((s) => s.focusSessions);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const [deep, setDeep] = React.useState(false);

  const groups = React.useMemo(() => groupSessions(sessions), [sessions]);
  const today = groups.find((g) => g.date === todayISO());
  const todayMinutes = today?.minutes ?? 0;

  const { start, toggle } = engine;
  const resume = React.useCallback(
    (session: FocusSession) =>
      start({
        taskId: session.task_id,
        label: session.label ?? "",
        mode: session.mode === "stopwatch" ? "stopwatch" : "pomodoro",
      }),
    [start],
  );

  useHotkeys({
    " ": () => toggle(),
    d: () => setDeep((v) => !v),
    escape: () => setDeep(false),
  });

  return (
    <>
      <PageHeader
        title="Focus"
        subtitle={todayMinutes ? `${formatDuration(todayMinutes)} today` : "Nothing logged yet today"}
        actions={
          <IconButton label="Deep work (D)" active={deep} onClick={() => setDeep(true)}>
            <Moon />
          </IconButton>
        }
      />

      <PageBody className="pb-24">
        <div className="py-6">
          <FocusDial engine={engine} />
        </div>

        {groups.length === 0 ? (
          <EmptyState
            icon={Timer}
            title="No sessions logged yet"
            description="Every finished timer lands here — credited to the task you attached it to, so you can see where the hours actually went."
            action={
              <Button variant="primary" size="sm" onClick={() => start()}>
                Start {engine.minutes} minutes
              </Button>
            }
            className="border-t border-line"
          />
        ) : (
          <div className="space-y-11 pt-4">
            <FocusStats groups={groups} weekStart={weekStart} />
            <DayTimeline
              items={today?.items ?? NO_SESSIONS}
              minutes={todayMinutes}
              nowMin={nowMinutes()}
            />
            <SessionHistory groups={groups} onResume={resume} />
          </div>
        )}
      </PageBody>

      <DeepWork open={deep} onClose={() => setDeep(false)}>
        <FocusDial engine={engine} ambient />
      </DeepWork>
    </>
  );
}
