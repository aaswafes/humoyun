"use client";

import * as React from "react";
import { UMR_META, type UmrCategory } from "@/lib/umr";

// =========================================================
// Drawing a category in SVG.
//
// Tints are theme-aware and tint-set aware, so a hex value in a chart would be
// wrong in dark mode and wrong again under "vivid". Custom properties inherit
// through SVG: put `tint-<name>` on a <g> and every shape inside it can read
// `var(--tint)`. That is the whole trick, and it is why no chart in this
// section names a colour.
// =========================================================

export function TintGroup({
  category, children, opacity,
}: {
  category: UmrCategory;
  children: React.ReactNode;
  opacity?: number;
}) {
  return (
    <g className={`tint-${UMR_META[category].tint}`} opacity={opacity}>
      {children}
    </g>
  );
}

/** The same, for a legend swatch or anything outside an <svg>. */
export function TintDot({ category, className }: { category: UmrCategory; className?: string }) {
  return (
    <span className={`tint-${UMR_META[category].tint} ${className ?? ""}`}>
      <span
        className="block size-2 rounded-[3px]"
        style={{ background: "var(--tint)" }}
        aria-hidden
      />
    </span>
  );
}
