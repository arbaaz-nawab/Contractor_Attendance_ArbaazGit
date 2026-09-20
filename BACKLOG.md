# Backlog — Contractor Attendance App

Prioritized findings and ideas. P1 = fix soon (security/data-integrity/workflow-breaking),
P2 = should fix, P3 = cleanup / nice-to-have. Each has an ID for cross-referencing from
other docs. Status: OPEN unless noted.

All items below were verified directly against the code on 2026-09-19 (see file:line refs).

## P1 — Security / data integrity / broken workflow

- **B2 — RESOLVED 2026-09-20.** Every dashboard-only API route (`/api/dashboard`,
  `/api/managers`, `/api/compliance-list`, `/api/compliance-files`, `/api/compliance-serve`,
  `/api/compliance-update`, `/api/compliance-delete`, `/api/rota`, `/api/rota-confirm`,
  `/api/amend-contractor`, `/api/amend-overtime`, `/api/overtime-approve`, `/api/shift-list`,
  `/api/shift-correct`, `/api/trigger-notify`) now requires a signed, httpOnly session cookie
  (`lib/session.js`, `requireSession()`), issued by `/api/check-pin` on a correct PIN. `/api/
  overtime-list`'s narrow public engineer-lookup shape stays open by design (see MEMORY.md
  2026-09-20 entry) but now returns minimal fields only. `/api/contractor-lookup`,
  `/api/operative-lookup`, `/api/active-check` were re-classified PUBLIC (used by the contractor/
  engineer forms, not the dashboard) and deliberately left open — that's correct, not a gap. Was:
  every route above answered any caller with no PIN check at all. See
  [SECURITY_AND_DATA.md](SECURITY_AND_DATA.md) (needs a refresh pass to match) and the MEMORY.md
  2026-09-20 entry for the full route classification and design.
- **B4** — `upsertOperativeInduction` upserts with `onConflict: 'operative_name'`
  ([lib/db.js:304-319](lib/db.js#L304-L319)), but the actual unique index is
  `operative_induction_name_idx` on `lower(trim(operative_name))`
  ([supabase-schema.sql:91-92](supabase-schema.sql#L91-L92)). Supabase upsert needs the conflict
  target to match a real constraint/index; a column name that doesn't match the functional index
  will likely fail or silently insert duplicate rows per operative. The caller in
  [pages/api/signin.js:111-114](pages/api/signin.js#L111-L114) swallows the error, so this can be
  failing silently in production today.
- **B5** — `getAllRows()` and `getAllOvertimeRows()` ([lib/db.js:166-174](lib/db.js#L166-L174),
  [lib/db.js:325-333](lib/db.js#L325-L333)) call `.select('*')` with no `.limit()`/pagination.
  Supabase's JS client caps unbounded selects at 1000 rows by default. Once `contractor_log` or
  `engineer_overtime` passes 1000 rows, the dashboard, exports, and duplicate-ID/company lookups
  will silently drop older rows.
- **B8** — Sign-out and the active-ID check both call `findActiveSession(id, today)`
  ([lib/db.js:202-213](lib/db.js#L202-L213)), which requires `date = today`. A contractor who
  signs in before midnight and is still on site after midnight cannot sign themselves out — the
  system reports "No active sign-in found" even though their session is still `Active`. Only a
  manager's Force Sign-Out (`getAllRows()` with no date filter,
  [pages/api/amend-contractor.js:56-57](pages/api/amend-contractor.js#L56-L57)) can close it.
- **B10** — Manager PINs are plaintext in the `managers` table and the `MANAGER_PINS` env var
  ([lib/db.js:400-422](lib/db.js#L400-L422)). `APPROVAL_PIN` is a universal fallback usable for
  any manager name. No endpoint rate-limits or locks out repeated PIN attempts
  (`check-pin`, `amend-contractor`, `amend-overtime`, `overtime-approve`, `compliance-delete`,
  `rota`, `rota-confirm`).
- **B13 — RESOLVED 2026-09-20** (partially — see remaining gap below). `/api/compliance-update`
  now requires a dashboard session (`requireSession()`, closes B2's blanket fix over this route
  too). Still true and NOT fixed: `managerName` on this route is still free-text with **no PIN
  check**, unlike every other write endpoint — a signed-in manager can still attribute an update
  to any name. Session auth closes "any anonymous caller," not "any signed-in caller impersonating
  a colleague." Consider adding the same `getManagerPin()` check this route's siblings already
  have.
- **B14 — RESOLVED 2026-09-20.** `/api/compliance-files` (both GET and DELETE) is now wrapped in
  `requireSession()` alongside the rest of the compliance routes. Was: DELETE had no auth check at
  all.
- **B19** — Because `APPROVAL_PIN` is a universal fallback in `getManagerPin`
  ([lib/db.js:420-421](lib/db.js#L420-L421)), anyone who knows it can act as an arbitrary,
  attacker-chosen `managerName` string on any PIN-gated write endpoint — there is no check that
  the name corresponds to a real manager row, so the audit trail (`Amended By` / `Approved By`)
  can contain any name the caller types.

## P2 — Should fix

- **B3** — R2 photo URLs are presigned with a 7-day expiry
  ([lib/r2Upload.js:54](lib/r2Upload.js#L54)) but stored permanently in `photo_url` /
  `image_path`. Any photo link older than 7 days is dead when a manager clicks it later.
- **B6** — `lib/email.js` `buildHtml()` interpolates contractor-entered fields
  (`operativeName`, `companyName`, `buildings`, `pointOfContact`) directly into HTML with no
  escaping ([lib/email.js:22-30](lib/email.js#L22-L30)). A contractor who enters HTML/script in
  any of these fields at sign-in gets it rendered in the overdue-alert email every manager
  receives.
- **B7** — Two related time issues:
  1. `calcDuration` ([lib/ukTime.js:30-41](lib/ukTime.js#L30-L41)) parses `"YYYY-MM-DD HH:mm:ss"`
     UK wall-clock strings with `new Date(str)`. A session that spans a BST↔GMT clock change will
     show a duration off by ~1 hour from actual elapsed time (affects ~2 nights/year).
  2. The Vercel cron is fixed at `17:00 UTC` ([vercel.json:5](vercel.json#L5)), which is 18:00 UK
     time only during BST (summer). In winter (GMT), the "overdue after 18:00" alert
     ([lib/email.js:46](lib/email.js#L46)) actually fires at 17:00 UK time — an hour early.
- **B12 — RESOLVED 2026-09-20.** `/api/trigger-notify` now requires a dashboard session
  (`requireSession()`). Was: no auth check at all, directly callable by anyone.
- **B15** — `/api/notify-overdue`'s auth check is skipped entirely if `CRON_SECRET` is unset
  (`if (cronSecret) {...}`, [pages/api/notify-overdue.js:34-42](pages/api/notify-overdue.js#L34-L42)).
  If an operator forgets to set it, the endpoint is fully public.
- **B20** — No CSRF protection or same-origin checks on any POST route. Combined with B2 (open
  GETs) and B10 (no PIN rate limiting), a malicious page could drive most mutating endpoints if
  it can guess a manager PIN.

## P3 — Cleanup / documentation

- **B1** — `README.md` and `PROJECT_EXPLANATION.txt` describe the old local-Excel/OneDrive
  architecture built on `lib/excel.js`. The live app uses `lib/db.js` (Supabase) exclusively —
  `lib/excel.js` is not imported by any page or API route (only `scripts/setup-excel.js`, a
  one-time legacy setup script, uses `exceljs` directly and is unrelated to `lib/excel.js`).
  `lib/excel.js` is dead code kept for reference; the two docs should be rewritten or archived.
- **B9** — Manager/contact names are duplicated in three places that can drift out of sync:
  `lib/config.js` `MANAGERS` (used for amend/delete modal fallback lists),
  `components/SignInForm.js` `CONTACTS` (point-of-contact dropdown), and the Supabase `managers`
  table (source of truth for PINs/emails, fetched live by the dashboard).
- **B11** — `SETUP_GUIDE.md`/`USER_GUIDE.md` say `CF_R2_BUCKET` "default: contractor-photos", but
  `lib/r2Upload.js` `isR2Configured()` has no default — it requires the var to be explicitly set.
  `NEXT_PUBLIC_APP_TITLE` is documented as a configurable env var but is never read anywhere in
  code; `components/Layout.js` hardcodes the title `'Estates Contractor Log'`.
- **B16** — `USER_GUIDE.md` describes a Sunday/Monday week-start-day dropdown in the Weekly Rota
  filter bar. No such control exists in `pages/dashboard.js`; `WEEK_START_DAY` is a hardcoded
  constant (`1` = Monday) in `lib/config.js`.
- **B17** — `app.py` is a 0-byte empty file at the repo root, unrelated to the Next.js app.
  Candidate for removal.
- **B18** — The `xlsx` (SheetJS) npm package is used only client-side in `pages/dashboard.js` for
  generating the Monthly Summary `.xlsx` export. It is unrelated to `lib/excel.js` (the dead
  server-side ExcelJS data engine, B1) — worth keeping straight in future sessions since both
  "Excel" layers exist in the same repo for different reasons.
