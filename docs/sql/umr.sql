-- =========================================================
-- Umr — the time ledger.
--
-- "Umr" is a lifetime. The section divides every minute into five kinds of
-- living: taʼlim (learning), ibodat (worship), xordiq (restoring yourself),
-- dam (amusement) and inson (people). Dam is capped at a share of taʼlim —
-- ten minutes of study buys one minute of games — so the two have to be
-- counted the same way, from the same ledger, or the cap means nothing.
--
-- Almost all of that ledger is DERIVED and stored nowhere: focus sessions,
-- the minutes recorded on tasks, prayers and habit ticks are already rows in
-- this database. Deriving keeps one fact in one place — change a session and
-- Umr changes with it.
--
-- Two things cannot be derived, and this migration adds them:
--   1. which kind of living a task or a habit belongs to  (tasks.umr, habits.umr)
--   2. the minutes nothing else records at all             (umr_logs)
--      — sleep, meals, a commute, an hour on the phone.
--
-- Everything else about Umr — the Dam ratio, the budget window, the minutes a
-- prayer is worth, the rules that map a task kind or a tag to a category —
-- lives in profiles.prefs.umr as jsonb, so tuning it never needs a migration.
--
-- Safe to re-run.
-- =========================================================

-- ---- 1. the category on the two things that own time ----

alter table public.tasks  add column if not exists umr text;
alter table public.habits add column if not exists umr text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_umr_check') then
    alter table public.tasks
      add constraint tasks_umr_check
      check (umr is null or umr in ('talim', 'ibodat', 'xordiq', 'dam', 'inson'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'habits_umr_check') then
    alter table public.habits
      add constraint habits_umr_check
      check (umr is null or umr in ('talim', 'ibodat', 'xordiq', 'dam', 'inson'));
  end if;
end $$;

-- Null is not "uncategorised for ever" — it means nobody has said yet, and the
-- Umr page lists exactly those rows so they can be triaged in one pass. A
-- default would have hidden them.

-- ---- 2. the minutes nothing else records ----

create table if not exists public.umr_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  category    text not null check (category in ('talim', 'ibodat', 'xordiq', 'dam', 'inson')),
  minutes     integer not null default 0 check (minutes >= 0 and minutes <= 1440),
  label       text,
  -- Minutes past midnight, when it is known. The hour-of-day profile on the
  -- stats page uses it; a row without one still counts towards every total.
  start_min   integer check (start_min is null or (start_min >= 0 and start_min < 1440)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists umr_logs_user_date_idx on public.umr_logs (user_id, date);

alter table public.umr_logs enable row level security;

-- The same four policies every other table in this database carries, and the
-- same shape: one user, their own rows, nothing shared. Umr says more about a
-- person than anything else here, so it is the last thing that should ever
-- grow a cross-account read path.
drop policy if exists own_select on public.umr_logs;
drop policy if exists own_insert on public.umr_logs;
drop policy if exists own_update on public.umr_logs;
drop policy if exists own_delete on public.umr_logs;

create policy own_select on public.umr_logs for select
  using ((select auth.uid()) = user_id);
create policy own_insert on public.umr_logs for insert
  with check ((select auth.uid()) = user_id);
create policy own_update on public.umr_logs for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy own_delete on public.umr_logs for delete
  using ((select auth.uid()) = user_id);
