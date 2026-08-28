"use client";

import * as React from "react";
import { ListChecks, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, inboxTasks, overdueTasks } from "@/lib/store";
import { todayISO } from "@/lib/date";
import { PageHeader, PageBody } from "@/components/shell/page-header";
import { openQuickAdd } from "@/components/shell/quick-add";
import { Button, IconButton, Segmented } from "@/components/ui/primitives";
import { SelectionProvider, useSelection } from "@/components/inbox/selection";
import { InboxView } from "@/components/inbox/inbox-view";
import { UpcomingView } from "@/components/inbox/upcoming-view";
import { AllView } from "@/components/inbox/all-view";
import { DoneView } from "@/components/inbox/done-view";
import { BulkBar } from "@/components/inbox/bulk-bar";

type Tab = "inbox" | "upcoming" | "all" | "done";

function TabLabel({
  text, count, tone = "default",
}: {
  text: string;
  count: number;
  tone?: "default" | "danger";
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {count > 0 && (
        <span className={cn("text-[11px] tnum", tone === "danger" ? "text-danger" : "text-ink-4")}>
          {count}
        </span>
      )}
    </span>
  );
}

function InboxSurface() {
  const tasks = useStore((s) => s.tasks);
  const { selecting, setSelecting, clear } = useSelection();
  const [tab, setTab] = React.useState<Tab>("inbox");

  const today = todayISO();
  const inboxCount = React.useMemo(() => inboxTasks(tasks).length, [tasks]);
  const overdueCount = React.useMemo(() => overdueTasks(tasks, today).length, [tasks, today]);
  const topLevel = React.useMemo(() => tasks.filter((t) => !t.parent_id), [tasks]);
  const doneCount = React.useMemo(() => topLevel.filter((t) => t.status === "done").length, [topLevel]);

  // A selection only makes sense against the list it was made in.
  const goTo = React.useCallback((next: Tab) => { clear(); setTab(next); }, [clear]);

  const subtitle =
    tab === "inbox" ? (inboxCount ? `${inboxCount} unscheduled` : "Nothing waiting")
    : tab === "upcoming" ? "Next 14 days"
    : tab === "all" ? `${topLevel.length} ${topLevel.length === 1 ? "task" : "tasks"}`
    : `${doneCount} completed`;

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={subtitle}
        actions={
          <>
            <IconButton
              label={selecting ? "Leave select mode" : "Select tasks"}
              active={selecting}
              onClick={() => setSelecting(!selecting)}
            >
              <ListChecks />
            </IconButton>
            <Button variant="primary" size="sm" onClick={openQuickAdd}>
              <Plus className="size-3.5" />
              New
            </Button>
          </>
        }
      >
        <Segmented<Tab>
          value={tab}
          onChange={goTo}
          options={[
            { value: "inbox", label: <TabLabel text="Inbox" count={inboxCount} /> },
            { value: "upcoming", label: <TabLabel text="Upcoming" count={overdueCount} tone="danger" />, title: overdueCount ? `${overdueCount} overdue` : undefined },
            { value: "all", label: "All" },
            { value: "done", label: "Done" },
          ]}
        />
      </PageHeader>

      <PageBody>
        {tab === "inbox" && <InboxView />}
        {tab === "upcoming" && <UpcomingView onSeeAll={() => goTo("all")} />}
        {tab === "all" && <AllView />}
        {tab === "done" && <DoneView onSeeUpcoming={() => goTo("upcoming")} />}
      </PageBody>

      <BulkBar />
    </>
  );
}

export default function InboxPage() {
  return (
    <SelectionProvider>
      <InboxSurface />
    </SelectionProvider>
  );
}
