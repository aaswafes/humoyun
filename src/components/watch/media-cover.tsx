"use client";

import * as React from "react";
import { Clapperboard, Sparkles, Tv } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Media, MediaKind } from "@/lib/types";

const GLYPH: Record<MediaKind, React.ComponentType<{ className?: string }>> = {
  film: Clapperboard,
  anime: Sparkles,
  series: Tv,
};

/**
 * A title needs a face. With no artwork we draw one: the tint fills the
 * poster, a bar runs along the top where a book would have a spine, the kind
 * glyph sits in the corner so a film reads as a film at a glance, and the
 * title sits in the display serif. `cover_url` wins whenever the user has
 * supplied real artwork.
 */
export function MediaCover({ item, className }: { item: Media; className?: string }) {
  // Remember which URL failed rather than a bare boolean, so a new URL retries itself.
  const [brokenUrl, setBrokenUrl] = React.useState<string | null>(null);
  const url = item.cover_url;
  const showArt = !!url && brokenUrl !== url;
  const Glyph = GLYPH[item.kind] ?? Clapperboard;
  // Titles the user has set aside recede rather than shouting from the shelf.
  const dim = item.status === "paused" || item.status === "dropped";

  return (
    <div
      className={cn(
        `tint-${item.color}`,
        "relative isolate aspect-[2/3] w-full overflow-hidden rounded-md shadow-sm",
        "transition-[opacity,box-shadow] duration-200 ease-[var(--ease-out-apple)]",
        dim && "opacity-60",
        className,
      )}
      style={{ background: showArt ? "var(--hover)" : "var(--tint-soft)" }}
    >
      {showArt ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote posters, no image loader configured
        <img
          src={url as string}
          alt=""
          onError={() => setBrokenUrl(url as string)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <>
          <span aria-hidden className="absolute inset-x-0 top-0 h-[5px]" style={{ background: "var(--tint)" }} />
          {/* The glyph is texture on the poster, not a status, so it stays in the tint. */}
          <span
            aria-hidden
            className="absolute right-2.5 top-3 opacity-50"
            style={{ color: "var(--tint-ink)" }}
          >
            <Glyph className="size-3.5" />
          </span>
          <div className="absolute inset-0 flex items-end p-3">
            <span
              className="display-serif line-clamp-5 text-[17px] leading-[1.18]"
              style={{ color: "var(--tint-ink)" }}
            >
              {item.title || "Untitled"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
