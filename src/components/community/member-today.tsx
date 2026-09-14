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
 * Soft background, strong text — never a white letter on a status colour.
 *
 * `--success`/`--warn`/`--danger` are dark in the light theme and LIGHT in the
 * dark one, so white-on-colour is legible in exactly one of them. Pairing each
 * soft fill with its own strong ink is the same trick `bg-accent-soft
 * text-accent` uses everywhere else, and it is correct in both themes by
 * construction rather than by being checked.
 *
 * Colour never carries the state alone: the prayer's initial is always drawn,
 * the count is stated, and the tooltip and the text alternative name every
 * status in words.
 */
const PRAYER_TONE: Record<PrayerStatus, string> = {
  none:   "bg-hover text-ink-4",
  prayed: "bg-[var(--success-soft)] text-success",
  jamaah: "bg-[var(--success-soft)] text-success ring-1 ring-[var(--success)]",
  late:   "bg-[var(--warn-soft)] text-warn",
  qadha:  "bg-[var(--warn-soft)] text-warn",
  missed: "bg-[var(--danger-soft)] text-danger",
};

const PRAYER_WORD: Record<PrayerStatus, string> = {
  none: "not logged",
  prayed: "prayed",
  jamaah: "in jamaah",
  late: "late",
  qadha: "qadha",
  missed: "missed",
};

/**
 * The salah track, named.
 *
 * This was five 7px dots and nothing else, and the first thing its owner asked
 * on seeing it was "where are the salah tracks?" — which is the whole review.
 * Each prayer now carries its initial, the count is stated, and the tooltip and
 * the text alternative still spell out every status in full. A track nobody can
 * find is not a track.
 */
export function SalahStrip({ salah, compact }: { salah: FeedMember["salah"]; compact?: boolean }) {
  const describedBy = React.useId();
  if (!salah) return null;

  const byName = new Map(salah.map((p) => [p.name, p.status]));
  const done = PRAYER_NAMES.filter((n) => {
    const st = byName.get(n);
    return st && st !== "none" && st !== "missed";
  }).length;

  const summary = PRAYER_NAMES
    .map((n) => `${PRAYER_LABELS[n]} ${PRAYER_WORD[byName.get(n) ?? "none"]}`)
    .join(", ");

  return (
    <div className="flex items-center gap-2" aria-describedby={describedBy}>
      <div className="flex items-center gap-1">
        {PRAYER_NAMES.map((name) => {
          const status = byName.get(name) ?? "none";
          return (
            <span
              key={name}
              title={`${PRAYER_LABELS[name]} — ${PRAYER_WORD[status]}`}
              className={cn(
                "grid h-[19px] min-w-[19px] place-items-center rounded-full px-1",
                "text-[10.5px] font-semibold leading-none",
                PRAYER_TONE[status],
              )}
            >
              {PRAYER_LABELS[name].charAt(0)}
            </span>
          );
        })}
      </div>
      {!compact && (
        <span className="text-[11.5px] text-ink-3 tnum">{done}/5</span>
      )}
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
          <SalahStrip salah={member.salah} />
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
