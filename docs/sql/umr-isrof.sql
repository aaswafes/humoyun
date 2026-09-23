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
-- zero, so it has no ratio of its own and does not spend the Dam budget.
--
-- RUN THIS ONCE: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Or, with SUPABASE_ACCESS_TOKEN in .env.local:
--   node scripts/db.mjs docs/sql/umr-isrof.sql
--
-- Five CHECK constraints name the kinds that are allowed, and a CHECK can only
-- be widened by dropping and re-adding it. All five names are known, so this
-- is five pairs of lines and nothing clever. Existing rows all pass.
--
-- Nothing already recorded is touched. Safe to re-run.
-- =========================================================

alter table public.tasks drop constraint if exists tasks_umr_check;
alter table public.tasks add constraint tasks_umr_check
  check (umr is null or umr in ('talim','ibodat','xordiq','dam','inson','isrof'));

alter table public.habits drop constraint if exists habits_umr_check;
alter table public.habits add constraint habits_umr_check
  check (umr is null or umr in ('talim','ibodat','xordiq','dam','inson','isrof'));

alter table public.focus_sessions drop constraint if exists focus_sessions_umr_kinds_check;
alter table public.focus_sessions add constraint focus_sessions_umr_kinds_check
  check (umr_kinds <@ array['talim','ibodat','xordiq','dam','inson','isrof']::text[]);

-- `focus_sessions.umr` is the dead single-kind column, kept so an older build
-- cannot fail on insert. Its CHECK is widened too, for the same reason.
alter table public.focus_sessions drop constraint if exists focus_sessions_umr_check;
alter table public.focus_sessions add constraint focus_sessions_umr_check
  check (umr is null or umr in ('talim','ibodat','xordiq','dam','inson','isrof'));

alter table public.umr_logs drop constraint if exists umr_logs_category_check;
alter table public.umr_logs add constraint umr_logs_category_check
  check (category in ('talim','ibodat','xordiq','dam','inson','isrof'));

-- Proof it took: all five lines below should contain 'isrof'.
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conname in (
   'tasks_umr_check', 'habits_umr_check',
   'focus_sessions_umr_kinds_check', 'focus_sessions_umr_check',
   'umr_logs_category_check'
 )
 order by 1, 2;
