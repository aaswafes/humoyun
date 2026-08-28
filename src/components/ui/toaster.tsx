"use client";

import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import { useMounted } from "./overlays";

const ICONS = {
  default: Info,
  success: CheckCircle2,
  danger: AlertCircle,
};

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const mounted = useMounted();
  if (!mounted) return null;

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-[200] flex w-[min(92vw,380px)] -translate-x-1/2 flex-col gap-2"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.tone ?? "default"];
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line px-3 py-2.5",
              "material shadow-lg anim-slide",
            )}
          >
            <Icon
              className={cn(
                "mt-px size-4 shrink-0",
                t.tone === "success" && "text-success",
                t.tone === "danger" && "text-danger",
                (!t.tone || t.tone === "default") && "text-ink-3",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug text-ink">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{t.description}</p>
              )}
            </div>
            {t.action && (
              <button
                onClick={() => { t.action!.run(); dismiss(t.id); }}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-accent hover:bg-accent-soft cursor-pointer transition-colors"
              >
                {t.action.label}
              </button>
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
