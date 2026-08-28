"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { CALC_METHODS } from "@/lib/prayer";

/** Times are only as honest as the settings behind them — so show them. */
export function LocationLine({ className }: { className?: string }) {
  const profile = useStore((s) => s.profile);
  if (!profile) return null;

  const method = CALC_METHODS.find((m) => m.id === profile.calc_method)?.label ?? profile.calc_method;
  const madhab = profile.madhab === "hanafi" ? "Hanafi" : "Shafi'i";

  return (
    <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-ink-3", className)}>
      <MapPin className="size-3.5 shrink-0 text-ink-4" aria-hidden />
      <span className="text-ink-2">{profile.city}</span>
      <span aria-hidden className="text-ink-4">·</span>
      <span>{method}</span>
      <span aria-hidden className="text-ink-4">·</span>
      <span>{madhab} asr</span>
      <Link
        href="/settings"
        className="ml-auto rounded-sm text-accent transition-opacity duration-150 hover:opacity-70"
      >
        Change
      </Link>
    </div>
  );
}
