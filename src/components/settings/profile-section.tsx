"use client";

import * as React from "react";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/date";
import { Input } from "@/components/ui/primitives";
import { Pane, Row } from "./ui";

export function ProfileSection() {
  const profile = useStore((s) => s.profile);
  const email = useStore((s) => s.email);
  const updateProfile = useStore((s) => s.updateProfile);

  const displayName = profile?.display_name ?? "";
  const avatar = profile?.avatar ?? "";

  // Seeded once: this pane is the only writer, and it remounts on every visit.
  const [nameDraft, setNameDraft] = React.useState(displayName);
  const [avatarDraft, setAvatarDraft] = React.useState(avatar);
  const [saved, setSaved] = React.useState(false);

  const initial = (avatarDraft.trim() || nameDraft.trim() || "H").slice(0, 2);

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }

  function commitName() {
    const next = nameDraft.trim();
    if (!next) { setNameDraft(displayName); return; }
    if (next === displayName) return;
    updateProfile({ display_name: next });
    flashSaved();
  }

  function commitAvatar() {
    const next = avatarDraft.trim().slice(0, 2);
    setAvatarDraft(next);
    if (next === avatar) return;
    updateProfile({ avatar: next || null });
    flashSaved();
  }

  return (
    <Pane
      title="Profile"
      description="Who this workspace belongs to. Your name shows on the account chip in the sidebar."
    >
      <div className="mb-5 flex items-center gap-3.5 rounded-lg border border-line bg-sunken px-4 py-3.5">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-canvas">
          <span className="display-serif text-[22px] leading-none">{initial.toUpperCase()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-tight text-ink">
            {nameDraft.trim() || "Unnamed"}
          </p>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{email ?? "Not signed in"}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[11.5px] font-medium text-success",
            "transition-opacity duration-200 ease-[var(--ease-out-apple)]",
            saved ? "opacity-100" : "opacity-0",
          )}
        >
          <Check className="size-3.5" />
          Saved
        </span>
      </div>

      <Row label="Display name" hint="Used in the sidebar and on your weekly review.">
        <Input
          value={nameDraft}
          aria-label="Display name"
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="w-[236px]"
        />
      </Row>

      <Row label="Email" hint="This is your sign-in address and cannot be changed here.">
        <div
          className={cn(
            "flex h-8 w-[236px] items-center gap-2 rounded-md border border-line bg-hover px-2.5",
            "text-[13px] text-ink-2",
          )}
        >
          <Lock className="size-3.5 shrink-0 text-ink-4" />
          <span className="truncate">{email ?? "—"}</span>
        </div>
      </Row>

      <Row
        label="Avatar initial"
        hint="One or two characters — a letter or an emoji. Leave it empty to use the first letter of your display name."
      >
        <Input
          value={avatarDraft}
          aria-label="Avatar initial"
          maxLength={2}
          placeholder={(displayName.trim() || "H").charAt(0).toUpperCase()}
          onChange={(e) => setAvatarDraft(e.target.value)}
          onBlur={commitAvatar}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className="w-[64px] text-center"
        />
      </Row>

      {profile?.created_at && (
        <Row label="Member since" hint="The day this workspace was created.">
          <span className="text-[13px] text-ink-2 tnum">
            {formatDate(profile.created_at.slice(0, 10), { year: true })}
          </span>
        </Row>
      )}
    </Pane>
  );
}
