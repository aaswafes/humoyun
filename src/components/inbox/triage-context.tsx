"use client";

import * as React from "react";
import type { TaskStatus } from "@/lib/types";

// =========================================================
// One piece of state for the whole triage surface: which tab, which filters,
// what is selected, where the keyboard cursor sits, what is being renamed.
// Every view reads from here so a filter, a selection and a cursor survive a
// tab switch in exactly the way the user expects — and so the date rail, the
// bulk bar and the keyboard layer can all act on the same "target".
// =========================================================

export type TriageTab = "inbox" | "upcoming" | "all" | "done";
export type SortKey = "manual" | "date" | "priority" | "created" | "alpha";
export type GroupKey = "none" | "date" | "priority" | "status" | "tag" | "kind";

export interface Filters {
  q: string;
  tags: string[];
  priority: number | null;
  status: TaskStatus | "any";
  sort: SortKey;
  group: GroupKey;
}

export const DEFAULT_FILTERS: Filters = {
  q: "",
  tags: [],
  priority: null,
  status: "any",
  sort: "date",
  group: "none",
};

export function filtersDirty(f: Filters): boolean {
  return (
    f.q.trim() !== "" ||
    f.tags.length > 0 ||
    f.priority !== null ||
    f.status !== "any" ||
    f.sort !== DEFAULT_FILTERS.sort ||
    f.group !== DEFAULT_FILTERS.group
  );
}

/** Human summary of a filter set — used on saved-view chips and in tooltips. */
export function describeFilters(f: Filters, labels: {
  priority: (p: number) => string;
  status: (s: TaskStatus) => string;
  sort: (s: SortKey) => string;
  group: (g: GroupKey) => string;
}): string {
  const parts: string[] = [];
  if (f.q.trim()) parts.push(`“${f.q.trim()}”`);
  if (f.tags.length) parts.push(f.tags.map((t) => `#${t}`).join(" "));
  if (f.priority !== null) parts.push(labels.priority(f.priority));
  if (f.status !== "any") parts.push(labels.status(f.status));
  parts.push(`by ${labels.sort(f.sort).toLowerCase()}`);
  if (f.group !== "none") parts.push(`grouped by ${labels.group(f.group).toLowerCase()}`);
  return parts.join(" · ");
}

/** What "a row was dropped on this other row" means in the active view. */
export type RowDropFn = (overId: string, ids: string[]) => void;

export interface TriageApi {
  // ---- tab ----
  tab: TriageTab;
  setTab: (t: TriageTab) => void;

  // ---- filters ----
  filters: Filters;
  patchFilters: (changes: Partial<Filters>) => void;
  replaceFilters: (next: Filters) => void;
  resetFilters: () => void;

  // ---- selection ----
  selecting: boolean;
  setSelecting: (on: boolean) => void;
  ids: string[];
  count: number;
  isSelected: (id: string) => boolean;
  /** `order` is the flat visible row order — shift extends from the anchor. */
  toggle: (id: string, opts?: { shift?: boolean; order?: string[] }) => void;
  setSelected: (ids: string[], on: boolean) => void;
  clear: () => void;

  // ---- keyboard cursor ----
  rows: string[];
  publishRows: (ids: string[]) => void;
  cursorId: string | null;
  setCursor: (id: string | null) => void;

  // ---- inline rename ----
  editingId: string | null;
  setEditingId: (id: string | null) => void;

  /** Selection if there is one, otherwise the cursor row. What every bulk verb acts on. */
  targetIds: string[];

  // ---- live announcements for the virtual cursor ----
  message: { text: string; n: number };
  announce: (text: string) => void;

  // ---- drag ----
  dragIds: string[];
  setDragIds: (ids: string[]) => void;

  // ---- legend ----
  legendOpen: boolean;
  setLegendOpen: (open: boolean) => void;

  /** The active view registers what a drop on a row means, for the page-level DndContext. */
  onRowDrop: RowDropFn | null;
  setOnRowDrop: (fn: RowDropFn | null) => void;
}

const TriageContext = React.createContext<TriageApi | null>(null);

const EMPTY: string[] = [];

export function TriageProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTabRaw] = React.useState<TriageTab>("inbox");
  const [filters, setFiltersRaw] = React.useState<Filters>(DEFAULT_FILTERS);
  const [selecting, setSelectingRaw] = React.useState(false);
  const [selected, setSelectedSet] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const [rows, setRows] = React.useState<string[]>(EMPTY);
  const [cursorRaw, setCursor] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [dragIds, setDragIds] = React.useState<string[]>(EMPTY);
  const [legendOpen, setLegendOpen] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; n: number }>({ text: "", n: 0 });

  // Boxed so a function can live in state without useState treating it as an updater.
  const [dropBox, setDropBox] = React.useState<{ fn: RowDropFn | null }>({ fn: null });

  const anchor = React.useRef<string | null>(null);

  // A cursor pointing at a row the current query no longer returns is a dead
  // cursor — derived here rather than cleaned up in an effect.
  const cursorId = cursorRaw && rows.includes(cursorRaw) ? cursorRaw : null;

  const announce = React.useCallback((text: string) => {
    setMessage((prev) => ({ text, n: prev.n + 1 }));
  }, []);

  // Views hand up their flat visible order every render; only a real change
  // should re-render the tree, so compare before storing.
  const publishRows = React.useCallback((next: string[]) => {
    setRows((prev) => {
      if (prev.length === next.length && prev.every((id, i) => id === next[i])) return prev;
      return next;
    });
  }, []);

  const toggle = React.useCallback((id: string, opts?: { shift?: boolean; order?: string[] }) => {
    const order = opts?.order;
    const from = anchor.current;
    const extending = !!(opts?.shift && from && order && order.includes(from) && order.includes(id));

    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (extending && from && order) {
        const a = order.indexOf(from);
        const b = order.indexOf(id);
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i++) next.add(order[i]);
        return next;
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    // Keep the anchor put while extending so a range can be widened repeatedly.
    if (!extending) anchor.current = id;
  }, []);

  const setSelectedIds = React.useCallback((list: string[], on: boolean) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      list.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
    if (on && list.length) anchor.current = list[list.length - 1];
  }, []);

  const clear = React.useCallback(() => {
    setSelectedSet(new Set<string>());
    anchor.current = null;
  }, []);

  const setSelecting = React.useCallback((on: boolean) => {
    setSelectingRaw(on);
    if (!on) {
      setSelectedSet(new Set<string>());
      anchor.current = null;
    }
  }, []);

  const setTab = React.useCallback((next: TriageTab) => {
    setTabRaw(next);
    setEditingId(null);
    setCursor(null);
    setSelectedSet(new Set<string>());
    anchor.current = null;
  }, []);

  const patchFilters = React.useCallback((changes: Partial<Filters>) => {
    setFiltersRaw((prev) => ({ ...prev, ...changes }));
  }, []);

  const replaceFilters = React.useCallback((next: Filters) => setFiltersRaw(next), []);
  const resetFilters = React.useCallback(() => setFiltersRaw(DEFAULT_FILTERS), []);

  const setOnRowDrop = React.useCallback((fn: RowDropFn | null) => {
    setDropBox((prev) => (prev.fn === fn ? prev : { fn }));
  }, []);

  const ids = React.useMemo(() => [...selected], [selected]);
  const targetIds = React.useMemo(
    () => (ids.length ? ids : cursorId ? [cursorId] : EMPTY),
    [ids, cursorId],
  );

  const value = React.useMemo<TriageApi>(
    () => ({
      tab,
      setTab,
      filters,
      patchFilters,
      replaceFilters,
      resetFilters,
      selecting,
      setSelecting,
      ids,
      count: ids.length,
      isSelected: (id: string) => selected.has(id),
      toggle,
      setSelected: setSelectedIds,
      clear,
      rows,
      publishRows,
      cursorId,
      setCursor,
      editingId,
      setEditingId,
      targetIds,
      message,
      announce,
      dragIds,
      setDragIds,
      legendOpen,
      setLegendOpen,
      onRowDrop: dropBox.fn,
      setOnRowDrop,
    }),
    [
      tab, setTab, filters, patchFilters, replaceFilters, resetFilters,
      selecting, setSelecting, ids, selected, toggle, setSelectedIds, clear,
      rows, publishRows, cursorId, setCursor, editingId,
      targetIds, message, announce, dragIds, legendOpen, dropBox, setOnRowDrop,
    ],
  );

  return <TriageContext.Provider value={value}>{children}</TriageContext.Provider>;
}

export function useTriage(): TriageApi {
  const value = React.useContext(TriageContext);
  if (!value) throw new Error("useTriage must be used inside <TriageProvider>");
  return value;
}

/** Views call this every render with their flat visible order. */
export function useRegisterRows(order: string[]) {
  const { publishRows } = useTriage();
  React.useEffect(() => { publishRows(order); }, [order, publishRows]);
}

/**
 * A view registers what dropping one row onto another should do. Pass a
 * stable (useCallback'd) function — it is an effect dependency.
 */
export function useRegisterRowDrop(fn: RowDropFn | null) {
  const { setOnRowDrop } = useTriage();
  React.useEffect(() => {
    setOnRowDrop(fn);
    return () => setOnRowDrop(null);
  }, [fn, setOnRowDrop]);
}
