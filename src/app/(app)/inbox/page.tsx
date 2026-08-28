"use client";

import * as React from "react";
import { Keyboard, ListChecks, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, inboxTasks, overdueTasks } from "@/lib/store";
import { todayISO } from "@/lib/date";
import { PageHeader, PageBody } from "@/components/shell/page-header";
import { openQuickAdd } from "@/components/shell/quick-add";
import { Button, IconButton, Segmented } from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/overlays";
import { VisuallyHidden } from "@/components/ui/form";
import { TriageProvider, useTriage, type TriageTab } from "@/components/inbox/triage-context";
import { useTriageActions } from "@/components/inbox/actions";
import { useTriageKeys } from "@/components/inbox/triage-keys";
import { TriageDnd } from "@/components/inbox/triage-dnd";
import { DateRail, LegendList } from "@/components/inbox/date-rail";
import { ViewsBar } from "@/components/inbox/views-bar";
import { InboxView } from "@/components/inbox/inbox-view";
import { UpcomingView } from "@/components/inbox/upcoming-view";
import { AllView } from "@/components/inbox/all-view";
import { DoneView } from "@/components/inbox/done-view";
import { BulkBar } from "@/components/inbox/bulk-bar";

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
  const {
    tab, setTab, selecting, setSelecting, message, legendOpen, setLegendOpen,
  } = useTriage();
  const actions = useTriageActions();

  const searchRef = React.useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = React.useState<string[] | null>(null);

  const today = todayISO();
  const inboxCount = React.useMemo(() => inboxTasks(tasks).length, [tasks]);
  const overdueCount = React.useMemo(() => overdueTasks(tasks, today).length, [tasks, today]);
  const topLevel = React.useMemo(() => tasks.filter((t) => !t.parent_id), [tasks]);
  const doneCount = React.useMemo(() => topLevel.filter((t) => t.status === "done").length, [topLevel]);

  // One row deletes straight away with an undo in the toast; a whole selection
  // is worth a beat of friction first.
  const requestDelete = React.useCallback(
    (ids: string[]) => {
      if (ids.length <= 1) actions.deleteTasks(ids);
      else setPendingDelete(ids);
    },
    [actions],
  );

  // "/" works from any tab: switch to All, then focus the box the frame after
  // it exists. Two frames, because the tab swap is a full re-render.
  const focusSearch = React.useCallback(() => {
    if (tab === "all") { searchRef.current?.focus(); return; }
    setTab("all");
    requestAnimationFrame(() => requestAnimationFrame(() => searchRef.current?.focus()));
  }, [tab, setTab]);

  useTriageKeys({ onRequestDelete: requestDelete, onFocusSearch: focusSearch });

  const subtitle =
    tab === "inbox" ? (inboxCount ? `${inboxCount} unscheduled` : "Nothing waiting")
    : tab === "upcoming" ? "Next 14 days"
    : tab === "all" ? `${topLevel.length} ${topLevel.length === 1 ? "task" : "tasks"}`
    : `${doneCount} completed`;

  const withRail = tab !== "done";

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={subtitle}
        actions={
          <>
            <IconButton
              label="Keyboard shortcuts"
              active={legendOpen}
              onClick={() => setLegendOpen(!legendOpen)}
            >
              <Keyboard />
            </IconButton>
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
        <Segmented<TriageTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "inbox", label: <TabLabel text="Inbox" count={inboxCount} /> },
            {
              value: "upcoming",
              label: <TabLabel text="Upcoming" count={overdueCount} tone="danger" />,
              title: overdueCount ? `${overdueCount} overdue` : undefined,
            },
            { value: "all", label: "All" },
            { value: "done", label: "Done" },
          ]}
        />
      </PageHeader>

      <PageBody wide>
        <div className="mx-auto w-full max-w-[1160px]">
          <TriageDnd>
            <ViewsBar />

            <div className={cn("gap-6", withRail && "lg:grid lg:grid-cols-[minmax(0,1fr)_264px]")}>
              <div className="min-w-0">
                {tab === "inbox" && <InboxView />}
                {tab === "upcoming" && <UpcomingView onSeeAll={() => setTab("all")} />}
                {tab === "all" && <AllView searchRef={searchRef} />}
                {tab === "done" && <DoneView onSeeUpcoming={() => setTab("upcoming")} />}
              </div>

              {withRail && (
                <aside aria-label="Triage rail" className="mt-6 lg:mt-0">
                  <div className="lg:sticky lg:top-3">
                    <DateRail />
                  </div>
                </aside>
              )}
            </div>
          </TriageDnd>
        </div>
      </PageBody>

      <BulkBar />

      {/* The keyboard cursor is virtual, so its position is spoken here. */}
      <div aria-live="polite" aria-atomic="true">
        <VisuallyHidden>
          {message.text ? <span key={message.n}>{message.text}</span> : null}
        </VisuallyHidden>
      </div>

      <Modal open={legendOpen} onClose={() => setLegendOpen(false)} title="Keyboard triage" width={560}>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-3">
            Every key acts on the selection when there is one, and on the row under the cursor
            otherwise. Nothing here is destructive without an undo.
          </p>
          <LegendList />
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { if (pendingDelete) actions.deleteTasks(pendingDelete); }}
        title={`Delete ${pendingDelete?.length ?? 0} tasks?`}
        description="They go permanently, along with anything nested underneath. One undo waits in the toast."
        confirmLabel="Delete"
      />
    </>
  );
}

export default function InboxPage() {
  return (
    <TriageProvider>
      <InboxSurface />
    </TriageProvider>
  );
}
