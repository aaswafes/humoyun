"use client";

import * as React from "react";
import { useHotkeys } from "@/hooks/use-hotkeys";

export interface SelectionApi {
  selecting: boolean;
  ids: string[];
  count: number;
  isSelected: (id: string) => boolean;
  /** `order` is the flat, visible row order of the current view — shift extends from the anchor. */
  toggle: (id: string, opts?: { shift?: boolean; order?: string[] }) => void;
  clear: () => void;
  setSelecting: (on: boolean) => void;
}

const SelectionContext = React.createContext<SelectionApi | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selecting, setSelectingRaw] = React.useState(false);
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const anchor = React.useRef<string | null>(null);

  const toggle = React.useCallback((id: string, opts?: { shift?: boolean; order?: string[] }) => {
    const order = opts?.order;
    const from = anchor.current;
    const extending = !!(opts?.shift && from && order && order.includes(from) && order.includes(id));

    setSelected((prev) => {
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

  const clear = React.useCallback(() => {
    setSelected(new Set<string>());
    anchor.current = null;
  }, []);

  const setSelecting = React.useCallback((on: boolean) => {
    setSelectingRaw(on);
    if (!on) {
      setSelected(new Set<string>());
      anchor.current = null;
    }
  }, []);

  const ids = React.useMemo(() => [...selected], [selected]);

  const value = React.useMemo<SelectionApi>(
    () => ({
      selecting,
      ids,
      count: ids.length,
      isSelected: (id: string) => selected.has(id),
      toggle,
      clear,
      setSelecting,
    }),
    [selecting, ids, selected, toggle, clear, setSelecting],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionApi {
  const value = React.useContext(SelectionContext);
  if (!value) throw new Error("useSelection must be used inside <SelectionProvider>");
  return value;
}

/**
 * Escape drops the selection, then leaves select mode. Registered only while
 * selecting so the key stays free the rest of the time.
 */
export function useSelectionHotkeys() {
  const { selecting, setSelecting, count, clear } = useSelection();

  useHotkeys(
    {
      escape: () => {
        // An open popover or dialog owns Escape first — both listen on document.
        if (document.querySelector('[role="dialog"]')) return;
        if (count) clear();
        else setSelecting(false);
      },
    },
    { enabled: selecting },
  );
}
