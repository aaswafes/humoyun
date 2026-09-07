import { createClient } from "@supabase/supabase-js";

// =========================================================
// The service-role client. SERVER ONLY.
//
// This key bypasses row-level security completely, so it must never be
// imported from a "use client" module — it is read from a variable with no
// NEXT_PUBLIC_ prefix precisely so a bundler cannot hand it to a browser.
//
// Everything that uses it has to filter by user_id itself. RLS is not
// standing behind these queries any more.
// =========================================================

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
