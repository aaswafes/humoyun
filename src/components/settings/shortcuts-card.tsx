"use client";

import * as React from "react";
import { Keyboard } from "lucide-react";
import { Kbd } from "@/components/ui/primitives";

interface Shortcut {
  label: string;
  keys: string[];
  alt?: string[];
}

const GLOBAL: Shortcut[] = [
  { label: "Command palette", keys: ["⌘", "K"], alt: ["⌘", "/"] },
  { label: "Quick add", keys: ["N"], alt: ["C"] },
  { label: "Show or hide the sidebar", keys: ["⌘", "\\"] },
  { label: "Jump to today", keys: ["T"] },
  { label: "Previous day", keys: ["⇧", "←"] },
  { label: "Next day", keys: ["⇧", "→"] },
  { label: "Close any panel", keys: ["Esc"] },
];

const GO_TO: Shortcut[] = [
  { label: "Today", keys: ["T"] },
  { label: "Calendar", keys: ["C"] },
  { label: "Inbox", keys: ["I"] },
  { label: "Mind Map", keys: ["M"] },
  { label: "Books", keys: ["B"] },
  { label: "Habits", keys: ["H"] },
  { label: "Salah", keys: ["S"] },
  { label: "Focus", keys: ["F"] },
  { label: "Goals", keys: ["G"] },
  { label: "Weekly Review", keys: ["R"] },
  { label: "Stats", keys: ["A"] },
];

function ShortcutRow({ item }: { item: Shortcut }) {
  return (
    <li className="flex items-center gap-3 py-[3.5px]">
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{item.label}</span>
      <span className="flex shrink-0 items-center gap-1">
        {item.keys.map((k, i) => <Kbd key={`${k}-${i}`}>{k}</Kbd>)}
        {item.alt && (
          <>
            <span className="px-0.5 text-[10.5px] text-ink-4">or</span>
            {item.alt.map((k, i) => <Kbd key={`alt-${k}-${i}`}>{k}</Kbd>)}
          </>
        )}
      </span>
    </li>
  );
}

export function ShortcutsCard() {
  return (
    <section aria-labelledby="shortcuts-heading" className="mt-12">
      <div className="mb-3 flex items-center gap-2">
        <Keyboard className="size-4 text-ink-3" />
        <h2
          id="shortcuts-heading"
          className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3"
        >
          Keyboard shortcuts
        </h2>
      </div>

      <div className="grid gap-x-12 gap-y-7 rounded-lg border border-line bg-sunken px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <p className="text-[12px] font-medium text-ink">Anywhere</p>
          <ul className="mt-2">
            {GLOBAL.map((s) => <ShortcutRow key={s.label} item={s} />)}
          </ul>
        </div>

        <div>
          <p className="text-[12px] font-medium text-ink">
            Go to <span className="font-normal text-ink-4">— press G, then</span>
          </p>
          <ul className="mt-2 grid gap-x-8 sm:grid-cols-2">
            {GO_TO.map((s) => <ShortcutRow key={s.label} item={s} />)}
          </ul>
        </div>
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-4">
        ⌘ is Ctrl on Windows and Linux. Shortcuts pause while you are typing in a field.
      </p>
    </section>
  );
}
