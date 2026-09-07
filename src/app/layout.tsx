import type { Metadata, Viewport } from "next";
import {
  Inter, Manrope, Figtree, IBM_Plex_Sans, Rubik, Source_Sans_3,
  Instrument_Serif, Playfair_Display, Fraunces, Lora,
  JetBrains_Mono, IBM_Plex_Mono,
} from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// =========================================================
// Twelve faces, two of them preloaded.
//
// next/font emits an @font-face per family but the browser only downloads a
// face something on the page actually renders in — so the ten alternatives
// cost a first-time visitor nothing until they pick one. `preload: false`
// keeps them out of the <head> preload list, which is the part that would
// have cost something.
//
// latin-ext is there for a reason: Uzbek Latin needs `oʻ` and `gʻ`
// (U+02BB), and without that subset those two letters fall back to a system
// font mid-word.
// =========================================================

// next/font is a compile-time transform: every option has to be a literal it
// can read without executing anything, so the subset list is repeated rather
// than shared through a constant.
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const instrument = Instrument_Serif({
  subsets: ["latin", "latin-ext"], weight: "400", style: ["italic", "normal"],
  variable: "--font-instrument", display: "swap",
});

const manrope = Manrope({ subsets: ["latin", "latin-ext"], variable: "--font-manrope", display: "swap", preload: false });
const figtree = Figtree({ subsets: ["latin", "latin-ext"], variable: "--font-figtree", display: "swap", preload: false });
const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans", display: "swap", preload: false,
});
const rubik = Rubik({ subsets: ["latin", "latin-ext"], variable: "--font-rubik", display: "swap", preload: false });
const sourceSans = Source_Sans_3({ subsets: ["latin", "latin-ext"], variable: "--font-source-sans", display: "swap", preload: false });

const playfair = Playfair_Display({ subsets: ["latin", "latin-ext"], style: ["italic", "normal"], variable: "--font-playfair", display: "swap", preload: false });
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-fraunces", display: "swap", preload: false });
const lora = Lora({ subsets: ["latin", "latin-ext"], style: ["italic", "normal"], variable: "--font-lora", display: "swap", preload: false });

const jetbrains = JetBrains_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-jetbrains", display: "swap", preload: false });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"], weight: ["400", "500"],
  variable: "--font-plex-mono", display: "swap", preload: false,
});

const FONT_VARS = [
  inter, instrument, manrope, figtree, plexSans, rubik, sourceSans,
  playfair, fraunces, lora, jetbrains, plexMono,
].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Qalamchi",
  description: "A calendar that knows what you are actually trying to do.",
  applicationName: "Qalamchi",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Qalamchi" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#191919" },
  ],
};

// =========================================================
// Runs before the first paint, so nothing flashes on the way in.
//
// It mirrors what lib/customize.ts does at runtime, from a copy of the
// settings kept in localStorage. It is duplicated rather than imported on
// purpose: this has to be one inline string that executes before any bundle
// has loaded, and it must never throw — a broken theme is survivable, a
// broken boot script is a white page.
// =========================================================
const BOOT_SCRIPT = `
(function () {
  try {
    var d = document.documentElement, S = d.style;
    var a = {};
    try { a = JSON.parse(localStorage.getItem("humoyun.appearance") || "{}") || {}; } catch (e) {}

    var theme = a.theme || localStorage.getItem("humoyun.theme") || "system";
    var dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    d.classList.toggle("dark", dark);

    var accent = a.accent || localStorage.getItem("humoyun.accent") || "blue";
    var custom = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent);
    d.setAttribute("data-accent", custom ? "custom" : accent);
    if (custom) {
      var h = accent.replace("#", "");
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      var r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
      var lin = function (v) { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
      var L = 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
      var t = dark ? 255 : 0, m = 0.16;
      var mixed = [r,g,b].map(function (c) { return Math.round(c + (t - c) * m); });
      S.setProperty("--accent", "#" + h);
      S.setProperty("--accent-hover", "rgb(" + mixed.join(",") + ")");
      S.setProperty("--accent-ink", L > 0.42 ? "#141414" : "#ffffff");
      S.setProperty("--accent-soft", "rgba(" + r + "," + g + "," + b + "," + (dark ? 0.18 : 0.12) + ")");
      S.setProperty("--accent-line", "rgba(" + r + "," + g + "," + b + "," + (dark ? 0.44 : 0.36) + ")");
      S.setProperty("--selected", "rgba(" + r + "," + g + "," + b + "," + (dark ? 0.16 : 0.1) + ")");
    }

    if (a.palette) d.setAttribute("data-palette", a.palette);
    if (a.tints) d.setAttribute("data-tints", a.tints);
    if (a.motion) d.setAttribute("data-motion", a.motion);
    if (a.lang) d.setAttribute("lang", a.lang);

    var SYS = ', -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    var sans = { inter:"--font-inter", manrope:"--font-manrope", figtree:"--font-figtree",
                 plex:"--font-plex-sans", rubik:"--font-rubik", source:"--font-source-sans" };
    var serif = { instrument:"--font-instrument", playfair:"--font-playfair",
                  fraunces:"--font-fraunces", lora:"--font-lora" };
    var mono = { jetbrains:"--font-jetbrains", "plex-mono":"--font-plex-mono" };

    if (a.sans && sans[a.sans]) S.setProperty("--ui-font-sans", "var(" + sans[a.sans] + ")" + SYS);
    if (a.display === "body") {
      S.setProperty("--display-family", "var(--ui-font-sans)");
      S.setProperty("--display-style", "normal");
    } else if (a.display && serif[a.display]) {
      S.setProperty("--ui-font-serif", "var(" + serif[a.display] + '), "Iowan Old Style", Georgia, serif');
      S.setProperty("--display-style", a.display === "fraunces" ? "normal" : "italic");
    }
    if (a.serifNumerals === false) S.setProperty("--display-family", "var(--ui-font-sans)");
    if (a.mono && mono[a.mono]) S.setProperty("--ui-font-mono", "var(" + mono[a.mono] + '), ui-monospace, Menlo, monospace');

    if (a.scale) S.setProperty("--ui-scale", String(a.scale));
    if (a.iconStroke) S.setProperty("--icon-stroke", String(a.iconStroke));
    if (a.sidebarWidth) S.setProperty("--sidebar-w", Math.round(a.sidebarWidth) + "px");
    if (typeof a.radius === "number") {
      var radii = { "--r-xs":4, "--r-sm":6, "--r-md":9, "--r-lg":13, "--r-xl":18, "--r-2xl":24 };
      for (var k in radii) S.setProperty(k, (Math.round(radii[k] * a.radius * 10) / 10) + "px");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={FONT_VARS}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
