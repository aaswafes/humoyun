"use client";

import * as React from "react";
import { CloudMoon, Inbox as InboxIcon } from "lucide-react";
import { useStore, somedayTasks } from "@/lib/store";
import { Button, EmptyState, IconButton } from "@/components/ui/primitives";
import { useTriage, useRegisterRows, useRegisterSummary } from "./triage-context";
import { useTriageActions } from "./actions";
import { TriageRow } from "./triage-dnd";

// =========================================================
// Someday.
//
// The Inbox used to hold two different things — "not triaged yet" and "maybe
// one day" — and could therefore never be emptied. This is the second pile,
// kept out of the Inbox count, out of the calendar and out of the way.
//
// Deliberately no drag ordering and no date rail: nothing here is scheduled,
// so there is nothing for either to act on.
// =========================================================

export function SomedayView({ onSeeInbox }: { onSeeInbox: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const { selecting } = useTriage();
  const actions = useTriageActions();

  const items = React.useMemo(() => somedayTasks(tasks), [tasks]);
  const order = React.useMemo(() => items.map((t) => t.id), [items]);
  useRegisterRows(order);
  useRegisterSummary("");

  if (items.length === 0) {
    return (
      <EmptyState
        icon={CloudMoon}
        title="Nothing on the maybe pile"
        description="Send a task here when it is worth keeping but not worth deciding about yet. It leaves the Inbox count and the calendar alone until you bring it back."
        action={
          <Button variant="secondary" size="sm" onClick={onSeeInbox}>
            <InboxIcon className="size-3.5" />
            Go to the Inbox
          </Button>
        }
      />
    );
  }

  return (
    <div role="group" aria-label={`${items.length} someday tasks`}>
      {items.map((task) => (
        <TriageRow
          key={task.id}
          task={task}
          order={order}
          trailing={
            selecting ? undefined : (
              <IconButton
                label={`Move "${task.title || "Untitled"}" back to the Inbox`}
                title="Back to the Inbox"
                onClick={() => actions.setSomeday([task.id], false)}
              >
                <InboxIcon />
              </IconButton>
            )
          }
        />
      ))}
    </div>
  );
}
