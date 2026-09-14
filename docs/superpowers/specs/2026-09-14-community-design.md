# Community — design

Date: 2026-09-14
Status: approved

Qalamchi has been one person's operating system. This adds the first surface where
another human being appears in it.

## The problem

Every table in this app carries one policy: `auth.uid() = user_id`. "Only you can
read this row." That is the product's spine, not an implementation detail — it is
why it is safe to put your prayers and your unfinished thoughts in the same
database as your task list.

A community means someone else sees some of that. The entire design is the shape
of the hole we cut, and how small we can keep it.

## The one door

**No existing table's RLS changes.** Not `tasks`, not `prayers`, not `books`,
not `profiles`. Adding a second permissive policy to `tasks` — "also readable if
you share a community with the owner and they opted in and the date is today and
it is top-level and not deleted" — is five conditions on the table that holds a
person's whole life, and one wrong `or` leaks all of it forever.

Instead there is **one `security definer` function**, `community_feed(p_community_id)`.
It is the only code in the system that can read across accounts. It returns:

- member `user_id`, `display_name`, `avatar`
- `plan`: today's top-level, non-deleted task `title` + `status` — **only** when
  that member's `share_plan` is true for this community
- `salah`: today's five prayer statuses — **only** when `share_salah` is true
- nothing else

Not notes. Not times. Not subtasks. Not yesterday or tomorrow. Not another table.
The function's `select` list is the privacy policy, written once, in one place a
person can read in thirty seconds.

The function's first statement is the membership check: if the caller is not an
accepted member of `p_community_id`, it returns zero rows. `security definer`
means it runs as its owner and bypasses RLS, so that check is load-bearing —
it is the lock, and it comes before anything else in the body.

### Why not a published snapshot

The alternative was a `community_day` table each client writes its own summary
into. Safe by construction, but it is a second copy of the truth that goes stale,
rewrites on every checkbox, and can disagree with the real task list. This
codebase already decided against second copies (see the notes workspace: "a note
on the canvas, a dot in the graph and a card in the list are the same note").
A definer function is as contained and always current.

## Tables

All new. None of them touch an existing table.

| Table | Holds |
|---|---|
| `communities` | name, description, tint, `invite_code` (unique, short), `created_by` |
| `community_members` | `community_id`, `user_id`, role, `joined_at`, three share flags |
| `community_goals` | joint goal: title, unit, `target`, deadline, status |
| `community_goal_contributions` | `goal_id`, `user_id`, `amount`, note, date |
| `community_recs` | kind, title, creator, url, note, author |
| `community_rec_saves` | `rec_id`, `user_id` — who took the advice |

`community_members` carries `share_plan`, `share_salah`, `share_shelf`, all
`default false`. Sharing is per membership, so a study group can see your plan
while only your family sees your salah.

RLS on the new tables uses one helper, `is_member(community_id)`, itself a
`security definer` function — a policy on `community_members` that queries
`community_members` recurses forever otherwise, and that is the classic way this
schema fails.

## Surfaces

### `/community`

Your communities as rows. **Create** and **Join with a code**. Empty state offers
both, because an empty community page with no way out is the worst screen in the app.

### `/community/[id]`

Four sections, one page, folded per the density rules.

**Today** — one row per member: avatar, name, a progress ring, five salah dots,
and today's task titles listed quietly underneath. A member sharing nothing still
appears, marked "not sharing" — hiding people makes a community feel dead, and
the absence is information.

**Goals** — pooled joint goals. One bar, the total against the target, and a
per-member breakdown of who put in what. **+ Log progress** adds a contribution.

**Recs** — a book, film, anime or channel with a note saying why. Every rec has
**Add to my shelf**, which inserts a real row into your own `books` or `media`
through the existing store action. That button is the reason this is part of
Qalamchi and not a group chat.

**Members** — the invite code, your three switches, leave. Owners can rename,
recolour and delete.

## Where the data lives

The store's rule is "no fetching — the store holds everything". That rule is
about *your* rows: `hydrate` pulls every collection for `user_id = you` and the
optimistic CRUD stamps `user_id` on every write.

Community data breaks both halves — it is other people's rows, and it arrives
through an RPC. So it does not go in the global store. `src/components/community/`
owns its own small data module with its own loading state, refreshed on mount and
on window focus. Communities and memberships go through the same module for the
same reason: a `communities` row has no `user_id` for the store's CRUD to stamp.

In `SOLO` mode there is no network and no account, so the page shows a single
empty state saying community needs a real account. It does not half-work.

## Navigation

The `build` sidebar group is replaced by `community`. Group ids stay separate
from labels so switching language does not reset what is folded.

Settings keeps its two existing homes: the account menu and the command palette.

## Templates are removed

Not just delisted — removed. The page, the components, the `templates` collection,
`applyTemplate` and `saveDayAsTemplate`, the Calendar's template drag target, the
right-rail card, the day-peek menu, the "save this day as a routine" action, the
command-palette entries, the sample-data seed, and the i18n keys.

Note templates (`is_template` rows in `notes`) are an unrelated feature and stay.

The `templates` Postgres table is **not dropped** by the app. The SQL file says
how to drop it, commented, as a deliberate manual step — code that deletes a
user's data on deploy is not something this repo should contain.

## Verification

- `npx tsc --noEmit` clean
- `npm run lint` clean
- `npm run build` succeeds
- no `templates` identifier left outside the notes feature
- the door: call `community_feed` for a community the caller does not belong to
  and confirm zero rows; turn `share_salah` off and confirm salah disappears
- both themes, tokens only, no raw hex
