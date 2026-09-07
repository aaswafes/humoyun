"use client";

import * as React from "react";
import { Check, Copy, Link2, Send, Unlink } from "lucide-react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { SOLO } from "@/lib/local-db";
import { Button, Spinner } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Callout, Pane, Row } from "./ui";

// =========================================================
// Telegram capture.
//
// Pairing is done straight against Supabase rather than through an API
// route: `telegram_links` carries the same own_select/own_insert/own_update
// policies as every other table, so a row can only ever be read or written
// by the account it belongs to. The bot's own webhook is the only thing that
// needs a service key, and it lives on the server.
//
// The code is one-time and short-lived. The webhook clears it the moment it
// is spent, so an old screenshot of one cannot bind a second chat.
// =========================================================

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
const CODE_MINUTES = 15;
// No I, O, 0 or 1 — this gets read off a screen and typed into a phone.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

interface LinkRow {
  id: string;
  chat_id: number | null;
  username: string | null;
  code: string | null;
  code_expires_at: string | null;
  linked_at: string | null;
}

export function TelegramSection() {
  const userId = useStore((s) => s.userId);
  const toast = useStore((s) => s.toast);

  const [row, setRow] = React.useState<LinkRow | null | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [unlinkOpen, setUnlinkOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("telegram_links")
      .select("id, chat_id, username, code, code_expires_at, linked_at")
      .eq("user_id", userId)
      .maybeSingle();
    setRow((data as LinkRow) ?? null);
  }, [userId]);

  React.useEffect(() => {
    if (!userId) return;
    let alive = true;
    void supabase
      .from("telegram_links")
      .select("id, chat_id, username, code, code_expires_at, linked_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => { if (alive) setRow((data as LinkRow) ?? null); });
    return () => { alive = false; };
  }, [userId]);

  async function generate() {
    if (!userId) return;
    setBusy(true);
    const code = newCode();
    const expires = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString();
    // One row per account, so this replaces any code already outstanding.
    const { error } = await supabase.from("telegram_links").upsert(
      { user_id: userId, code, code_expires_at: expires, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't make a code", description: error.message, tone: "danger" });
      return;
    }
    await refresh();
  }

  async function unlink() {
    if (!row) return;
    setBusy(true);
    const { error } = await supabase.from("telegram_links").delete().eq("id", row.id);
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't unlink", description: error.message, tone: "danger" });
      return;
    }
    await refresh();
    toast({ title: "Telegram unlinked" });
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1600); },
      () => toast({ title: "Couldn't copy", tone: "danger" }),
    );
  }

  if (SOLO) return null;

  const live = row?.code && (!row.code_expires_at || new Date(row.code_expires_at) > new Date());
  const startUrl = BOT && row?.code ? `https://t.me/${BOT}?start=${row.code}` : null;

  return (
    <Pane
      title="Telegram"
      description="Text the bot and it lands in your Inbox. Messages go through the same parser as quick add, so “gym friday 7am for 45m #health !high” means the same thing from your phone."
    >
      {!BOT && (
        <Callout tone="warn" title="Bot not configured yet" className="mb-5">
          Set <code>NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code> to your bot&rsquo;s handle, and
          <code> TELEGRAM_BOT_TOKEN</code> plus <code>TELEGRAM_WEBHOOK_SECRET</code> on the
          server, then point the bot&rsquo;s webhook at <code>/api/telegram/webhook</code>.
          The code below still works once those are in place.
        </Callout>
      )}

      {row === undefined ? (
        <div className="flex items-center gap-2 py-4 text-[13px] text-ink-3"><Spinner /> Loading…</div>
      ) : row?.linked_at ? (
        <>
          <Row label="Connected" hint={row.username ? `@${row.username}` : `Chat ${row.chat_id}`}>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-success">
              <Check className="size-3.5" aria-hidden />
              Linked
            </span>
          </Row>
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={() => setUnlinkOpen(true)} disabled={busy}>
              <Unlink className="size-3.5" />
              Unlink this chat
            </Button>
          </div>
        </>
      ) : live ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-2">
            Send this to the bot — it expires in {CODE_MINUTES} minutes.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-line bg-sunken px-3 py-2 text-[15px] font-semibold tracking-[0.14em] tnum text-ink">
              /start {row.code}
            </code>
            <Button variant="secondary" size="sm" onClick={() => copy(`/start ${row!.code}`)}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            {startUrl && (
              <Button variant="primary" size="sm" onClick={() => window.open(startUrl, "_blank", "noopener")}>
                <Send className="size-3.5" />
                Open Telegram
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            className="self-start text-[12.5px] text-ink-3 underline underline-offset-2 cursor-pointer hover:text-ink"
          >
            Make a new code
          </button>
        </div>
      ) : (
        <Button variant="primary" size="sm" onClick={() => void generate()} disabled={busy}>
          <Link2 className="size-3.5" />
          {busy ? "Working…" : "Connect Telegram"}
        </Button>
      )}

      <ConfirmDialog
        open={unlinkOpen}
        onClose={() => setUnlinkOpen(false)}
        onConfirm={() => void unlink()}
        title="Unlink Telegram?"
        description="The bot stops accepting messages from that chat. Tasks it already captured stay exactly where they are."
        confirmLabel="Unlink"
      />
    </Pane>
  );
}
