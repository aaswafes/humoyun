-- =========================================================
-- Isrof — the sixth kind of living.
--
-- "Isrof" is waste: the hours you would take back. It is NOT Dam. Dam is
-- amusement you chose and budgeted for; Isrof is time that left nothing
-- behind. Keeping them apart is the whole point of adding it — a day with two
-- hours of Dam and none of Isrof is a different day from the reverse, and one
-- bucket called "not work" would hide that.
--
-- Isrof is deliberately NOT capped. You do not budget waste, you drive it to
-- zero, so it has no ratio of its own and does not spend the Dam budget. Say
-- the word if you want it to come out of the same pocket as Dam.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR before using Isrof in the app:
--   Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Until it runs, picking Isrof will fail to save and the app will say so —
-- nothing breaks, and nothing already recorded is touched.
--
-- Safe to re-run.
-- =========================================================

-- Every place a kind of living is written has a CHECK naming the allowed
-- words, so each one has to learn the new one. Dropping and re-adding is the
-- only way to widen a CHECK; it is instant and validates the existing rows,
-- all of which already pass.

alter table public.tasks  drop constraint if exists tasks_umr_check;
alter table public.habits drop constraint if exists habits_umr_check;

alter table public.tasks
  add constraint tasks_umr_check
  check (umr is null or umr in ('talim', 'ibodat', 'xordiq', 'dam', 'inson', 'isrof'));

alter table public.habits
  add constraint habits_umr_check
  check (umr is null or umr in ('talim', 'ibodat', 'xordiq', 'dam', 'inson', 'isrof'));

alter table public.focus_sessions drop constraint if exists focus_sessions_umr_kinds_check;
alter table public.focus_sessions
  add constraint focus_sessions_umr_kinds_check
  check (umr_kinds <@ array['talim', 'ibodat', 'xordiq', 'dam', 'inson', 'isrof']::text[]);

-- The dead single-kind column keeps its own CHECK widened too, so an older
-- build that is still serving cannot fail on insert mid-deploy.
alter table public.focus_sessions drop constraint if exists focus_sessions_umr_check;
alter table public.focus_sessions
  add constraint focus_sessions_umr_check
  check (umr is null or umr in ('talim', 'ibodat', 'xordiq', 'dam', 'inson', 'isrof'));

-- umr_logs declares its CHECK inline on the column, so it is found by its
-- generated name rather than one we chose.
do $$
declare
  conname_found text;
begin
  select conname into conname_found
    from pg_constraint
   where conrelid = 'public.umr_logs'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%category%';

  if conname_found is not null then
    execute format('alter table public.umr_logs drop constraint %I', conname_found);
  end if;

  alter table public.umr_logs
    add constraint umr_logs_category_check
    check (category in ('talim', 'ibodat', 'xordiq', 'dam', 'inson', 'isrof'));
end $$;

-- Check it took: all four should say the new word is allowed.
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conname in (
   'tasks_umr_check', 'habits_umr_check',
   'focus_sessions_umr_kinds_check', 'focus_sessions_umr_check',
   'umr_logs_category_check'
 )
 order by 1, 2;
