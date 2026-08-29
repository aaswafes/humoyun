"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { VisuallyHidden } from "@/components/ui/form";
import { normalizeUrl, urlLabel } from "./youtube-url";

/**
 * The link out to the video itself.
 *
 * It is an anchor, not a button, because it navigates — and it is never nested
 * inside another control: on the shelf card the card's own hit area is a
 * sibling overlay, so this link sits above it rather than inside it.
 */
export function OpenOnYoutube({
  url, title, tone = "icon", className,
}: {
  url: string;
  /** what the link is for, so the label says more than "open" */
  title: string;
  tone?: "icon" | "pill";
  className?: string;
}) {
  const href = normalizeUrl(url);
  if (!href) return null;

  const label = `Open ${title || "this video"} on YouTube`;

  if (tone === "pill") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(
          "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5",
          "text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink active:scale-[0.97]",
          className,
        )}
        title={urlLabel(url)}
      >
        <ExternalLink className="size-3 text-ink-3" aria-hidden />
        Open on YouTube
        <VisuallyHidden>{` — ${label}`}</VisuallyHidden>
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      title="Open on YouTube"
      className={cn(
        "grid size-7 cursor-pointer place-items-center rounded-full bg-raised text-ink-2 shadow-sm",
        "transition-colors duration-150 hover:bg-hover hover:text-ink active:scale-[0.97]",
        className,
      )}
    >
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}
