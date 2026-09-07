"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight, Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle2,
  Sparkles, KeyRound, ChevronLeft,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Button, Input, Spinner } from "@/components/ui/primitives";
import { Field } from "@/components/ui/form";
import { cn } from "@/lib/cn";

type Mode = "signin" | "signup" | "magic" | "reset";

const TITLES: Record<Mode, { title: string; sub: string }> = {
  signin: { title: "Welcome back", sub: "Pick up where the day left off." },
  signup: { title: "Make it yours", sub: "One account, every device." },
  magic: { title: "No password needed", sub: "We'll email you a link that signs you straight in." },
  reset: { title: "Reset your password", sub: "We'll email you a link to set a new one." },
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [mode, setMode] = React.useState<Mode>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [capsOn, setCapsOn] = React.useState(false);
  const [loading, setLoading] = React.useState<null | "email" | "google">(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = React.useState(false);
  const [googleEnabled, setGoogleEnabled] = React.useState(false);

  // Only offer Google if the project actually has the provider turned on —
  // a button that always 400s is worse than no button.
  React.useEffect(() => {
    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.external?.google) setGoogleEnabled(true); })
      .catch(() => { /* offline or blocked — just hide the button */ });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    const oauthError = params.get("error");
    if (oauthError) setError(decodeURIComponent(oauthError));
  }, [params]);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
    setNeedsConfirm(false);
  }

  async function resendConfirmation() {
    setLoading("email");
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    setLoading(null);
    if (error) setError(error.message);
    else {
      setNeedsConfirm(false);
      setNotice("Confirmation sent. Check your inbox, and your spam folder.");
    }
  }

  async function signInWithGoogle() {
    setLoading("google");
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) { setError(error.message); setLoading(null); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading("email");
    setError(null);
    setNotice(null);
    setNeedsConfirm(false);

    const address = email.trim();

    if (mode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      setLoading(null);
      if (error) setError(error.message);
      else setNotice(`Link sent to ${address}. It signs you in for 60 minutes.`);
      return;
    }

    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
      });
      setLoading(null);
      if (error) setError(error.message);
      else setNotice(`Reset link sent to ${address}.`);
      return;
    }

    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: address, password })
        : await supabase.auth.signUp({
          email: address,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });

    if (error) {
      setLoading(null);
      // The one failure with a real fix attached, so give it a button.
      if (error.message.toLowerCase().includes("not confirmed")) {
        setNeedsConfirm(true);
        setError("This address hasn't been confirmed yet.");
      } else {
        setError(error.message);
      }
      return;
    }

    if (mode === "signup" && !data.session) {
      setLoading(null);
      switchMode("signin");
      setNotice("Account created. Confirm it from the email we just sent, then sign in.");
      return;
    }

    router.push(next);
    router.refresh();
  }

  const copy = TITLES[mode];
  const passwordMode = mode === "signin" || mode === "signup";
  const busy = loading !== null;

  return (
    <div className="w-full max-w-[392px]">
      {/* wordmark */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 grid size-11 place-items-center rounded-[14px] bg-ink text-canvas shadow-lg">
          <span className="display-serif text-[22px] leading-none">H</span>
        </div>
        <h1 className="display-serif text-[44px] leading-none tracking-[-0.01em] text-ink">
          Qalamchi
        </h1>
        <p className="mt-3 max-w-[30ch] text-[13.5px] leading-relaxed text-ink-3">
          A calendar that knows what you are actually trying to do.
        </p>
      </div>

      <div className="surface p-6 shadow-lg">
        {mode === "signin" || mode === "signup" ? (
          <div className="mb-5 flex rounded-lg bg-hover p-0.5">
            {([["signin", "Sign in"], ["signup", "Create account"]] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={cn(
                  "h-7 flex-1 rounded-[7px] text-[13px] font-medium cursor-pointer",
                  "transition-[background-color,color,box-shadow] duration-200 ease-[var(--ease-out-apple)]",
                  mode === m
                    ? "bg-raised text-ink shadow-[0_1px_3px_rgba(0,0,0,0.10),0_0_0_0.5px_rgba(0,0,0,0.06)]"
                    : "text-ink-3 hover:text-ink-2",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className="mb-4 -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-[12.5px] text-ink-3 hover:text-ink cursor-pointer transition-colors"
          >
            <ChevronLeft className="size-3.5" />
            Back to sign in
          </button>
        )}

        <div className="mb-5">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{copy.title}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{copy.sub}</p>
        </div>

        {googleEnabled && passwordMode && (
          <>
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={busy}
              className={cn(
                "flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-raised",
                "text-[13.5px] font-medium text-ink cursor-pointer transition-colors",
                "hover:bg-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {loading === "google" ? <Spinner className="size-4" /> : <GoogleMark />}
              Continue with Google
            </button>
            <div className="my-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] uppercase tracking-[0.06em] text-ink-4">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="space-y-3.5">
          <Field label="Email">
            {(wiring) => (
              <div className="relative">
                <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
                <Input
                  {...wiring}
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-9 pl-8"
                />
              </div>
            )}
          </Field>

          {passwordMode && (
            <Field
              label="Password"
              hint={
                mode === "signin" ? (
                  <button
                    type="button"
                    onClick={() => switchMode("reset")}
                    className="text-[11px] text-ink-3 hover:text-accent cursor-pointer transition-colors"
                  >
                    Forgot?
                  </button>
                ) : undefined
              }
              description={mode === "signup" ? "At least 6 characters." : undefined}
            >
              {(wiring) => (
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
                  <Input
                    {...wiring}
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) => setCapsOn(e.getModifierState?.("CapsLock") ?? false)}
                    placeholder="••••••••"
                    className="h-9 pl-8 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-4 hover:text-ink-2 cursor-pointer transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              )}
            </Field>
          )}

          {capsOn && passwordMode && (
            <p className="text-[11.5px] text-ink-3">Caps Lock is on.</p>
          )}

          {error && (
            <div role="alert" className="rounded-md bg-danger-soft px-2.5 py-2">
              <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-danger">
                <AlertCircle className="mt-px size-3.5 shrink-0" />
                {error}
              </p>
              {needsConfirm && (
                <button
                  type="button"
                  onClick={resendConfirmation}
                  className="mt-1.5 ml-5 text-[12px] font-semibold text-danger underline underline-offset-2 cursor-pointer"
                >
                  Resend the confirmation email
                </button>
              )}
            </div>
          )}

          {notice && (
            <p className="flex items-start gap-1.5 rounded-md bg-accent-soft px-2.5 py-2 text-[12.5px] leading-snug text-accent">
              <CheckCircle2 className="mt-px size-3.5 shrink-0" />
              {notice}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" loading={loading === "email"} className="w-full">
            {mode === "signin" && "Sign in"}
            {mode === "signup" && "Create account"}
            {mode === "magic" && "Email me a link"}
            {mode === "reset" && "Send reset link"}
            {!busy && <ArrowRight className="size-4" />}
          </Button>
        </form>

        {mode === "signin" && (
          <button
            type="button"
            onClick={() => switchMode("magic")}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[12.5px] text-ink-3 hover:text-ink cursor-pointer transition-colors"
          >
            <KeyRound className="size-3.5" />
            Sign in without a password
          </button>
        )}
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-4">
        <Sparkles className="size-3" />
        Your data is yours. Row-level security, per account.
      </p>
    </div>
  );
}
