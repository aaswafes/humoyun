# Humoyun — build contract

Read this before writing a line. Everything here already exists and works; do not
re-invent it, do not edit the files listed under "Do not touch".

## The product

A calendar-first personal operating system. Notion's structure (checkboxes, inline
editing, tints, templates) with Apple's manners (hairlines, springs, restraint,
tabular numerals). One user, their whole life: tasks, events, reading plans, habits,
salah, goals, a mind map anchored to dates, focus timers, and weekly review.

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
const { tasks, books, habits, habitLogs, goals, boards, nodes, edges,
        templates, prayers, dayLogs, focusSessions, reviews, tags,
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

Collection keys: `tasks books habits habitLogs goals boards nodes edges templates
prayers dayLogs focusSessions reviews tags`.

Semantic actions already written — call these instead of hand-rolling:

```ts
addTask(partial) toggleTask(id) moveTask(id, date, startMin?) duplicateTask(id)
addSubtask(parentId, title) createSeries(base, recurrence) deleteSeries(seriesId, from?)
logHabit(habitId, date, count?) toggleHabit(habitId, date)
setPrayer(date, name, status) cyclePrayer(date, name)
setDayLog(date, changes) setReview(weekStart, changes)
scheduleBook(bookId, { startDate, pagesPerDay, endDate, skipWeekdays, replace })
unscheduleBook(bookId, from?) logReading(bookId, page)
applyTemplate(templateId, date) saveDayAsTemplate(date, name)
startTimer({taskId,label,mode,targetMinutes}) pauseTimer() resumeTimer() stopTimer(save)
setSelectedDate(iso) setCalendarView(v) openInspector(taskId|null)
toast({title, description?, tone?: 'default'|'success'|'danger', action?})
setTheme(t) setAccent(a) updateProfile(changes)
```

Selectors exported from the same module:
`tasksOn(tasks,date)`, `subtasksOf`, `inboxTasks`, `overdueTasks`, `completionOn`,
`habitStreak`, `prayerStreak`, `focusMinutesOn`, `orderBetween(before,after)`, `uid()`.

### `@/lib/date`

`todayISO toISO fromISO addDays addMonths diffDays isToday isPast weekday startOfWeek
endOfWeek weekDates startOfMonth endOfMonth monthGrid isSameMonth daysBetween monthName
dayName dayNameOf dayNumber yearOf weekdayHeaders formatDate friendlyDate formatTime
formatRange parseTime formatDuration formatClock nowMinutes quarterOf weekNumber`

Dates are always `'yyyy-MM-dd'` local strings. Times are integer minutes from midnight.
Never call `toISOString()` on a user-facing date.

### `@/lib/types`

All entity interfaces plus `TINTS`, `ACCENTS`, `PRAYER_NAMES`, `PRAYER_LABELS`,
`PRIORITY_LABELS`, `TABLE_OF`.

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
- Charts and heatmaps: focusable data or a `VisuallyHidden` summary, plus `<title>`
  on meaningful SVG shapes.
