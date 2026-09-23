# Qalamchi

A calendar-first personal operating system. Notion's structure, Apple's manners.

Tasks and events live on one timeline. Books, films and videos share one
Consumption shelf, and a book drags onto the calendar and schedules itself.
Umr divides every recorded minute into five kinds of living — taʼlim, ibodat,
xordiq, dam, inson — and caps amusement at a share of study. Habits, salah,
focus timers and a weekly review all feed the same day.

## Schema changes

DDL cannot go through the anon or service-role key — those talk to PostgREST,
which serves rows and cannot alter a table. Schema changes live in
`docs/sql/*.sql` and reach the database one of three ways:

1. **The Supabase connector**, when it is connected. Nothing to set up.
2. **`node scripts/db.mjs docs/sql/<file>.sql`**, which calls the Management
   API — the same thing the dashboard's SQL editor uses. Needs
   `SUPABASE_ACCESS_TOKEN` in `.env.local`; check it with
   `node scripts/db.mjs --check`.
3. **By hand**, in the dashboard SQL editor.

A personal access token reaches every project on the account, not just this
one. `.env.local` is gitignored, but treat it like a password and revoke it
from the dashboard if it ever leaks.

## Run it

```bash
npm install
npm run dev
```

Environment (`.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=           # server only, never NEXT_PUBLIC_
```

### Accounts

An account is a username and a password. There is no email step and nothing to
confirm — `/api/auth/signup` creates the user with the service-role key and
`email_confirm: true`, then the browser signs in with it immediately.

A username is stored as an address inside `users.qalamchi.app`, a domain that
exists only as an identifier; nothing is ever sent to it. Accounts made before
this still have real addresses and still sign in — the field takes either.

**`SUPABASE_SERVICE_ROLE_KEY` is therefore required, not optional.** Without it
`/api/auth/signup` answers 503 and nobody can create an account. Supabase ->
Settings -> API -> `service_role`, then set it in `.env.local` *and* in the
Vercel project (env changes need a redeploy to take effect).

### Optional — Telegram capture

Text the bot and it lands in the Inbox, through the same parser as quick add.
Create a bot with @BotFather, then:

```
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=   # the handle, no @
TELEGRAM_BOT_TOKEN=                  # from BotFather
TELEGRAM_WEBHOOK_SECRET=             # any long random string you choose
SUPABASE_SERVICE_ROLE_KEY=           # server only, never NEXT_PUBLIC_
```

Point the bot at the route once, replacing both placeholders:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook"   -d "url=https://<your-domain>/api/telegram/webhook"   -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Then open Settings -> Notifications -> Telegram, generate a code and send
`/start <code>` to the bot. The code is one-time and expires in 15 minutes.

### Optional — push notifications

`reminders.ts` can only fire while a tab is open. Push is what reaches you
when Qalamchi is closed. Generate a VAPID pair (`npx web-push generate-vapid-keys`)
and set the public half for the app:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

The sender lives in `supabase/functions/push-reminders/` — its own header
documents the two deploy commands and the `cron.schedule` call. The service
worker is registered only in a production build, so the switch in
Settings -> Notifications -> Push does nothing under `next dev`.

## Shape of it

```
src/
  app/
    (app)/            the signed-in shell: today, calendar, projects, books,
                      habits, salah, focus, goals, stats, review, community,
                      settings
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
ever readable by the account that owns it. Schema changes ship as SQL under
`docs/sql/` — run them once against the project.

`CONTRACT.md` documents the design tokens and the store API. Read it before
adding a surface.

## Keys

| | |
|---|---|
| `⌘K` | command palette |
| `N` | quick add — one line of natural language |
| `T` | jump to today |
| `⇧←` `⇧→` | previous / next day |
| `G` then `C` | calendar (also `T` today, `I` inbox, `P` projects, `U` Umr, `B` consumption, `H` habits, `S` salah, `F` focus, `G` goals, `R` review, `A` stats) |
| `⌘\` | toggle sidebar |
