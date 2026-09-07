import * as React from "react";
import type { Metadata } from "next";
import { LoginCard } from "./login-card";

export const metadata: Metadata = {
  title: "Sign in · Qalamchi",
  description: "A calendar that knows what you are actually trying to do.",
};

export default function LoginPage() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-5 py-12">
      {/* A calendar grid, barely there — the product's own motif rather than
          decoration borrowed from somewhere else. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
          backgroundSize: "112px 112px",
          maskImage: "radial-gradient(ellipse 90% 70% at 50% 42%, black 20%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 42%, black 20%, transparent 78%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 size-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.06]"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 65%)" }}
      />

      <div className="relative">
        <React.Suspense
          fallback={<div className="h-[520px] w-[392px] rounded-xl skeleton" />}
        >
          <LoginCard />
        </React.Suspense>
      </div>
    </main>
  );
}
