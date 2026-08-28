import { createBrowserClient } from "@supabase/ssr";

// Only imported from "use client" modules, so creating it at module scope is safe
// and keeps the generated types intact (a Proxy wrapper erases them).
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export function getSupabase() {
  return supabase;
}
