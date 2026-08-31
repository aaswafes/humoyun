"use client";

import * as React from "react";
import { ChevronRight, Keyboard } from "lucide-react";
import { cn } from "@/lib/cn";
import { Kbd } from "@/components/ui/primitives";
import { FoldRegion, useFold } from "./ui";

interface Shortcut {
  label: string;
  keys: string[];
  alt?: string[];
}

const GLOBAL: Shortcut[] = [
  { label: "Command palette", keys: ["⌘", "K"], alt: ["⌘", "/"] },
  { label: "Quick add", keys: ["N"], alt: ["C"] },
  { label: "Undo the last change", keys: ["⌘", "Z"] },
  { label: "Redo it", keys: ["⌘", "⇧", "Z"], alt: ["⌘", "Y"] },
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

const TOTAL = GLOBAL.length + GO_TO.length;

function ShortcutRow({ item }: { item: Shortcut }) {
  return (
    <li className="flex items-center gap-3 py-[3.5px]">
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{item.label}</span>
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

/** The whole reference, resting as one line. Nothing here is a setting — it is a reminder. */
export function ShortcutsCard() {
  const [open, setOpen] = useFold("humoyun.settings.shortcutsOpen", false);

  return (
    <section aria-labelledby="shortcuts-heading" className="mt-12">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "-mx-1.5 flex min-h-[28px] w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left",
          "transition-colors duration-150 hover:bg-hover",
        )}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <Keyboard className="size-3.5 shrink-0 text-ink-4" aria-hidden />
        <span id="shortcuts-heading" className="shrink-0 text-[12.5px] font-semibold text-ink-2">
          Keyboard shortcuts
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3 tnum">
          {TOTAL} of them · ⌘K opens the palette
        </span>
      </button>

      <FoldRegion open={open}>
        <div className="grid gap-x-12 gap-y-7 pl-[22px] pt-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div>
            <p className="text-[12px] font-medium text-ink-2">Anywhere</p>
            <ul className="mt-2">
              {GLOBAL.map((s) => <ShortcutRow key={s.label} item={s} />)}
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-medium text-ink-2">
              Go to <span className="font-normal text-ink-4">— press G, then</span>
            </p>
            <ul className="mt-2 grid gap-x-8 sm:grid-cols-2">
              {GO_TO.map((s) => <ShortcutRow key={s.label} item={s} />)}
            </ul>
          </div>

          <p className="text-[11.5px] leading-relaxed text-ink-4 md:col-span-2">
            ⌘ is Ctrl on Windows and Linux. Shortcuts pause while you are typing in a field.
          </p>
        </div>
      </FoldRegion>
    </section>
  );
}
