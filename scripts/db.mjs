#!/usr/bin/env node
/**
 * Run a .sql file against this project's Supabase database.
 *
 * Why this exists: DDL cannot go through the anon or service-role key. Those
 * talk to PostgREST, which serves rows — it has no way to alter a table or
 * widen a CHECK. So every schema change used to need either the Supabase
 * connector or a human with the dashboard open, and when the connector dropped
 * mid-session the work stopped.
 *
 * This is the third door: the Management API, which is what the dashboard's own
 * SQL editor calls. It needs one secret and no dependencies.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_...      a personal access token
 *   SUPABASE_PROJECT_REF=ahnuger...    optional; defaults to the ref in the URL
 *
 * Put them in `.env.local`, which is gitignored. A personal access token is
 * account-wide — it reaches every project you own, not just this one — so
 * treat it like a password and revoke it from the dashboard if it ever leaks.
 *
 * Usage:
 *   node scripts/db.mjs docs/sql/umr-isrof.sql
 *   node scripts/db.mjs --check            # credentials and connectivity only
 *
 * Node 24 on Windows sometimes prints "Assertion failed: !(handle->flags &
 * UV_HANDLE_CLOSING)" as it exits after a failed request. It comes from libuv
 * tearing down a socket, always AFTER the real message, and says nothing about
 * whether the SQL ran. Read the line above it.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const API = "https://api.supabase.com/v1";

/** `.env.local` is the project's own habit; nothing here shells out to dotenv. */
async function loadEnvLocal() {
  try {
    const text = await readFile(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const [, key, raw] = m;
      if (process.env[key]) continue; // a real environment variable always wins
      process.env[key] = raw.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // No file is fine; the variables may come from the environment.
  }
}

/** The ref is the first label of the project URL, so it need not be set twice. */
function projectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url);
  return m ? m[1] : null;
}

function fail(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error("");
  process.exit(1);
}

async function run(query, { label }) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef();

  if (!token) {
    fail(
      "No SUPABASE_ACCESS_TOKEN.",
      "Make one at supabase.com/dashboard/account/tokens and add it to .env.local.",
    );
  }
  if (!ref) {
    fail(
      "No project ref.",
      "Set SUPABASE_PROJECT_REF, or leave NEXT_PUBLIC_SUPABASE_URL in .env.local.",
    );
  }

  const res = await fetch(`${API}/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // One request per run, so nothing needs keeping alive.
      Connection: "close",
    },
    body: JSON.stringify({ query }),
  });

  const body = await res.text();

  if (!res.ok) {
    // 401 is the token, 404 is the ref — saying which saves a round of guessing.
    const why = res.status === 401
      ? "The token was rejected. It may be revoked, or pasted with a character missing."
      : res.status === 404
        ? `No project "${ref}" on this account.`
        : "";
    fail(`${label} failed — HTTP ${res.status}.`, `${why}\n  ${body.slice(0, 400)}`);
  }

  return body;
}

const [, , arg] = process.argv;

await loadEnvLocal();

if (!arg || arg === "--check") {
  const out = await run("select current_database() as db, version() as version;", {
    label: "Connection check",
  });
  console.log(`\n  Connected to ${projectRef()}.`);
  console.log(`  ${out.slice(0, 300)}\n`);
  process.exit(0);
}

const path = resolve(process.cwd(), arg);
const sql = await readFile(path, "utf8");

console.log(`\n  Running ${arg} against ${projectRef()}…`);
const out = await run(sql, { label: arg });
console.log(`  Done.\n`);
if (out && out !== "[]") console.log(`${out.slice(0, 2000)}\n`);
