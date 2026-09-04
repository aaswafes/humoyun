"use client";

import * as React from "react";
import { KeyRound, Lock, LockOpen, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { Field } from "@/components/ui/form";
import { bodyAsHtml } from "./rich-text";
import {
  WrongPassword, forgetPassword, isOpen, lockBody, rememberPassword,
  subscribeToOpenNotes, unlockBody,
} from "./note-crypto";

// =========================================================
// The two dialogs a locked note needs, and nothing else.
//
// Setting a password is the dangerous one, so it says so in the dialog rather
// than in a tooltip nobody reads: there is no reset, no recovery and no copy
// of the words anywhere else. Everything else about it is deliberately dull.
// =========================================================

/** What Field hands the control it wraps. */
type FieldWiring = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

const BOX = cn(
  "h-9 w-full rounded-md border border-line bg-transparent px-2.5 text-[13.5px] text-ink",
  "transition-[border-color,box-shadow] duration-150 placeholder:text-ink-4",
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft",
);

/**
 * One password box, and a small fight with the browser.
 *
 * `autocomplete="off"` is ignored on password fields by every engine that
 * ships a password manager — which is how an unlock prompt ended up
 * pre-filled with a saved credential, defeating the point of asking. What
 * they do honour is `new-password`, which says "this is not a login, do not
 * offer what you have saved". The randomised `name` matters as much: a
 * manager matches saved entries by field name, so a name that is different on
 * every mount has nothing to match against.
 *
 * The `data-*` attributes are the opt-outs the popular extensions read.
 * None of this can force a manager to behave — it is the browser's window,
 * not ours — but between them they cover what people actually run.
 */
function PasswordBox({
  wiring, value, onChange, autoFocus,
}: {
  wiring: FieldWiring;
  value: string;
  onChange: (next: string) => void;
  autoFocus?: boolean;
}) {
  // Unique per mount, so there is nothing stable to key a saved entry to.
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

/** Re-renders when a note is unlocked or locked again. */
export function useOpenNotes(): (noteId: string) => boolean {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribeToOpenNotes(bump), []);
  return React.useCallback((noteId: string) => isOpen(noteId), []);
}

// ---------------------------------------------------------
// Unlocking
// ---------------------------------------------------------

export function UnlockDialog({
  note, open, onClose, onUnlocked,
}: {
  note: Note;
  open: boolean;
  onClose: () => void;
  /** the decrypted HTML, handed straight to whoever asked for it */
  onUnlocked: (html: string, password: string) => void;
}) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.lock || busy) return;
    setBusy(true);
    setError(null);
    try {
      const html = await unlockBody(note.body, password, note.lock);
      rememberPassword(note.id, password);
      setPassword("");
      onUnlocked(html, password);
    } catch (err) {
      // Deliberately the same message whatever went wrong: telling someone
      // *how* their guess was wrong is telling them something.
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
          label="Password"
          error={error ?? undefined}
          description={note.lock?.hint ? `Hint: ${note.lock.hint}` : undefined}
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

export function LockDialog({
  note, open, onClose,
}: {
  note: Note;
  open: boolean;
  onClose: () => void;
}) {
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const [password, setPassword] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [hint, setHint] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reset = () => { setPassword(""); setAgain(""); setHint(""); setError(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 4) { setError("Use at least four characters."); return; }
    if (password !== again) { setError("The two do not match."); return; }

    setBusy(true);
    try {
      const { body, lock } = await lockBody(bodyAsHtml(note), password, hint);
      patch("notes", note.id, { body, lock, format: "html" });
      rememberPassword(note.id, password);
      reset();
      onClose();
      toast({
        title: "Note locked",
        description: "It stays open until you reload.",
      });
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
          Lock this note
        </span>
      }
      width={420}
    >
      <form onSubmit={submit} autoComplete="off" data-form-type="other" className="px-4 pb-4 pt-3">
        <div
          className="mb-4 flex gap-2.5 rounded-lg p-3"
          style={{ background: "var(--warn-soft)" }}
        >
          <ShieldAlert className="mt-px size-4 shrink-0 text-warn" aria-hidden />
          <p className="text-[12px] leading-relaxed text-ink-2">
            The note is encrypted in your browser and stored as ciphertext.
            Nobody can read it without this password — not the database, not
            the app, not me. <strong className="font-semibold text-ink">There is no way to reset it.</strong>{" "}
            Forget it and the note is gone for good.
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
            description="Optional, shown on the unlock prompt. Never put the password in it."
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

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button type="submit" size="sm" variant="primary" loading={busy}>
            <Lock className="size-3.5" />
            Lock it
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
    forgetPassword(note.id);
    toast({ title: "Lock removed", description: "The note is readable again." });
  }, [patch, toast]);
}
