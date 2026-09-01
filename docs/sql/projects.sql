-- =========================================================
-- Projects
--
-- Run once against the Supabase project. Local preview mode
-- (NEXT_PUBLIC_SOLO=1) needs none of this — it mirrors the same shape into
-- localStorage — so this file only matters when the app is pointed at a real
-- database.
--
-- A project owns tasks. Milestones are not a table: a task with
-- kind = 'milestone' inside a project is one.
-- =========================================================

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default '',
  description text,
  status      text not null default 'active'
              check (status in ('idea', 'active', 'paused', 'done', 'dropped')),
  color       text not null default 'blue',
  icon        text,
  start_date  date,
  due_date    date,
  goal_id     uuid references public.goals(id) on delete set null,
  order_index double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id);
create index if not exists projects_goal_idx on public.projects (goal_id);

alter table public.projects enable row level security;

-- One policy, same shape as every other table: a row is only ever visible to
-- the account that owns it.
drop policy if exists "projects are private" on public.projects;
create policy "projects are private" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------
-- The link from work to project.
--
-- ON DELETE SET NULL, deliberately: deleting the container must never delete
-- the work. The app unlinks tasks and notes before it removes a project, and
-- this is the backstop for anything that gets there another way.
-- ---------------------------------------------------------
alter table public.tasks
  add column if not exists project_id uuid references public.projects(id) on delete set null;

alter table public.notes
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists tasks_project_idx on public.tasks (project_id);
create index if not exists notes_project_idx on public.notes (project_id);
