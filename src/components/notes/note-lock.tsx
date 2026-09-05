"use client";

import * as React from "react";
import { KeyRound, Lock, LockOpen, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Note, NoteVault } from "@/lib/types";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { Field } from "@/components/ui/form";
import { bodyAsHtml } from "./rich-text";
import {
  WrongPassword, createVault, currentVaultPassword, forgetVault, isLegacyLock,
  lockWithVault, rememberLegacy, rememberVault, subscribeToOpenNotes, unlockNote,
  vaultAccepts, vaultOpen,
} from "./note-crypto";

// =========================================================
// One password, asked for once.
//
// Setting it is the dangerous moment, so the dialog says so rather than hiding
// it in a tooltip: there is no reset, no recovery, and no copy of the words
// anywhere else. After that, locking a note is a single click — the whole
// point of a vault is that you stop being asked.
// =========================================================

type FieldWiring = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

const BOX = cn(
  "h-9 w-full rounded-md border border-line bg-transparent px-2.5 text-[13.5px] text-ink",
  "transition-[border-color,box-shadow] duration-150 placeholder:text-ink-4",
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft",
);

/**
 * One password box, and a small fight with the browser.
 *
 * `autocomplete="off"` is ignored on password fields by every engine that
 * ships a password manager, which is how an unlock prompt ends up pre-filled
 * with a saved credential. What they honour is `new-password`; the randomised
 * name leaves a manager nothing stable to match a saved entry against.
 */
function PasswordBox({
  wiring, value, onChange, autoFocus,
}: {
  wiring: FieldWiring;
  value: string;
  onChange: (next: string) => void;
  autoFocus?: boolean;
}) {
  const name = React.useId();
  return (
    <input
      {...wiring}
      type="password"
      name={name}
      autoFocus={autoFocus}
      autoComplete="new-password"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-1p-ignore
      data-lpignore="true"
      data-bwignore="true"
      data-form-type="other"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={BOX}
    />
  );
}

// ---------------------------------------------------------
// The vault record lives on the profile
// ---------------------------------------------------------

export function useVault() {
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);

  const vault = React.useMemo<NoteVault | null>(() => {
    const raw = (profile?.prefs as Record<string, unknown> | undefined)?.note_vault;
    return raw && typeof raw === "object" ? (raw as NoteVault) : null;
  }, [profile?.prefs]);

  const save = React.useCallback((next: NoteVault) => {
    updateProfile({ prefs: { ...(profile?.prefs ?? {}), note_vault: next } });
  }, [profile?.prefs, updateProfile]);

  return { vault, save };
}

/** Re-renders when the vault is opened or closed. */
export function useOpenNotes(): number {
  const [tick, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribeToOpenNotes(bump), []);
  return tick;
}

export { forgetVault, vaultOpen };

// ---------------------------------------------------------
// Asking for the password
// ---------------------------------------------------------

/**
 * One prompt for two jobs, because to the person typing they are the same job.
 *
 * A note still on its own password is opened with it and then quietly re-sealed
 * under the vault, so the second time it is just another note. That migration
 * is the only reason this component writes anything.
 */
export function UnlockDialog({
  note, open, onClose, onUnlocked,
}: {
  note: Note;
  open: boolean;
  onClose: () => void;
  onUnlocked: (html: string) => void;
}) {
  const { vault } = useVault();
  const patch = useStore((s) => s.patch);
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const legacy = isLegacyLock(note);
  const hint = legacy ? note.lock?.hint : vault?.hint;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.lock || busy) return;
    setBusy(true);
    setError(null);
    try {
      const html = await unlockNote(note, password, vault);

      if (legacy) {
        rememberLegacy(note.id, password);
        // It opened, so this really is its password — but the vault is what
        // every other note answers to now. Move it across while we hold the
        // plaintext, and it never asks separately again.
        const held = currentVaultPassword();
        if (vault && held) {
          const sealed = await lockWithVault(html, vault, held);
          patch("notes", note.id, { body: sealed.body, lock: sealed.lock });
        }
      } else {
        rememberVault(password);
      }

      setPassword("");
      onUnlocked(html);
    } catch (err) {
      setError(err instanceof WrongPassword ? err.message : "Could not open this note.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { setPassword(""); setError(null); onClose(); }}
      title={
        <span className="inline-flex items-center gap-2">
          <Lock className="size-3.5 text-ink-3" aria-hidden />
          {note.title?.trim() || "Locked note"}
        </span>
      }
      width={400}
    >
      <form onSubmit={submit} autoComplete="off" data-form-type="other" className="px-4 pb-4 pt-3">
        <Field
          label={legacy ? "This note's own password" : "Your password"}
          error={error ?? undefined}
          description={
            hint ? `Hint: ${hint}`
              : legacy ? "Locked before you set one password for everything."
                : undefined
          }
        >
          {(props) => (
            <PasswordBox
              wiring={props}
              value={password}
              onChange={(v) => { setPassword(v); setError(null); }}
              autoFocus
            />
          )}
        </Field>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!password}>
            <LockOpen className="size-3.5" />
            Open
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------
// Locking
// ---------------------------------------------------------

/**
 * Lock a note with the password already in hand.
 *
 * Returns false when there is nothing in hand — no vault yet, or a vault that
 * has not been opened this session — and the caller should show the dialog.
 *
 * This is a plain action rather than an effect inside the dialog, which is
 * what it was first. An effect whose deps included the note and an inline
 * onClose re-ran on every render, cancelled its own await before it could
 * close, and sealed the same note in a loop — fast enough that the debounced
 * local save never flushed and the lock appeared not to happen at all.
 */
export function useLockNote() {
  const { vault } = useVault();
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  return React.useCallback(async (note: Note): Promise<boolean> => {
    const held = currentVaultPassword();
    if (!vault || !held) return false;
    const sealed = await lockWithVault(bodyAsHtml(note), vault, held);
    patch("notes", note.id, { body: sealed.body, lock: sealed.lock, format: "html" });
    toast({ title: "Note locked", description: "It stays open until you reload." });
    return true;
  }, [vault, patch, toast]);
}

/**
 * Asking for the password, for the two cases that need one:
 *   no vault yet   — set the one password, then lock
 *   vault closed   — type it once to open the vault, then lock
 * A vault that is already open never reaches here; useLockNote handles it.
 */
export function LockDialog({
  note, open, onClose,
}: {
  note: Note;
  open: boolean;
  onClose: () => void;
}) {
  const { vault, save } = useVault();
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  const [password, setPassword] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [hint, setHint] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const creating = !vault;
  const reset = () => { setPassword(""); setAgain(""); setHint(""); setError(null); };

  const sealNote = React.useCallback(async (v: NoteVault, pw: string) => {
    const sealed = await lockWithVault(bodyAsHtml(note), v, pw);
    patch("notes", note.id, { body: sealed.body, lock: sealed.lock, format: "html" });
    rememberVault(pw);
    toast({ title: "Note locked", description: "It stays open until you reload." });
  }, [note, patch, toast]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      if (creating) {
        if (password.length < 6) { setError("Use at least six characters."); return; }
        if (password !== again) { setError("The two do not match."); return; }
        const made = await createVault(password, hint);
        save(made);
        await sealNote(made, password);
      } else {
        if (!(await vaultAccepts(vault, password))) { setError("That is not your password."); return; }
        await sealNote(vault, password);
      }
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not lock this note.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={
        <span className="inline-flex items-center gap-2">
          <KeyRound className="size-3.5 text-ink-3" aria-hidden />
          {creating ? "Set your password" : "Unlock to lock"}
        </span>
      }
      width={420}
    >
      <form onSubmit={submit} autoComplete="off" data-form-type="other" className="px-4 pb-4 pt-3">
        {creating ? (
          <>
            <div className="mb-4 flex gap-2.5 rounded-lg p-3" style={{ background: "var(--warn-soft)" }}>
              <ShieldAlert className="mt-px size-4 shrink-0 text-warn" aria-hidden />
              <p className="text-[12px] leading-relaxed text-ink-2">
                One password for every note you lock, from now on. Each note is
                encrypted in your browser; nobody can read them without it — not
                the database, not the app, not me.{" "}
                <strong className="font-semibold text-ink">There is no way to reset it.</strong>{" "}
                Forget it and every locked note is gone for good.
              </p>
            </div>

            <div className="space-y-3">
              <Field label="Password">
                {(props) => (
                  <PasswordBox
                    wiring={props}
                    value={password}
                    onChange={(v) => { setPassword(v); setError(null); }}
                    autoFocus
                  />
                )}
              </Field>
              <Field label="Type it again" error={error ?? undefined}>
                {(props) => (
                  <PasswordBox
                    wiring={props}
                    value={again}
                    onChange={(v) => { setAgain(v); setError(null); }}
                  />
                )}
              </Field>
              <Field
                label="Hint"
                description="Optional, shown on every unlock prompt. Never put the password in it."
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    className={BOX}
                  />
                )}
              </Field>
            </div>
          </>
        ) : (
          <Field
            label="Your password"
            error={error ?? undefined}
            description={vault?.hint ? `Hint: ${vault.hint}` : "The one you set for locked notes."}
          >
            {(props) => (
              <PasswordBox
                wiring={props}
                value={password}
                onChange={(v) => { setPassword(v); setError(null); }}
                autoFocus
              />
            )}
          </Field>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!password}>
            <Lock className="size-3.5" />
            {creating ? "Set it and lock" : "Lock it"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Take the lock off for good, once the note is already open. */
export function useRemoveLock() {
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  return React.useCallback((note: Note, plainHtml: string) => {
    patch("notes", note.id, { body: plainHtml, lock: null, format: "html" });
    toast({ title: "Lock removed", description: "The note is readable again." });
  }, [patch, toast]);
}
