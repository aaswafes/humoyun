"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { SOLO } from "@/lib/local-db";
import { useStore } from "@/lib/store";
import type {
  Community, CommunityGoal, Contribution, FeedMember, Membership, Rec, RecKind, RecSave, ShareKey,
} from "./community-types";

/**
 * The store holds everything, and deliberately does not hold this.
 *
 * `hydrate` pulls every collection for `user_id = you`, and the optimistic CRUD
 * stamps `user_id` on every write. Community rows fail both halves: they are
 * other people's rows, and a `communities` row has no `user_id` to stamp. So
 * this surface owns its own small read layer instead of bending the store into
 * a shape the rest of the app would then have to defend against.
 */

/** Codes people read aloud and type back in. No 0/O/1/I. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeInviteCode(): string {
  let out = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/**
 * Turn whatever Supabase threw into a sentence a person can read.
 *
 * A PostgrestError is a plain object, not an `Error`, so an `instanceof` check
 * misses it and `String(...)` on it yields the literal text "[object Object]".
 * That is what every failure on this surface showed until the message was read
 * off the object properly — an error handler that hides the error is worse
 * than none, because it also hides the bug underneath it.
 */
function fail(error: unknown, fallback: string): never {
  throw new Error(messageOf(error) || fallback);
}

function messageOf(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown };
    for (const part of [e.message, e.details, e.hint]) {
      if (typeof part === "string" && part.trim()) return part;
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchMyCommunities(): Promise<{ communities: Community[]; memberships: Membership[] }> {
  const [{ data: memberships, error: mErr }, { data: communities, error: cErr }] = await Promise.all([
    supabase.from("community_members").select("*"),
    supabase.from("communities").select("*"),
  ]);
  if (mErr) fail(mErr, "Could not load your communities");
  if (cErr) fail(cErr, "Could not load your communities");

  const list = (communities ?? []) as Community[];
  list.sort((a, b) => a.name.localeCompare(b.name));
  return { communities: list, memberships: (memberships ?? []) as Membership[] };
}

/** The one call that crosses accounts. Everything it can return is in the SQL. */
export async function fetchFeed(communityId: string): Promise<FeedMember[]> {
  const { data, error } = await supabase.rpc("community_feed", { p_community_id: communityId });
  if (error) fail(error, "Could not load the community");
  return (data ?? []) as FeedMember[];
}

export async function fetchGoals(communityId: string) {
  const { data: goals, error } = await supabase
    .from("community_goals").select("*").eq("community_id", communityId);
  if (error) fail(error, "Could not load goals");

  const ids = (goals ?? []).map((g) => g.id as string);
  if (ids.length === 0) return { goals: [] as CommunityGoal[], contributions: [] as Contribution[] };

  const { data: contributions, error: cErr } = await supabase
    .from("community_goal_contributions").select("*").in("goal_id", ids);
  if (cErr) fail(cErr, "Could not load goal progress");

  return {
    goals: (goals ?? []) as CommunityGoal[],
    contributions: (contributions ?? []) as Contribution[],
  };
}

export async function fetchRecs(communityId: string) {
  const { data: recs, error } = await supabase
    .from("community_recs").select("*").eq("community_id", communityId)
    .order("created_at", { ascending: false });
  if (error) fail(error, "Could not load recommendations");

  const ids = (recs ?? []).map((r) => r.id as string);
  if (ids.length === 0) return { recs: [] as Rec[], saves: [] as RecSave[] };

  const { data: saves, error: sErr } = await supabase
    .from("community_rec_saves").select("*").in("rec_id", ids);
  if (sErr) fail(sErr, "Could not load recommendations");

  return { recs: (recs ?? []) as Rec[], saves: (saves ?? []) as RecSave[] };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Creating one goes through a definer function, and has to.
 *
 * `communities` is readable by members only, so at the instant the row exists
 * its own creator cannot see it — PostgREST asks for the new row back, the
 * SELECT policy is applied to the RETURNING clause, and the whole INSERT rolls
 * back. Doing both writes server-side fixes the ordering and makes them atomic,
 * so a community never exists with nobody in it.
 */
export async function createCommunity(
  fields: { name: string; description?: string | null; color?: string },
): Promise<Community> {
  const { data, error } = await supabase.rpc("create_community", {
    p_name: fields.name,
    p_description: fields.description ?? null,
    p_color: fields.color ?? "blue",
    p_invite_code: makeInviteCode(),
  });
  if (error) fail(error, "Could not create the community");
  return data as Community;
}

/** Joining goes through the definer function — a code alone cannot see the row. */
export async function joinByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc("join_community", { p_code: code.trim() });
  if (error) fail(error, "That code did not work");
  return data as string;
}

export async function setShare(membershipId: string, key: ShareKey, value: boolean) {
  const { error } = await supabase
    .from("community_members").update({ [key]: value }).eq("id", membershipId);
  if (error) fail(error, "Could not save that");
}

export async function leaveCommunity(membershipId: string) {
  const { error } = await supabase.from("community_members").delete().eq("id", membershipId);
  if (error) fail(error, "Could not leave");
}

export async function updateCommunity(id: string, changes: Partial<Community>) {
  const { error } = await supabase
    .from("communities").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) fail(error, "Could not save");
}

export async function deleteCommunity(id: string) {
  const { error } = await supabase.from("communities").delete().eq("id", id);
  if (error) fail(error, "Could not delete");
}

export async function addGoal(
  communityId: string, userId: string,
  fields: { title: string; unit: string | null; target: number; due_date: string | null; color: string },
): Promise<CommunityGoal> {
  const { data, error } = await supabase
    .from("community_goals")
    .insert({ community_id: communityId, created_by: userId, ...fields })
    .select().single();
  if (error) fail(error, "Could not add the goal");
  return data as CommunityGoal;
}

export async function updateGoal(id: string, changes: Partial<CommunityGoal>) {
  const { error } = await supabase
    .from("community_goals").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) fail(error, "Could not save the goal");
}

export async function deleteGoal(id: string) {
  const { error } = await supabase.from("community_goals").delete().eq("id", id);
  if (error) fail(error, "Could not delete the goal");
}

export async function addContribution(
  goalId: string, userId: string, amount: number, note: string | null, date: string,
): Promise<Contribution> {
  const { data, error } = await supabase
    .from("community_goal_contributions")
    .insert({ goal_id: goalId, user_id: userId, amount, note, date })
    .select().single();
  if (error) fail(error, "Could not log that");
  return data as Contribution;
}

export async function deleteContribution(id: string) {
  const { error } = await supabase.from("community_goal_contributions").delete().eq("id", id);
  if (error) fail(error, "Could not remove that");
}

export async function addRec(
  communityId: string, userId: string,
  fields: { kind: RecKind; title: string; creator: string | null; url: string | null; note: string | null; color: string },
): Promise<Rec> {
  const { data, error } = await supabase
    .from("community_recs")
    .insert({ community_id: communityId, user_id: userId, ...fields })
    .select().single();
  if (error) fail(error, "Could not post that");
  return data as Rec;
}

export async function deleteRec(id: string) {
  const { error } = await supabase.from("community_recs").delete().eq("id", id);
  if (error) fail(error, "Could not remove that");
}

export async function saveRec(recId: string, userId: string): Promise<RecSave> {
  const { data, error } = await supabase
    .from("community_rec_saves").insert({ rec_id: recId, user_id: userId }).select().single();
  if (error) fail(error, "Could not save that");
  return data as RecSave;
}

export async function unsaveRec(saveId: string) {
  const { error } = await supabase.from("community_rec_saves").delete().eq("id", saveId);
  if (error) fail(error, "Could not remove that");
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface Loadable<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Load once, again when the tab comes back, and on demand.
 *
 * Other people's days change while you are looking at them, and this is the
 * whole reason the page refreshes on focus: coming back to a stale roster and
 * reading it as today is worse than a moment of uncertainty.
 *
 * A refresh deliberately does NOT put the surface back into its loading state.
 * The data on screen is still the best answer available, and replacing a read
 * roster with skeletons every time the window is focused is a flicker, not
 * information. Only the first load has nothing to show.
 *
 * `load` must be memoised by the caller — it is the dependency that says when
 * the thing being loaded actually changed.
 */
export function useLoad<T>(load: () => Promise<T>): Loadable<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(!SOLO);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (SOLO) return;
    let alive = true;
    load()
      .then((value) => { if (alive) { setData(value); setError(null); } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Something went wrong"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load, nonce]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  React.useEffect(() => {
    if (SOLO) return;
    const onFocus = () => setNonce((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return { data, error, loading, reload };
}

/** The signed-in user's id, which every write needs and SOLO does not have. */
export function useUserId(): string | null {
  return useStore((s) => s.profile?.id ?? null);
}
