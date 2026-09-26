# CLAUDE.md

Contractor Attendance App — Goodenough College. Next.js 14 (Pages Router), Supabase (Postgres +
Storage), Cloudflare R2 (photos), Vercel (hosting + cron). No auth framework beyond a homegrown
session (see below), no ORM, no test suite. Resend/email is **dormant** — see Conventions.

## Folder map

- `pages/index.js` — contractor sign-in/out, engineer shift + overtime entry (all public, no auth)
- `pages/dashboard.js` — manager dashboard, 9 tabs (Contractors, Overtime, Approvals, Monthly
  Summary, Weekly Rota, Compliance, Attendance, Parking, Planned Works), one 2500+ line component
- `pages/api/*.js` — one file per endpoint, thin wrappers around `lib/db.js`
- `components/` — `SignInForm.js`/`SignOutForm.js` (contractor), `EngineerShiftForm.js`/
  `EngineerOvertimeForm.js` (engineer), `AttendanceTab.js`, `ParkingTab.js`,
  `PlannedWorksTab.js` (dashboard tabs), `Layout.js`
- `lib/db.js` — **the** data layer (Supabase). `lib/config.js` (engineers/teams/approvers/
  Planned Works managers), `lib/ukTime.js`, `lib/plannedWorksWeek.js` (Monday-based weeks/ISO
  week numbers — isolated on purpose, not part of `ukTime.js`), `lib/session.js`/
  `lib/sessionClient.js` (dashboard login), `lib/email.js` (dormant, see Conventions),
  `lib/r2Upload.js` (R2). `lib/excel.js` is dead code — do not use or "fix" it; see
  [BACKLOG.md](BACKLOG.md) B1.
- `supabase-schema.sql` — hand-maintained schema, run manually in Supabase SQL Editor

## Docs index — read before large changes

[ARCHITECTURE.md](ARCHITECTURE.md) (routes + data flow) · [DATABASE.md](DATABASE.md) (schema) ·
[BUSINESS_RULES.md](BUSINESS_RULES.md) (non-obvious logic) · [DECISIONS.md](DECISIONS.md) (why) ·
[CONFIG_AND_ENV.md](CONFIG_AND_ENV.md) (env vars) · [INTEGRATIONS.md](INTEGRATIONS.md) (R2/
Supabase/Resend/Cron) · [SECURITY_AND_DATA.md](SECURITY_AND_DATA.md) (auth gaps — read before
touching any API route) · [BACKLOG.md](BACKLOG.md) (known issues, B-IDs) ·
[TESTING.md](TESTING.md) (manual scenarios) · [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) ·
[MEMORY.md](MEMORY.md) (session log — append, don't overwrite)

## Session rules

1. Read [MEMORY.md](MEMORY.md) first for recent context, then only the docs/files the task
   actually needs — don't re-read the whole repo every session.
2. For `pages/dashboard.js` (2500+ lines), grep for the function/tab you need or read a line
   range — never read the whole file unless the task genuinely spans it.
3. Make minimal, targeted edits. Never re-print a whole file back in a response; use Edit for
   changes, and quote only the relevant lines when explaining something.
4. At the end of a session that changed code or found something non-obvious, append a dated entry
   to [MEMORY.md](MEMORY.md) (what/why/files) and give the user a short report — don't leave
   findings only in your own head.

## Conventions

- **Time**: always write timestamps via `lib/ukTime.js` (`ukDateString`, `ukDateTimeString`,
  `ukTimeString`) — never `new Date().toISOString()` directly for anything user-facing or stored.
  Be aware reading them back with `new Date(str)` has known DST edge cases (BACKLOG B7).
- **`lib/db.js` mapper shape**: functions for `contractor_log`, `engineer_overtime`,
  `contractor_compliance`, and `shift_log` return/accept `'Title Case'` keys — for the first three
  this preserves the legacy Excel column names; `shift_log` has no such legacy but was written to
  match that shape anyway (verified against the real mapper/callers 2026-09-20 — this note
  previously and incorrectly grouped it with the camelCase tables below). Every *other* table added
  since (`weekly_rota`, `parking_*`, `planned_works*`, `operative_induction`) uses plain
  **camelCase** instead — there's no Excel legacy to preserve for them, so don't "fix" them into
  Title Case for consistency with the wrong precedent, and don't "fix" `shift_log` into camelCase
  either — match each table's own established shape, checking `lib/db.js` if unsure.
- **Schema changes**: edit `supabase-schema.sql` with `IF NOT EXISTS` guards, run manually in
  Supabase SQL Editor, then update [DATABASE.md](DATABASE.md) — there is no migration tool or
  auto-apply step. See [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).
- **PIN checks**: always verify manager PINs server-side via `getManagerPin()` inside the API
  route, never trust a client-side check alone. Don't add a new write route without a PIN check
  unless it's deliberately public like `signin`/`signout`.
- **Dashboard sessions**: any new dashboard-only route must be wrapped in `requireSession()`
  (`lib/session.js`) — a signed httpOnly cookie issued by `/api/check-pin`, not the client-side
  PIN gate. Client-side fetches to such routes should use `dashFetch()` (`lib/sessionClient.js`)
  instead of plain `fetch()` so a 401 correctly triggers the PIN gate again. See BACKLOG B2 history
  and the 2026-09-20 MEMORY.md entries.
- **Cron count**: keep `vercel.json`'s `crons` array at 2 entries total (both currently
  `flag-missing-shifts`, at `0 16 * * *` and `0 17 * * *` UTC, so one always lands at 17:00 UK
  time across GMT/BST). This is a deliberate ceiling, not an accident — check the Vercel plan's
  cron limits before adding a third.
- **Email is dormant**: `lib/email.js`, `pages/api/notify-overdue.js`, and
  `pages/api/trigger-notify.js` exist and work, but are unreferenced by the UI and not scheduled
  — no verified sending domain exists. Don't wire them back in without checking MEMORY.md first;
  the Contractors-tab overdue banner is the current replacement.

## Never

- Never treat the dashboard's client-side PIN gate as real authentication — it's a UI convenience
  only; every API route needs its own server-side check (BACKLOG B2).
- Never modify `lib/excel.js` to "fix" something — it isn't in use; fix `lib/db.js` instead.
- Never add secrets, real PINs, or `.env` values into any doc, comment, or commit message.
- Never add a new whole-table or unbounded-filter read in `lib/db.js` without paging it through
  `fetchAllRows()` — PostgREST caps a single response at `MAX_PAGE_ROWS` (1000) regardless of match
  count, silently truncating anything larger (BACKLOG B5 — this bit production for real on
  2026-09-20 once `contractor_log` crossed 1000 rows; fixed the same day, see MEMORY.md). Verify any
  new one with `scripts/test-pagination.js`.
