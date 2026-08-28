"use client";

import * as React from "react";

// =========================================================
// Windowed list with measured heights.
//
// The All view can hold thousands of rows and a task row is not a fixed
// height — meta lines, tag chips and expanded subtasks all change it — so
// every rendered row reports its real height and the offsets are rebuilt from
// what was actually measured. Rows that have never been on screen fall back to
// an estimate, which is all the scrollbar needs to be honest.
//
// The scroll container belongs to the page shell, so it is found by walking up
// rather than owned here; nothing about the page chrome has to change.
// =========================================================

function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el) {
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === "auto" || overflow === "scroll" || overflow === "overlay") return el;
    el = el.parentElement;
  }
  return null;
}

/** Index of the last offset that is still at or before `value`. */
function lowerBound(offsets: number[], value: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function MeasuredRow({
  rowKey, onMeasure, children,
}: {
  rowKey: string;
  onMeasure: (key: string, height: number) => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    onMeasure(rowKey, el.getBoundingClientRect().height);
    const ro = new ResizeObserver(() => onMeasure(rowKey, el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowKey, onMeasure]);

  return <div ref={ref}>{children}</div>;
}

interface Viewport { top: number; height: number }

export function VirtualRows<T>({
  items, getKey, render, estimate = 44, overscan = 600, focusKey, className,
}: {
  items: T[];
  getKey: (item: T, index: number) => string;
  render: (item: T, index: number) => React.ReactNode;
  /** first-guess row height, replaced the moment a row is measured */
  estimate?: number;
  /** extra pixels rendered above and below the viewport */
  overscan?: number;
  /** keep this row rendered and on screen — the keyboard cursor */
  focusKey?: string | null;
  className?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLElement | null>(null);
  const buffer = React.useRef(new Map<string, number>());
  const flushing = React.useRef(false);

  const [heights, setHeights] = React.useState<ReadonlyMap<string, number>>(() => new Map());
  const [viewport, setViewport] = React.useState<Viewport>({ top: 0, height: 1200 });

  const keys = React.useMemo(() => items.map(getKey), [items, getKey]);

  const offsets = React.useMemo(() => {
    const out = new Array<number>(keys.length + 1);
    let acc = 0;
    for (let i = 0; i < keys.length; i++) {
      out[i] = acc;
      acc += heights.get(keys[i]) ?? estimate;
    }
    out[keys.length] = acc;
    return out;
  }, [keys, estimate, heights]);

  const total = offsets[keys.length] ?? 0;

  // Measurements arrive one ResizeObserver callback at a time; they are pooled
  // for a frame so a hundred rows settling do not cause a hundred renders.
  const onMeasure = React.useCallback((key: string, height: number) => {
    if (height <= 0) return;
    buffer.current.set(key, height);
    if (flushing.current) return;
    flushing.current = true;
    requestAnimationFrame(() => {
      flushing.current = false;
      const pending = buffer.current;
      buffer.current = new Map();
      setHeights((prev) => {
        let changed = false;
        const next = new Map(prev);
        pending.forEach((value, k) => {
          const before = next.get(k);
          if (before === undefined || Math.abs(before - value) >= 0.5) {
            next.set(k, value);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    });
  }, []);

  const readViewport = React.useCallback(() => {
    const container = containerRef.current;
    const scroller = scrollerRef.current;
    if (!container) return;
    if (!scroller) {
      setViewport({ top: 0, height: window.innerHeight * 3 });
      return;
    }
    const top = scroller.getBoundingClientRect().top - container.getBoundingClientRect().top;
    setViewport((prev) =>
      Math.abs(prev.top - top) < 8 && prev.height === scroller.clientHeight
        ? prev
        : { top, height: scroller.clientHeight },
    );
  }, []);

  React.useEffect(() => {
    scrollerRef.current = getScrollParent(containerRef.current);
    const scroller = scrollerRef.current;
    let frame = requestAnimationFrame(readViewport);
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(readViewport);
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [readViewport]);

  // The list growing or shrinking moves everything under it.
  React.useEffect(() => {
    const frame = requestAnimationFrame(readViewport);
    return () => cancelAnimationFrame(frame);
  }, [total, readViewport]);

  const focusIndex = focusKey ? keys.indexOf(focusKey) : -1;

  let start = lowerBound(offsets, Math.max(0, viewport.top - overscan));
  let end = lowerBound(offsets, viewport.top + viewport.height + overscan) + 1;
  if (focusIndex >= 0) {
    start = Math.min(start, focusIndex);
    end = Math.max(end, focusIndex + 1);
  }
  start = Math.max(0, Math.min(start, Math.max(0, keys.length - 1)));
  end = Math.min(keys.length, Math.max(end, start + 1));

  // A cursor that moved outside the window has to be brought into view from
  // here: the row cannot scroll itself while it is not rendered. Only an
  // actual cursor move counts — a measurement settling must not yank the page.
  const chased = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (focusIndex < 0 || focusKey == null) { chased.current = null; return; }
    if (chased.current === focusKey) return;
    chased.current = focusKey;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const rowTop = offsets[focusIndex];
    const rowBottom = offsets[focusIndex + 1];
    if (rowTop >= viewport.top && rowBottom <= viewport.top + viewport.height) return;
    scroller.scrollTop += rowTop < viewport.top
      ? rowTop - viewport.top - 24
      : rowBottom - (viewport.top + viewport.height) + 24;
  }, [focusKey, focusIndex, offsets, viewport]);

  const rendered: React.ReactNode[] = [];
  for (let i = start; i < end; i++) {
    rendered.push(
      <MeasuredRow key={keys[i]} rowKey={keys[i]} onMeasure={onMeasure}>
        {render(items[i], i)}
      </MeasuredRow>,
    );
  }

  return (
    <div ref={containerRef} className={className} style={{ height: total, position: "relative" }}>
      <div style={{ position: "absolute", top: offsets[start], left: 0, right: 0 }}>
        {rendered}
      </div>
    </div>
  );
}
