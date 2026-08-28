"use client";

// =========================================================
// A node's body is plain text in the database, so the small
// amount of structure people actually type — line breaks,
// bullets, checkboxes, links, a bit of emphasis — is parsed
// out of it rather than stored beside it. Editing still shows
// the raw text, so nothing is hidden from the person typing.
// =========================================================

import * as React from "react";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/primitives";

export type Block =
  | { kind: "text"; line: number; text: string }
  | { kind: "bullet"; line: number; text: string }
  | { kind: "check"; line: number; text: string; done: boolean };

const CHECK_RE = /^(\s*)[-*]\s*\[([ xX])\]\s?(.*)$/;
const BULLET_RE = /^(\s*)[-*]\s+(.*)$/;

export function parseBody(body: string | null | undefined): Block[] {
  if (!body) return [];
  const out: Block[] = [];
  body.split("\n").forEach((raw, line) => {
    const check = CHECK_RE.exec(raw);
    if (check) {
      out.push({ kind: "check", line, text: check[3].trim(), done: check[2].toLowerCase() === "x" });
      return;
    }
    const bullet = BULLET_RE.exec(raw);
    if (bullet) {
      out.push({ kind: "bullet", line, text: bullet[2].trim() });
      return;
    }
    const text = raw.trim();
    if (text) out.push({ kind: "text", line, text });
  });
  return out;
}

export function checklistStats(blocks: Block[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const b of blocks) {
    if (b.kind !== "check") continue;
    total++;
    if (b.done) done++;
  }
  return { done, total };
}

/** Flip one checkbox without disturbing a single other character of the body. */
export function toggleChecklistLine(body: string, line: number): string {
  const lines = body.split("\n");
  const raw = lines[line];
  if (raw === undefined) return body;
  const m = CHECK_RE.exec(raw);
  if (!m) return body;
  lines[line] = `${m[1]}- [${m[2].toLowerCase() === "x" ? " " : "x"}] ${m[3]}`;
  return lines.join("\n");
}

export function appendChecklistItem(body: string | null | undefined, text = ""): string {
  const base = (body ?? "").replace(/\s+$/, "");
  return base ? `${base}\n- [ ] ${text}` : `- [ ] ${text}`;
}

/** Strip the markers so a converted task or a search index sees plain words. */
export function plainText(body: string | null | undefined): string {
  return parseBody(body).map((b) => b.text).join(" ");
}

// ---------------------------------------------------------
// Inline spans
// ---------------------------------------------------------
const INLINE_RE =
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|(https?:\/\/[^\s<>"']+)/g;

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${tail}`;
  } catch {
    return url;
  }
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      // the node itself is a drag surface, so the link claims the gesture first
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="cursor-pointer text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
    >
      {children}
    </a>
  );
}

/** Line-level emphasis, code, and links. Everything else stays literal. */
export function Inline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const key = `${m.index}`;
    if (m[2]) parts.push(<Link key={key} href={m[2]}>{m[1]}</Link>);
    else if (m[3]) parts.push(
      <code key={key} className="rounded-[4px] bg-hover px-1 py-px text-[11.5px] text-ink-2">{m[3]}</code>,
    );
    else if (m[4]) parts.push(<strong key={key} className="font-semibold text-ink">{m[4]}</strong>);
    else if (m[5]) parts.push(<em key={key} className="italic">{m[5]}</em>);
    else if (m[6]) parts.push(<Link key={key} href={m[6]}>{shortUrl(m[6])}</Link>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ---------------------------------------------------------
// Rendered body
// ---------------------------------------------------------
export function BodyView({
  blocks, onToggle, max = 6, className, compact,
}: {
  blocks: Block[];
  onToggle: (line: number) => void;
  /** how many lines fit before the rest collapses into a count */
  max?: number;
  className?: string;
  compact?: boolean;
}) {
  const shown = blocks.slice(0, max);
  const hidden = blocks.length - shown.length;

  return (
    <div className={cn("min-w-0 space-y-[3px]", className)}>
      {shown.map((b) => {
        if (b.kind === "check") {
          return (
            <div key={b.line} className="flex items-start gap-1.5">
              <span className="mt-px shrink-0" onPointerDown={(e) => e.stopPropagation()}>
                <Checkbox
                  size="sm"
                  checked={b.done}
                  label={b.done ? `Undo: ${b.text}` : `Done: ${b.text}`}
                  onChange={() => onToggle(b.line)}
                />
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 break-words text-[12px] leading-[1.45]",
                  b.done ? "text-ink-4 line-through" : "text-ink-2",
                )}
              >
                <Inline text={b.text} />
              </span>
            </div>
          );
        }
        if (b.kind === "bullet") {
          return (
            <div key={b.line} className="flex items-start gap-1.5 text-[12px] leading-[1.45] text-ink-2">
              <span aria-hidden className="mt-[6px] size-[3px] shrink-0 rounded-full bg-ink-4" />
              <span className="min-w-0 flex-1 break-words"><Inline text={b.text} /></span>
            </div>
          );
        }
        return (
          <p
            key={b.line}
            className={cn(
              "break-words text-[12px] leading-[1.45] text-ink-2",
              compact && "line-clamp-2",
            )}
          >
            <Inline text={b.text} />
          </p>
        );
      })}
      {hidden > 0 && (
        <p className="text-[11px] text-ink-4 tnum">+{hidden} more line{hidden === 1 ? "" : "s"}</p>
      )}
    </div>
  );
}
