import type { TaskKind, TaskStatus } from "@/lib/types";
import type { GroupKey, SortKey } from "./triage-context";

// =========================================================
// The words triage puts on filters, sorts and groups. They live apart from
// any one view because the control row writes them into a menu, the saved-view
// menu writes them into a description, and the list writes them onto a header —
// three places that must never drift from one another.
// =========================================================

export const SORT_LABELS: Record<SortKey, string> = {
  manual: "Manual",
  date: "Date",
  priority: "Priority",
  created: "Newest",
  alpha: "A–Z",
};

/** The Inbox tab sorts the same keys, but "manual" there means a hand order. */
export const INBOX_SORT_LABELS: Record<SortKey, string> = {
  manual: "My order",
  date: "Date added",
  priority: "Priority",
  created: "Newest first",
  alpha: "A–Z",
};

export const GROUP_LABELS: Record<GroupKey, string> = {
  none: "Nothing",
  date: "Date",
  priority: "Priority",
  status: "Status",
  tag: "Tag",
  kind: "Type",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To-do",
  doing: "Doing",
  done: "Done",
  dropped: "Dropped",
};

export const KIND_LABELS: Record<TaskKind, string> = {
  task: "Tasks", event: "Events", reading: "Reading", habit: "Habits",
  prayer: "Prayer", block: "Blocks", milestone: "Milestones",
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done", "dropped"];
export const SORT_ORDER: SortKey[] = ["date", "priority", "created", "alpha"];
export const GROUP_ORDER: GroupKey[] = ["none", "date", "priority", "status", "tag", "kind"];
export const INBOX_SORTS: SortKey[] = ["manual", "priority", "created", "alpha"];
