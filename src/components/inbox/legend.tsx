"use client";

import * as React from "react";
import { Kbd } from "@/components/ui/primitives";
import { TRIAGE_LEGEND } from "./triage-keys";

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
                    <Kbd key={k}>{k}</Kbd>
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
