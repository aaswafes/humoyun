-- =========================================================
-- Folders, and one password for all of them.
--
-- Run once against the Supabase project.
--
-- A folder is a note's one home, which is what makes it draggable: you can
-- drop a note into a place, and it leaves the place it was. Categories stay
-- what they were — as many as apply, none of them a home. Two ideas, kept
-- apart on purpose.
-- =========================================================

create table if not exists public.note_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'New folder',
  icon        text,
  color       text not null default 'slate',
  order_index double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists note_folders_user_idx on public.note_folders (user_id);
create unique index if not exists note_folders_name_idx
  on public.note_folders (user_id, lower(name));

alter table public.note_folders enable row level security;

drop policy if exists "note folders are private" on public.note_folders;
create policy "note folders are private" on public.note_folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ON DELETE SET NULL, deliberately: throwing a folder away must never throw
-- the writing away with it. The notes fall back to Unfiled.
alter table public.notes
  add column if not exists folder_id uuid references public.note_folders(id) on delete set null;

create index if not exists notes_folder_idx on public.notes (user_id, folder_id);
