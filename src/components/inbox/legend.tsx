"use client";

import * as React from "react";
import { TRIAGE_LEGEND } from "./triage-keys";

/**
 * Kbd's look, without Kbd's `touch:hidden`. Kbd is a hint beside a control
 * and rightly vanishes on a touch screen; here the keys ARE the content, and
 * the legend can still open on one — an iPad with a keyboard, by its "?" key —
 * where a hidden Kbd left a column of labels with nothing to label.
 */
function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line bg-hover px-1 font-sans text-[10.5px] font-medium leading-none text-ink-3">
      {children}
    </kbd>
  );
}

/**
 * The keyboard legend. It used to hold a permanent column of the rail; now it
 * lives behind the "?" in the header and the "?" key, which is where a
 * reference belongs — read once, then never in the way again.
 */
export function LegendList() {
  return (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {TRIAGE_LEGEND.map((section) => (
        <div key={section.title}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">
            {section.title}
          </p>
          <ul className="flex flex-col gap-1.5">
            {section.items.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span className="flex w-[52px] shrink-0 items-center gap-0.5">
                  {item.keys.map((k) => (
                    <KeyCap key={k}>{k}</KeyCap>
                  ))}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
