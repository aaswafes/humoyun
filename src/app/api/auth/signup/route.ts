import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { emailForUsername, normalizeUsername, usernameError } from "@/lib/username";

// =========================================================
// Create an account from a username and a password.
//
// The browser cannot do this itself. `supabase.auth.signUp` always creates an
// unconfirmed user and mails them a link, and that link is the thing that kept
// not arriving — so the account is created here instead, with the service-role
// key and `email_confirm: true`, and the caller is signed in straight away.
// There is no inbox in this flow at all.
//
// `api/` sits outside the auth gate, so this route is reachable by anyone.
// That is deliberate — it is how a new person signs up — and it is why the
// attempts are capped per address below.
// =========================================================

export const dynamic = "force-dynamic";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const attempts = new Map<string, number[]>();

function overLimit(ip: string) {
  const now = Date.now();
  // The map only ever grows in a warm instance, so drop cold callers first.
  if (attempts.size > 500) {
    for (const [key, stamps] of attempts) {
      if (stamps.every((t) => now - t >= WINDOW_MS)) attempts.delete(key);
    }
  }
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("That request did not make sense.", 400);
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  const nameProblem = usernameError(username);
  if (nameProblem) return fail(nameProblem, 400);
  if (password.length < 6) return fail("Passwords are at least 6 characters.", 400);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (overLimit(ip)) return fail("Too many accounts from here. Try again in an hour.", 429);

  const admin = adminClient();
  if (!admin) {
    // Missing service-role key — a deployment problem, not something the
    // person signing up can fix, so say so instead of showing them a stack.
    return fail("Sign-up is not configured on this server yet.", 503);
  }

  const name = normalizeUsername(username);
  const { error } = await admin.auth.admin.createUser({
    email: emailForUsername(name),
    password,
    email_confirm: true,
    user_metadata: { username: name },
  });

  if (error) {
    // Two different 422s come back from here — a taken address and a weak
    // password — so match on what it says, not on the status code.
    const message = error.message.toLowerCase();
    if (message.includes("already") || message.includes("exists")) {
      return fail("That username is taken. Try another.", 409);
    }

    // A rejected key is a wrong or missing SUPABASE_SERVICE_ROLE_KEY on this
    // deployment. Supabase phrases that as "Invalid API key", which reads on
    // the form like the person typed something wrong — they did not, and no
    // amount of retrying will help. Name it for what it is and log it, so the
    // next time this happens it is one line in the function logs.
    if (message.includes("api key") || message.includes("jwt") || message.includes("unauthorized")) {
      console.error("[signup] service-role key rejected by Supabase:", error.message);
      return fail("Sign-up is misconfigured on this server. This is not your fault.", 503);
    }

    console.error("[signup] createUser failed:", error.message);
    return fail(error.message, 500);
  }

  return NextResponse.json({ ok: true });
}
