"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Mail, Lock, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

type Mode = "signin" | "signup";

function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [mode, setMode] = React.useState<Mode>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const fn = mode === "signin" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn({ email: email.trim(), password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    if (mode === "signup" && !data.session) {
      setNotice("Check your email to confirm the account, then sign in.");
      setMode("signin");
      setLoading(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="w-full max-w-[380px]">
      {/* Wordmark */}
      <div className="mb-9 text-center">
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-ink text-canvas shadow-lg">
          <span className="display-serif text-[22px] leading-none">H</span>
        </div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
          Humoyun
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-3">
          A calendar that knows what you are
          <br />
          <span className="display-serif text-[15px] text-ink-2">actually trying to do.</span>
        </p>
      </div>

      <form onSubmit={submit} className="surface p-5 shadow-md">
        <div className="mb-4 flex rounded-lg bg-hover p-0.5">
          {(["signin", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={cn(
                "h-7 flex-1 rounded-[7px] text-[13px] font-medium cursor-pointer transition-all duration-200",
                mode === m
                  ? "bg-raised text-ink shadow-[0_1px_3px_rgba(0,0,0,0.10),0_0_0_0.5px_rgba(0,0,0,0.06)]"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <label className="mb-1.5 block text-[12px] font-medium text-ink-2" htmlFor="email">
          Email
        </label>
        <div className="relative mb-3">
          <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-9 pl-8"
          />
        </div>

        <label className="mb-1.5 block text-[12px] font-medium text-ink-2" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="h-9 pl-8"
          />
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-md bg-danger-soft px-2.5 py-2 text-[12.5px] leading-snug text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 rounded-md bg-accent-soft px-2.5 py-2 text-[12.5px] leading-snug text-accent">
            {notice}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-4 w-full">
          {mode === "signin" ? "Sign in" : "Create account"}
          {!loading && <ArrowRight className="size-4" />}
        </Button>
      </form>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[12px] text-ink-4">
        <Sparkles className="size-3" />
        Your data is yours. Row-level security, per account.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-sunken px-5 py-10">
      {/* soft depth, no gradients shouting */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 size-[620px] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 62%)" }}
      />
      <React.Suspense fallback={null}>
        <LoginCard />
      </React.Suspense>
    </main>
  );
}
