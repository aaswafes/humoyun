"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import type { Tint } from "@/lib/types";

/**
 * A book needs a face. With no artwork we draw one: the tint fills the board,
 * a darker spine runs down the left, and the title sits in the display serif.
 * `cover_url` wins whenever the user has supplied real artwork.
 */
export function BookCover({
  title, tint, coverUrl, className, titleClassName, dim,
}: {
  title: string;
  tint: Tint;
  coverUrl?: string | null;
  className?: string;
  titleClassName?: string;
  /** paused / dropped books recede a little */
  dim?: boolean;
}) {
  // Remember which URL failed rather than a bare boolean, so a new URL retries itself.
  const [brokenUrl, setBrokenUrl] = React.useState<string | null>(null);
  const showArt = !!coverUrl && brokenUrl !== coverUrl;

  return (
    <div
      className={cn(
        `tint-${tint}`,
        "relative isolate aspect-[2/3] w-full overflow-hidden rounded-md shadow-sm",
        "transition-[opacity,box-shadow] duration-200 ease-[var(--ease-out-apple)]",
        dim && "opacity-60",
        className,
      )}
      style={{ background: showArt ? "var(--hover)" : "var(--tint-soft)" }}
    >
      {showArt ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote covers, no image loader configured
        <img
          src={coverUrl as string}
          alt=""
          onError={() => setBrokenUrl(coverUrl as string)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <>
          <span aria-hidden className="absolute inset-y-0 left-0 w-[5px]" style={{ background: "var(--tint)" }} />
          <span aria-hidden className="absolute inset-y-0 left-[7px] w-px opacity-40" style={{ background: "var(--tint)" }} />
          <div className="absolute inset-0 flex items-end p-3 pl-4">
            <span
              className={cn("display-serif line-clamp-5 text-[17px] leading-[1.18]", titleClassName)}
              style={{ color: "var(--tint-ink)" }}
            >
              {title || "Untitled"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
