# Humoyun — what to add, what to remove

**Date:** 2026-08-31
**Status:** proposed, awaiting greenlight
**Scope:** no new surfaces. Consolidate what exists, then make it reachable.

The app is 312 files, 16 signed-in surfaces, ~55,000 lines. Every finding below
was read out of the tree, not assumed. Line numbers are current as of `ae2f4fb`.

---

## Summary

| # | Change | Kind | Lines | Effort | Risk |
|---|---|---|---|---|---|
| A3 | Command palette can't see Notes, Films, YouTube | add | +30 | S | very low |
| R3 | Four analytics functions exist twice | remove | −60 | S | very low |
| A4 | No tests at all | add | +150 | S–M | low |
| R1 | YouTube is a filtered copy of Films & Anime | remove | **−2,174** | M | low |
| A1 | The app shell has no mobile layout | add | +400 | L | medium |
| R2 | Books and Films are one kit with two units | remove | **−2,500** | L | medium |
| A2 | Notifications only fire with a tab open | add | +350 | L | med-high |

Effort: **S** under a session · **M** one session · **L** two to three.

---

## Remove

### R1 — YouTube is a filtered view of a surface that already exists

The strongest finding in the audit. YouTube is not a separate feature; it is
`/watch` with a different `WHERE kind IN (...)`.

`types.ts:126-130` says so outright:

```ts
export type MediaKind = "film" | "anime" | "series" | "youtube" | "playlist";
export const MEDIA_KINDS: MediaKind[] = ["film", "anime", "series"];
/** The YouTube shelf is the same model, listed separately. */
export const YOUTUBE_KINDS: MediaKind[] = ["youtube", "playlist"];
```

Both pages are line-for-line parallel. `watch/page.tsx:84-85` and
`youtube/page.tsx:84-85` are the same four lines with one constant swapped, and
`youtube/page.tsx:12` already imports `buildMediaRows` from
`components/watch/media-table`. One table, one store collection (`media`), one
set of rows — rendered by two sets of components:

| `components/watch/` | `components/youtube/` |
|---|---|
| `media-sheet.tsx` (1,196) | `video-sheet.tsx` (957) |
| `media-table.tsx` (472) | `video-table.tsx` (235) |
| `watch-toolbar.tsx` (196) | `youtube-toolbar.tsx` (199) |
| `media-card.tsx` (158) | `video-card.tsx` (186) |
| `watch-insights.tsx` (172) | `youtube-insights.tsx` (141) |
| `episode-log.tsx` (99) | `video-log.tsx` (99) |
| `add-media-modal.tsx` (266) | `add-video-modal.tsx` (270) |
| `facets.ts` (56) | `youtube-facets.ts` (45) |
| `watch-plan.ts` (285) | `youtube-plan.ts` (42) |

**Do:** delete the `/youtube` route and `components/youtube/*` **except**
`youtube-url.ts` (69) and `youtube-link.tsx` (66), which are genuinely
YouTube-specific and move into `components/watch/`. Add a kind filter to the
Watch toolbar so the YouTube shelf is one click, and rename the surface
**Watchlist**.

**Saves:** ~2,174 lines, one route, one sidebar item.
**No migration** — the rows already live in the same table. Nothing is lost:
every YouTube capability survives as a filter.

### R2 — Books and Films are one kit with two units

Not a database merge. The two tables stay. The *UI* is duplicated.

| `Book` | `Media` |
|---|---|
| `author` | `creator` |
| `genre` `topic` `series` | `genre` `topic` `series` |
| `cover_url` `color` `rating` `notes` | `cover_url` `color` `rating` `notes` |
| `total_pages` `current_page` | `total_episodes` `current_episode` |
| `pages_per_day` | `episodes_per_day` |
| `start_date` `end_date` `status` | `start_date` `end_date` `status` |

The shapes differ by a unit noun. Media adds `url`, `channel`, `runtime_min`;
Book adds nothing Media lacks. Yet `book-sheet.tsx` (889) and `media-sheet.tsx`
(1,196) — the two largest components in the app — solve the same problem twice,
as do the card, table, toolbar, facets, cover and plan files.

**Do:** extract `components/library/` — one `ItemCard`, `ItemSheet`,
`ItemTable`, `Toolbar`, `facets`, `plan`, parameterised by a unit descriptor
(`{ noun: "page" | "episode", total, current, perDay }`). Books and Watchlist
become thin configuration on top.

**Saves:** ~2,500 lines.
**Risk:** medium. These are the app's two biggest components. This is careful
decomposition, not a merge-and-pray — and it should land *after* A4.

### R3 — Four analytics functions exist twice

| Function | Copy A | Copy B |
|---|---|---|
| `plannedMinutes` | `stats/derive.ts:69` | `review/derive.ts:276` |
| `sessionDate` | `stats/derive.ts:90` | `review/metrics.ts:61` |
| `isFocus` / `isFocusSession` | `stats/derive.ts:95` | `review/metrics.ts:59` |
| `focusByTag` | `stats/derive.ts:294` | `review/derive.ts:234` |

The first three are identical today, differing only in formatting. `focusByTag`
has two signatures for one intent.

They agree now. Nothing keeps them agreeing. The day they drift, Stats and
Weekly Review report **different numbers for the same week** — a bug you never
catch, you just quietly stop trusting the app.

**Do:** move the shared four into `src/lib/metrics.ts`; both surfaces import it.

### R4 — The sidebar is the density problem the calm pass didn't reach

Sixteen items in four groups (`sidebar.tsx:70-110`). The calm pass fixed the
pages and left the nav. R1 takes it to 15, R2 to 14. That alone may be enough —
worth re-reading the nine rules against the sidebar once both land.

### Checked and *not* a duplicate: Notes vs Mind Map

`Note` (`types.ts:190`) and `MapNode` (`types.ts:273`) are genuinely different
entities. Note carries `body`, `tags`, `pinned`, `locator` and foreign keys to
book, media, task, goal and node. MapNode carries `x`, `y`, `w`, `h`, `shape`
for canvas layout. `Note.node_id` already links the two.

There is a real question here — *where does a thought go?* — but it is a product
decision, not code bloat. **No deletion proposed.**

---

## Add

### A1 — The app shell has no mobile layout

Responsive prefixes across the entire shell:

| File | `sm:`/`md:`/`lg:`/`xl:` |
|---|---|
| `shell/app-shell.tsx` | **0** |
| `shell/sidebar.tsx` | **0** |
| `shell/command-palette.tsx` | **0** |
| `shell/quick-add.tsx` | **0** |
| `shell/timer-bar.tsx` | **0** |
| `(app)/layout.tsx` | **0** |
| `shell/page-header.tsx` | 1 (`md:px-8`) |

`globals.css:55` sets `--sidebar-w: 264px` with no media query — the file
contains exactly one `@media`, for reduced motion. The sidebar is `shrink-0` at
264px (`sidebar.tsx:116`), so on a 390px phone the content gets 126px.

A calendar-first personal operating system you cannot open on your phone is
half an operating system. This is the highest-impact item on the list.

**Do:** sidebar becomes a `Sheet` below `md`; `--sidebar-w` gets a media query;
`PageBody` padding steps down; tap targets audited to 44px on touch — the
contract's 28px floor is a mouse number.

**Note:** this touches `globals.css`, `app-shell.tsx`, `sidebar.tsx` and
`(app)/layout.tsx`, all listed under **Do not touch** in `CONTRACT.md`. It needs
an explicit contract amendment before a line is written.

### A2 — Notifications only fire with a tab open

`settings/reminders.ts:9-14`, in its own words:

> Everything here is local: the browser's own Notification API, prayer times
> calculated on the device, tasks already in memory. Nothing is sent anywhere
> and there is no server pushing anything — **reminders arrive while Humoyun is
> open in a tab**.

`public/manifest.webmanifest` exists; there is no service worker anywhere in the
tree. The Notifications pane offers a Fajr reminder, a morning plan at 08:00 and
a habit nudge at 20:00 — three things that fire precisely when a laptop is shut.

**Do:** service worker + Web Push, with a Supabase edge function on cron doing
the scheduling. Prayer times are computed locally by `adhan` but can be
precomputed a day ahead per profile.

**Depends on A1.** iOS Safari delivers push only to an installed PWA, so the
mobile shell is a hard prerequisite, not a nice-to-have.

### A3 — The command palette can't see three surfaces

`command-palette.tsx:31-35` subscribes to exactly five collections:

```ts
const tasks  = useStore((s) => s.tasks);
const books  = useStore((s) => s.books);
const habits = useStore((s) => s.habits);
const goals  = useStore((s) => s.goals);
const nodes  = useStore((s) => s.nodes);
```

No `notes`. No `media`. So **Notes**, **Films & Anime** and **YouTube** — the
three newest features, shipped in `19e8350` and `ae2f4fb` — are invisible to
⌘K. Task *notes* aren't searched either; line 100 matches titles only.

The placeholder still reads "Search tasks, books, habits — or run a command",
which is at least honest.

**Do:** add `notes` and `media` result groups; extend task matching to `notes`.
Best value-per-hour on the list.

### A4 — No tests

`playwright` sits in `devDependencies`; the tree contains no `*.spec.*` or
`*.test.*`. Not a coverage drive — one smoke path:

> sign in → add a task by natural language → see it on Today → complete it →
> see Today's ring move.

That single test covers the store, `parse.ts`, the optimistic write path and the
Today surface — exactly the blast radius of R1 and R2. **It lands before them,
not after.**

---

## Sequencing

**Wave 1 — one day, near-zero risk.** A3 + R3 + A4.
A4 is the safety net for everything after it. A3 and R3 are small, self-contained
and felt immediately.

**Wave 2 — the merge that pays for itself.** R1.
Biggest line reduction for the least risk, because the data model is already
shared. Needs Wave 1's smoke test in place.

**Wave 3 — pick one.** R2 or A1.
R2 if the app feels *heavy to work on*. A1 if it feels *hard to use*.
**Recommendation: A1.** A life OS you can't check on your phone loses to the phone.

**Wave 4 — A2.** Strictly after A1.

## Deliberately not doing

- **No new surfaces.** Sixteen exist and none are tested. A seventeenth makes it worse.
- **No Notes/Map merge.** They are distinct entities. Decide the UX question first.
- **No database migrations.** R1 and R2 are both pure UI consolidation.

## Open questions

1. Does the contract get amended for A1, or does mobile live in a parallel shell?
2. Is the Watchlist kind filter a segmented control or a facet in the existing toolbar?
3. Does R2 keep two routes (Books, Watchlist) or become one **Library** with a type filter?
