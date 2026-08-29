"use client";

import * as React from "react";
import { Check, Monitor, MoonStar, SunMedium } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatTime } from "@/lib/date";
import { ACCENTS, TINTS, type Accent, type Tint } from "@/lib/types";
import { Badge, Button, Checkbox, Progress, Segmented } from "@/components/ui/primitives";
import { SwatchCheck } from "@/components/ui/form";
import { FoldGroup, Group, Pane, Row } from "./ui";

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

const TINT_LABEL: Record<Tint, string> = {
  slate: "Slate", red: "Red", orange: "Orange", amber: "Amber", emerald: "Emerald",
  teal: "Teal", blue: "Blue", violet: "Violet", pink: "Pink", brown: "Brown",
};

interface RovingProps {
  ref: (el: HTMLButtonElement | null) => void;
  tabIndex: number;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Arrow-key movement inside a radio group, with a roving tab stop — one Tab
 * lands in the group, arrows choose. Returns the props each option needs.
 */
function useRovingRadio<T extends string>(
  values: readonly T[], value: T, onChange: (v: T) => void,
): (i: number) => RovingProps {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, values.indexOf(value));

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const last = values.length - 1;
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    onChange(values[next]);
    refs.current[next]?.focus();
  }

  return (i: number) => ({
    ref: (el: HTMLButtonElement | null) => { refs.current[i] = el; },
    tabIndex: i === index ? 0 : -1,
    onKeyDown: (e: React.KeyboardEvent) => onKeyDown(e, i),
  });
}

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
  theme, label, icon: Icon, active, onSelect, roving,
}: {
  theme: Theme;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onSelect: () => void;
  roving: RovingProps;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      {...roving}
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

/**
 * The accent, shown doing its actual job. Everything in here is a live
 * primitive, so what you see is exactly what the rest of the app renders.
 */
function AccentPreview() {
  const [done, setDone] = React.useState(false);

  return (
    <div className="rounded-lg bg-sunken p-3">
      <div className="flex items-center gap-2.5 rounded-md bg-selected px-2 py-1.5">
        <Checkbox checked={done} onChange={setDone} label="Preview task" size="sm" />
        <span className={cn("min-w-0 flex-1 truncate text-[13px]", done ? "text-ink-4 line-through" : "text-ink")}>
          Deep work — hardest thing first
        </span>
        <span className="shrink-0 text-[11.5px] text-ink-3 tnum">8:00</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 px-2">
        <Button variant="primary" size="xs">Primary</Button>
        <Button size="xs">Secondary</Button>
        <span className="rounded-md bg-accent-soft px-2 py-1 text-[11.5px] font-medium leading-none text-accent">
          Selected
        </span>
        <span className="rounded-md border border-accent-line px-2 py-1 text-[11.5px] font-medium leading-none text-ink-2">
          Outline
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 px-2">
        <Progress value={68} className="flex-1" />
        <span className="shrink-0 text-[11.5px] text-ink-3 tnum">68%</span>
      </div>
    </div>
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

  const themes: Theme[] = ["light", "dark", "system"];
  const themeRoving = useRovingRadio(themes, theme, setTheme);
  const accentRoving = useRovingRadio(ACCENTS, accent, setAccent);

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
      <Group title="Theme">
        <Row
          label="Light, dark, or whatever the system says"
          hint="System follows your device between light and dark on its own."
          stacked
        >
          <div role="radiogroup" aria-label="Theme" className="flex gap-2.5">
            <ThemeCard theme="light" label="Light" icon={SunMedium} active={theme === "light"} onSelect={() => setTheme("light")} roving={themeRoving(0)} />
            <ThemeCard theme="dark" label="Dark" icon={MoonStar} active={theme === "dark"} onSelect={() => setTheme("dark")} roving={themeRoving(1)} />
            <ThemeCard theme="system" label="System" icon={Monitor} active={theme === "system"} onSelect={() => setTheme("system")} roving={themeRoving(2)} />
          </div>
        </Row>
      </Group>

      <Group
        title="Accent"
        description="One colour, used sparingly — selection, primary buttons, the day you are on."
      >
        <Row label="Pick one" hint={`Currently ${ACCENT_LABEL[accent]}. Arrow keys move between them.`} stacked>
          <div>
            <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-2.5">
              {ACCENTS.map((a, i) => {
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
                    {...accentRoving(i)}
                    className={cn(
                      `tint-${ACCENT_TINT[a]}`,
                      "grid size-7 cursor-pointer place-items-center rounded-full",
                      "transition-transform duration-200 ease-[var(--ease-out-apple)] hover:scale-110 active:scale-95",
                      active && "ring-2 ring-accent ring-offset-2 ring-offset-[var(--canvas)]",
                    )}
                    style={{ background: "var(--tint)" }}
                  >
                    {/* A bare white tick washes out on Amber and Slate; SwatchCheck
                        carries its own scrim so it reads on every tint. */}
                    {active && <SwatchCheck />}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 max-w-[420px]">
              <AccentPreview />
            </div>
          </div>
        </Row>
      </Group>

      <FoldGroup
        title="Entity colours"
        storageKey="humoyun.settings.tintsOpen"
        summary="Ten tints, named — the reference for tasks, books, habits and tags"
        description="They are tuned separately for light and dark, so a task keeps its identity when the theme flips."
      >
        <Row label="The palette" hint="Not editable — this is the reference, so you can name a colour when you pick one." stacked>
          <div className="flex flex-wrap gap-1.5">
            {TINTS.map((t) => (
              <Badge key={t} tint={t} dot className="h-[22px] px-2 text-[11.5px]">
                {TINT_LABEL[t]}
              </Badge>
            ))}
          </div>
        </Row>
      </FoldGroup>

      <Group title="Time">
        <Row
          label="Clock"
          hint={`Every time in the app follows this — currently ${formatTime(14 * 60 + 5, hour12)} and ${formatTime(8 * 60, hour12)}.`}
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
      </Group>
    </Pane>
  );
}
