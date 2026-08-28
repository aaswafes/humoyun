"use client";

import * as React from "react";
import { Check, Monitor, MoonStar, SunMedium } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatTime } from "@/lib/date";
import { ACCENTS, type Accent, type Tint } from "@/lib/types";
import { Segmented } from "@/components/ui/primitives";
import { Pane, Row } from "./ui";

type Theme = "light" | "dark" | "system";

const ACCENT_TINT: Record<Accent, Tint> = {
  blue: "blue",
  violet: "violet",
  emerald: "emerald",
  amber: "amber",
  rose: "pink",
  graphite: "slate",
};

const ACCENT_LABEL: Record<Accent, string> = {
  blue: "Blue",
  violet: "Violet",
  emerald: "Emerald",
  amber: "Amber",
  rose: "Rose",
  graphite: "Graphite",
};

/**
 * A miniature of the app in one theme, painted so it stays true under *both*
 * themes: the light half leans on --canvas/--ink and the dark half swaps them,
 * because those two tokens invert against each other by definition.
 */
function Chrome({ variant }: { variant: "light" | "dark" }) {
  const light = variant === "light";
  const base = light ? "bg-canvas dark:bg-ink" : "bg-ink dark:bg-canvas";
  const rail = light ? "bg-ink/[6%] dark:bg-canvas/[8%]" : "bg-canvas/[7%] dark:bg-ink/[6%]";
  const strong = light ? "bg-ink/[30%] dark:bg-canvas/[35%]" : "bg-canvas/[35%] dark:bg-ink/[30%]";
  const faint = light ? "bg-ink/[13%] dark:bg-canvas/[16%]" : "bg-canvas/[16%] dark:bg-ink/[13%]";
  const edge = light ? "border-ink/[10%] dark:border-canvas/[12%]" : "border-canvas/[12%] dark:border-ink/[10%]";

  return (
    <div className={cn("absolute inset-0", base)}>
      <div className={cn("absolute inset-y-0 left-0 w-[32px] border-r", rail, edge)}>
        <div className="absolute left-2 top-2.5 size-2 rounded-[3px] bg-accent" />
        <div className={cn("absolute left-2 top-[26px] h-1 w-[15px] rounded-full", faint)} />
        <div className={cn("absolute left-2 top-[34px] h-1 w-[11px] rounded-full", faint)} />
        <div className={cn("absolute left-2 top-[42px] h-1 w-[17px] rounded-full", faint)} />
      </div>

      <div className={cn("absolute left-[42px] top-[11px] h-[7px] w-[46%] rounded-full", strong)} />
      <div className={cn("absolute left-[42px] top-[28px] h-1 w-[62%] rounded-full", faint)} />
      <div className={cn("absolute left-[42px] top-[36px] h-1 w-[48%] rounded-full", faint)} />
      <div
        className={cn(
          "absolute bottom-2.5 left-[42px] right-3 h-[18px] rounded-[5px] border",
          rail, edge,
        )}
      >
        <div className="absolute left-1.5 top-1.5 size-[7px] rounded-[2px] bg-accent" />
        <div className={cn("absolute left-[18px] top-[7px] h-1 w-[54%] rounded-full", faint)} />
      </div>
    </div>
  );
}

function ThemeCard({
  theme, label, icon: Icon, active, onSelect,
}: {
  theme: Theme;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        "group flex flex-1 cursor-pointer flex-col gap-2 rounded-lg border p-1.5 text-left",
        "transition-[border-color,background-color,transform] duration-200 ease-[var(--ease-out-apple)]",
        "active:scale-[0.985]",
        active
          ? "border-accent-line bg-accent-soft"
          : "border-line hover:border-line-strong hover:bg-hover",
      )}
    >
      <div className="relative h-[76px] w-full overflow-hidden rounded-md">
        {theme === "dark" ? (
          <Chrome variant="dark" />
        ) : theme === "light" ? (
          <Chrome variant="light" />
        ) : (
          <>
            <Chrome variant="light" />
            <div className="absolute inset-0" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}>
              <Chrome variant="dark" />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-1 pb-0.5">
        <Icon className={cn("size-3.5 shrink-0", active ? "text-accent" : "text-ink-3")} />
        <span className={cn("flex-1 text-[12.5px] font-medium", active ? "text-accent" : "text-ink-2")}>
          {label}
        </span>
        {active && <Check className="size-3.5 shrink-0 text-accent" strokeWidth={3} />}
      </div>
    </button>
  );
}

export function AppearanceSection() {
  const profile = useStore((s) => s.profile);
  const hour12 = useStore((s) => s.hour12);
  const setTheme = useStore((s) => s.setTheme);
  const setAccent = useStore((s) => s.setAccent);
  const updateProfile = useStore((s) => s.updateProfile);

  const theme = (profile?.theme ?? "system") as Theme;
  const accent = (profile?.accent ?? "blue") as Accent;

  function setClock(next: boolean) {
    // `hour12` is lifted out of prefs at hydrate, so it needs updating alongside.
    useStore.setState({ hour12: next });
    updateProfile({ prefs: { ...(profile?.prefs ?? {}), hour12: next } });
  }

  return (
    <Pane
      title="Appearance"
      description="How the app looks and how it writes the time. Changes apply the moment you pick them."
    >
      <Row
        label="Theme"
        hint="System follows your device between light and dark on its own."
        stacked
      >
        <div role="radiogroup" aria-label="Theme" className="flex gap-2.5">
          <ThemeCard theme="light" label="Light" icon={SunMedium} active={theme === "light"} onSelect={() => setTheme("light")} />
          <ThemeCard theme="dark" label="Dark" icon={MoonStar} active={theme === "dark"} onSelect={() => setTheme("dark")} />
          <ThemeCard theme="system" label="System" icon={Monitor} active={theme === "system"} onSelect={() => setTheme("system")} />
        </div>
      </Row>

      <Row
        label="Accent"
        hint="One colour, used sparingly — selection, primary buttons, the day you are on."
        stacked
      >
        <div>
          <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-2.5">
            {ACCENTS.map((a) => {
              const active = accent === a;
              return (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={ACCENT_LABEL[a]}
                  title={ACCENT_LABEL[a]}
                  onClick={() => setAccent(a)}
                  className={cn(
                    `tint-${ACCENT_TINT[a]}`,
                    "grid size-7 cursor-pointer place-items-center rounded-full",
                    "transition-transform duration-200 ease-[var(--ease-out-apple)] hover:scale-110 active:scale-95",
                    active && "ring-2 ring-accent ring-offset-2 ring-offset-[var(--canvas)]",
                  )}
                  style={{ background: "var(--tint)" }}
                >
                  {active && <Check className="size-3.5 text-canvas" strokeWidth={3.5} />}
                </button>
              );
            })}
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium leading-none text-accent-ink">
              Primary
            </span>
            <span className="rounded-md bg-accent-soft px-2.5 py-1 text-[12px] font-medium leading-none text-accent">
              Selected
            </span>
            <span className="rounded-md border border-accent-line px-2.5 py-1 text-[12px] font-medium leading-none text-ink-2">
              Outline
            </span>
            <span className="text-[12px] text-ink-3">{ACCENT_LABEL[accent]}</span>
          </div>
        </div>
      </Row>

      <Row
        label="Clock"
        hint={`Every time in the app follows this — currently ${formatTime(14 * 60 + 5, hour12)}.`}
      >
        <Segmented
          value={hour12 ? "12" : "24"}
          onChange={(v) => setClock(v === "12")}
          options={[
            { value: "12", label: "12-hour" },
            { value: "24", label: "24-hour" },
          ]}
        />
      </Row>
    </Pane>
  );
}
