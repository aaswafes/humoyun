"use client";

import * as React from "react";
import { EyeOff, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { PRAYER_LABELS, PRAYER_NAMES, type PrayerStatus } from "@/lib/types";
import { Ring } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import type { FeedMember } from "./community-types";

/**
 * `profile.avatar` is one or two characters — a letter or an emoji — not a URL.
 * Settings says so and only ever writes that, so this draws text, and falls
 * back to the first letter of the name the way the sidebar does.
 */
export function Avatar({ member, size = 28 }: { member: FeedMember; size?: number }) {
  const mark = member.avatar?.trim() || (member.display_name || "?").charAt(0).toUpperCase();
  return (
    <div
      className="grid shrink-0 place-items-center rounded-[8px] bg-ink text-canvas"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="display-serif leading-none" style={{ fontSize: size * 0.46 }}>{mark}</span>
    </div>
  );
}

/**
 * Status is never carried by colour alone here: a prayed dot is filled, a
 * jamaah dot is filled with a ring, and the text alternative spells all five
 * out for anyone who cannot see either.
 */
const PRAYER_TONE: Record<PrayerStatus, string> = {
  none: "bg-hover",
  prayed: "bg-[var(--success)]",
  jamaah: "bg-[var(--success)] ring-2 ring-[var(--success-soft)]",
  late: "bg-[var(--warn)]",
  qadha: "bg-[var(--warn)] opacity-70",
  missed: "bg-[var(--danger)]",
};

const PRAYER_WORD: Record<PrayerStatus, string> = {
  none: "not logged",
  prayed: "prayed",
  jamaah: "in jamaah",
  late: "late",
  qadha: "qadha",
  missed: "missed",
};

export function SalahDots({ salah }: { salah: FeedMember["salah"] }) {
  const describedBy = React.useId();
  if (!salah) return null;

  const byName = new Map(salah.map((p) => [p.name, p.status]));
  const summary = PRAYER_NAMES
    .map((n) => `${PRAYER_LABELS[n]} ${PRAYER_WORD[byName.get(n) ?? "none"]}`)
    .join(", ");

  return (
    <div className="flex items-center gap-1" aria-describedby={describedBy}>
      {PRAYER_NAMES.map((name) => {
        const status = byName.get(name) ?? "none";
        return (
          <span
            key={name}
            title={`${PRAYER_LABELS[name]} — ${PRAYER_WORD[status]}`}
            className={cn("size-[7px] rounded-full", PRAYER_TONE[status])}
          />
        );
      })}
      <VisuallyHidden id={describedBy}>{summary}</VisuallyHidden>
    </div>
  );
}

/**
 * One member's today.
 *
 * A member who shares nothing still gets a row. Hiding them would make a real
 * community look empty, and "not sharing" is information — it is the
 * difference between a quiet day and a private one, which is exactly the
 * distinction a null plan carries and an empty one does not.
 */
export function MemberRow({ member }: { member: FeedMember }) {
  const plan = member.plan;
  const done = plan?.filter((t) => t.status === "done").length ?? 0;
  const total = plan?.length ?? 0;

  return (
    <div className="flex gap-3 py-3.5">
      <Avatar member={member} size={30} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[13.5px] font-medium leading-tight text-ink">
            {member.is_self ? "You" : member.display_name}
          </p>
          {member.role === "owner" && (
            <span className="text-[10.5px] uppercase tracking-[0.06em] text-ink-4">Owner</span>
          )}
          <div className="flex-1" />
          <SalahDots salah={member.salah} />
        </div>

        {plan === null ? (
          <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-4">
            <EyeOff className="size-3.5" />
            Not sharing a plan
          </p>
        ) : total === 0 ? (
          <p className="mt-1 text-[12.5px] text-ink-4">Nothing planned today</p>
        ) : (
          <>
            <div className="mt-1 flex items-center gap-2">
              <Ring value={done} max={total} size={15} stroke={2.5} />
              <p className="text-[12.5px] text-ink-3 tnum">{done} of {total} done</p>
            </div>
            <ul className="mt-1.5 space-y-1">
              {plan.map((task, i) => (
                <li key={`${task.title}-${i}`} className="flex items-start gap-1.5 text-[12.5px] leading-snug">
                  <span className="mt-[3px] grid size-3 shrink-0 place-items-center">
                    {task.status === "done"
                      ? <Check className="size-3 text-ink-4" />
                      : <span className="size-[5px] rounded-full bg-hover" />}
                  </span>
                  <span className={cn("min-w-0", task.status === "done" ? "text-ink-4 line-through" : "text-ink-2")}>
                    {task.title}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {member.is_self && !member.shares_plan && (
          <p className="mt-1.5 text-[11.5px] text-ink-4">Only you can see this — your plan switch is off.</p>
        )}
      </div>
    </div>
  );
}
