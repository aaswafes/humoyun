"use client";

import * as React from "react";
import { CloudOff } from "lucide-react";
import { useT } from "@/lib/i18n";

// =========================================================
// The service worker registration, and the one piece of UI it needs.
//
// Registration is production-only on purpose: a worker caching hashed dev
// chunks turns "I edited a file and nothing changed" into a mystery, and
// there is nothing to gain from it while `next dev` is running.
//
// The bar appears only while the browser says it is offline. Qalamchi still
// opens and still shows everything already loaded, but a write cannot reach
// Supabase — so the bar says exactly that rather than letting a save fail
// with a toast that reads like a bug.
// =========================================================

export function OfflineBar() {
  const [offline, setOffline] = React.useState(false);
  const { t } = useT();

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // After load, so registration never competes with the first paint.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // An unavailable worker costs the app nothing — it just stays online-only.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  React.useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 bg-warn-soft px-3 py-1.5 text-[12px] text-warn"
    >
      <CloudOff className="size-3.5 shrink-0" aria-hidden />
      <span>{t("misc.offline")}</span>
    </div>
  );
}
