"use client";

import * as React from "react";

/**
 * The global stylesheet already flattens durations under reduced motion, which
 * is right for transitions but wrong for an ambient loop: a 9-second breathing
 * ring would become a 0.01ms twitch. The breathing ring is therefore not
 * rendered at all when the preference is set, so this reads the media query.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
