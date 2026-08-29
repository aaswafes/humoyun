"use client";

import * as React from "react";
import { Check, Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { SOLO } from "@/lib/local-db";
import { supabase } from "@/lib/supabase/client";
import { diffDays, formatDate, toISO, todayISO } from "@/lib/date";
import { Button, Input, Progress } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { Callout, FoldGroup, Group, Pane, Row, StaticField } from "./ui";

const AVATAR_PRESETS = ["H", "🌙", "📓", "🕌", "☕", "🏔", "✍️", "🌿"];

const MIN_LENGTH = 8;

interface Strength {
  score: number;        // 0..4
  label: string;
  missing: string[];
}

/** Length first, then variety. The advice is specific, never just "weak". */
function measure(password: string): Strength {
  const missing: string[] = [];
  if (password.length < 12) missing.push("twelve characters or more");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) missing.push("both cases");
  if (!/\d/.test(password)) missing.push("a number");
  if (!/[^A-Za-z0-9]/.test(password)) missing.push("a symbol");

  let score = 0;
  if (password.length >= MIN_LENGTH) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password) && password.length >= 12) score++;

  const label = ["Too short", "Weak", "Fair", "Good", "Strong"][score] ?? "Weak";
  return { score, label, missing };
}

function PasswordForm({ email }: { email: string | null }) {
  const toast = useStore((s) => s.toast);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [visible, setVisible] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const strength = measure(password);
  const local = (email ?? "").split("@")[0].toLowerCase();

  const passwordError =
    !touched || !password ? null
      : password.length < MIN_LENGTH ? `Use at least ${MIN_LENGTH} characters.`
        : local.length > 2 && password.toLowerCase().includes(local) ? "Do not put your email address in your password."
          : null;

  const confirmError = touched && confirm && confirm !== password ? "The two passwords do not match." : null;
  const ready = password.length >= MIN_LENGTH && confirm === password && !passwordError && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (!ready) return;

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setServerError(error.message);
      return;
    }
    setPassword("");
    setConfirm("");
    setTouched(false);
    setVisible(false);
    toast({ title: "Password changed", description: "Use the new one next time you sign in.", tone: "success" });
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid gap-3.5 sm:max-w-[340px]">
        <Field
          label="New password"
          error={passwordError ?? serverError}
          description={password ? undefined : `At least ${MIN_LENGTH} characters. Longer beats clever.`}
        >
          {(wiring) => (
            <div className="relative">
              <Input
                {...wiring}
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setServerError(null); }}
                onBlur={() => setTouched(true)}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Hide password" : "Show password"}
                className={cn(
                  "absolute right-0 top-0 grid h-8 w-9 cursor-pointer place-items-center rounded-r-md",
                  "text-ink-3 transition-colors hover:text-ink",
                )}
              >
                {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          )}
        </Field>

        {password.length > 0 && (
          <div className="-mt-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11.5px] font-medium text-ink-2">{strength.label}</span>
              {strength.missing.length > 0 && (
                <span className="truncate text-[11.5px] text-ink-4">
                  add {strength.missing.slice(0, 2).join(", ")}
                </span>
              )}
            </div>
            <Progress value={strength.score} max={4} height={3} className="mt-1.5" />
          </div>
        )}

        <Field label="Repeat it" error={confirmError}>
          {(wiring) => (
            <Input
              {...wiring}
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setTouched(true)}
            />
          )}
        </Field>

        <div>
          <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!ready}>
            <KeyRound className="size-3.5" />
            Change password
          </Button>
        </div>
      </div>
    </form>
  );
}

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

  // A UTC timestamp sliced to ten characters is a UTC calendar date; east of
  // Greenwich that reads a day early, so it goes through the local-date helper.
  const createdISO = profile?.created_at ? toISO(new Date(profile.created_at)) : null;
  const daysHere = createdISO ? Math.max(0, diffDays(todayISO(), createdISO)) : 0;

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

  function commitAvatar(raw: string) {
    const next = raw.trim().slice(0, 2);
    setAvatarDraft(next);
    if (next === avatar) return;
    updateProfile({ avatar: next || null });
    flashSaved();
  }

  return (
    <Pane
      title="Account"
      description="Who this workspace belongs to, and the key that opens it. Your name shows on the account chip in the sidebar."
    >
      <div className="mb-6 flex items-center gap-3.5 rounded-lg bg-sunken px-4 py-3.5">
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

      <Group title="Profile">
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
          <StaticField icon={Lock}>{email ?? "—"}</StaticField>
        </Row>

        <Row
          label="Avatar"
          hint="One or two characters — a letter or an emoji. Leave it empty to fall back to the first letter of your name."
          stacked
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={avatarDraft}
              aria-label="Avatar initial"
              maxLength={2}
              placeholder={(displayName.trim() || "H").charAt(0).toUpperCase()}
              onChange={(e) => setAvatarDraft(e.target.value)}
              onBlur={(e) => commitAvatar(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="w-[64px] shrink-0 text-center"
            />
            <div className="flex flex-wrap gap-1">
              {AVATAR_PRESETS.map((p) => {
                const active = avatarDraft.trim() === p;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Use ${p} as the avatar`}
                    onClick={() => commitAvatar(p)}
                    className={cn(
                      "grid size-8 cursor-pointer place-items-center rounded-md text-[15px] leading-none",
                      "transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)] active:scale-[0.94]",
                      active ? "bg-accent-soft text-accent ring-1 ring-accent-line" : "bg-hover text-ink-2 hover:bg-active",
                    )}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        </Row>

        {createdISO && (
          <Row
            label="Member since"
            hint={daysHere > 0 ? `${daysHere} days of your life in here so far.` : "Day one."}
          >
            <span className="text-[13px] text-ink-2 tnum">{formatDate(createdISO, { year: true })}</span>
          </Row>
        )}
      </Group>

      <FoldGroup
        title="Security"
        storageKey="humoyun.settings.securityOpen"
        summary={SOLO ? "No password on a local preview" : email ? "Change your password" : "Sign in to change your password"}
        description="Changing this signs you back in everywhere with the new password. Nothing else about the account moves."
      >
        {SOLO ? (
          <Callout tone="info" title="This is a local preview" className="mt-1">
            Everything lives in this browser and there is no account to hold a password. Connect Supabase
            and sign in, and the change-password control appears here.
          </Callout>
        ) : email ? (
          <div className="pt-1">
            <PasswordForm email={email} />
          </div>
        ) : (
          <Callout tone="warn" title="Not signed in" className="mt-1">
            The password can only be changed while you are signed in. Sign in, then come back to this pane.
          </Callout>
        )}
      </FoldGroup>
    </Pane>
  );
}
