-- =========================================================
-- Folding a note away, and locking one.
--
-- Run once against the Supabase project. Local preview mode
-- (NEXT_PUBLIC_SOLO=1) needs none of this.
--
--   collapsed  the card shows its title and nothing else. A view preference,
--              but stored on the row rather than in localStorage so a note you
--              folded away stays folded on every device.
--
--   lock       null for an ordinary note. When it is set, `body` is no longer
--              text — it is base64 AES-GCM ciphertext, and this column holds
--              the salt and IV needed to try a password against it.
--
--              The password itself is nowhere: not in this table, not in the
--              app, not on the server. The key is derived in the browser and
--              lives only in memory. That is the point, and it is also the
--              risk — a forgotten password is an unreadable note, permanently.
-- =========================================================

alter table public.notes
  add column if not exists collapsed boolean not null default false,
  add column if not exists lock      jsonb;

-- Locked notes are excluded from search and from every word count, so they are
-- worth finding cheaply.
create index if not exists notes_locked_idx on public.notes (user_id) where lock is not null;
