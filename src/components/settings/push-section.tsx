"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { SOLO } from "@/lib/local-db";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { Spinner } from "@/components/ui/primitives";
import { Callout, Pane, ToggleRow } from "./ui";

// =========================================================
// Push, per browser.
//
// This is a property of the device you are standing at, not of the account:
// turning it on here subscribes this browser and leaves your phone alone.
// That is why the copy talks about "this browser" throughout — a single
// account-wide switch would be a lie about how the Push API works.
// =========================================================

export function PushSection() {
  const userId = useStore((s) => s.userId);
  const toast = useStore((s) => s.toast);

  const [state, setState] = React.useState<PushState | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { void pushState().then(setState); }, []);

  async function toggle(next: boolean) {
    if (!userId) return;
    setBusy(true);
    const result = next ? await enablePush(userId) : await disablePush();
    setState(result);
    setBusy(false);

    if (next && result === "on") toast({ title: "Push is on for this browser", tone: "success" });
    else if (next && result === "denied") {
      toast({
        title: "Notifications are blocked",
        description: "Your browser is refusing them for this site. Allow them in the address bar, then try again.",
        tone: "danger",
      });
    } else if (!next && result === "off") toast({ title: "Push is off for this browser" });
  }

  if (SOLO) return null;

  return (
    <Pane
      title="Push"
      description="Reminders that arrive with Humoyun closed. Everything on the pane above only fires while a tab is open — this is what makes a prayer or a deadline reach you when it is not."
    >
      {state === null ? (
        <div className="flex items-center gap-2 py-4 text-[13px] text-ink-3"><Spinner /> Checking…</div>
      ) : state === "unsupported" ? (
        <Callout tone="info" title="This browser cannot do push">
          Push needs a service worker and the Push API. Safari supports it only for a site
          you have added to your Home Screen or Dock.
        </Callout>
      ) : state === "unconfigured" ? (
        <Callout tone="warn" title="Server keys not set yet">
          Push needs a VAPID key pair. Set <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> for the
          app and <code>VAPID_PRIVATE_KEY</code> on the sender, then reload this page.
        </Callout>
      ) : state === "denied" ? (
        <Callout tone="warn" title="Blocked by the browser">
          Notifications are turned off for this site, so Humoyun cannot ask again. Allow them
          from the padlock in the address bar, then reload.
        </Callout>
      ) : (
        <>
          <ToggleRow
            checked={state === "on"}
            onChange={(next) => void toggle(next)}
            label="Send push to this browser"
            description={
              busy
                ? "Working…"
                : state === "on"
                  ? "This browser is subscribed. Other devices you sign in on each need their own switch."
                  : "You will be asked for permission once."
            }
          />
          {/* Registration is production-only, so say so rather than let a dev
              build look broken. */}
          {process.env.NODE_ENV !== "production" && (
            <Callout tone="info" title="Development build" className="mt-4">
              The service worker only registers in a production build, so this switch will not
              stick while <code>next dev</code> is running.
            </Callout>
          )}
        </>
      )}
    </Pane>
  );
}
