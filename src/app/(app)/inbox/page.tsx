"use client";

import * as React from "react";
import { CircleHelp, ListChecks, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { useStore, inboxTasks, overdueTasks, somedayTasks } from "@/lib/store";
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
import { DateRail } from "@/components/inbox/date-rail";
import { LegendList } from "@/components/inbox/legend";
import { ControlRow } from "@/components/inbox/control-row";
import { InboxView } from "@/components/inbox/inbox-view";
import { SomedayView } from "@/components/inbox/someday-view";
import { UpcomingView } from "@/components/inbox/upcoming-view";
import { AllView, filterTasks } from "@/components/inbox/all-view";
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
  const { t } = useT();
  const tasks = useStore((s) => s.tasks);
  const {
    tab, setTab, filters, selecting, setSelecting, message, legendOpen, setLegendOpen,
  } = useTriage();
  const actions = useTriageActions();

  const searchRef = React.useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = React.useState<string[] | null>(null);

  const today = todayISO();
  const inboxCount = React.useMemo(() => inboxTasks(tasks).length, [tasks]);
  const overdueCount = React.useMemo(() => overdueTasks(tasks, today).length, [tasks, today]);
  const somedayCount = React.useMemo(() => somedayTasks(tasks).length, [tasks]);
  const topLevel = React.useMemo(() => tasks.filter((t) => !t.parent_id), [tasks]);
  const doneCount = React.useMemo(() => topLevel.filter((t) => t.status === "done").length, [topLevel]);

  // The All tab's count belongs in the header with every other tab's count, and
  // it is the same pass the list runs — so it is computed the same way, once here.
  const shown = React.useMemo(
    () => (tab === "all" ? filterTasks(tasks, filters).length : 0),
    [tab, tasks, filters],
  );

  // One row deletes straight away with an undo in the toast; a whole selection
  // is worth a beat of friction first.
  const requestDelete = React.useCallback(
    (ids: string[]) => {
      if (ids.length <= 1) actions.deleteTasks(ids);
      else setPendingDelete(ids);
    },
    [actions],
  );

  // "/" works from any tab. The two tabs that search already own the box; from
  // anywhere else it lands on All, focused the frame after the box exists.
  const focusSearch = React.useCallback(() => {
    if (tab === "all" || tab === "done") { searchRef.current?.focus(); return; }
    setTab("all");
    requestAnimationFrame(() => requestAnimationFrame(() => searchRef.current?.focus()));
  }, [tab, setTab]);

  useTriageKeys({ onRequestDelete: requestDelete, onFocusSearch: focusSearch });

  const subtitle =
    tab === "inbox" ? (inboxCount ? t("inbox.unscheduled", { n: inboxCount }) : t("inbox.nothingWaiting"))
    : tab === "someday" ? (somedayCount ? t("inbox.somedayCount", { n: somedayCount }) : t("inbox.nothingHeldBack"))
    : tab === "upcoming" ? "Next 14 days"
    : tab === "all"
      ? (shown === topLevel.length
          ? `${topLevel.length} ${topLevel.length === 1 ? "task" : "tasks"}`
          : `${shown} of ${topLevel.length}`)
      : `${doneCount} completed`;

  // Someday has no dates in it, so a date rail would have nothing to act on.
  const withRail = tab !== "done" && tab !== "someday";

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={subtitle}
        actions={
          <>
            <IconButton
              label="Keyboard shortcuts"
              title="Keyboard shortcuts — press ?"
              active={legendOpen}
              onClick={() => setLegendOpen(!legendOpen)}
            >
              <CircleHelp />
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
            { value: "inbox", label: <TabLabel text={t("nav.inbox")} count={inboxCount} /> },
            {
              value: "upcoming",
              label: <TabLabel text={t("when.upcoming")} count={overdueCount} tone="danger" />,
              title: overdueCount ? `${overdueCount} overdue` : undefined,
            },
            { value: "someday", label: <TabLabel text={t("when.someday")} count={somedayCount} /> },
            { value: "all", label: t("when.all") },
            { value: "done", label: t("action.done") },
          ]}
        />
      </PageHeader>

      <PageBody wide>
        <div className="mx-auto w-full max-w-[1120px]">
          <TriageDnd>
            <ControlRow searchRef={searchRef} />

            <div className={cn(withRail && "lg:grid lg:grid-cols-[minmax(0,1fr)_256px] lg:gap-10")}>
              <div className="min-w-0">
                {tab === "inbox" && <InboxView />}
                {tab === "someday" && <SomedayView onSeeInbox={() => setTab("inbox")} />}
                {tab === "upcoming" && <UpcomingView onSeeAll={() => setTab("all")} />}
                {tab === "all" && <AllView />}
                {tab === "done" && <DoneView onSeeUpcoming={() => setTab("upcoming")} />}
              </div>

              {withRail && (
                <aside aria-label="Triage rail" className="mt-10 lg:mt-0">
                  <div className="lg:sticky lg:top-4">
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

      <Modal open={legendOpen} onClose={() => setLegendOpen(false)} title="Keyboard triage" width={600}>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          <p className="mb-5 text-[12.5px] leading-relaxed text-ink-3">
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
        description="They go to the trash, along with anything nested underneath — restore them from Settings → Data, or undo straight away from the toast."
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
