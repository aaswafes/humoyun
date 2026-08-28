"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import type { MapNode } from "@/lib/types";
import { boundsOf, clamp, type Box, type Rect } from "./geometry";

const W = 176;
const H = 112;
const PAD = 8;

/**
 * Bottom-right overview. Dots are tinted like their nodes so the board reads as
 * a shape you recognise; dragging inside it flies the viewport.
 *
 * The projection is derived from the content alone, never from the viewport, so
 * panning only moves the one highlighted rectangle instead of redrawing every dot.
 */
function MinimapImpl({
  nodes, boxes, view, onCenter, className,
}: {
  nodes: MapNode[];
  boxes: Map<string, Box>;
  /** the visible slice of the world, in world units */
  view: Rect;
  onCenter: (world: { x: number; y: number }) => void;
  className?: string;
}) {
  const svgRef = React.useRef<SVGSVGElement>(null);

  const world = React.useMemo<Rect>(() => {
    const b = boundsOf(boxes.values());
    if (!b) return { x: -400, y: -300, w: 800, h: 600 };
    return { x: b.x - 80, y: b.y - 80, w: b.w + 160, h: b.h + 160 };
  }, [boxes]);

  const scale = Math.min((W - PAD * 2) / world.w, (H - PAD * 2) / world.h);
  const ox = PAD + (W - PAD * 2 - world.w * scale) / 2;
  const oy = PAD + (H - PAD * 2 - world.h * scale) / 2;

  const dots = React.useMemo(
    () =>
      nodes.map((n) => {
        const b = boxes.get(n.id);
        if (!b) return null;
        const h = Math.max(2, b.h * scale);
        return (
          <rect
            key={n.id}
            className={`tint-${n.color}`}
            x={ox + (b.x - world.x) * scale}
            y={oy + (b.y - world.y) * scale}
            width={Math.max(2, b.w * scale)}
            height={h}
            rx={Math.min(3, h * 0.4)}
            fill="var(--tint)"
            opacity={0.55}
          />
        );
      }),
    [nodes, boxes, scale, ox, oy, world.x, world.y],
  );

  const jump = React.useCallback((clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    onCenter({
      x: world.x + (clientX - r.left - ox) / scale,
      y: world.y + (clientY - r.top - oy) / scale,
    });
  }, [onCenter, world.x, world.y, ox, oy, scale]);

  // The viewport can sit well outside the content; keep its marker on screen.
  const vx = ox + (view.x - world.x) * scale;
  const vy = oy + (view.y - world.y) * scale;
  const vw = view.w * scale;
  const vh = view.h * scale;
  const left = clamp(vx, 1, W - 7);
  const top = clamp(vy, 1, H - 7);

  return (
    <div
      className={cn(
        "material overflow-hidden rounded-lg border border-line shadow-[var(--shadow-md)]",
        className,
      )}
    >
      <svg
        ref={svgRef}
        width={W}
        height={H}
        role="img"
        aria-label="Board overview"
        className="block cursor-pointer touch-none"
        onPointerDown={(e) => {
          e.preventDefault();
          jump(e.clientX, e.clientY);
          // the projection depends only on the content, so it cannot go stale mid-drag
          const move = (ev: PointerEvent) => jump(ev.clientX, ev.clientY);
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        {dots}
        <rect
          x={left}
          y={top}
          width={clamp(vw - (left - vx), 6, W - left - 1)}
          height={clamp(vh - (top - vy), 6, H - top - 1)}
          rx={3}
          fill="var(--accent-soft)"
          stroke="var(--accent)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}

export const Minimap = React.memo(MinimapImpl);
