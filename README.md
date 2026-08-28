# Humoyun

A calendar-first personal operating system. Notion's structure, Apple's manners.

Tasks and events live on one timeline. Books drag onto the calendar and schedule
themselves. A mind map anchors notes to dates, so a thought in May points at a
milestone in June. Habits, salah, focus timers and a weekly review all feed the
same day.

## Run it

```bash
npm install
npm run dev
```

Environment (`.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Shape of it

```
src/
  app/
    (app)/            the signed-in shell: today, calendar, map, books, habits,
                      salah, focus, goals, stats, review, templates, settings
    login/            email + password
  components/
    ui/               design-system primitives — buttons, overlays, calendar picker
    shell/            sidebar, command palette, quick add, timer bar, page chrome
    tasks/            task row, list, inspector — reused by every surface
    <feature>/        one folder per surface
  lib/
    store.ts          Zustand + optimistic Supabase writes; the whole data layer
    types.ts          domain model, mirrors the database
    date.ts           'yyyy-MM-dd' strings and minutes-from-midnight, no timezones
    parse.ts          natural language: "gym friday 7am for 45m #health !high"
    prayer.ts         prayer times computed locally with adhan
  proxy.ts            auth gate (Next 16 renamed middleware -> proxy)
```

Data lives in Supabase with row-level security on every table, so a row is only
ever readable by the account that owns it.

`CONTRACT.md` documents the design tokens and the store API. Read it before
adding a surface.

## Keys

| | |
|---|---|
| `⌘K` | command palette |
| `N` | quick add — one line of natural language |
| `T` | jump to today |
| `⇧←` `⇧→` | previous / next day |
| `G` then `C` | calendar (also `T` today, `I` inbox, `M` map, `B` books, `H` habits, `S` salah, `F` focus, `G` goals, `R` review, `A` stats) |
| `⌘\` | toggle sidebar |
