-- =========================================================
-- Community
--
-- Run once against the Supabase project. Local preview mode
-- (NEXT_PUBLIC_SOLO=1) has no account and no network, so the Community page
-- refuses to work there rather than half-working — this file only matters
-- when the app is pointed at a real database.
--
-- This is the first feature in Qalamchi where one account reads another
-- account's data. Read the section below before changing anything here.
-- =========================================================

-- ---------------------------------------------------------
-- The one door
--
-- Every other table in this app has exactly one policy: auth.uid() = user_id.
-- That is the product's spine. Nothing in this file weakens it: `tasks`,
-- `prayers`, `books` and `profiles` keep the policies they already have.
--
-- Instead there is one security-definer function, `community_feed`, which is
-- the only code in the system that can read across accounts. Its select list
-- IS the privacy policy: name, avatar, today's top-level task titles, today's
-- five prayer statuses. There is no parameter that widens it and no branch
-- that returns more.
--
-- Two rules for anything added here later:
--   1. A definer function bypasses RLS, so its FIRST statement is the
--      membership check. That check is the lock.
--   2. `set search_path` on every definer function, or a caller can point
--      `tasks` at a table of their own.
-- ---------------------------------------------------------


-- ---------------------------------------------------------
-- Tables
-- ---------------------------------------------------------

create table if not exists public.communities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  description text,
  color       text not null default 'blue',
  invite_code text not null unique,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The three switches are the whole privacy model, and they are false.
-- Joining a community shares nothing until the member says otherwise, and
-- says it again for the next community — a study group seeing your plan must
-- never imply your family sees your salah.
create table if not exists public.community_members (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  share_plan   boolean not null default false,
  share_salah  boolean not null default false,
  share_shelf  boolean not null default false,
  joined_at    timestamptz not null default now(),
  unique (community_id, user_id)
);

create index if not exists community_members_user_idx on public.community_members (user_id);
create index if not exists community_members_community_idx on public.community_members (community_id);

-- A joint habit.
--
-- Same shape as a personal habit on purpose: cadence, weekdays, times_per_week
-- and target_count are named exactly as `public.habits` names them, so the app
-- hands one straight to lib/habits and reuses the single answer to "is this due
-- today?" rather than growing a second one.
--
-- Unlike a plan or a salah record, a habit log here is not private life data
-- pulled out of a private table — it is written into the community by the act
-- of ticking it. So these two tables need no definer function: ordinary RLS,
-- read by members, written by the person it belongs to.
create table if not exists public.community_habits (
  id             uuid primary key default gen_random_uuid(),
  community_id   uuid not null references public.communities(id) on delete cascade,
  name           text not null default '',
  icon           text not null default 'check',
  color          text not null default 'blue',
  cadence        text not null default 'daily' check (cadence in ('daily', 'weekly', 'custom')),
  weekdays       integer[] not null default '{}',
  times_per_week integer not null default 3,
  target_count   integer not null default 1,
  unit           text,
  archived       boolean not null default false,
  created_by     uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists community_habits_community_idx on public.community_habits (community_id);

-- One row per person per habit per day. The unique constraint is what makes a
-- tick idempotent: a second device ticking the same day updates rather than
-- adding a duplicate nobody can see.
create table if not exists public.community_habit_logs (
  id         uuid primary key default gen_random_uuid(),
  habit_id   uuid not null references public.community_habits(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  count      integer not null default 1,
  note       text,
  logged_at  timestamptz not null default now(),
  unique (habit_id, user_id, date)
);

create index if not exists community_habit_logs_habit_idx on public.community_habit_logs (habit_id, date);

-- A recommendation is something you chose to say out loud, so unlike a plan
-- or a prayer it needs no switch: posting it is the consent.
create table if not exists public.community_recs (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null default 'book'
               check (kind in ('book', 'film', 'anime', 'series', 'youtube', 'other')),
  title        text not null default '',
  creator      text,
  url          text,
  note         text,
  color        text not null default 'blue',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists community_recs_community_idx on public.community_recs (community_id);

create table if not exists public.community_rec_saves (
  id         uuid primary key default gen_random_uuid(),
  rec_id     uuid not null references public.community_recs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (rec_id, user_id)
);


-- ---------------------------------------------------------
-- is_member — the helper every policy leans on
--
-- It has to be a definer function. A policy on community_members that reads
-- community_members re-enters its own policy and Postgres gives up with
-- "infinite recursion detected". This is the standard way that schema fails
-- and the reason this function exists at all.
-- ---------------------------------------------------------
create or replace function public.is_member(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.community_members m
    where m.community_id = p_community_id
      and m.user_id = auth.uid()
  );
$$;

-- Supabase grants EXECUTE on public functions to anon and authenticated by
-- default privilege, so revoking from `public` leaves anon holding a grant of
-- its own. Every definer function here refuses a signed-out caller on its
-- first line anyway; this makes the door locked as well as guarded.
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;


-- ---------------------------------------------------------
-- Policies
-- ---------------------------------------------------------

alter table public.communities                  enable row level security;
alter table public.community_members            enable row level security;
alter table public.community_habits            enable row level security;
alter table public.community_habit_logs        enable row level security;
alter table public.community_recs               enable row level security;
alter table public.community_rec_saves          enable row level security;

-- Communities: visible to members. Created by anyone (you are not yet a
-- member at the moment of insert, which is why the check is on created_by).
drop policy if exists "communities are visible to members" on public.communities;
create policy "communities are visible to members" on public.communities
  for select using (public.is_member(id));

drop policy if exists "anyone can create a community" on public.communities;
create policy "anyone can create a community" on public.communities
  for insert with check (auth.uid() = created_by);

drop policy if exists "owners edit their community" on public.communities;
create policy "owners edit their community" on public.communities
  for update using (auth.uid() = created_by) with check (auth.uid() = created_by);

drop policy if exists "owners delete their community" on public.communities;
create policy "owners delete their community" on public.communities
  for delete using (auth.uid() = created_by);

-- Members: a member sees the roster of their own communities. A member can
-- only ever write their own row — the share switches are nobody else's to
-- flip, including the owner's.
drop policy if exists "members see the roster" on public.community_members;
create policy "members see the roster" on public.community_members
  for select using (public.is_member(community_id));

drop policy if exists "you join yourself" on public.community_members;
create policy "you join yourself" on public.community_members
  for insert with check (auth.uid() = user_id);

drop policy if exists "you edit your own membership" on public.community_members;
create policy "you edit your own membership" on public.community_members
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "you leave yourself" on public.community_members;
create policy "you leave yourself" on public.community_members
  for delete using (auth.uid() = user_id);

-- Joint goals and recs are community content: members read all of it, and
-- write rows they author.
drop policy if exists "members read habits" on public.community_habits;
create policy "members read habits" on public.community_habits
  for select using (public.is_member(community_id));

drop policy if exists "members add habits" on public.community_habits;
create policy "members add habits" on public.community_habits
  for insert with check (public.is_member(community_id) and auth.uid() = created_by);

drop policy if exists "members edit habits" on public.community_habits;
create policy "members edit habits" on public.community_habits
  for update using (public.is_member(community_id)) with check (public.is_member(community_id));

drop policy if exists "authors delete habits" on public.community_habits;
create policy "authors delete habits" on public.community_habits
  for delete using (auth.uid() = created_by);

-- Everyone in the community sees everyone's ticks — that is the entire point
-- of a joint habit — but only you can write yours.
drop policy if exists "members read habit logs" on public.community_habit_logs;
create policy "members read habit logs" on public.community_habit_logs
  for select using (exists (
    select 1 from public.community_habits h
    where h.id = habit_id and public.is_member(h.community_id)
  ));

drop policy if exists "you log for yourself" on public.community_habit_logs;
create policy "you log for yourself" on public.community_habit_logs
  for insert with check (auth.uid() = user_id and exists (
    select 1 from public.community_habits h
    where h.id = habit_id and public.is_member(h.community_id)
  ));

drop policy if exists "you edit your own logs" on public.community_habit_logs;
create policy "you edit your own logs" on public.community_habit_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "you remove your own logs" on public.community_habit_logs;
create policy "you remove your own logs" on public.community_habit_logs
  for delete using (auth.uid() = user_id);

drop policy if exists "members read recs" on public.community_recs;
create policy "members read recs" on public.community_recs
  for select using (public.is_member(community_id));

drop policy if exists "members post recs" on public.community_recs;
create policy "members post recs" on public.community_recs
  for insert with check (public.is_member(community_id) and auth.uid() = user_id);

drop policy if exists "authors edit recs" on public.community_recs;
create policy "authors edit recs" on public.community_recs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "authors delete recs" on public.community_recs;
create policy "authors delete recs" on public.community_recs
  for delete using (auth.uid() = user_id);

drop policy if exists "members read saves" on public.community_rec_saves;
create policy "members read saves" on public.community_rec_saves
  for select using (exists (
    select 1 from public.community_recs r
    where r.id = rec_id and public.is_member(r.community_id)
  ));

drop policy if exists "you save for yourself" on public.community_rec_saves;
create policy "you save for yourself" on public.community_rec_saves
  for insert with check (auth.uid() = user_id and exists (
    select 1 from public.community_recs r
    where r.id = rec_id and public.is_member(r.community_id)
  ));

drop policy if exists "you unsave for yourself" on public.community_rec_saves;
create policy "you unsave for yourself" on public.community_rec_saves
  for delete using (auth.uid() = user_id);


-- ---------------------------------------------------------
-- local_today — each member's own today
--
-- The app's dates are local 'yyyy-MM-dd' strings, so "today" is a different
-- day for different people and `current_date` on the server is nobody's.
--
-- Taking the date as a parameter was the obvious alternative and is wrong:
-- a client that can name the date can ask for any date, and "today's plan
-- only" stops being true the moment someone edits the request. Reading each
-- member's own timezone off their profile cannot be spoofed at all.
--
-- An unknown zone name would raise, so it is checked rather than trusted.
-- ---------------------------------------------------------
create or replace function public.local_today(p_tz text)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_tz is null or p_tz = '' then current_date
    when exists (select 1 from pg_timezone_names where name = p_tz)
      then (now() at time zone p_tz)::date
    else current_date
  end;
$$;


-- ---------------------------------------------------------
-- community_feed — the only thing that crosses accounts
--
-- Returns one row per member. `plan` and `salah` are null unless that member
-- turned the matching switch on for THIS community.
--
-- What a member never sends, whatever the switches say: task notes, times,
-- subtasks, tags, projects, any day but their own today, and every other
-- table in the database.
--
-- You always see your own row in full — it is your data — and the flags come
-- back so the page can tell you plainly that nobody else is seeing it.
-- ---------------------------------------------------------
create or replace function public.community_feed(p_community_id uuid)
returns table (
  user_id      uuid,
  display_name text,
  avatar       text,
  role         text,
  is_self      boolean,
  shares_plan  boolean,
  shares_salah boolean,
  shares_shelf boolean,
  plan         jsonb,
  salah        jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  -- The lock. A definer function bypasses RLS, so nothing above this line may
  -- read anything.
  if not public.is_member(p_community_id) then
    return;
  end if;

  return query
  select
    m.user_id,
    coalesce(p.display_name, 'Member') as display_name,
    p.avatar,
    m.role,
    (m.user_id = auth.uid()) as is_self,
    m.share_plan,
    m.share_salah,
    m.share_shelf,

    case when m.share_plan or m.user_id = auth.uid() then (
      select coalesce(jsonb_agg(jsonb_build_object('title', t.title, 'status', t.status)
                                order by t.order_index, t.created_at), '[]'::jsonb)
      from public.tasks t
      where t.user_id = m.user_id
        and t.date = public.local_today(p.timezone)
        and t.parent_id is null
        and t.deleted_at is null
    ) end as plan,

    case when m.share_salah or m.user_id = auth.uid() then (
      select coalesce(jsonb_agg(jsonb_build_object('name', pr.name, 'status', pr.status)), '[]'::jsonb)
      from public.prayers pr
      where pr.user_id = m.user_id
        and pr.date = public.local_today(p.timezone)
    ) end as salah

  from public.community_members m
  left join public.profiles p on p.id = m.user_id
  where m.community_id = p_community_id
  order by (m.user_id = auth.uid()) desc, m.joined_at;
end;
$$;

revoke execute on function public.community_feed(uuid) from public, anon;
grant execute on function public.community_feed(uuid) to authenticated;


-- ---------------------------------------------------------
-- create_community — the other half of the door
--
-- Creating one from the client could not work, and the reason is worth writing
-- down. `communities` is readable by members only, so at the instant the row is
-- inserted its own creator cannot see it. PostgREST asks for the new row back,
-- Postgres applies the SELECT policy to the RETURNING clause, denies it, and
-- rolls the whole INSERT back. The failure reads as a permissions problem and
-- is really an ordering one.
--
-- Doing both writes here fixes the ordering and makes them atomic as well:
-- there is no longer a moment where a community exists with nobody in it.
-- ---------------------------------------------------------
create or replace function public.create_community(
  p_name        text,
  p_description text,
  p_color       text,
  p_invite_code text
)
returns public.communities
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.communities;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'a community needs a name';
  end if;

  insert into public.communities (name, description, color, invite_code, created_by)
  values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''),
          coalesce(p_color, 'blue'), upper(btrim(p_invite_code)), auth.uid())
  returning * into v_row;

  insert into public.community_members (community_id, user_id, role, share_plan, share_salah, share_shelf)
  values (v_row.id, auth.uid(), 'owner', false, false, false);

  return v_row;
end;
$$;

revoke execute on function public.create_community(text, text, text, text) from public, anon;
grant execute on function public.create_community(text, text, text, text) to authenticated;


-- ---------------------------------------------------------
-- join_community — the only way in
--
-- A code is useless without this: `communities` is readable by members only,
-- so a person holding an invite cannot look up the row they are trying to
-- join. Hence a definer function, which does exactly one write and returns
-- exactly the id.
-- ---------------------------------------------------------
create or replace function public.join_community(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select c.id into v_id
  from public.communities c
  where upper(c.invite_code) = upper(trim(p_code));

  if v_id is null then
    raise exception 'no community with that code';
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (v_id, auth.uid(), 'member')
  on conflict (community_id, user_id) do nothing;

  return v_id;
end;
$$;

revoke execute on function public.join_community(text) from public, anon;
grant execute on function public.join_community(text) to authenticated;


-- ---------------------------------------------------------
-- Templates
--
-- The Templates feature was removed from the app. Its table is deliberately
-- NOT dropped here: a deploy that deletes a person's saved routines without
-- being asked is not a thing this repo should be able to do.
--
-- Drop it by hand, once, if you are sure:
--
--   drop table if exists public.templates;
-- ---------------------------------------------------------


-- ---------------------------------------------------------
-- Joint goals, removed
--
-- Goals were replaced by joint habits. Their tables are deliberately NOT
-- dropped here, for the same reason `templates` was not: a deploy that deletes
-- what people wrote, without being asked, is not something this repo should be
-- able to do.
--
-- Drop them by hand, once, if you are sure:
--
--   drop table if exists public.community_goal_contributions;
--   drop table if exists public.community_goals;
-- ---------------------------------------------------------
