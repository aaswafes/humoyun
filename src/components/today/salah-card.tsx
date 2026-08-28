"use client";

import * as React from "react";
import { Check, Clock, Flame, History, Moon, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, prayerStreak } from "@/lib/store";
import { formatTime } from "@/lib/date";
import { prayerTimesFor } from "@/lib/prayer";
import { PRAYER_LABELS, PRAYER_NAMES, type PrayerStatus } from "@/lib/types";
import { RailCard, RailRow } from "./rail-card";

const STATUS_LABEL: Record<PrayerStatus, string> = {
  none: "not logged",
  prayed: "prayed",
  jamaah: "prayed in jamaah",
  late: "prayed late",
  qadha: "qadha",
  missed: "missed",
};

const STATUS_ICON: Record<PrayerStatus, React.ComponentType<{ className?: string }> | null> = {
  none: null,
  prayed: Check,
  jamaah: Users,
  late: Clock,
  qadha: History,
  missed: X,
};

// Jamaah reads as the filled state — the strongest mark on the card.
const STATUS_DOT: Record<PrayerStatus, string> = {
  none: "border border-line-strong",
  prayed: "bg-success-soft text-success",
  jamaah: "bg-success text-canvas",
  late: "bg-warn-soft text-warn",
  qadha: "bg-warn-soft text-warn",
  missed: "bg-danger-soft text-danger",
};

const COUNTED: PrayerStatus[] = ["prayed", "jamaah", "late"];

export function SalahCard({ date, minutesNow }: { date: string; minutesNow: number }) {
  const prayers = useStore((s) => s.prayers);
  const profile = useStore((s) => s.profile);
  const hour12 = useStore((s) => s.hour12);
  const cyclePrayer = useStore((s) => s.cyclePrayer);

  const times = React.useMemo(
    () => prayerTimesFor(date, {
      latitude: profile?.latitude ?? 41.2995,
      longitude: profile?.longitude ?? 69.2401,
      method: profile?.calc_method ?? "MuslimWorldLeague",
      madhab: profile?.madhab ?? "hanafi",
    }),
    [date, profile?.latitude, profile?.longitude, profile?.calc_method, profile?.madhab],
  );

  const today = prayers.filter((p) => p.date === date);
  const logged = today.filter((p) => COUNTED.includes(p.status)).length;
  const streak = prayerStreak(prayers, date);

  return (
    <RailCard
      icon={Moon}
      title="Salah"
      href="/salah"
      hrefLabel="Open Salah"
      accessory={
        <span className="flex items-center gap-2">
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 tnum">
              <Flame className="size-3 text-warn" />
              {streak}
            </span>
          )}
          <span className="text-[11.5px] font-medium text-ink-2 tnum">{logged}/5</span>
        </span>
      }
    >
      {PRAYER_NAMES.map((name) => {
        const status = today.find((p) => p.name === name)?.status ?? "none";
        const at = times[name];
        const Icon = STATUS_ICON[status];
        const pending = status === "none" && at > minutesNow;

        return (
          <RailRow
            key={name}
            onClick={() => cyclePrayer(date, name)}
            ariaLabel={`${PRAYER_LABELS[name]} — ${STATUS_LABEL[status]}. Change status.`}
            ariaPressed={COUNTED.includes(status)}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-[18px] shrink-0 place-items-center rounded-full",
                "transition-[background-color,border-color] duration-150 ease-[var(--ease-out-apple)]",
                STATUS_DOT[status],
              )}
            >
              {Icon && <Icon className="size-2.5 stroke-[3]" />}
            </span>
            <span className={cn("flex-1 text-[13px]", pending ? "text-ink-3" : "text-ink")}>
              {PRAYER_LABELS[name]}
            </span>
            <span className={cn("text-[12px] tnum", pending ? "text-ink-4" : "text-ink-3")}>
              {formatTime(at, hour12)}
            </span>
          </RailRow>
        );
      })}
    </RailCard>
  );
}
