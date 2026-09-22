# Humoyun — build contract

Read this before writing a line. Everything here already exists and works; do not
re-invent it, do not edit the files listed under "Do not touch".

## The product

A calendar-first personal operating system. Notion's structure (checkboxes, inline
editing, tints, templates) with Apple's manners (hairlines, springs, restraint,
tabular numerals). One user, their whole life: tasks, events, reading plans, habits,
salah, goals, focus timers, the Umr time ledger, and weekly review.

## Stack

Next.js 16 (App Router, Turbopack default — never pass `--turbopack`), React 19,
TypeScript, Tailwind v4 (tokens live in CSS via `@theme inline`, there is NO
tailwind.config.ts), Zustand, Supabase (auth + Postgres + RLS), lucide-react icons,
`motion` (Framer Motion v13 namespace) only where a spring genuinely helps,
`@dnd-kit/*` for drag and drop, `adhan` for prayer times.

Next 16 notes: `params`/`searchParams` are async; `middleware.ts` is `proxy.ts`;
`next lint` is gone.

## Design language — non-negotiable

**Colour.** Never write a raw hex or a Tailwind palette colour (`bg-slate-100`,
`text-gray-500`) in a component. Only semantic tokens:

| Token | Use |
|---|---|
| `bg-canvas` | page background |
| `bg-sunken` | sidebar / app chrome |
| `bg-raised` | cards, popovers, anything above the page |
| `bg-hover` / `bg-active` | interaction layers |
| `bg-selected` | selected row |
| `text-ink` | primary text |
| `text-ink-2` | secondary text |
| `text-ink-3` | tertiary / icons |
| `text-ink-4` | placeholders, disabled |
| `border-line` / `border-line-strong` | hairlines |
| `bg-accent` `text-accent` `bg-accent-soft` `text-accent-ink` | the one accent |
| `text-success` `text-warn` `text-danger` + `-soft` variants | semantics |
| `material` | translucent blurred surface (headers, floating bars) |
| `surface` | raised + hairline + radius, in one utility |
| `hairline-b` / `-t` / `-l` / `-r` | 1px inset separators |

Entity colours (tasks, books, habits, tags) use the ten **tints**. Put `tint-${color}`
on an element then read `var(--tint)`, `var(--tint-soft)`, `var(--tint-ink)`. Tints
are already tuned for both themes — never hand-pick a dark-mode value.

**Type.** Body 13–13.5px. Section labels 11px uppercase, `tracking-[0.06em]`,
`text-ink-3`. Page titles 15px semibold `tracking-[-0.01em]`. Big numerals and dates
use `display-serif` (Instrument Serif italic) — this is the app's one flourish, use it
for calendar day numbers, big stats, and empty-state accents, not for body copy.
Every number that changes (timers, counts, prices, stats) gets `tnum`.

**Space.** 4px rhythm. Rows are 28–32px tall. Cards use `rounded-lg` (13px), pills
`rounded-full`, small controls `rounded-md` (9px). Gaps 1.5/2/3.

**Motion.** 120–260ms, `ease-[var(--ease-out-apple)]`. Press feedback is
`active:scale-[0.97]`. Animate transform and opacity only. Entrance classes exist:
`anim-fade`, `anim-pop`, `anim-slide`, `anim-check`. Respect reduced-motion (already
handled globally).

**Interaction rules.** `cursor-pointer` on everything clickable. Icon-only buttons get
`aria-label`. Hit areas ≥28px. Focus rings are global — never remove them. Destructive
actions confirm via `ConfirmDialog`. Empty states always offer the action that fills them.

## Existing API — use it, don't rebuild it

### `@/lib/store` (Zustand)

```ts
const { tasks, books, media, habits, habitLogs, goals, projects,
        prayers, dayLogs, focusSessions, umrLogs, reviews, tags,
        profile, ready, selectedDate, calendarView, hour12 } = useStore();
```

Prefer narrow selectors — `useStore(s => s.tasks)` — over destructuring the whole store.

Generic optimistic CRUD (writes to Supabase, rolls back and toasts on failure):

```ts
insert(collectionKey, partialRow) -> full row     // id/user_id/timestamps filled in
patch(collectionKey, id, changes)
remove(collectionKey, id)
removeWhere(collectionKey, predicate)
```

Collection keys: `tasks books media habits habitLogs goals projects
prayers dayLogs focusSessions umrLogs reviews tags`.

Semantic actions already written — call these instead of hand-rolling:

```ts
addTask(partial) toggleTask(id) moveTask(id, date, startMin?) duplicateTask(id)
addSubtask(parentId, title) createSeries(base, recurrence) deleteSeries(seriesId, from?)
logHabit(habitId, date, count?) toggleHabit(habitId, date)
setPrayer(date, name, status) cyclePrayer(date, name)
setDayLog(date, changes) setReview(weekStart, changes)
logUmr({date?, category, minutes, label?, startMin?})
setTaskUmr(taskId, category|null) setHabitUmr(habitId, category|null)
scheduleBook(bookId, { startDate, pagesPerDay, endDate, skipWeekdays, replace })
unscheduleBook(bookId, from?) logReading(bookId, page)
startTimer({taskId,label,mode,targetMinutes}) pauseTimer() resumeTimer() stopTimer(save)
setSelectedDate(iso) setCalendarView(v) openInspector(taskId|null)
toast({title, description?, tone?: 'default'|'success'|'danger', action?})
setTheme(t) setAccent(a) updateProfile(changes)
```

Selectors exported from the same module:
`tasksOn(tasks,date)`, `subtasksOf`, `inboxTasks`, `overdueTasks`, `completionOn`,
`habitStreak`, `prayerStreak`, `focusMinutesOn`, `orderBetween(before,after)`, `uid()`.

### `@/lib/username`

An account is a **username and a password**. No email, no confirmation step.
`emailForUsername` stores the name as an address inside `users.qalamchi.app`,
which is an identifier and not an inbox; `credentialToEmail` passes anything
containing `@` through untouched, because accounts made before this have real
addresses. **Never print `user.email` on a screen** — `accountLabel(email)`
gives the username for a username account and the address for an older one, and
`isUsernameAccount(email)` says which word to put on the label.

Creating the account is `/api/auth/signup`, server-side with the service-role
key, because the browser's `supabase.auth.signUp` can only ever make an
unconfirmed user and that confirmation mail is what kept not arriving.

### `@/lib/date`

`todayISO toISO fromISO addDays addMonths diffDays isToday isPast weekday startOfWeek
endOfWeek weekDates startOfMonth endOfMonth monthGrid isSameMonth daysBetween monthName
dayName dayNameOf dayNumber yearOf weekdayHeaders formatDate friendlyDate formatTime
formatRange parseTime formatDuration formatClock nowMinutes quarterOf weekNumber`

Dates are always `'yyyy-MM-dd'` local strings. Times are integer minutes from midnight.
Never call `toISOString()` on a user-facing date.

### `@/lib/types`

All entity interfaces plus `TINTS`, `ACCENTS`, `PRAYER_NAMES`, `PRAYER_LABELS`,
`PRIORITY_LABELS`, `TABLE_OF`, `UMR_CATEGORIES`. The Umr *category type* is here
because it is a column type; everything else about Umr is in `@/lib/umr`.

### `@/lib/parse`

`parseTask(input, weekStart)` — natural language to `{title,date,start_min,end_min,
duration_min,tags,priority}`. Reuse it anywhere the user types a task.

### `@/lib/prayer`

`prayerTimesFor(iso, {latitude,longitude,method,madhab})` → minutes for fajr, sunrise,
dhuhr, asr, maghrib, isha, lastThird. `currentPrayer(times, minutesNow)`.
`CALC_METHODS`, `CITY_PRESETS`. Calculated locally — no network.

### UI kit

`@/components/ui/primitives`: `Button IconButton Checkbox Input Textarea InlineInput
AutoTextarea Segmented Badge Progress Ring Kbd Spinner Divider SectionLabel EmptyState
Skeleton Tooltip`

`@/components/ui/overlays`: `Popover MenuItem MenuSeparator MenuLabel Modal Sheet
ConfirmDialog TintPicker useMounted`

`@/components/ui/mini-calendar`: `MiniCalendar` (value, onChange, weekStart, markers)

`@/components/ui/toaster`: mounted globally, drive it with `toast()`.

`@/components/shell/page-header`: `PageHeader` (title, subtitle, actions, children) and
`PageBody` (wide?) — **every page starts with these two.**

`@/components/shell/quick-add`: `openQuickAdd()`

`@/hooks/use-hotkeys`: `useHotkeys(map, opts)`, `useNow(ms)`

## Page skeleton every route follows

```tsx
"use client";
export default function XPage() {
  return (
    <>
      <PageHeader title="…" subtitle="…" actions={…}>{/* view switchers */}</PageHeader>
      <PageBody wide>…</PageBody>
    </>
  );
}
```

The route group `(app)` already provides sidebar, command palette, quick add, task
inspector and timer bar. Pages render content only.

## Do not touch

`src/app/globals.css`, `src/app/layout.tsx`, `src/lib/*`, `src/hooks/*`,
`src/components/ui/*`, `src/components/shell/*`, `src/proxy.ts`, `src/app/login/*`,
`src/app/(app)/layout.tsx`, `package.json`.

If you genuinely need a new shared primitive, put it in your own feature folder and
export it — do not edit the shared kit.

## Quality bar

- TypeScript strict. No `any` without a comment explaining why.
- No `useEffect` that could be derived state. No fetching — the store holds everything.
- Lists over ~60 rows need windowing or pagination.
- Every interactive element: keyboard reachable, labelled, visible focus.
- Both themes must be checked. Both. The tints handle it if you use them.
- Write the comment that explains *why*, never the one that restates the code.

---

# Addendum — standards settled after the first review

The first build drifted in a few places because these were never pinned down.
They are pinned now.

## Type scale

Body and UI text: **10.5, 11, 11.5, 12, 12.5, 13, 13.5, 15, 17, 19px**. Nothing
below 10.5px, nothing between these steps.

`display-serif` has exactly four sizes and no others:

| Size | Role |
|---|---|
| `text-[64px]` | page hero numeral — the Today day number, and nothing else on that page |
| `text-[44px]` | section hero — focus dial clock, Day-view date |
| `text-[32px]` | stat tile headline |
| `text-[22px]` | card stat |

Editable sheet and panel titles are `text-[17px] font-semibold tracking-[-0.01em]`.

## Hit areas

Minimum **28px effective** on every interactive element. A smaller glyph is fine
as long as padding brings the box to 28px (`-m-1 p-1` is the usual trick). Prefer
`IconButton` — its `sm`/`md`/`lg` are already 24/28/36px, so use `md` or larger for
anything that is not inside a dense row that already has a big parent target.

## Shared primitives — use these, do not rebuild them

`@/components/ui/form` now exports:

- `Field` — renders a real `<label for>`, description and error, and hands your
  control `{ id, aria-describedby, aria-invalid }`. **Every labelled input goes
  through this.** No more bare `<label>` next to a bare `<Input>`.
- `Select` — the one dropdown. Keyboard-operable, labelled, styled with the kit.
  Replaces every hand-rolled trigger + Popover + button-list.
- `Toggle` — switch with `role="switch"` and a proper label.
- `MiniEmpty` — compact empty state for rail cards and panels, where `EmptyState`
  (py-14) is far too tall.
- `VisuallyHidden` — for the text alternative behind a chart, heatmap or graphic.
  Point at it with `aria-describedby`.
- `SwatchCheck` — contrast-safe tick for a selected colour swatch. Never put a
  bare white check on a light tint.

`@/lib/habits` is the single source of truth for habit scheduling:
`habitScheduledOn`, `weeklyTarget`, `isHabitComplete`, `habitStreakOn`,
`buildLogIndex`, `loggedThisWeek`, `cadenceLabel`. **Never read `habit.weekdays`
directly.** `weekdays` always means weekday indices; `times_per_week` carries N for
the `custom` cadence. Anything that answers "is this habit due today" imports
`habitScheduledOn`.

## Projects

`src/components/projects/` owns the surface. Read `project-model.ts` first: it is
the single source of truth for a project's numbers.

- `buildProjectIndex(projects, tasks)` → `index.stats(id)`. Board, list,
  timeline and sheet all read the same index, so three views can never disagree
  about how far along a project is. **Never count a project's tasks by hand.**
- Only top-level tasks count (`parent_id === null`); a subtask inherits its
  parent's `project_id` for labelling and is deliberately not in the denominator.
  A `dropped` task leaves the denominator too — it is a decision, not a debt.
- A **milestone is a task**, `kind: "milestone"` with a date, inside the project.
  There is no milestones table and there must not be one — the calendar and the
  timeline already draw them.
- Deleting a project unlinks its tasks and keeps them. `useProjectActions`
  wraps that in one `batchUndo` step; go through the hook, not `remove` directly.
- Attention flags come from `projectAttention`. `danger` is for a due date that
  has already passed and nothing else; everything else is `quiet`.

## Consumption — the three shelves, one section

Books, Films & Anime and YouTube are **one section called Consumption**, at
`/consumption/{books,films,youtube}`, with one sidebar entry and one tab strip
(`src/components/consumption/tabs.tsx`). The shelves themselves were not
redesigned — only the chrome merged. Each keeps its own toolbar, views, add
button and sheet.

- The views live in `src/components/consumption/{books,films,youtube}-view.tsx`
  and the route files under `src/app/(app)/consumption/` do nothing but render
  one. A view renders its own `PageHeader` (titled with `nav.consumption`),
  then `<ConsumptionTabs active="…" />`, then its `PageBody`.
- `/books`, `/watch` and `/youtube` are permanent redirects in `next.config.ts`.
  They exist for bookmarks and old deep links; **link to `/consumption/…`
  inside the app**, or every in-app navigation pays for a round trip.
- The sidebar lights **one** entry: the longest `href` the path starts with.
  A plain `startsWith` per item lit two things at once as soon as one route sat
  under another, which is why the rule is stated rather than inferred.

Underneath, they are still one surface drawn three times: cards in a grid,
grouped by whatever the toolbar is grouping by. `src/components/shelf/` owns
what they share.

- `ShelfDnd` / `ShelfGroup` / `ShelfItem` make a card draggable **between
  shelves**, and nothing else. A drop re-files the card under the group it
  landed on. It is deliberately not a reorder — these shelves sort by title,
  pace and progress, never by hand, so a card dropped between two others would
  spring back, and a drag that appears to do something and doesn't is the whole
  bug this pass was about.
- Drag is off unless the current grouping is one a drop can honestly change:
  status, kind, genre, topic, series. **Author, creator and channel are facts
  about the work, not shelves you choose** — dragging never rewrites them, and
  the grip does not appear.
- Empty groups stay in the model and are hidden at rest, then appended **at the
  end** for the length of a drag. A shelf you cannot see is a shelf you cannot
  drop on; inserting one above the cursor mid-drag would slide the target out
  from under it.
- A drop runs the same code the sheet's status menu runs. Finishing a book moves
  the bookmark to the last page, pausing one asks for a resume date. If those
  ever disagree, the drag is wrong, not the menu.

## Umr — the time ledger

Umr is a lifetime, counted. Every minute the app knows about belongs to one of
five kinds of living: **taʼlim** (learning), **ibodat** (worship), **xordiq**
(restoring yourself), **dam** (amusement) and **inson** (people). The section
is `/umr` in the Plan group, with its own long stats page at `/umr/stats` in
Reflect.

**The rule the section exists for.** Dam is capped at a share of taʼlim —
ten minutes of study buys one minute of games, by default. That cap is the
reason everything funnels through **one** module: if study time and game time
were counted by two different pieces of code the cap would drift and mean
nothing.

### `@/lib/umr` is the only place any of this is decided

`UMR_CATEGORIES`, `UMR_META` (label, gloss, examples, tint), `parseUmrPrefs` /
`writeUmrPrefs`, `buildUmrIndex`, `taskCategory`, `sessionCategory`,
`habitCategory`, `buildLedger`, `totalsOf`, `damBalance`, `ratioPhrase`.
**No surface re-derives a category or a budget.** `@/components/umr/use-umr`
wraps it for React (`useUmrLedger`, `useDamBalance`, `useSetUmrPrefs`) and
`@/components/umr/derive` holds every statistic, as pure functions.

### What is stored, and what is not

Almost nothing is stored. Focus sessions, minutes on tasks, prayers and habit
ticks are already rows; Umr reads them. Only two things were added:

- `tasks.umr` and `habits.umr` — nullable text, checked against the five names.
  **Null means nobody has said yet**, which is not the same as "none": the Umr
  page lists exactly those rows for triage, and answering once writes the
  category onto the task or habit so it never has to be answered again.
- `umr_logs` — the minutes nothing else records: sleep, meals, a commute, an
  hour on the phone. One user, their own rows, the same four `own_*` policies
  every other table carries. `docs/sql/umr.sql`, applied.

Everything else — the ratio, the budget window, the minutes a prayer is worth,
the kind and tag rules, the minutes a habit tick is worth, where sleep goes —
lives in `profiles.prefs.umr`, so retuning a rule never needs a migration.

### The Focus dial asks for a kind, not a task

`/focus` times a **kind of living**, not a goal and not a task:
`kind-picker.tsx` is the dial's picker and writes `focus_sessions.umr_kinds`,
with an optional free-text label saying *what exactly* (the Umr stats group by
it, so "Chemistry" and "Qurʼan" stay tellable apart inside Taʼlim).

**More than one kind is allowed, and the minutes SPLIT EVENLY between them.**
An hour studying with a friend is Taʼlim and Inson both, so it is thirty
minutes of each. Counting the whole hour to each would let a day total more
than a day and would let the Dam cap be gamed by ticking Taʼlim beside it —
the ledger's one invariant is that every minute is counted exactly once.
`splitMinutes` in `@/lib/umr` does the division and hands the remainder to the
earliest shares, so nothing is lost: 25 minutes across two kinds is 13 and 12.
Both the ledger and the Focus "Kinds" panel call it, so they cannot disagree.

Choosing a kind closes the list — a choice should feel like one — and a second
kind is one more tap on the pill, because the toggle is additive.

- `sessionCategories` reads `session.umr_kinds` first and only then falls back
  to the task, the tags and the kind rules — and that fallback can only ever
  name one. A sitting started on the dial answers for itself; one started from
  a task row still inherits, and still credits that task's `actual_min`.
- `focus_sessions.umr` (singular) is dead and deliberately not dropped, the
  same decision `tasks.template_id` made: dropping it would have broken the
  deployed build for the minute between the migration and the deploy.
- `subject-picker.tsx` survives for exactly one job — re-attaching a logged
  session to a task in the editor — and no longer speaks `FocusSubject`.
- Choosing Dam draws `dam-line.tsx` under the dial with the live balance. It
  never blocks the start button; it states the number while the choice can
  still change, which is the only moment it can do any good.
- A logged sitting is worth **at least one minute** in the ledger. Plain
  rounding dropped anything under thirty seconds, so Focus said "1m logged" and
  Umr said nothing had happened.

### Counting a minute exactly once

Stopping a timer credits `task.actual_min`, so a task and its sessions describe
the same minutes. **Sessions win** — they carry a clock time, which the hour
profile needs — and a task contributes only the residual it can prove beyond
them. Taking the larger of the two, the way the Stats page does for a single
figure, would double-count here.

### The honesty rules, which must not be softened

- **Nothing is estimated.** A minute is in the ledger because a timer measured
  it, a row records it, or the user said so. Prayers are the single declared
  figure, at a length the user sets, and every surface that shows them says so.
- **The gap stays visible.** Bars are drawn against the whole 24 hours, not
  against what was recorded, so the hours nothing knows about read as empty
  space instead of being normalised away.
- **The cap warns, never blocks.** Logging Dam past the budget asks once and
  then goes through. A ledger you lie to in order to stay under a self-imposed
  cap is worth nothing, and every other number on the page depends on it.
- **The budget does not roll over.** An unspent hour on Monday buys nothing on
  Tuesday — the only version of the rule that cannot be gamed.
- **Balance is a description, not a score.** The panel says so out loud: a week
  spent almost entirely on taʼlim reads low, and may be exactly the right week.

### Drawing a category

Tints are theme-aware and tint-set aware, so a hex value in a chart is wrong in
dark mode and wrong again under "vivid". Custom properties inherit through SVG:
put `tint-<name>` on a `<g>` and every shape inside reads `var(--tint)`. That is
what `@/components/umr/stats/shared.tsx` exists for, and it is why no chart in
this section names a colour.

## Accessibility floor

- Anything clickable is a `<button>` (or has `role`, `tabIndex={0}` and a key handler).
  A `<div onClick>` is a bug.
- Never nest interactive elements. A row that is itself clickable cannot contain
  buttons — make the row a non-interactive container with an explicit primary button,
  or drop the row handler.
- Every input has an accessible name via `Field`. A placeholder is not a name.
- State is never carried by colour alone — pair it with an icon, a shape or text.
- Any modal or portaled panel with `role="dialog"` needs `aria-modal`, initial focus,
  focus containment and focus restore on close. If that is more than the surface needs,
  use `Modal`/`Sheet` from the kit, which already do it, or drop the dialog role.
- Drag and drop always has a keyboard path. For dnd-kit that means adding
  `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })`
  and a visible button that performs the same action on the current selection.
- **The card is the grab target, not just the grip.** Every draggable surface
  pairs `useDragBody(listeners)` from `@/components/ui/drag`, spread on the card
  or row body, with dnd-kit's own `attributes` + `listeners` on the grip — which
  gets `data-no-drag` so one press activates once. The grip is the affordance
  and the keyboard path; the pointer belongs on the body. Mark the card's title
  `{...DRAG_OK}` so the one control that is really content can still be grabbed.
  A grip-only draggable is a bug: it looks draggable and is not.
- Charts and heatmaps: focusable data or a `VisuallyHidden` summary, plus `<title>`
  on meaningful SVG shapes.

---

# The calm pass — density rules

The owner's words: *"too dense … simplify the UI … now it seems too much stuff on
display … but don't cut any feature, just make it look less overwhelming."*

So: **nothing is deleted. Things are folded, quietened, and given room.** If you find
yourself removing a capability, you have misread the brief — collapse it instead.

## The nine rules

1. **One hero per screen.** Exactly one element may use `display-serif` at 44px or 64px.
   Everything else steps down to 32/22. Two big serif numbers on one screen fight.

2. **Card budget: four.** At most four bordered surfaces visible without scrolling.
   Prefer whitespace and a hairline over a border. **A bordered card inside a bordered
   card is banned** — pick one level and let the inner content breathe.

3. **Collapsed by default.** Anything not needed the second the page opens starts folded
   behind a one-line summary that states its own value ("5h 20m planned · 1 unscheduled").
   Planning tools, analysis strips, secondary rails, option rows. Expansion state persists
   in localStorage per surface. The feature stays; only its resting state changes.

4. **Label diet.** Uppercase micro-labels are for true section headers only — **three per
   screen, maximum**. If the content explains itself, the label is noise. Delete it.

5. **One number per idea.** "1 of 6 done · 5 still open" states the same fact twice, next
   to a ring that states it a third time. Choose the single clearest expression and drop
   the rest.

6. **Quiet by default.** Warning and danger colours are for things the user must act on
   *now*. Planning more than fits in a day is information, not an emergency — state it in
   `text-ink-3`, not in orange with a triangle. Reserve `--warn` and `--danger` for real
   failure.

7. **Room to breathe.** Section gap 32px (`space-y-8`). Card padding 16–20px. Between a
   heading and its content, 8–12px. Density lives in the rows, not in the chrome.

8. **Push text down a step.** Supporting copy that is `text-ink-2` today should mostly be
   `text-ink-3`; hints and units go to `text-ink-4`. Only what the user came for stays at
   `text-ink`.

9. **Two accents, visible.** At most two accent-coloured elements on screen at once. The
   accent marks *the* action or *the* selection — a screen where six things are blue has
   told the user nothing.

## What "folded" looks like

A folded section is a single row: a quiet label, its summary in `text-ink-3`, and a
chevron. It is a real `<button>` with `aria-expanded`, it animates open in 200ms, and it
remembers. It is never a dead end — the summary line always says what is inside.

## Applying this

Work surface by surface. For each one ask, in order:
- What did the user come to this screen to do? That is the hero. Everything else is
  support and should look like it.
- What is on screen that they did not ask for? Fold it.
- What is stated more than once? Say it once.
- What is bordered that could just be spaced?
- What is coloured that could be grey?

Then check your work against the nine rules literally, one by one.


---

# Addendum — customisation and language

## The one rule that is easy to break

`@theme inline` **inlines values into utilities**. `--radius-lg: 13px` there
compiles `rounded-lg` to `border-radius:13px` — a literal, which no runtime
override can reach. So every customisable token goes through a second
variable:

```css
:root      { --r-lg: 13px; --ui-font-sans: …; }
@theme inline { --radius-lg: var(--r-lg); --font-sans: var(--ui-font-sans); }
```

`rounded-lg` then compiles to `var(--r-lg)`, which `lib/customize.ts` can
re-point. **Adding a customisable token means adding a `--…` in `:root` and
pointing `@theme` at it — never a literal.** Verify by grepping the built CSS
for the utility; if it holds a number, it is not customisable.

## Appearance

`lib/customize.ts` owns the whole model. It lives in `profiles.prefs.ui`, a
jsonb column that already existed, so a new knob never needs a migration.

- `useStore().setAppearance(changes)` is the only way it changes. It paints
  first, then saves. `setTheme` and `setAccent` are thin wrappers over it.
- `applyAppearance()` writes CSS custom properties onto `<html>`. Nothing
  re-renders to change a colour.
- `theme` and `accent` still have real columns and are mirrored, so anything
  reading the profile stays correct. A **custom hex accent lives in prefs
  only** — the column's type cannot hold one.
- The pre-paint script in `layout.tsx` mirrors this logic from a localStorage
  copy. If you add a knob that affects first paint, add it there too, and keep
  it inside its `try` — a broken boot script is a white page.
- `zoom` on `<html>` is the interface-size control. Anything sized against the
  viewport must divide it back out: use `h-dvh-app`, never `h-dvh`.

Fonts are loaded by `next/font` in `layout.tsx` with `preload: false` on
everything but the two defaults, so eleven alternatives cost a first-time
visitor nothing. next/font is a compile-time transform — **every option must
be a literal**, so the subset arrays are repeated rather than shared.

## Language

`lib/i18n.ts`. `const { t } = useT()` and `t("nav.today")`. English is the
source of truth and every key exists there; a missing Uzbek string falls back
to English rather than rendering a raw key.

Uzbek is Latin script and needs `oʻ` / `gʻ` — U+02BB MODIFIER LETTER TURNED
COMMA, not an apostrophe. That is why every face loads `latin-ext`.

**Never key persistent state on a translated string.** The sidebar groups
carry an `id` for their collapse state and a `label` for display, precisely
so switching language does not silently reset what is folded.

Coverage today is navigation, settings, the Inbox tabs, the matrix, note
links and the offline bar. Other surfaces are still English and fall back
cleanly; translate them as you touch them.

## Storage keys stay `humoyun.*`

The product is Qalamchi; the localStorage prefix is not. Renaming the keys
would silently drop saved views, pinned items and every folded section for no
user-visible gain. The backup file's `app: "humoyun"` marker stays for the
same reason — old exports must keep importing.


---

# Community — the one door

This is the only surface in the app where one account reads another's data,
and the rule that makes it safe is short:

**Never add a policy to an existing table.** `tasks`, `prayers`, `books`,
`profiles` and the rest each carry exactly one policy — `auth.uid() = user_id`
— and nothing in Community changed that. A second permissive policy on `tasks`
is five conditions on the table holding a person's whole life, and one wrong
`or` leaks all of it, silently, forever.

Everything that crosses an account boundary goes through **one security-definer
function**, `community_feed`, in `docs/sql/community.sql`. Its select list *is*
the privacy policy: display name, avatar, today's top-level task titles and
done state, today's five prayer statuses. Adding a field there is a privacy
decision, not a refactor.

Two rules for anything added to that file:

1. A definer function bypasses RLS, so its **first statement is the membership
   check**. That check is the lock, not a validation.
2. `set search_path` on every definer function, or a caller can point `tasks`
   at a table of their own.

**Sharing is three booleans per membership, all `false`.** `share_plan`,
`share_salah`, `share_shelf`, on `community_members` — per community, so a
study group seeing your plan never implies your family sees your salah. Only
the member owning the row may write it; the owner cannot flip anyone's switch.

**"Today" is each member's own today**, derived server-side from their profile
timezone. The function deliberately takes no date parameter: a client that can
name the date can ask for any date, and "today only" stops being true.

**Community data does not live in the store.** `hydrate` pulls rows where
`user_id = you` and the CRUD stamps `user_id` on write; community rows fail
both halves. `src/components/community/community-data.ts` owns its own reads,
refreshed on mount and on window focus — and a refresh never returns the
surface to its loading state, because replacing a roster you are reading with
skeletons is a flicker, not information.

`null` plan and `[]` plan are different things and the UI must keep saying so:
null is "not sharing", empty is "shared, nothing planned". Collapsing them
accuses people of doing nothing.

**`.insert().select()` is a trap wherever the SELECT policy depends on a row you
have not written yet.** Creating a community from the client could not work:
`communities` is readable by members only, so at the instant the row exists its
creator is not yet a member, Postgres applies the SELECT policy to the RETURNING
clause, denies it, and rolls the whole INSERT back. It reads as a permissions
bug and is an ordering one. `create_community` does both writes server-side,
which also makes them atomic. Anything else added here that creates a row plus
the membership that makes it visible belongs in the same shape.

**Read Supabase errors off the object.** A `PostgrestError` is a plain object,
not an `Error`. `err instanceof Error` is false and `String(err)` gives the
literal "[object Object]", which is what this surface showed for every failure
until `messageOf()` in `community-data.ts` existed. Never surface a raw caught
value as a toast.

---

# Zikr — the fourth tab on Salah

`src/components/salah/zikr-*` owns it. Times used to sit here; it is now folded
inside Rhythm (`rhythm-view.tsx`), because a month of times, the Hijri date and
the qibla are reference — looked up a few times a year, and in the way every
other day. Nothing was removed.

**Nothing is shipped with it.** There is no library of adhkar and there must not
be one: every button on the board was written by the person using it, and the
empty state says so. A button carries its own `step`, so **one press records the
whole thirty-three** — the counting happens on a tasbih, in the hand, and this
surface only keeps the record. There is no tap counter.

**A set is one press over several zikr.** `setDeltas` turns it into the block to
add, merging a zikr named twice rather than overwriting it, and the whole block
is written at once so a set of three is still one patch and one undo step.

**A count lives in `day_logs.data.zikr`,** `{ [zikrId]: number }`, one row per
day, next to the sunnah ticks already in `data.salah`. There is no `zikr` table
and there must not be one: the day's record stays in one row, no migration was
needed, and every lifetime number is a sum over rows the store already holds.
`zikrCountsOf` / `withZikrCounts` are the only readers and writers, and
`withZikrCounts` merges, so it can never drop the salah block sharing that
column.

**No running total is stored anywhere.** `buildZikrStats` derives all of it. A
total kept twice can disagree with itself, and correcting yesterday's number
would leave the stored one wrong forever.

**A count outlives the button that made it.** Deleting a zikr removes the button
and drops it from any set that named it; the history keeps every number already
recorded and labels it "Deleted zikr". Deleting must never silently subtract
from a total that was true.

**The buttons are `profile.prefs.zikr`** — `items` and `sets`. Per-day data never
goes there; it would grow without limit in a jsonb column meant for knobs. The
reader still accepts `custom` and `target`, the names the first build used.

**Periods are one function.** `rangeFor(stats, period, offset, today, weekStart)`
returns the window *and* the bars that describe it — days for a week or a month,
months for a year, years for lifetime — so the headline, the breakdown and the
history can never disagree about which days they counted.
