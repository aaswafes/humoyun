-- =========================================================
-- The notes workspace: categories, rich text, templates, canvas.
--
-- Run once against the Supabase project. Local preview mode
-- (NEXT_PUBLIC_SOLO=1) needs none of this — it mirrors the same shape into
-- localStorage — so this file only matters when the app is pointed at a real
-- database.
--
-- Four columns on notes and one small table, deliberately:
--
--   categories   a note belongs to several shelves at once, unlike `kind`
--                which is one word for what a note *is*. This is what the
--                graph clusters by and what the multiselect writes.
--   format       'plain' for everything written before the rich editor, 'html'
--                after. Old notes keep rendering as text until they are opened
--                and edited, so nothing has to be migrated in place.
--   is_template  a template IS a note. Same editor, same categories, same
--                everything — it is simply held back from the lists and
--                offered when a new note is started.
--   layout       {x,y,w,h,style,z} on the one infinite canvas, or null when
--                the note has not been placed on it. One jsonb rather than six
--                columns, because the canvas will grow more knobs than the
--                schema should have to hear about.
-- =========================================================

alter table public.notes
  add column if not exists categories  text[]  not null default '{}',
  add column if not exists format      text    not null default 'plain',
  add column if not exists is_template boolean not null default false,
  add column if not exists layout      jsonb;

alter table public.notes drop constraint if exists notes_format_check;
alter table public.notes
  add constraint notes_format_check check (format in ('plain', 'html'));

-- Filtering by category is a containment test, which is what GIN indexes.
create index if not exists notes_categories_idx on public.notes using gin (categories);
-- Every list on the surface starts by throwing the templates out.
create index if not exists notes_template_idx on public.notes (user_id, is_template);

-- ---------------------------------------------------------
-- The category vocabulary.
--
-- Categories are stored on the note as plain text so a shelf can be renamed
-- out from under nothing, and this table is what gives each one a colour, an
-- icon and an order. A category with no row here still works — it just draws
-- slate and sorts last, which is what makes typing a new one in the picker
-- safe.
-- ---------------------------------------------------------
create table if not exists public.note_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default '',
  icon        text,
  color       text not null default 'slate',
  order_index double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists note_categories_user_idx on public.note_categories (user_id);
-- Two shelves called "Books" is a bug, not a choice.
create unique index if not exists note_categories_name_idx
  on public.note_categories (user_id, lower(name));

alter table public.note_categories enable row level security;

drop policy if exists "note categories are private" on public.note_categories;
create policy "note categories are private" on public.note_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
