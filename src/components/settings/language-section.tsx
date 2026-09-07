"use client";

import * as React from "react";
import { Check, Languages } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { LANGUAGES, useT } from "@/lib/i18n";
import type { Lang } from "@/lib/customize";
import { Callout, Pane, Row } from "./ui";

// =========================================================
// Language.
//
// The choice rides in the same `prefs.ui` blob as everything else in
// Appearance, so it is saved the same way and restored before first paint by
// the same boot script. Changing it re-renders from the store — there is no
// reload, and no route prefix.
// =========================================================

export function LanguageSection() {
  const setAppearance = useStore((s) => s.setAppearance);
  const { t, lang } = useT();

  return (
    <Pane title={t("language.title")} description={t("language.hint")}>
      <Row label={t("language.title")} stacked>
        <div role="radiogroup" aria-label={t("language.title")} className="flex flex-wrap gap-2">
          {LANGUAGES.map((option) => {
            const active = option.value === lang;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setAppearance({ lang: option.value as Lang })}
                className={cn(
                  "flex min-w-[150px] items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left cursor-pointer",
                  "transition-colors duration-150",
                  active
                    ? "border-accent-line bg-accent-soft"
                    : "border-line hover:bg-hover",
                )}
              >
                <Languages className={cn("size-4 shrink-0", active ? "text-accent" : "text-ink-3")} aria-hidden />
                <span className="min-w-0 flex-1">
                  {/* The native name leads: someone looking for their own
                      language should not have to read English to find it. */}
                  <span className="block text-[13.5px] font-medium text-ink">{option.native}</span>
                  <span className="block text-[12px] text-ink-3">{option.label}</span>
                </span>
                {active && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
              </button>
            );
          })}
        </div>
      </Row>

      {lang === "uz" && (
        <Callout tone="info" title="Tarjima davom etmoqda" className="mt-5">
          {t("language.partial")}
        </Callout>
      )}
    </Pane>
  );
}
