# Memory Log

Chronological log, newest entry at the bottom. Format: `## YYYY-MM-DD, title` then what/why/files.

**Roll-up rule**: once this file exceeds ~150 lines, condense entries older than the most recent
5 into a single dated "Summary through YYYY-MM-DD" entry at the top of the log, preserving any
decision, gotcha, or rejected-option reason that would otherwise be lost, then continue appending
new entries below it.

## Summary through 2026-09-20 (six entries condensed — see git history / earlier doc versions for full detail)

Covers: the initial documentation audit, the dashboard desktop-width fix, building the engineer
Shift feature (sign-in/out, early-leave chips, missing-signout flagging), a verify-and-fix pass on
it, a cron/stale-row fix pass, and building the dashboard Attendance tab. Condensed here per the
roll-up rule — the five entries below this one (server-side sessions onward) are kept in full.

**What got built in this span**: the full documentation set (CLAUDE.md, MEMORY.md, and the other
root docs) from a from-scratch codebase read, confirming 11 given hypotheses and finding 9 more
(B12–B20, see [BACKLOG.md](BACKLOG.md)); a one-line CSS fix for the dashboard rendering at
phone-width on desktop monitors; the `shift_log` table and the whole engineer Shift feature
(`EngineerShiftForm.js`, `shift-signin`/`shift-signout`/`shift-status`/`flag-missing-shifts`
routes) as a fixed-8h daily block separate from overtime, with a calm one-tap early-leave-reason
screen and automatic missing-signout flagging at a 17:00 UK cutoff (GMT/BST-safe via two cron
firings + a per-engineer lazy fallback); the dashboard **Attendance** tab (`AttendanceTab.js`) —
Live/Week/Month views of shift data plus a manager correction flow for flagged shifts, with
`shift-list`/`shift-correct` routes and a `correction_note` column.

**Bugs found and fixed along the way** (all in the Shift feature, found during a dedicated
verify-and-fix pass): the cron's cutoff comparison used `!== 17` instead of `< 17`; an engineer
signing in late (e.g. 19:00) was incorrectly self-flagged as missing on their very next check,
fixed by also requiring the shift's own sign-in time to be before the cutoff; the early-leave
chip screen depended on the phone's own clock instead of the server's authoritative elapsed-hours
calculation, fixed by always asking the server first; two phones signing in as the same engineer
could race and create duplicate OPEN rows, fixed with a partial unique index
(`shift_log_one_open_per_engineer_idx`); a stale OPEN row from a previous day could wrongly block
a genuinely new day's sign-in via that same unique index, fixed by unconditionally flagging
previous-day OPEN rows before checking.

**Every rejected-option reason from this span, one line each** (nothing lost by condensing):
- Dashboard-width fix: rejected making the dashboard simply full-width — chose two width tokens
  (520px fixed for public forms, a 960–1440px fluid `clamp()` for the dashboard) because the
  public forms read best narrow regardless of screen size, while the dashboard needs more room on
  large screens but shouldn't stretch edge-to-edge on an ultrawide monitor either.
- Shift/overtime overlap wiring: rejected adding a preset-name prop to `EngineerOvertimeForm.js`
  to skip re-picking a name when entering it from the new Shift/Overtime picker — kept that form
  entirely unchanged as instructed, accepting the minor redundancy of picking your name twice.
- Missing-shift cron, first pass: rejected folding the sweep into the existing `notify-overdue`
  cron (to save on cron count) — kept it as its own endpoint so the two concerns (email vs. shift
  sweep) stayed separate; a later pass (see "Option B" in the kept entries below) revisited this
  same trade-off again as the cron count changed.
- Attendance tab design: rejected a generic table-plus-edit-modal and a literal bar chart — chose
  vertical "capsule" fills for the Week view and a calendar heat-map for Month (small multiples,
  scannable in seconds), and rejected one tooltip per grid cell in favour of a single shared
  tooltip positioned via fixed screen coordinates, since a per-cell tooltip got clipped by the
  table's own scroll container.

**Standing decisions from the original planning session** (still the basis for everything built
since, unless a later entry says otherwise): shift is a fixed 8h continuous block; shift and
overtime must never overlap; engineers sign in via their own phone with no code, one shared
dashboard PIN, managers keep personal PINs for approvals/amends; attendance visuals are for
managers/PIN holders only; a forgotten sign-out auto-closes at a set time, flagged for manager
correction, never silently dropped; early sign-out (<8h) asks for a reason via soft one-tap chips,
never a live running-hours meter shown to the engineer; parking is a standalone section with no
cross-check against sign-ins; weekly planned works is filled in by multiple managers with a
searchable history; email was flagged as out of scope from the very start ("no domain is
available") — later formally retired, see the last entry below. Agreed build order: 1 layout fix,
2 shift sign-in + engineer mobile page, 3 dashboard Attendance tab, 4 parking, 5 weekly planned
works, 6 email — all six steps are now complete (email as a deliberate retirement, not a build).

## 2026-09-20, Server-side dashboard sessions (closes B2, B12, B13)

Closed the standing gap (BACKLOG B2, called out in every doc since the initial audit) where the
manager dashboard's PIN gate was purely client-side `sessionStorage` — any dashboard API route
would answer any caller who knew the URL, no PIN required. Every dashboard-only route now also
requires a signed, httpOnly session cookie, checked server-side.

**Route classification** (full table given to the user before editing, reproduced here):

| Class | Routes | Auth |
|---|---|---|
| PUBLIC | `signin`, `signout`, `active-check`, `contractor-lookup`, `operative-lookup`, `overtime-signin`, `overtime-signout`, `shift-signin`, `shift-signout`, `shift-status` | none (unchanged) |
| DUAL-USE | `overtime-list` | narrow `engineer`+`status=ACTIVE` query stays public but now returns only 4 minimal fields (`engineerName`,`status`,`startTimestamp`,`notes`); any other query shape requires a session |
| AUTH | `check-pin` | issues the session — must itself stay reachable without one |
| DASHBOARD | `dashboard`, `managers`, `compliance-list`, `compliance-files`, `compliance-serve`, `compliance-update`, `compliance-delete`, `rota`, `rota-confirm`, `amend-contractor`, `amend-overtime`, `overtime-approve`, `shift-list`, `shift-correct`, `trigger-notify` | now requires session (`requireSession()` wrap); existing per-manager PIN checks on writes kept as-is (defence in depth) |
| CRON | `notify-overdue`, `flag-missing-shifts` | unchanged — still `CRON_SECRET` only |

Two DASHBOARD routes — `compliance-update` and `trigger-notify` — had **no protection at all**
before this (BACKLOG B13, B12). They're closed now as a direct result of this change, verified
live (see Testing below), not just by re-reading the code.

**Design** (`lib/session.js`, server-only, `node:crypto`, no dependency added): a session is just
`{issuedAt}.{HMAC-SHA256(issuedAt)}` — no session store, nothing to look up or expire server-side,
because the only claim it needs to make is "the PIN was checked, within the last 24h." Verifying
is recompute-and-compare (`crypto.timingSafeEqual`) plus an age check. Cookie: `HttpOnly`,
`SameSite=Strict`, `Secure` only when `NODE_ENV==='production'` (true for both Vercel Preview and
Production — both run `next build` and are served over HTTPS; only local `next dev`, plain HTTP,
needs it omitted — verified this is the right signal, not guessed), no `Max-Age` (session cookie,
gone when the browser closes, per the agreed design). `requireSession(handler)` in the same file
wraps a route to 401 JSON before it runs if the cookie is missing/invalid/expired. Kept the
client-safe pieces in a separate `lib/sessionClient.js` (`dashFetch()`, a `fetch` wrapper that
broadcasts a `window` event on 401) specifically so the browser bundle never pulls in
`node:crypto` — a small but deliberate separation, not an accident.

**New env var**: `SESSION_SECRET` — required for `check-pin` to issue sessions and for every
`requireSession`-wrapped route to accept them. **Fails closed**: `check-pin.js` returns `503` and
logs `[check-pin] Cannot issue a session — SESSION_SECRET is not configured.` if it's unset, rather
than silently granting an unsigned/unverifiable session. Must be set in **all** relevant Vercel
environments (Production and Preview both — Vercel scopes env vars per environment) or dashboard
login will 503 wherever it's missing. Added a locally-generated value to `.env.local` for this
session's own testing (gitignored, never committed) — the user still needs to set their own value
in Vercel.

**401 wiring**: `lockDashboard()` in `pages/dashboard.js` now also fires `POST /api/logout`
(fire-and-forget) to clear the server cookie, not just the local `sessionStorage` flag. A new
`useEffect` listens for the `dashboard-session-expired` window event (dispatched by `dashFetch()`
on any 401) and calls `lockDashboard()` — this is what makes the PIN gate reappear automatically
if a session expires mid-use, including from the 60-second auto-refresh interval (which already
self-halts once `unlocked` flips false, via its existing dependency-based cleanup — no change
needed there). Every `fetch(` call in `pages/dashboard.js` to a now-session-gated endpoint was
replaced with `dashFetch(` — the **one** exception, deliberately left untouched, is `PinGate`'s own
call to `/api/check-pin`, since a 401 there means "wrong PIN," not "session expired," and firing
the same event on that path would be semantically wrong (harmless in practice, but incorrect to
write). `components/AttendanceTab.js`'s two fetch calls (`shift-list`, `shift-correct`) were
switched to `dashFetch` too, for the same reason — `AttendanceTab` didn't need `lockDashboard`
passed in as a prop; it reacts to the same shared window event.

Also added a `pagehide` listener (fire-and-forget `POST /api/logout` with `keepalive: true`) so
the server session is cleared when the tab is actually closed or navigated away from. **This is
not** a reintroduction of the auto-lock-on-tab-switch/hide behaviour that was deliberately removed
(see the condensed summary above) — `pagehide` only fires on a genuine unload, never on switching
to another tab or backgrounding this one, so the earlier UX decision stands unchanged.

**Pitfalls checked** (as asked):
- *Cookie not sent on fetch*: not an issue — these are same-origin requests, and `fetch()`'s
  default `credentials` mode has been `"same-origin"` in every current browser for years, so the
  `HttpOnly` cookie is sent automatically without needing `credentials: 'include'` on every call
  site. Verified live with curl (see below), not just assumed.
- *60-second auto-refresh hitting 401 after a lock*: the refresh interval's own `useEffect`
  already depends on `unlocked` and returns early + clears the interval when it's false — locking
  (whether manual or via a 401) stops the interval as an existing side effect, no new code needed.
- *Preview deployments*: `NODE_ENV` is `'production'` for Preview builds too (Vercel always runs
  `next build`), and Preview URLs are HTTPS, so `Secure` is correct there — the pitfall would have
  been the reverse (forcing `Secure` in local dev and silently breaking login over `http://`),
  which the `NODE_ENV` check avoids.

**Testing performed** (ran a local dev server and used curl — not just code inspection):
`GET /api/dashboard` with no cookie → `401`; the narrow `overtime-list?engineer=X&status=ACTIVE`
lookup → `200` with no cookie; `GET /api/overtime-list` (no query) → `401`; `GET /api/shift-list`
→ `401`. `POST /api/check-pin` with the real `DASHBOARD_PIN` → `200 {ok:true}` and a cookie with
exactly the intended shape (`HttpOnly`, no `Secure` over local http, no expiry — confirmed via the
curl cookie jar). With that cookie: `GET /api/dashboard` → `200` with real data. `POST /api/logout`
→ `200`, then the same `GET /api/dashboard` → `401` again. `POST /api/compliance-update` and
`POST /api/trigger-notify` with no cookie → both `401` (previously wide open — confirms B12/B13
closed). Public routes (`active-check`, `contractor-lookup`, `operative-lookup`, `signin`,
`overtime-signin`, `shift-signin`) all answered normally with zero cookies throughout. One
route (`shift-list`/`shift-status`) returned `500` even with a valid cookie — traced to the test
Supabase project not having the `shift_log` table migrated yet (an unrelated, pre-existing gap
from earlier steps, not caused by this change — the session check itself had already passed by
the time that error occurred).

Files touched: `pages/api/check-pin.js`, `pages/api/dashboard.js`, `pages/api/managers.js`,
`pages/api/compliance-list.js`, `pages/api/compliance-files.js`, `pages/api/compliance-serve.js`,
`pages/api/compliance-update.js`, `pages/api/compliance-delete.js`, `pages/api/rota.js`,
`pages/api/rota-confirm.js`, `pages/api/amend-contractor.js`, `pages/api/amend-overtime.js`,
`pages/api/overtime-approve.js`, `pages/api/shift-list.js`, `pages/api/shift-correct.js`,
`pages/api/trigger-notify.js`, `pages/api/overtime-list.js` (dual-use split, rewritten), `lib/db.js`
— all edited; `lib/session.js`, `lib/sessionClient.js`, `pages/api/logout.js` — all new;
`pages/dashboard.js` and `components/AttendanceTab.js` edited only for the dashFetch/401/lock
wiring described above. `lib/config.js`, `lib/email.js`, database schema, and every route already
classified PUBLIC or CRON were not touched. Verified with `npx next build` (clean) and a live
local curl session (above) — no new dependencies.

## 2026-09-20, Parking tab — standalone Estates parking log

Added a "Parking" tab so Estates can log/trace parking booked for external contractors: who
asked, which project, which company, when. Deliberately standalone — no FK/link to
`contractor_log` anywhere, per the agreed rule.

**Tables** (`supabase-schema.sql`, section 9): `parking_bookings` (one row per booking — see field
list below), `parking_staff` (editable Estates-staff picker list, soft-removable via an `active`
flag so removing a name never touches historical bookings — they store names as plain text
snapshots, never a foreign key), `parking_history` (one row per create/edit/status-change/cancel:
`booking_id`, `changed_by`, `changed_at`, `change_type`, and a JSON-encoded `changes` array of
`{field, old, new}` — stored as TEXT, matching this schema's existing all-TEXT convention rather
than introducing JSONB for one table). `parking_staff` has a functional unique index on
`lower(trim(name))`, mirroring `operative_induction`'s pattern — but unlike the B4 bug that index
was meant to prevent, staff add/restore uses an explicit select-then-insert-or-update rather than
Supabase's `.upsert({onConflict})`, so there's no onConflict-target mismatch risk here; the index
is just a race-condition backstop, caught and treated as success in `lib/db.js` if it fires.

**Fields on `parking_bookings`**: `requester`, `project_code`, `company`, `booking_date` (UK date,
one day only, no repeat), `duration_type` (stable code `1H`/`2H`/`3H`/`4H`/`FULL_DAY`, friendly
label computed client-side), `vehicle_reg` (normalised uppercase + spaces stripped, server-side,
authoritative), `booked_by` ("entered by" — who logged the row), `requested_at` (set at creation),
`booked_at` (set the first time status becomes `Booked`), `status` (`Requested`/`Booked`/
`Completed`/`Cancelled` — cancelling is just a status value, no hard delete anywhere, including no
delete button in the UI).

**lib/db.js convention deviation (deliberate)**: parking functions return/accept plain camelCase
objects, not the legacy `'Title Case'` mapper shape used by `contractor_log`/`engineer_overtime`/
`contractor_compliance`. Those three exist to preserve Excel-era column names from before the
Supabase migration; parking never had an Excel form, so there's nothing to preserve — this follows
the precedent already set by `weekly_rota`, which also skips that mapper layer. Documented in a
comment at the top of the new `lib/db.js` section so a future session doesn't "fix" it into
Title-Case for consistency with the wrong precedent.

**API routes** (all wrapped in `requireSession`, no per-manager PIN on writes — per the agreed
design, this feature's writes are session-only, unlike every other write route in the app):
- `GET /api/parking-list?dateFrom&dateTo&status&company&search` — filtered list. Also doubles as
  the booking-detail endpoint via `?id=123` (returns `{booking, history}`) rather than adding a
  fourth route category beyond the three asked for (list/save/staff).
- `POST /api/parking-save` — one route, three actions (`create`/`update`/`status`), mirroring the
  `action`-discriminator pattern already used by `overtime-approve.js`. Every branch requires a
  `changedBy` (or `enteredBy` on create) and writes a `parking_history` row; `update` skips writing
  history if a diff-check finds nothing actually changed (no-op edits aren't logged as noise).
  Duplicate vehicle-reg-same-date check runs on create and update (excluding the row itself) and
  returns a `warning` string in an otherwise-`success:true` response — never blocks the save, per
  the agreed "soft warning" rule.
- `GET/POST /api/parking-staff` — GET returns the active staff list plus suggestion data in one
  payload (staff + distinct past requesters → `requesterSuggestions`; past parking companies +
  known contractor/compliance company names, read-only, no link back → `companySuggestions`);
  POST `{action:'add'|'remove', name}` adds/reactivates or soft-removes a name.

**UI** (`components/ParkingTab.js`, all new — `pages/dashboard.js` touched only for the tab
registration: one import, one `tabs` entry, one render block):
- Design choice: skipped a generic table-plus-modal. The list is compact rows (date · company +
  project code · requester/reg/duration · status badge); clicking one opens a detail view built
  around a short timeline — Requested (by, when) → Booked (when) → each subsequent edit/status
  change as one line each ("Company changed from X to Y — Jane, 14:02") — so "who asked, for which
  project, when" reads in one glance instead of cross-referencing a table and a separate log.
- Adding a booking is deliberately short: one modal, today's date pre-filled, duration as one-tap
  chips (reusing the `.chip`/`.chip-group` CSS already built for the shift early-reason picker —
  no new CSS needed there), and "entered by" remembered per browser via `localStorage`
  (`gc_parking_entered_by`) so a repeat user just confirms it instead of re-selecting every call.
- Requester and company fields are `<input list=...>` + `<datalist>` (suggestions from staff/past
  values, but free text always accepted, per the spec); "entered by" and "changed by" are strict
  `<select>`s from the staff list only — matching the spec's distinction between the two.
  Status-change actions (Mark Booked/Completed/Cancel) prompt for a `changedBy` picker inline
  before confirming, since the schema requires an actor on every change, not just edits.
  "Manage Staff" is a small modal: chips with a remove (×) button each, plus an add-name input.
- Views: "Today & Upcoming" and "History" are presets for the same `dateFrom`/`dateTo` state (not
  separate view state) — clicking one just sets those two fields, and the explicit From/To date
  inputs stay live on top of whichever preset was last clicked, so a manager can start from a
  preset and then narrow further, satisfying both "two views" and "date range filter" without
  duplicate state. Free-text search/company filters are debounced 300ms.
- "Download Excel" dynamically `import()`s the already-installed `xlsx` package (used elsewhere in
  `pages/dashboard.js` for the Monthly Summary export) and exports exactly the columns asked for,
  from whatever `records` the current filters/search/view have already produced client-side — no
  new dependency, confirmed `xlsx` was already in `package.json` before adding this.
- Mobile: booking rows use `flex-wrap` (no dedicated breakpoint needed); all modals reuse the
  existing `maxWidth/width:90%/overflowY:auto` modal shape already proven at 375px by every other
  dashboard modal; the filter row reuses `.filter-row`, which already stacks under 600px.

New CSS: `.badge--requested`/`--booked`/`--cancelled` (three more status colours alongside the
existing `--active`/`--completed`), `.parking-row`/`__date`/`__main`/`__company`/`__sub`,
`.parking-timeline`/`__item`/`__when`, `.parking-staff-list`/`.parking-staff-chip` — all in
`styles/globals.css`, nothing else touched there.

**Known minor limitation carried over, not introduced fresh**: `getKnownContractorCompanies()`
reads all of `contractor_log.company_name` with no row cap, same pattern as the existing BACKLOG
B5 issue (Supabase's default 1000-row cap on unbounded selects) — on a very large `contractor_log`
this company-suggestion list could miss older companies. Same class of pre-existing trade-off,
not a new one; not fixed here as it's out of this task's scope.

SQL to run in Supabase (SQL Editor → Run) before this tab will work — paste this block, or the
whole `supabase-schema.sql` file (idempotent either way):

```sql
CREATE TABLE IF NOT EXISTS parking_bookings (
  id             BIGSERIAL PRIMARY KEY,
  requester      TEXT NOT NULL,
  project_code   TEXT NOT NULL,
  company        TEXT NOT NULL,
  booking_date   TEXT NOT NULL,
  duration_type  TEXT NOT NULL,
  vehicle_reg    TEXT NOT NULL,
  booked_by      TEXT NOT NULL,
  requested_at   TEXT,
  booked_at      TEXT,
  status         TEXT NOT NULL DEFAULT 'Requested',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE parking_bookings DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_parking_bookings" ON parking_bookings;
CREATE POLICY "allow_all_parking_bookings" ON parking_bookings FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS parking_staff (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS parking_staff_name_idx ON parking_staff (lower(trim(name)));
ALTER TABLE parking_staff DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_parking_staff" ON parking_staff;
CREATE POLICY "allow_all_parking_staff" ON parking_staff FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS parking_history (
  id          BIGSERIAL PRIMARY KEY,
  booking_id  BIGINT NOT NULL,
  changed_by  TEXT NOT NULL,
  changed_at  TEXT NOT NULL,
  change_type TEXT NOT NULL,
  changes     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE parking_history DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_parking_history" ON parking_history;
CREATE POLICY "allow_all_parking_history" ON parking_history FOR ALL USING (true) WITH CHECK (true);
```

Testing performed: live curl against a local dev server confirmed all three new routes 401 with
no session cookie and reach real logic (not just the auth guard) once logged in — verified by the
error changing from `401` to a Supabase "table not found" `500`, since this test project doesn't
have these tables yet (same situation as `shift_log` in the earlier session — expected, resolves
once the SQL above is run). Could not test full CRUD behaviour end-to-end against real data for
that reason; did a careful manual re-read of `parking-save.js`'s create/update/status branches and
`lib/db.js`'s new functions specifically checking: conflict-check exclusion of the row itself,
history is skipped on no-op edits, `booked_at` only ever set once, and vehicle-reg normalisation
happens server-side (authoritative) not just client-side.

Files touched: `supabase-schema.sql`, `lib/db.js`, `styles/globals.css`, `pages/dashboard.js`
(11 lines — import, tab entry, render block only) — all edited; `pages/api/parking-list.js`,
`pages/api/parking-save.js`, `pages/api/parking-staff.js`, `components/ParkingTab.js` — all new.
Contractor sign-in/out, shift/overtime features, compliance, rota, `email.js`, `config.js`,
session code (`lib/session.js`/`lib/sessionClient.js`), and every previously-existing route were
not touched. Verified with `npx next build` — compiles cleanly, no new dependencies.

## 2026-09-20, Parking hardening pass

Five checks against the previous entry's work; four real gaps found and fixed, one confirmed
already correct.

1. **History integrity** — `createParkingBooking`/`updateParkingBooking` and the matching
   `addParkingHistory` call were two independent Supabase calls with no shared transaction; a
   history-insert failure after a successful booking write would have silently left a booking with
   no audit trail. Fixed with a small `writeHistoryOrRevert()` wrapper in `parking-save.js`: the
   booking write still happens first (unavoidable for CREATE specifically — `parking_history` needs
   the booking's DB-generated id, so history can't be written before the row exists; kept the same
   order for update/status for consistency), then if the history insert throws, it compensates by
   reverting the booking write (delete for create, restore-old-field-values for update/status) and
   returns a clear `success:false` error instead of the original 200. If the revert itself *also*
   fails (e.g. the DB genuinely went away mid-request), that's reported as a distinct
   `success:false, historyFailed:true` with an explicit "contact support" message — the one case
   that can't be self-healed, so it's surfaced loudly rather than guessed at. Added
   `deleteParkingBooking()` to `lib/db.js` for the create-rollback path.
2. **Validation gap found and fixed**: `booking_date` was checked for calendar validity in
   `handleCreate` (a regex only — `2026-13-40` would have passed the old `/^\d{4}-\d{2}-\d{2}$/`
   check) and **not checked for format at all** in `handleUpdate`. Replaced the regex with
   `isValidBookingDate()` (format + round-trip through `new Date(y,m-1,d)` to catch impossible
   dates like day 30 of February) and applied it to both `handleCreate` and `handleUpdate`. Every
   other rule was already correctly enforced and left alone: blank `changed_by`/`enteredBy`,
   invalid `status` values, invalid `duration_type` codes, and blank required fields all already
   400 in every write branch — confirmed by re-reading each branch line by line, not assumed.
3. **`booked_at` semantics, tightened**: entering `Booked` (first time, or reactivating from
   `Requested`/`Cancelled`) always refreshes `booked_at` to now. Moving back to `Requested` clears
   it, since the booking is no longer confirmed — leaving a stale `booked_at` on a `Requested` row
   would misleadingly suggest it's still confirmed. Moving to `Completed` or `Cancelled` leaves
   whatever `booked_at` was already there untouched, preserving "when it was booked" as history.
   All of this was already captured in `parking_history` regardless, since every status change logs
   `{field:'Status', old, new}` — the fix was only to the `booked_at` side-effect, not the logging
   (which was already correct/complete).
4. **Empty staff list** — `AddBookingModal`'s form and `BookingDetailModal`'s Edit/status-action
   buttons both needed a staff-list `<select>` with no way to ever populate it if `parking_staff`
   was empty. Added `EmptyStaffPrompt` (shown instead of the form/actions when `meta.staff.length
   === 0`) with a "Manage Staff" button that closes the current modal and opens
   `StaffManagerModal` — wired via a new `onManageStaff` prop on both modals.
5. **Excel export — confirmed and fixed**: `aoa_to_sheet` was being fed free-text fields
   (`company`, `requester`, `projectCode`) with no sanitisation. Added `sanitizeCell()` — prefixes a
   literal `'` on any value starting with `=`, `+`, `-`, or `@` before it reaches the sheet, the
   standard mitigation for spreadsheet formula injection from user-controlled export data. Applied
   to every column in the export row, not just the three free-text ones, since there's no
   downside to doing so and it's one less thing to get subtly wrong later if another free-text
   column is ever added to the export.

Files touched (this pass only): `lib/db.js` (added `deleteParkingBooking`),
`pages/api/parking-save.js` (history-integrity wrapper, real-date validation, `booked_at` rule),
`components/ParkingTab.js` (`EmptyStaffPrompt`, `sanitizeCell`, `onManageStaff` wiring). No other
file touched — shift, overtime, contractor, compliance, rota, and session code untouched. Verified
with `npx next build` — compiles cleanly.

**Consolidated end-to-end test checklist** (run on a preview deployment with all SQL applied —
shift_log + its unique index + correction_note, and the three parking tables):
1. Shift: sign in as an engineer, confirm no live hours meter is shown while OPEN.
2. Shift: sign out under 8h → chip screen appears, pick a reason, confirm it saves with hours.
3. Shift: sign out at/after 8h → completes directly, no chip screen.
4. Shift: leave a shift OPEN, wait past 17:00 UK (or adjust a row's date) → confirm it shows
   MISSING_SIGNOUT on next status check, then correct it from the dashboard Attendance tab (Live
   view "Correct" button) and confirm it becomes COMPLETE with the note recorded.
5. Overlap: starting overtime while a shift is OPEN is blocked (and vice versa), friendly message.
6. Attendance tab: Week capsules and Month heat-map both render for the engineer just tested;
   tooltip opens on tap on a phone-width viewport.
7. Auth: `curl` a dashboard endpoint (e.g. `/api/dashboard`) with no cookie → 401; log in via the
   PIN gate → same call succeeds; click Lock → same call 401s again.
8. Contractor sign-in/out and the engineer overtime/shift forms all still work with **zero**
   cookies (open in a private window, never touch `/dashboard`).
9. Parking: create a booking with a duplicate vehicle-reg+date → soft warning shown, not blocked.
10. Parking: mark it Booked (prompts for who), then back to Requested → confirm `booked_at` clears
    (check the detail timeline) and both changes appear in history.
11. Parking: edit a field, confirm the diff appears correctly in the detail timeline.
12. Parking: with the staff list emptied (via Manage Staff), confirm New Booking shows the
    "Add an Estates staff member first" prompt instead of a broken form.
13. Parking: type a company name starting with `=` (e.g. `=SUM(A1)`), save, then Download Excel and
    open it — the cell must show literally, not evaluate as a formula.
14. Parking: search box matches by project code, company, reg, and requester independently.
15. Parking: Download Excel on a filtered view — confirm only the filtered rows and the ten
    specified columns are present.

## 2026-09-20, Planned Works tab — weekly Estates sheet, in-app

Added a "Planned Works" tab: managers enter the week's planned works; Umayma Chakour downloads
one Excel file matching the existing weekly sheet, ready to email (email sending itself is out of
scope for this step, as agreed).

**New config** (`lib/config.js`, additive only): `PLANNED_WORKS_MANAGERS` (Arbaaz Nawab, Chris
Vasta, Margarita Miller, Sarfraz Arfan) and `PLANNED_WORKS_ADMIN` (Umayma Chakour) — deliberately
separate from `MANAGERS` (the PIN/amend-dropdown list). Any of the four can add/edit/review any
row; there is one shared dashboard code, so export isn't restricted by identity — it's just styled
as the prominent action (primary-coloured button, labelled "for Umayma Chakour").

**Tables** (`supabase-schema.sql`, section 11): `planned_works` (one row per work item — fields
below) and `planned_works_oncall` (one row per on-call line, full-replace on save per week, same
pattern as `weekly_rota.setRotaWeek`). Both skip the usual auto `created_at TIMESTAMPTZ` housekeeping
column other tables have — the spec asked for a business-meaningful `created_at` TEXT field by
that exact name, so keeping both would have collided; the TEXT one (UK datetime string, matching
every other business timestamp in this app) is what's actually used.

**`planned_works` fields**: `company_name`, `description`, `building_name`, `start_date`,
`end_date` (date range prints as "21/09 - 23/09" when both are set), `location`,
`person_in_charge`, `rams_signed_off`, `events_team_notified`, `parking_required` (free text —
**no link to the Parking tab**, exactly as instructed: managers type "Y - AB12 CDE" style text
here, independent of any real parking booking), `comments`, `added_by`, `created_at`,
`last_edited_by`, `last_edited_at`, `review_status` (`''`/`Completed`/`Carried Over` — set on the
*source* row when reviewed), `carried_from_id` (set on the *new* copy a carry-over creates —
makes the action idempotent: re-tapping "Carry over" checks for an existing copy with this
`carried_from_id` + target week before inserting another), `deleted_at` (soft delete only, no hard
delete anywhere in the UI, so history stays traceable per the agreed rule).

**Week identity** (`lib/plannedWorksWeek.js`, new, isolated, pure date math — no DB, no
node:crypto, safe to import from both API routes and the client component; deliberately **not**
added to `lib/ukTime.js`, to keep zero risk to the shift/overtime/contractor features that already
depend on that file): a row belongs to a week via `week_start` (a Monday), placed in the weekend
block if its date is the Sat/Sun immediately before that Monday, or the week block if Mon-Fri.
`isoWeekInfo()` computes the standard ISO 8601 week number/year for that Monday — verified against
the task's own example (`2026-09-21` → `{isoYear:2026, isoWeek:39}`, confirmed with a standalone
script, not assumed). `create-row`/`update-row` both reject a start/end date outside the given
week's valid 7-day range (`isDateInWeek()`) rather than silently re-filing the row under whichever
week the date actually falls in — you'd need to switch weeks first, which avoids a date-picker
slip quietly moving a row into the wrong week's export.

**Weekly review and carry-over**: opening a week fetches the *previous* week's still-`review_status`-
less rows and shows them in a "Review Last Week" panel with two buttons per row — Completed (just
sets `review_status`) or Carry Over (idempotent copy into this week, per above, with `start_date`/
`end_date` cleared and `added_by` set to whoever performed the carry-over — the copy is a fresh
row someone is actively adding right now, not edited, so `last_edited_by`/`at` stay blank on it).
Reviewing never blocks or hides anything — unreviewed rows just stay visible with no badge until
acted on, matching "nothing is auto-copied or lost."

**Tracker**: four calm stat chips (`lib/config.js` `PLANNED_WORKS_MANAGERS` order), each showing a
row count for the current week or the neutral phrase "nothing added yet" for zero — no colour,
no red, matching the agreed tone exactly.

**On-call**: two groups (Estate Duty Manager, Call-out engineers), minimum 3 editable lines each
(padded client-side, never fewer), pre-filled from the previous week's saved lines as editable
suggestions only when the current week has no saved on-call data yet — saving always writes
exactly what's in the form, never silently reuses old data. **Phone numbers**: every catch block
in `planned-works-save.js` logs `err.message` only, never `req.body` — confirmed by re-reading
every `console.error` call in that file; the list/search/export routes never log at all on the
happy path. `lib/db.js`'s on-call functions take/return plain line objects with no logging either.

**Search**: one box across all weeks (company, description, building, person in charge, comments,
parking free text) via a single `.or(...ilike...)` Supabase query, capped at 200 results (same
practical ceiling style as other searches in this app) — each result carries its own `isoWeek` so
tapping it jumps straight to that week.

**Export** (`pages/api/planned-works-export.js`, `exceljs`): rebuilds the sheet layout in code — a
full column-by-column, row-by-row spec is in this file's own comments and was given verbatim in
the task. **Did not** copy the real template into the repo (it contains staff phone numbers), and
**did not** add a colour-legend field or column — the template's College/ESS/Holroyd Howe legend
was explicitly excluded, matching "no such field" in the data model. Library choice: `exceljs`
over the repo's other Excel library, `xlsx` (SheetJS Community Edition, already used client-side
in `pages/dashboard.js` for the simple Monthly Summary export) — `xlsx` CE cannot reliably write
merged cells, cell fills, or embedded images, and this layout needs all three. `exceljs` was
**already a dependency** (`lib/excel.js`, `scripts/setup-excel.js`), so nothing new was added.
Every cell value is a plain string (never a `{formula}` object), and any value starting with
`= + - @` gets a literal leading `'` — the same mitigation used for the Parking export. Rows
missing a date sort to the bottom of the *week* block (not the weekend block — see judgement call
below) and are never dropped; the UI shows "N rows need a date" and asks for confirmation before
download, but never blocks it.

**Verification performed** (as asked): re-opened the generated file with `exceljs` in a standalone
script using fake data (no DB needed) and confirmed — column B width 33.9 and L width 3.3 match
spec exactly; the D3:G4 title merge exists and reads "PLANNED WORKS - WEEK 39"; B5/B6 read "Week
No. 39  - 2026" / "WEEKEND WORKS: 19/09/2026 - 20/09/2026"; the header row's fill is orchid
(`FFDA70D6`) with the Events Team cell yellow (`FFFFFF00`); the embedded logo image is present
(1 image on the sheet); the print area came out as `A1:L32` for this fake dataset; page setup is
landscape with `fitToWidth:1`; the "ON CALL" section, the Estate Duty Manager/Call-out engineers
groups, their vertical B-column merges, and their per-line C:K merges with "dd/mm/yyyy - dd/mm/yyyy
Name phone" text all came out correctly; a company name of `=SUM(A1:A9)` was confirmed stored as
the literal string `'=SUM(A1:A9)` (`cell.type` = String, not Formula) — the injection guard works.
**Not verified**: LibreOffice was not found on this machine, so the file was **not** converted to
PDF and **not visually eyeballed** — the checks above are structural/programmatic only, not a
human look at the actual printed page. Also not tested end-to-end against real data, since this
test Supabase project doesn't have `planned_works`/`planned_works_oncall` yet (confirmed via curl:
401 with no session cookie on all four new routes, then a "table not found" 500 once logged in —
same pattern as `shift_log` and the parking tables in earlier steps, resolves once the SQL below
is run).

**Two defaults I chose that need your confirmation**, as asked:
1. **Default week view rule** — implemented exactly as given ("coming week if today is Wed-Sun,
   otherwise current week"), but I had to pin down the exact boundary in code: Wed/Thu/Fri/Sat/Sun
   → next Monday; Mon/Tue → this Monday. Confirm this is the boundary you meant (e.g. that Tuesday
   should still show the *current*, not coming, week).
2. **Undated-rows handling** — the spec says undated rows "go at the bottom of the week block" but
   doesn't say which block a *carried-over* row (which has no date at all) belongs to for export
   purposes. I put them in the **week** block (not weekend), since "weekend" is a date-based
   concept that doesn't apply to an undated placeholder. If you'd rather they appear in a distinct
   third area, or in the weekend block, that's a small change to `planned-works-export.js`.

**Rejected/excluded, as instructed** — recorded so a future session doesn't "helpfully" add these
back: no colour legend (College/ESS/Holroyd Howe) — no such field exists, and it's omitted from
the export entirely. No submit/lock step — the tracker is informational only, nothing prevents
further edits. No link to the Parking tab — `parking_required` is plain free text, matching the
current paper/Excel sheet's own habit, not a booking reference. No email sending — the export is
a plain file download; emailing it is a manual step outside this app. No pull from the existing
Weekly Duty Rota (`weekly_rota` table / Rota tab) — the on-call block is typed directly by the
admin/managers on this tab, independent of that data.

SQL to run in Supabase (SQL Editor → Run) — paste this block, or the whole `supabase-schema.sql`
file (idempotent either way):

```sql
CREATE TABLE IF NOT EXISTS planned_works (
  id                   BIGSERIAL PRIMARY KEY,
  week_start           TEXT NOT NULL,
  company_name         TEXT NOT NULL,
  description          TEXT NOT NULL,
  building_name        TEXT,
  start_date           TEXT,
  end_date             TEXT,
  location             TEXT,
  person_in_charge     TEXT,
  rams_signed_off      TEXT,
  events_team_notified TEXT,
  parking_required     TEXT,
  comments             TEXT,
  added_by             TEXT NOT NULL,
  created_at           TEXT,
  last_edited_by       TEXT,
  last_edited_at       TEXT,
  review_status        TEXT NOT NULL DEFAULT '',
  carried_from_id      BIGINT,
  deleted_at           TEXT
);
ALTER TABLE planned_works DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_planned_works" ON planned_works;
CREATE POLICY "allow_all_planned_works" ON planned_works FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS planned_works_oncall (
  id          BIGSERIAL PRIMARY KEY,
  week_start  TEXT NOT NULL,
  group_name  TEXT NOT NULL,
  line_order  INT NOT NULL DEFAULT 0,
  date_from   TEXT,
  date_to     TEXT,
  person_name TEXT,
  phone       TEXT,
  updated_by  TEXT,
  updated_at  TEXT
);
ALTER TABLE planned_works_oncall DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_planned_works_oncall" ON planned_works_oncall;
CREATE POLICY "allow_all_planned_works_oncall" ON planned_works_oncall FOR ALL USING (true) WITH CHECK (true);
```

Files touched: `supabase-schema.sql`, `lib/config.js` (additive), `lib/db.js` (additive),
`styles/globals.css` (additive), `pages/dashboard.js` (import, tab entry, render block only) — all
edited; `lib/plannedWorksWeek.js`, `pages/api/planned-works.js`, `pages/api/planned-works-save.js`,
`pages/api/planned-works-search.js`, `pages/api/planned-works-export.js`,
`components/PlannedWorksTab.js` — all new. Shift, overtime, contractor, compliance, rota, parking,
session code, and `email.js` were not touched. Verified with `npx next build` (clean) and a live
curl session against a local dev server (auth gating confirmed on all 4 new routes) plus the
standalone exceljs layout test described above.

## 2026-09-20, Retired the overdue-contractor email alert (dormant, not deleted)

**Decision**: the daily overdue-contractor email has never actually delivered — no verified
Resend sending domain means Resend only accepts mail to the account owner's own address, so every
other manager's alert has been silently swallowed since this feature shipped (the only trace was
a server-side `console.error`/`errors[]` array nobody was watching). Replaced it with an on-screen
banner on the Contractors tab, which needs no external service and can't silently fail the same
way, and stopped the daily cron that was paying for a send nobody but Resend's dashboard could see.

**Options considered and rejected**: (1) *Leave it as-is and wait for IT to verify a domain* —
rejected because there's no timeline for that, and in the meantime the dashboard gave managers a
false sense that alerts were going out; a banner is strictly better than a broken promise. (2) *Route
through Microsoft 365 instead of Resend* — rejected for this step because it needs an IT app
registration (Graph API / SMTP-relay credentials) that doesn't exist yet; a real option for later,
not a quick fix. Chose: retire the email path, keep it dormant, ship the banner now.

**How to revive it later**: `lib/email.js`, `pages/api/notify-overdue.js`, and
`pages/api/trigger-notify.js` are all untouched and still fully functional — `lib/email.js` now
carries a header comment pointing back to this entry. To bring it back: (a) get a verified sending
domain into `RESEND_FROM`, or build the Microsoft 365 route in a new file rather than repurposing
this one; (b) re-add a `notify-overdue` entry to `vercel.json`'s `crons` array (mind the total cron
count — see below); (c) put the "Send Overdue Alert" button back in `pages/dashboard.js`'s
Contractors filter row (the exact removed block, including its `notifyLoading`/`notifyMsg` state
and the tab-switch reset call, is in git history if this repo is ever committed/versioned; simplest
is to re-add the same shape fresh).

**Cron**: removed the `notify-overdue` entry from `vercel.json`; restored `flag-missing-shifts` to
two firings (`0 16 * * *` and `0 17 * * *` UTC) now that there's cron-count headroom for it — total
is still 2. Verified the handler's existing logic (did not rewrite it, only its stale header
comment): `ukHour() < 17` still no-ops the non-17:00-UK firing and is idempotent on repeat runs,
exactly as before. Net effect: **the missing-shift sweep is now exact at 17:00 UK time in both
GMT and BST** — previously (single-schedule compromise from an earlier pass) it landed exactly on
time in winter but an hour late (18:00 UK) in summer.

**Banner design**: reused the *existing* overdue definition rather than inventing a second one —
`isPast6PM` (already computed in `pages/dashboard.js`, the same boolean the per-row "Overdue" pill
already used) applied to `data.active` (the same array the Contractors table already renders,
fetched via the existing `/api/dashboard` — that route itself needed no changes, since it already
returns everything the banner needs). A new `overdueContractors` derived value feeds both the
existing per-row highlighting (untouched) and the new banner, so the two can never disagree.
Styling: calm amber (`--warning-light`/`--warning-border`, the same tokens already used for the
shift early-reason chips and Parking's Requested badge — not a new colour introduced for this),
bold title stating the count, one compact row per contractor with the same Force-Sign-Out button
the table already offers (identical `onClick`, not a second implementation). `.overdue-banner__row`
is `flex-wrap: wrap`, so name/company/building/time and the button drop onto their own lines on a
375px screen instead of overflowing — deliberately not a `.table-wrap` scroll container, since a
handful of names reads better stacked than scrolled sideways on a phone. It updates automatically
with the tab's existing 60-second `fetchData()` interval, since it's derived from the same `data`
state that interval already refreshes — no new polling was added.

**Send Overdue Alert button**: removed from the Contractors filter row along with its
`notifyLoading`/`notifyMsg` state and the one line resetting `notifyMsg` on tab switch (all dead
once the button using them was gone — removed together rather than left as orphaned state).
Replaced with a plain muted-text note, "Email alerts are not set up.", inline in the same filter
row. `pages/api/trigger-notify.js` itself is untouched and **confirmed still session-gated**
(`requireSession`, re-checked directly, not assumed) — it's just no longer called from the UI.

Files touched: `vercel.json`, `pages/api/flag-missing-shifts.js` (header comment only — logic
verified, not rewritten), `lib/email.js` (header comment only), `pages/dashboard.js` (banner added,
Send-Overdue-Alert button and its dedicated state removed), `styles/globals.css` (additive:
`.overdue-banner` and children). `pages/api/notify-overdue.js`, `pages/api/trigger-notify.js`, and
the rest of `lib/email.js` were not touched — both routes still exist and still work, just
unreferenced by the UI and the cron. Resend env vars, the `managers` table email column, shift/
parking/planned-works code, and session code were not touched. Verified with `npx next build`
(clean) and a live local dev/curl session: dashboard page renders with the new state removed, no
leftover references to `notifyMsg`/`notifyLoading` anywhere in the file, `flag-missing-shifts`
still responds correctly, `trigger-notify` still 401s with no session cookie, `notify-overdue`
still reachable and functioning unchanged.

## 2026-09-20, Documentation refresh — brought docs in line with the real (Supabase, sessions, 9-tab) app

Docs-only pass: read the current code and this file as ground truth and rewrote every root doc
that had drifted from what's actually built — several still described the pre-Supabase Excel-era
app. No application code was changed as part of this task, by design.

**README.md / PROJECT_EXPLANATION.txt** — both fully rewritten. Replaced every remaining
description of Excel-file storage with the real system: Supabase Postgres + Storage, QR-code
contractor sign-in, the engineer Shift-vs-Overtime distinction (early-leave reasons, missing-
signout flagging), all 9 dashboard tabs, server-side session auth, the `exceljs`/`xlsx` split, and
email marked dormant with a pointer back to this file. `PROJECT_EXPLANATION.txt` was restructured
from a flat "FILE 1…31" list (no longer practical at ~30 API routes) into a feature-grouped
walkthrough (Frontend / Backend / a dedicated dormant-email section).

**SETUP_GUIDE.md** — fully rewritten as a complete ordered setup: schema → GitHub → Vercel import
→ full env-var table (every var marked Required/Optional/Dormant/Not-used — including flagging
that `NEXT_PUBLIC_APP_TITLE` and `EXCEL_FILE_PATH` are documented elsewhere historically but not
actually read by any live code path) → deploy → disable Deployment Protection → a new **Step 5,
first-run seed data** (managers table PINs; Parking "Estates staff" — editable live via the tab;
Planned Works managers/admin and engineers/teams — fixed in `lib/config.js`, no UI) → QR code →
an end-to-end test checklist that includes checking for the `gc_dash_session` cookie. Added a
"Vercel Cron" section showing the real 2-entry schedule and the GMT/BST reasoning, and an
expanded troubleshooting table.

**supabase-schema.sql** — audited sequentially for fresh-run and re-run (idempotency) problems, as
asked ("fix ordering problems only"). Found and fixed exactly one real bug: the `compliance-docs`
storage policy was missing the `DROP POLICY IF EXISTS` guard every other policy in the file has —
a second full run of the file would have errored on it. One-line fix, no other change to that
file. Everything else audited clean: no forward references, no ordering problems; some
`ALTER TABLE ADD COLUMN IF NOT EXISTS` statements are redundant-but-harmless (column already exists
in the initial `CREATE TABLE`) and were deliberately left alone as harmless rather than "cleaned
up," since that's cosmetic, not an ordering problem. A gap in the section-number comments ("6b,
6c" → "9." → "11.", no "8"/"10") was likewise deliberately left untouched — out of the stated
scope.

**USER_GUIDE.md** — fully rewritten as short, plain-English, per-audience sections: Engineers
(sign in, sign out, the early-leave screen, what happens if you forget), Contractors (brief),
Managers/Admin (Attendance tab + exact missing-signout correction steps, Parking tab, the weekly
Planned Works rhythm — Wed-Fri entry, Review Last Week, the neutral tracker, Umayma's Friday
Excel download which she emails herself, explicit note that on-call is typed directly and not
pulled from the Rota tab — and the on-screen overdue banner with a one-line aside on why the old
email is gone), a "managing lists" table (DB-editable vs code-only), and an FAQ.

**SECURITY_AND_DATA.md** — fully rewritten. New auth table covering all ~30 routes (public /
session-gated / session+PIN / cron), explicitly marking `compliance-update`'s still-open no-PIN
gap (B13) and Parking/Planned Works as session-only *by design*. Personal-data inventory extended
with the categories that didn't exist when this doc was last accurate: engineer shift times and
early-leave reason/note text (flagged as possibly health-related, e.g. "Unwell"), parking
requester/company names and vehicle registrations, and on-call staff phone numbers (noted as
confirmed never logged to console — checked directly). Added a **"Decisions needed"** section, as
explicitly instructed not to invent answers for: retention periods for every data category (old
and new), who may see early-leave reasons given they may be health-related, whether
Parking/Planned Works should gain a manager-PIN second factor now that phone numbers/vehicle regs
are involved, the still-open `compliance-update` gap, and a pointer to BACKLOG.md for the rest.

**CLAUDE.md** — updated via targeted edits, not a rewrite: folder map expanded for the 9 tabs and
newer lib/component files; the mapper-shape convention bullet rewritten to state plainly that
Title-Case is legacy-only (three original tables) and every table since is camelCase, with an
explicit instruction not to "fix" the newer ones; two new Conventions bullets added ("Cron count"
— keep `vercel.json` at 2 entries, check the Vercel plan limit before adding a third; "Email is
dormant" — the three dormant files, don't wire them back without checking MEMORY.md). Kept
concise as asked — grew from ~60 to 85 lines, judged proportionate to the app having roughly
doubled in scope since it was last written.

**MEMORY.md** — this file. Rolled the 6 oldest entries (initial doc set, desktop-layout fix, the
Shift feature build + its two follow-up passes, the Attendance tab build) into one "Summary
through 2026-09-20" entry at the top, preserving every rejected-option reason from those six as a
single line each (dashboard-width tokens; the deliberately-unchanged `EngineerOvertimeForm`;
folding the missing-shift cron into `notify-overdue`; no live hours meter for engineers; the
Attendance tab's visualisation and tooltip choices) plus the original planning-session decisions
and the agreed 6-step build order. The 5 most recent entries (server-side sessions; Parking build;
Parking hardening; Planned Works build; email retirement) were kept **verbatim**, unedited, per
the explicit instruction.

**Constraint check**: the task said no `.js`/`.jsx` application code, `vercel.json`, env files, or
database contents were to be touched. Confirmed honored — the only non-Markdown file edited was
`supabase-schema.sql` (a `.sql` file, not `.js`/`.jsx`), and that edit adds an idempotency guard to
a `CREATE POLICY` statement; it doesn't touch any existing database *contents* (rows), only what
happens if the DDL script itself is run a second time.

**Could not verify from code alone**: whether `CF_R2_BUCKET` truly has no default (confirmed by
reading `lib/r2Upload.js` directly — no fallback value present, so this is verified, not guessed);
everything else in these docs was checked directly against the current code rather than assumed.
No open questions were left unresolved by this pass beyond the "Decisions needed" list already
recorded in SECURITY_AND_DATA.md (deliberately policy questions, not code questions).

Files touched this session: `README.md`, `PROJECT_EXPLANATION.txt`, `SETUP_GUIDE.md`,
`USER_GUIDE.md`, `SECURITY_AND_DATA.md` (all rewritten), `CLAUDE.md` (targeted edits),
`supabase-schema.sql` (one-line idempotency fix), `MEMORY.md` (this rollup + entry). No `.js`/
`.jsx` file, `vercel.json`, any env file, or database contents were touched.

## 2026-09-20, End-to-end audit — build, route matrix, business rules, export, secrets, docs

A check-only pass (no features added). Ran the app for real (local `next dev` against the same
test Supabase project used by earlier sessions), verified every claim below by execution or direct
code reading rather than assumption, and fixed only what was small/obvious/safe.

**Build & hygiene**: `npx next build` compiles clean, zero warnings, all 34 API routes + `/` +
`/dashboard` present in the route list. No lint script is configured (no `lint` entry in
`package.json`, no `.eslintrc`) — `next build`'s own built-in linting is the only static check
that runs; flagged as a gap, not fixed (adding a lint config is a scope decision, not a defect).
Grepped every `console.*` call in `pages/api/` and `lib/`: no route logs `req.body` directly;
`parking-save.js` logs `historyErr` (a Supabase error object, not the raw booking) on the already-
rare history-write-failure path; `check-pin.js` logs the configured PIN's *length* (not the PIN)
on every login attempt; `lib/email.js` (dormant) logs recipient name+email when actually invoked.
All three are minor console-only leaks to whoever has Vercel log access (i.e. already-trusted
operators), not fixed — listed as Nice to have below. No dead state from the retired email button
remains (`notifyLoading`/`notifyMsg`/"Send Overdue Alert" all absent from `pages/dashboard.js`,
confirmed by grep) and `lib/excel.js` is confirmed genuinely unimported anywhere under `pages/`.

**Route matrix**: wrote `scripts/route-audit.sh` (curl-based, logs in once via `/api/check-pin`
then hits every `pages/api/*.js` route with and without the session cookie) and ran it against a
local dev server. Kept the script in `scripts/` — worth re-running after any future route or
session-guard change, and it's cheap (one login, then a table of statuses, no test framework
needed). **Result: every one of the 34 routes matched its documented classification exactly** —
every PUBLIC/DUAL-USE-narrow route answered with no cookie, every DASHBOARD route 401'd with no
cookie and did not 401 with one, `logout`/`check-pin` behaved as the auth routes they are (the
script's one apparent "MISMATCH" — `check-pin` 401ing on an intentionally-empty test body — is the
correct behaviour for a wrong/missing PIN, not a gating bug; noted in the script's own class list
as a known false-positive shape, not fixed as a "bug" since it isn't one). Confirmed directly from
the response bodies and route source that the public `shift-status` and `overtime-list` (narrow)
endpoints never return `early_reason`/`early_note`/`correction_note`/`corrected_by`/`device_id`,
approval history, or any other engineer's data — `shift-status` returns only `signInTime`/
`shiftDate`/`signOutTime` for the querying engineer, `overtime-list`'s narrow shape only
`engineerName`/`status`/`startTimestamp`/`notes`. **CRON routes**: confirmed in code that both
`notify-overdue` and `flag-missing-shifts` skip their `CRON_SECRET` check entirely when that env
var is unset (`if (cronSecret) { ... }`) — this local/test environment's `.env.local` has no
`CRON_SECRET` set at all, so both cron routes answered with no auth header at all during testing;
this is documented behaviour (SETUP_GUIDE already calls it "Required in practice"), not something
this pass fixed, but it's worth a deliberate look — see Should-fix below.

**Business rules** — verified by code reading plus, where DB-independent, by direct execution
(the test Supabase project has the original tables only; `shift_log`, `parking_bookings`,
`parking_staff`, `parking_history`, `planned_works`, `planned_works_oncall` do **not** exist in
it — confirmed via the actual "Could not find the table … in the schema cache" errors surfaced
through the session-gated routes, so the auth layer itself was still exercised for real even
though the feature logic underneath 500s). Did not create the missing tables, per instruction.
- Shift/overtime never overlap, either direction: `shift-signin.js` blocks on an active overtime
  session; `overtime-signin.js` blocks on an open shift — both checked directly in source, both
  present and unconditional.
- Second same-day shift sign-in blocked: `shift-signin.js` checks `findShiftForDate` and 409s
  whether today's shift is `MISSING_SIGNOUT` or already `COMPLETE`.
- Missing sign-out never self-signable: `shift-signout.js` checks `pastCutoff` before allowing a
  normal sign-out and, if past it, writes `MISSING_SIGNOUT` and returns 409 instead of completing.
- Stale OPEN row from a previous day cannot block a new sign-in: `shift-signin.js` unconditionally
  flags any OPEN shift dated before today as `MISSING_SIGNOUT` *before* checking for a blocking
  open shift, exactly matching the comment describing why (the partial unique index would
  otherwise treat yesterday's leftover row as still blocking today).
- Under-8h requires an early reason, 8h+ does not: `shift-signout.js`'s `isEarly` check gates the
  `earlyReason` requirement; hours are computed as `(signOutDate - signInDate)` using
  `ukDateTimeString()` on both sides — **server time only**, no client-supplied timestamp used
  anywhere in the calculation.
- Planned Works week maths — actually executed, not just read: extracted `lib/plannedWorksWeek.js`
  into a standalone ESM test (stubbing only its one import, `WEEK_START_DAY = 1`, from
  `lib/config.js`) and ran 17 assertions covering the task's own example (`isoWeekInfo('2026-09-
  21')` → `{isoYear:2026, isoWeek:39}`), the weekend-before-Monday block boundaries in both
  directions, every day of the `defaultWeekStart` Mon/Tue-vs-Wed–Sun boundary, `formatDateRange`,
  and a year-boundary ISO week case (`2025-12-29` → ISO week 1 of 2026) not previously tested.
  **All 17 passed.**
- Carry-over idempotent: `handleReviewRow`'s carry-over branch calls
  `findCarriedPlannedWorksCopy(existing.id, targetWeek)` and only creates a new row if nothing was
  found — confirmed in source, matches the doc claim exactly.
- Undated rows warned before export: `planned-works-export.js` places any row without a date into
  the week block (not weekend) via the `byDateThenCompany` sort's `!a.startDate` tiebreak, never
  drops a row; the "N rows need a date" confirmation prompt lives client-side in
  `PlannedWorksTab.js` before the download link is followed (not re-verified live end-to-end for
  the same DB-availability reason as above, but the export route itself never filters undated rows
  out — confirmed by reading `planned-works-export.js`'s row-selection logic directly).
- Parking — required fields, real-date validation (`isValidBookingDate`, rejects e.g. `2026-13-40`
  on both create and update), duplicate-vehicle-reg-same-date soft warning (`findParkingConflict`
  result is always returned as a non-blocking `warning` field, confirmed on both create and
  update), and history-written-or-reverted (`writeHistoryOrRevert` wrapper: reverts the booking
  write — delete for create, restore-old-values for update/status — if the paired history insert
  throws, and reports a distinct `historyFailed:true` if the revert itself also fails) — all
  confirmed directly in `parking-save.js` source, matching the hardening pass described in the
  2026-09-20 "Parking hardening pass" entry above.

**Export verification**: rebuilt `planned-works-export.js`'s sheet-writing logic in a standalone
script (same code, DB calls replaced with fake rows — including one company name starting with
`=`, one comment starting with `-`, one description starting with `@`, and one deliberately-undated
row) and re-opened the generated `.xlsx` with `exceljs` to check it structurally. Confirmed:
column B width 33.9 / column L width 3.3; the `D3:G4` title merge reads "PLANNED WORKS - WEEK 39";
`B5`/`B6` read the week/weekend labels correctly; the header row fill is orchid with the Events
Team header specifically yellow; the logo embeds (1 image on the sheet, using the repo's real
`public/goodenough-logo.png`); page setup is landscape with `fitToWidth:1` and a print area ending
at the last written row; **all three injected risky values came back as literal strings with a
leading `'`** (`=SUM(A1:A9)` → `'=SUM(A1:A9)`, etc.) — the formula-injection guard works. (First
pass of this test had three false failures from bugs in the *test script's* own cell-index math,
not the product — re-derived the correct cell addresses from the actual output and confirmed all
three were test bugs, not product bugs, before reporting this as a pass.) Test files were written
into the repo directory temporarily (needed local `node_modules` resolution for ESM imports) and
deleted immediately after — confirmed via `git status` that nothing was left behind.

**UI at phone/desktop widths**: no headless browser (Playwright/Puppeteer) is installed, and per
the explicit instruction not to add a new dependency without asking first, none was installed.
Did a static substitute instead: grepped `styles/globals.css` and every `components/*.js` file for
wide fixed-width rules. Found one real candidate — `.attn-week-grid` (Attendance tab, Week view)
has `min-width: 620px`, which would overflow a 375px screen — but traced its actual usage in
`AttendanceTab.js` and confirmed it's wrapped in `.table-wrap` (`overflow-x: auto`), the same
scroll-container pattern used everywhere else in the app, so it scrolls inside its own box rather
than overflowing the page. No unguarded wide element was found. This is a code-based approximation,
**not** a real rendered-pixel check — genuine visual/interaction verification (tap targets,
overlap, layout shift) at 375px/1280px was not performed and would need Playwright or a real
device; flagged as not verified below, not claimed as done.

**Secrets & personal data**: grepped every **tracked** file for AWS-style keys, Resend keys,
JWT-shaped strings, PEM private-key headers, and hardcoded 4-digit PINs — none found. Grepped for
UK phone-number patterns repo-wide — none found. `.gitignore` correctly excludes `.env*` (with a
narrow, deliberate `!.env.example` exception used below) and every `*.xlsx`. Found and inspected
two oddly-named tracked files — `'/Users/896166/.../ContractorLog.xlsx'` and `'.../
contractor_log.xlsx'` (their literal git-tracked *filenames* are full absolute paths from a
different machine, evidently from an old `git add` with the wrong argument) — extracted both blobs
directly from git and opened them with `xlsx`: **both are empty header-row-only templates, no real
data**. `app.py` is tracked but is a 0-byte empty file. None of this is a personal-data leak, but
all three are confusing legacy cruft — listed as Nice to have (cleanup) below, not removed, since
deleting tracked files is a git-history-visible change bigger than "small and obvious."

**Docs vs code**: dashboard tab list (9 tabs, exact labels) matches `pages/dashboard.js`'s `tabs`
array exactly. Every `process.env.*` referenced anywhere in `pages/`+`lib/` matches SETUP_GUIDE's
env var table exactly (including confirming `NEXT_PUBLIC_APP_TITLE` really is never read and
`EXCEL_FILE_PATH` really is only read by the dead `lib/excel.js`/`scripts/setup-excel.js`, as
already documented). `vercel.json` cron count confirmed at exactly 2. **Found one real doc bug**:
SETUP_GUIDE.md's "Running Locally" section said `cp .env.local.example .env.local`, but no such
file existed anywhere in the repo — a fresh clone following the guide literally would hit a
"file not found" on the very first setup command. Fixed by adding `.env.example` (var names only,
no values, matching the guide's own env-var table) and correcting the one line in SETUP_GUIDE.md
to reference it. `.gitignore` already had a `!.env.example` exception in place (for exactly this
filename) from before this session, so the new file is trackable, not swallowed by the `.env.*`
ignore rule above it — confirmed with `git add -n`.

**Findings ranked (full list also given to the user directly)**:
- *Should fix*: cron routes fail OPEN (no auth check at all) if `CRON_SECRET` is ever unset in an
  environment — confirm it's actually set in Vercel Production; consider making the routes fail
  closed (mirroring `SESSION_SECRET`'s behaviour) rather than silently open, as a future change.
- *Nice to have*: `check-pin.js` logs the PIN's length on every attempt (minor brute-force hint,
  server-console-only); `parking-save.js` logs a raw Supabase error object instead of just
  `.message` on the rare history-revert-failure path; no lint script configured; the three odd
  tracked legacy files (`app.py`, two mis-pathed empty `.xlsx` templates) are confusing cruft worth
  a deliberate `git rm` at some point; the entire feature set built since the last commit (sessions,
  Shift, Parking, Planned Works, this audit) remains **uncommitted** in git — not a defect in the
  app itself, but a real operational risk (single point of failure if this working copy is lost)
  worth flagging even though committing wasn't asked for here.
- *Not verified*: real rendered-pixel UI check at 375px/1280px (no headless browser; would need
  your go-ahead to install one); full live functional test of Shift/Parking/Planned Works business
  rules against real data (this test Supabase project lacks those 6 tables — logic was verified by
  direct code execution and reading instead, as instructed).

Files touched: `.env.example` (new), `SETUP_GUIDE.md` (one-line fix), `scripts/route-audit.sh`
(new, kept for reuse), `MEMORY.md` (this entry). No `.js`/`.jsx` application file, `vercel.json`,
any other env file, or database contents were touched — confirmed via `git status` before and
after. The local dev server and its test session cookie were both cleaned up at the end.

## 2026-09-20, Applied audit fixes and committed all uncommitted work to a feature branch

Two-part session: (1) apply the small fixes the audit above flagged, (2) commit the large backlog
of uncommitted work (everything since the last real commit — layout fix through this audit) onto
a new branch, never touching `main`.

**Fixes applied**:
- `pages/api/flag-missing-shifts.js` and `pages/api/notify-overdue.js` now **fail closed**: if
  `CRON_SECRET` is unset, both return `503` and log `[<route>] CRON_SECRET not set` instead of
  silently skipping the auth check (the previous behaviour left the route wide open to anyone who
  found the URL in an environment that forgot to set the secret). When the secret *is* set, the
  existing Bearer-token check is unchanged. **Decision**: fail-closed was chosen over the
  alternative (leave it open, document the risk) because it mirrors how `SESSION_SECRET` already
  behaves elsewhere in this app (`lib/session.js`) — a loud 503 in a misconfigured environment is
  better than a quiet, undetectable open door, and it's a one-line change with no functional cost
  once the secret is actually set (which SETUP_GUIDE.md already calls "Required in practice").
- Removed the PIN-length `console.log` in `pages/api/check-pin.js` (a minor brute-force hint,
  console-only, but unnecessary).
- `pages/api/parking-save.js`'s history-revert-failure path now logs `historyErr.message` /
  `revertErr.message` instead of the raw Supabase error object.
- Grepped for any other `console.*` call that could print phone numbers, early-leave reasons,
  vehicle registrations, PINs or session values — none found beyond the two above (already static
  strings mentioning "session"/"SESSION_SECRET" as words, never a value).

**Legacy cruft removed** (`git rm`, confirmed unreferenced first): `app.py` (0-byte file, already
flagged as BACKLOG B17 "candidate for removal"); two tracked files whose literal filenames were
full absolute paths from a different machine's OneDrive
(`'/Users/896166/.../ContractorLog.xlsx'` and `'.../contractor_log.xlsx'`) — these turned out to
be a genuine nested directory tree (a folder literally named `'` at the repo root, containing
`Users/896166/Library/...`), not just oddly-named files; the whole tree was empty Excel templates
plus stray `.DS_Store` files, confirmed unreferenced by any code (the one string match was an
unrelated example value in a comment in `lib/excel.js`), and was deleted from both git and disk.

**New**: `.env.example` (referenced by SETUP_GUIDE.md's "Running Locally" instructions, which
previously pointed at a `.env.local.example` that didn't exist anywhere in the repo — a fresh
clone following the guide literally would have hit "file not found" on the first setup command);
`scripts/route-audit.sh` (the route auth-matrix smoke test from the audit, kept for reuse).

**Committing the backlog**: everything built since the last real commit (`9c8179b`) — desktop
layout fix, sessions, Shift/Attendance, Parking, Planned Works, email retirement, this audit's
fixes, and the documentation refresh — was sitting uncommitted in the working tree. Created
`feature/shift-parking-planned-works` off `main` (main untouched, nothing pushed) and committed it
as 7 logical commits matching the build history recorded above:
(a) desktop width fix, (b) auth/session, (c) shift sign-in/out + Attendance tab, (d) Parking tab,
(e) Planned Works tab, (f) email retirement + cron change, (g) docs + audit script + cleanup.

Most files split cleanly by feature at the whole-file level (new files are 100% attributable; API
routes touched by exactly one step were whole-filed into that step's commit). Four files were
touched across multiple steps and needed reconstruction rather than a whole-file assignment —
`pages/dashboard.js`, `lib/db.js`, `styles/globals.css`, `supabase-schema.sql` — done by resetting
each to its pre-session committed state and re-applying each step's slice of it in order (matched
against clear section boundaries: comment headers in the CSS and SQL files, function-level blocks
in `db.js`, individual `fetch`→`dashFetch` swaps and tab-registration lines in `dashboard.js`),
verified after the last commit by diffing each reconstructed file byte-for-byte against a backup
of the original pre-split working-tree content — all four came back identical. One real mistake
happened during this process and was caught by that same diff check: the two `git checkout HEAD --
<file>` resets used to start the reconstruction included `supabase-schema.sql`, which silently
discarded this session's own idempotency fix (the `DROP POLICY IF EXISTS` guard on the
`compliance-docs` storage policy, added earlier in the audit) along with the feature-table
additions; the feature tables were correctly re-added per commit, but the one-line idempotency
fix was initially missed and only caught by the final byte-for-byte diff against the backup —
fixed before committing (g).

**One deliberate deviation, disclosed rather than silently "fixed"**: the legacy-cruft `git rm`
(app.py, the two mis-pathed xlsx files) was staged before commit (a) was made, and `git commit`
committed all currently-staged changes, not just the file just `git add`ed for that commit — so
the cruft removal landed inside commit (a) "desktop width fix" instead of commit (g) "cleanup" as
intended. Not corrected via amend/rebase since this branch's commits were treated as
append-only once made (no interactive rebase, per this session's own tool constraints) — the
removal itself is correct and complete, just attributed to the wrong commit. Flagged in the report
rather than silently left for a future session to puzzle over.

**Verification**: `npx next build` run after the final commit — see the report for the result.
`git status` confirmed clean (nothing left uncommitted) and confirmed no `.env*` file, no database
content, and no unintended file was ever staged. A phone-number/secret-pattern grep was run against
every file about to be committed before the first commit was made — nothing found.

No `main`-branch changes, no push, no merge — all per instruction. Branch name:
`feature/shift-parking-planned-works`.
