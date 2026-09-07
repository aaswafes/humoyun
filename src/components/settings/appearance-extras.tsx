"use client";

import * as React from "react";
import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { accentReadable, isHex } from "@/lib/color";
import {
  DEFAULT_APPEARANCE, DISPLAY_FONTS, MONO_FONTS, PALETTE_LABELS, SANS_FONTS,
  TINT_SET_LABELS, resolveDark,
  type DisplayFont, type MonoFont, type MotionPref, type Palette,
  type SansFont, type TintSet,
} from "@/lib/customize";
import { TINTS } from "@/lib/types";
import { Button, Segmented } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Select } from "@/components/ui/form";
import { Group, Row } from "./ui";
import { Slider } from "./slider";

// =========================================================
// Everything about the look that is not theme or accent.
//
// Every control writes through `setAppearance`, which paints the document
// immediately and saves in the background — so each one is its own preview.
// There is no Apply button because there is nothing to apply.
// =========================================================

function useAppearance() {
  const profile = useStore((s) => s.profile);
  const setAppearance = useStore((s) => s.setAppearance);
  const appearance = useStore((s) => s.appearance);
  // `profile` is in the deps so this recomputes when a setting is saved.
  const current = React.useMemo(() => appearance(), [appearance, profile]);
  return { a: current, set: setAppearance };
}

/** Two stacked bars showing what a palette does to canvas and sunken. */
function PaletteSwatch({ palette, dark }: { palette: Palette; dark: boolean }) {
  return (
    <span
      data-palette={palette}
      className={cn("flex h-7 w-11 shrink-0 overflow-hidden rounded-md border border-line", dark && "dark")}
    >
      <span className="flex-1 bg-canvas" />
      <span className="w-1/3 bg-sunken" />
      <span className="w-1.5 bg-ink" />
    </span>
  );
}

export function AppearanceExtras() {
  const { a, set } = useAppearance();
  const { t } = useT();
  const [resetOpen, setResetOpen] = React.useState(false);
  const dark = resolveDark(a.theme);

  const customAccent = isHex(a.accent);
  const readable = !customAccent || accentReadable(a.accent, dark);

  const palettes = Object.keys(PALETTE_LABELS) as Palette[];

  return (
    <>
      {/* ---------------- surfaces ---------------- */}
      <Group title={t("appearance.palette")} description={t("appearance.paletteHint")}>
        <Row label={t("appearance.palette")} stacked>
          <div role="radiogroup" aria-label={t("appearance.palette")} className="flex flex-wrap gap-2">
            {palettes.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={a.palette === p}
                onClick={() => set({ palette: p })}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[12.5px] cursor-pointer",
                  "transition-colors duration-150",
                  a.palette === p
                    ? "border-accent-line bg-accent-soft text-ink"
                    : "border-line text-ink-2 hover:bg-hover hover:text-ink",
                )}
              >
                <PaletteSwatch palette={p} dark={dark} />
                {PALETTE_LABELS[p]}
                {a.palette === p && <Check className="size-3.5 text-accent" aria-hidden />}
              </button>
            ))}
          </div>
        </Row>
      </Group>

      {/* ---------------- custom accent ---------------- */}
      <Group title={t("appearance.accentCustom")} description={t("appearance.accentHint")}>
        <Row
          label={t("appearance.accentCustom")}
          hint={
            !readable
              ? <span className="text-warn">{t("appearance.accentUnreadable")}</span>
              : customAccent ? a.accent.toUpperCase() : undefined
          }
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t("appearance.accentCustom")}
              value={customAccent ? a.accent : "#0071e3"}
              onChange={(e) => set({ accent: e.target.value })}
              className="size-8 shrink-0 cursor-pointer rounded-md border border-line bg-raised p-0.5"
            />
            {customAccent && (
              <Button variant="ghost" size="sm" onClick={() => set({ accent: "blue" })}>
                {t("action.reset")}
              </Button>
            )}
          </div>
        </Row>
      </Group>

      {/* ---------------- typefaces ---------------- */}
      <Group title={t("appearance.fonts")}>
        <Row label={t("appearance.fontBody")} stacked>
          <div className="flex flex-col gap-2">
            <Select<SansFont>
              value={a.sans}
              onChange={(sans) => set({ sans })}
              label={t("appearance.fontBody")}
              options={(Object.keys(SANS_FONTS) as SansFont[]).map((k) => ({
                value: k, label: SANS_FONTS[k].label,
              }))}
              className="max-w-[280px]"
            />
            {/* The specimen is set in the chosen face, so the menu is not the
                only way to tell what you picked. */}
            <p
              className="text-[15px] leading-snug text-ink-2"
              style={{ fontFamily: SANS_FONTS[a.sans].stack }}
            >
              Bugun — oʻqish, gʻayrat, 0123456789
            </p>
          </div>
        </Row>

        <Row label={t("appearance.fontDisplay")} stacked>
          <div className="flex flex-col gap-2">
            <Select<DisplayFont>
              value={a.display}
              onChange={(display) => set({ display })}
              label={t("appearance.fontDisplay")}
              options={(Object.keys(DISPLAY_FONTS) as DisplayFont[]).map((k) => ({
                value: k, label: DISPLAY_FONTS[k].label,
              }))}
              className="max-w-[280px]"
            />
            <p
              className="text-[32px] leading-none text-ink"
              style={{
                fontFamily: DISPLAY_FONTS[a.display].stack,
                fontStyle: DISPLAY_FONTS[a.display].italic ? "italic" : "normal",
              }}
            >
              27 September
            </p>
          </div>
        </Row>

        <Row label={t("appearance.fontMono")}>
          <Select<MonoFont>
            value={a.mono}
            onChange={(mono) => set({ mono })}
            label={t("appearance.fontMono")}
            options={(Object.keys(MONO_FONTS) as MonoFont[]).map((k) => ({
              value: k, label: MONO_FONTS[k].label,
            }))}
            className="w-[200px]"
          />
        </Row>

        <Row
          label={t("appearance.serifNumerals")}
          hint={t("appearance.serifNumeralsHint")}
        >
          <Segmented<"on" | "off">
            value={a.serifNumerals ? "on" : "off"}
            onChange={(v) => set({ serifNumerals: v === "on" })}
            size="sm"
            options={[
              { value: "on", label: t("misc.on") },
              { value: "off", label: t("misc.off") },
            ]}
          />
        </Row>
      </Group>

      {/* ---------------- shape and size ---------------- */}
      <Group title={`${t("appearance.scale")} · ${t("appearance.radius")}`}>
        <Row label={t("appearance.scale")} stacked>
          <Slider
            label={t("appearance.scale")}
            value={a.scale} min={0.85} max={1.3} step={0.05}
            onChange={(scale) => set({ scale })}
            minLabel={t("appearance.small")}
            maxLabel={t("appearance.large")}
            format={(v) => `${Math.round(v * 100)}%`}
            className="max-w-[340px]"
          />
        </Row>

        <Row label={t("appearance.radius")} stacked>
          <Slider
            label={t("appearance.radius")}
            value={a.radius} min={0} max={1.6} step={0.1}
            onChange={(radius) => set({ radius })}
            minLabel={t("appearance.sharp")}
            maxLabel={t("appearance.round")}
            format={(v) => `${Math.round(13 * v)}px`}
            className="max-w-[340px]"
          />
        </Row>

        <Row label={t("appearance.iconStroke")} stacked>
          <Slider
            label={t("appearance.iconStroke")}
            value={a.iconStroke} min={1} max={2.5} step={0.25}
            onChange={(iconStroke) => set({ iconStroke })}
            minLabel={t("appearance.light")}
            maxLabel={t("appearance.heavy")}
            format={(v) => v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}
            className="max-w-[340px]"
          />
        </Row>

        <Row label={t("appearance.sidebarWidth")} stacked>
          <Slider
            label={t("appearance.sidebarWidth")}
            value={a.sidebarWidth} min={200} max={380} step={4}
            onChange={(sidebarWidth) => set({ sidebarWidth })}
            minLabel={t("appearance.narrow")}
            maxLabel={t("appearance.wide")}
            format={(v) => `${v}px`}
            className="max-w-[340px]"
          />
        </Row>
      </Group>

      {/* ---------------- motion + tints ---------------- */}
      <Group title={t("appearance.motion")} description={t("appearance.motionHint")}>
        <Row label={t("appearance.motion")}>
          <Segmented<MotionPref>
            value={a.motion}
            onChange={(motion) => set({ motion })}
            size="sm"
            options={[
              { value: "full", label: t("appearance.motion.full") },
              { value: "calm", label: t("appearance.motion.calm") },
              { value: "none", label: t("appearance.motion.none") },
            ]}
          />
        </Row>
      </Group>

      <Group title={t("appearance.tints")} description={t("appearance.tintsHint")}>
        <Row label={t("appearance.tints")} stacked>
          <div className="flex flex-col gap-3">
            <Segmented<TintSet>
              value={a.tints}
              onChange={(tints) => set({ tints })}
              size="sm"
              options={(Object.keys(TINT_SET_LABELS) as TintSet[]).map((k) => ({
                value: k, label: TINT_SET_LABELS[k],
              }))}
            />
            <div className="flex flex-wrap gap-1.5">
              {TINTS.map((tint) => (
                <span
                  key={tint}
                  title={tint}
                  className={`tint-${tint} size-6 rounded-md bg-[var(--tint)]`}
                />
              ))}
            </div>
          </div>
        </Row>
      </Group>

      {/* ---------------- reset ---------------- */}
      <Group title={t("appearance.resetAll")}>
        <Row label={t("appearance.resetAll")}>
          <Button variant="secondary" size="sm" onClick={() => setResetOpen(true)}>
            <RotateCcw className="size-3.5" />
            {t("action.reset")}
          </Button>
        </Row>
      </Group>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        // Language is deliberately not reset — it is not a look, and someone
        // resetting their theme has not asked to read English again.
        onConfirm={() => set({ ...DEFAULT_APPEARANCE, lang: a.lang })}
        title={t("appearance.resetAll")}
        description={t("appearance.resetConfirm")}
        confirmLabel={t("action.reset")}
      />
    </>
  );
}
