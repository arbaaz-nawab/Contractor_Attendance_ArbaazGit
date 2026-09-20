# Business Rules

Logic that isn't obvious from reading a single file in isolation — the "why" and the edge
cases. Code refs given so you can verify before relying on this.

## Sign-in / sign-out

- A contractor's **3-digit ID number** (`001`–`999`) is the uniqueness key, scoped to **one
  active session per ID per calendar day** — `findActiveSession(id, today)` in
  [lib/db.js:202-213](lib/db.js#L202-L213) requires `id_number` AND `status='Active'` AND
  `date=today`. Two different people could reuse the same 3-digit ID on different days, or the
  same day after the first has signed out — the ID is not a permanent identity, just a badge
  number for the day.
- Sign-in is validated client-side (`SignInForm.validate()`) and again server-side
  ([pages/api/signin.js:52-61](pages/api/signin.js#L52-L61)): company, operative name, ID
  required; ID must be exactly 3 digits; duplicate-active-ID is rejected with `409`.
- **Sign-in is never blocked by expired or missing compliance** (RAMS, induction, insurance,
  asbestos check). The form only warns and records the answers as given — see the "Compliance
  Outstanding" banner in `SignInForm.js:476-508`. The one hard stop is `asbestosChecked === 'No'`
  ([SignInForm.js:236-237](components/SignInForm.js#L236-L237)) — the form still lets you submit
  from a code standpoint (the check is inside `validate()`, which returns an error string blocking
  `handleSubmit`), so this is a genuine UI-level hard block, not just a warning.
- Contact number format is validated against three shapes: `+44` + 10 digits, `0` + 11 digits, or
  bare 10 digits ([SignInForm.js:214-227](components/SignInForm.js#L214-L227)) — UK mobile/landline
  patterns only, enforced client-side only (not re-validated in `signin.js`).
- **Sign-out only works for a session active *today*** — `SignOutForm`/`active-check`/`signout.js`
  all call `findActiveSession(id, today)`. A contractor who signs in before midnight and is still
  on site after midnight **cannot sign themselves out** the next day; the system reports no active
  session found. Only a manager's Force Sign-Out (unrestricted by date) can close it. See
  [BACKLOG.md](BACKLOG.md) B8.
- A photo at sign-out is optional; if R2 isn't configured or the upload throws, sign-out still
  succeeds with a "photo could not be saved" message — photo capture never blocks the workflow.

## Compliance expiry rules

Two independent expiry systems exist and are merged at lookup time
([pages/api/contractor-lookup.js](pages/api/contractor-lookup.js)):

1. **Manager-set dates** (`contractor_compliance` table, entered via the dashboard Compliance
   tab) — expiry computed once at write time: RAMS = date + 6 months, Induction = date + 12
   months, Insurance = date + 12 months (`addMonths()` in `compliance-update.js`). These take
   priority when present.
2. **Self-reported history fallback** (`findCompanyHistory()` scanning `contractor_log`) — if no
   manager-set dates exist, expiry is computed as a rolling window from the contractor's own
   most-recent "Yes" answer at a previous sign-in: RAMS 6 months, induction/insurance 12 months
   (`SIX_MONTHS_MS`/`TWELVE_MONTHS_MS` in `contractor-lookup.js`, approximated as `30-day months`,
   not calendar months — slightly different from the manager-set path's `setMonth()` arithmetic).
- **Induction is tracked per-operative** (`operative_induction` table), not per-company — a
  returning individual who changes employer keeps their induction status; RAMS and insurance are
  company-level only.
- A company/operative with no history at all is `FIRST_TIME` and every expiry flag defaults to
  `true` (i.e. "treat as expired / needs full H&S questions").

## Overdue / missed sign-out handling

- "Overdue" has two independent meanings in this app that happen not to diverge in practice but
  are computed differently:
  1. **Dashboard highlighting**: any row still `Status: 'Active'` once the current UK hour is
     ≥ 18 (`isPast6PM` in `pages/dashboard.js:1278-1280`), evaluated client-side on every render
     — not day-scoped, so a still-open session from a previous day also shows overdue.
  2. **Email alert**: `notify-overdue`/`trigger-notify` only consider sessions where
     `Status==='Active' AND Date===today` — a stale multi-day-old open session (see B8) is
     highlighted red on the dashboard but is **not** included in the overdue email once its
     sign-in date is no longer "today".
- The only way to close an overdue/stuck session is a manager's **Force Sign-Out**
  (`amend-contractor.js` action `forceSignOut`) — sets `Sign-Out Time`, `Status: 'Completed'`,
  `Work Completed` (defaults to `"Session closed by manager override"`), and stamps
  `Amended By`/`Amended At`. Requires manager PIN.

## Overtime approval model

- **Team-based, single-approval** (current model — see [DECISIONS.md](DECISIONS.md) for the
  superseded dual-approval scheme still visible in the schema). Each engineer belongs to exactly
  one line manager's team, defined in `lib/config.js` `TEAMS`
  ([lib/config.js:29-46](lib/config.js#L29-L46)).
- `canApprove(managerName, engineerName)` ([lib/config.js:69-73](lib/config.js#L69-L73)): true if
  `managerName === OVERRIDE_APPROVER` (currently **Sarfraz Arfan**), or if `managerName` is that
  engineer's assigned line manager. No one else can approve/reject that engineer's overtime — a
  request from a non-matching manager is rejected `403` server-side in
  [overtime-approve.js:86-94](pages/api/overtime-approve.js#L86-L94), even though the dashboard
  also filters the visible list client-side.
- An engineer not present in any `TEAMS` array (`UNASSIGNED_ENGINEERS`,
  [lib/config.js:76](lib/config.js#L76)) can **only** be approved by `OVERRIDE_APPROVER`. Adding a
  new name to `ENGINEERS` without also adding them to a team silently creates this state.
- One approval is sufficient: `PENDING`/`PARTIALLY APPROVED` → `FULLY APPROVED` in one call. The
  `'PARTIALLY APPROVED'` status value is kept only so legacy dual-approval-era records can still
  be progressed to `FULLY APPROVED` by the responsible manager — new records never enter that
  state under current code.
- When `OVERRIDE_APPROVER` approves someone outside their own team, the `Approved By` value is
  suffixed `" (Override)"` ([overtime-approve.js:96-98](pages/api/overtime-approve.js#L96-L98)) so
  it's visible in exports/dashboard that this wasn't the normal line-manager approval.
- `adjustedDuration` lets a manager override the computed `Xh Ym` figure at approval time or via a
  later `EDIT` action (only permitted on `PARTIALLY APPROVED`/`FULLY APPROVED` records). Monthly
  summary totals prefer `adjustedDuration` over the raw computed `duration` when present
  ([pages/dashboard.js:1316](pages/dashboard.js#L1316)).
- Manager identity at approval time is asserted, not authenticated, until the moment of action:
  the dashboard's "current manager" dropdown is a free self-select with no PIN
  ([pages/dashboard.js:1673-1674](pages/dashboard.js#L1673-L1674)); the PIN is only checked when
  actually submitting an approve/reject/edit/delete.

## Adjusted duration

- Applies to both contractor visits (`calcDuration(signIn, signOut)`, always computed, never
  stored) and overtime (`Adjusted Duration` column, explicitly stored, optional). For overtime,
  when set, it is treated as the authoritative figure everywhere it's displayed or summed
  (dashboard Overtime tab, Monthly Summary, Excel export) — the raw `duration` is only a fallback.

## Monthly summary rules

- Client-side aggregation only (`pages/dashboard.js`, no dedicated API route) — pulls
  `overtimeData` already loaded for the Overtime tab, filters to
  `approvalStatus === 'FULLY APPROVED'` and either the selected month (`YYYY-MM` prefix match on
  `Start Timestamp`) or an explicit `summaryFrom`/`summaryTo` date range, optionally filtered by
  engineer name substring.
- **Pending, rejected, and partially-approved records are excluded from every summary total** —
  only fully approved hours count.
- Export to Excel (`exportCsv`, despite the name, uses the `xlsx` package to build a real
  `.xlsx` workbook — [pages/dashboard.js:1365-1445](pages/dashboard.js#L1365-L1445)) produces a
  "Detailed Records" sheet, a "Summary" sheet, and (per `USER_GUIDE.md`) a Weekly Duty Rota sheet
  for the same period — all computed from data already in memory, not a fresh server query.

## Rota

- `weekly_rota` is a full-replace model per week: assigning a week deletes all existing rows for
  that `week_start_date` and re-inserts the new set ([lib/db.js:467-485](lib/db.js#L467-L485)).
  Re-editing an already-confirmed week silently drops `confirmed_by`/`confirmed_at` — there is no
  guard against a manager overwriting a confirmed week without re-confirming.
- Week start day is a hardcoded constant, `WEEK_START_DAY = 1` (Monday), in `lib/config.js`. There
  is no user-facing control to change this despite `USER_GUIDE.md` describing one — see
  [BACKLOG.md](BACKLOG.md) B16.
- Confirming a week (`rota-confirm`) is a separate manager-PIN-gated action from assigning it; the
  UI doesn't prevent viewing/using an unconfirmed rota.

## Who sees what

- There is no per-role authentication distinguishing "which manager is logged in" beyond a single
  shared `DASHBOARD_PIN` that unlocks the entire dashboard for anyone who has it — every manager
  sees every tab and every company/contractor's data. The only per-identity restriction is the
  Approvals tab's team filter, which is self-asserted (see above) and only enforced for the
  approve/reject/edit *action*, not for what's visible.
- Contractors and engineers have no accounts, sessions, or history view of their own beyond what
  the sign-in/sign-out/overtime forms show them in the moment.

## DST / midnight edge cases

- All stored timestamps are UK wall-clock strings produced via `date-fns-tz` against
  `Europe/London` at write time — correct at the moment of writing.
- Reading them back with plain `new Date(str)` (in `calcDuration`, and the various `addMonths()`/
  expiry helpers scattered across `signin.js`, `compliance-update.js`, `contractor-lookup.js`) is
  where interpretation gets fuzzy: Node parses a non-ISO `"YYYY-MM-DD HH:mm:ss"` string as
  **local server time**, which on Vercel is UTC — this happens to be internally consistent for
  same-format string-to-string diffs (`calcDuration`), but a session that spans a BST↔GMT clock
  change will show a duration that's off by about an hour from actual elapsed time (see
  [BACKLOG.md](BACKLOG.md) B7).
- Midnight itself is not a special case anywhere except implicitly via B8: `date` on a
  `contractor_log` row is fixed at sign-in time and never changes, so any session crossing
  midnight is permanently associated with the earlier calendar day, which is what breaks
  same-day-only lookups like `findActiveSession`.
