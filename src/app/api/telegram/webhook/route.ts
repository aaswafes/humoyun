import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { parseTask } from "@/lib/parse";
import { friendlyDate, formatTime } from "@/lib/date";

// =========================================================
// Telegram capture.
//
// Text the bot and it lands in the Inbox. The message goes through the same
// `parseTask` the quick-add bar uses, so "gym friday 7am for 45m #health
// !high" means the same thing from a phone as it does from the keyboard.
//
// Two things guard this route, because it is open to the internet:
//
//  1. Telegram is asked to send a secret header when the webhook is
//     registered, and a request without the right one is refused. This is
//     Telegram's own mechanism (`secret_token` on setWebhook).
//  2. A chat is only ever bound to an account by a one-time code typed into
//     the bot. An unbound chat can do nothing but ask to be bound.
//
// The reply is always the last word about what happened — a capture you have
// to go and verify is not a capture.
// =========================================================

export const dynamic = "force-dynamic";

const API = "https://api.telegram.org/bot";

interface TgChat { id: number; username?: string; first_name?: string }
interface TgMessage { chat: TgChat; text?: string; from?: TgChat }
interface TgUpdate { message?: TgMessage; edited_message?: TgMessage }

async function reply(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`${API}${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch {
    // A failed reply must not fail the capture — the task is already saved.
  }
}

/** What the task ended up as, said back in one line. */
function describe(p: ReturnType<typeof parseTask>, hour12: boolean): string {
  const bits: string[] = [];
  if (p.date) bits.push(friendlyDate(p.date));
  if (p.start_min != null) bits.push(formatTime(p.start_min, hour12));
  if (p.duration_min != null) bits.push(`${p.duration_min}m`);
  if (p.priority > 0) bits.push(["", "low", "medium", "high"][p.priority]);
  if (p.tags.length) bits.push(p.tags.map((t) => `#${t}`).join(" "));
  return bits.length ? ` · ${bits.join(" · ")}` : " · Inbox";
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  // Without a configured secret this route would be an open write endpoint,
  // so it stays closed rather than falling back to "no check".
  if (!expected) {
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  }
  if (request.headers.get("x-telegram-bot-api-secret-token") !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = adminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });   // malformed: acknowledge, drop
  }

  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  // Always 200 to Telegram for anything unusable, or it retries forever.
  if (!chatId || !text) return NextResponse.json({ ok: true });

  // ---- pairing: /start <code> --------------------------------------------
  const start = /^\/start(?:\s+(\S+))?$/i.exec(text);
  if (start) {
    const code = start[1]?.toUpperCase();
    if (!code) {
      await reply(chatId, "Open Qalamchi → Settings → Notifications, then send me the code it shows.");
      return NextResponse.json({ ok: true });
    }

    const { data: link } = await supabase
      .from("telegram_links")
      .select("id, user_id, code_expires_at")
      .eq("code", code)
      .maybeSingle();

    if (!link || (link.code_expires_at && new Date(link.code_expires_at) < new Date())) {
      await reply(chatId, "That code is not valid any more. Generate a fresh one in Settings.");
      return NextResponse.json({ ok: true });
    }

    // The code is cleared as it is spent, so it cannot bind a second chat.
    const { error } = await supabase
      .from("telegram_links")
      .update({
        chat_id: chatId,
        username: message?.from?.username ?? null,
        code: null,
        code_expires_at: null,
        linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", link.id);

    await reply(
      chatId,
      error
        ? "Something went wrong linking this chat. Try a new code."
        : "Linked. Send me anything and it lands in your Inbox.\n\nTry: <code>gym friday 7am for 45m #health !high</code>",
    );
    return NextResponse.json({ ok: true });
  }

  // ---- everything else is a capture --------------------------------------
  const { data: link } = await supabase
    .from("telegram_links")
    .select("user_id")
    .eq("chat_id", chatId)
    .not("linked_at", "is", null)
    .maybeSingle();

  if (!link) {
    await reply(chatId, "This chat is not linked to an account yet. Send /start followed by the code from Settings → Notifications.");
    return NextResponse.json({ ok: true });
  }

  // The user's own week start decides what "friday" means.
  const { data: profile } = await supabase
    .from("profiles")
    .select("week_start, prefs")
    .eq("id", link.user_id)
    .maybeSingle();

  const weekStart = typeof profile?.week_start === "number" ? profile.week_start : 1;
  const hour12 = (profile?.prefs as Record<string, unknown> | null)?.hour12 !== false;

  const parsed = parseTask(text, weekStart);
  const title = parsed.title.trim() || text;

  const { error } = await supabase.from("tasks").insert({
    user_id: link.user_id,
    title,
    date: parsed.date,
    start_min: parsed.start_min,
    end_min: parsed.end_min,
    duration_min: parsed.duration_min,
    all_day: parsed.start_min == null,
    tags: parsed.tags,
    priority: parsed.priority,
    color: parsed.color,
  });

  await reply(
    chatId,
    error
      ? "Couldn't save that one. Try again in a moment."
      : `✓ <b>${escapeHtml(title)}</b>${escapeHtml(describe(parsed, hour12))}`,
  );

  return NextResponse.json({ ok: true });
}
