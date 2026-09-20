# Architecture

Next.js 14 Pages Router app. No server framework beyond Next's built-in API routes; no ORM.
All persistence goes through [lib/db.js](lib/db.js) directly to Supabase (Postgres + Storage).

## Layers

1. **Pages (UI)** — `pages/index.js` (contractor sign-in/out + staff overtime entry),
   `pages/dashboard.js` (manager dashboard, 2529 lines, all tabs in one component).
2. **Components** — form pieces embedded in the pages above: `SignInForm.js`, `SignOutForm.js`,
   `EngineerOvertimeForm.js`, `Layout.js` (shared header/footer shell).
3. **API routes** (`pages/api/*.js`) — one file per endpoint, thin: parse request → call `lib/db.js`
   → shape response JSON. No shared middleware, no auth layer (see [SECURITY_AND_DATA.md](SECURITY_AND_DATA.md)
   and [BACKLOG.md](BACKLOG.md) B2).
4. **lib/** — `db.js` (Supabase data access + row-object mappers), `config.js` (engineer/team/
   approver static config), `ukTime.js` (timezone helpers), `email.js` (Resend overdue alerts),
   `r2Upload.js` (Cloudflare R2 photo uploads). `excel.js` is dead code — not imported anywhere
   except the unrelated `scripts/setup-excel.js` (see [BACKLOG.md](BACKLOG.md) B1).
5. **External services** — Supabase (Postgres tables + `compliance-docs` Storage bucket),
   Cloudflare R2 (sign-in/out and overtime photos), Resend (email), Vercel Cron (scheduled
   overdue-alert trigger). Full details in [INTEGRATIONS.md](INTEGRATIONS.md).

## Pages

| Path | Purpose | Auth |
|---|---|---|
| `/` (`pages/index.js`) | Contractor sign-in/sign-out + staff overtime entry, role picker | None (public) |
| `/dashboard` (`pages/dashboard.js`) | Manager dashboard — 6 tabs: Contractors, Overtime, Approvals, Monthly Summary, Weekly Rota, Compliance | Client-side `sessionStorage` PIN flag only |

## API routes

Method, purpose, auth actually enforced server-side, and which tables/services it touches.
"Auth: none" means the route is fully open — see [SECURITY_AND_DATA.md](SECURITY_AND_DATA.md) for the full risk table.

| Route | Method | Purpose | Auth | Touches |
|---|---|---|---|---|
| `active-check` | GET | Check if an ID has an active sign-in today | none | `contractor_log` |
| `amend-contractor` | POST | Amend/delete/force-sign-out a contractor_log row | manager PIN | `contractor_log` |
| `amend-overtime` | POST | Amend/delete an overtime row | manager PIN | `engineer_overtime` |
| `check-pin` | POST | Verify dashboard PIN against `DASHBOARD_PIN` | env var compare | none |
| `compliance-delete` | POST | Delete a company's compliance record | manager PIN | `contractor_compliance` |
| `compliance-files` | GET/DELETE | List / delete files in a company's Storage folder | **none** | Supabase Storage `compliance-docs` |
| `compliance-list` | GET | All compliance records + computed expiry status | none | `contractor_compliance` |
| `compliance-serve` | GET | Redirect to a signed URL for one compliance file | none | Supabase Storage `compliance-docs` |
| `compliance-update` | POST | Upsert compliance dates + upload documents | **none** | `contractor_compliance`, Storage |
| `contractor-lookup` | GET | Company history + RAMS/insurance/induction expiry | none | `contractor_log`, `contractor_compliance`, `operative_induction` |
| `dashboard` | GET | Active + completed contractor rows for a date range | none | `contractor_log` |
| `managers` | GET | List manager names | none | `managers` |
| `notify-overdue` | GET/POST | Send overdue-contractor email to managers (cron target) | `CRON_SECRET` bearer/header, **skipped if unset** | `contractor_log`, `managers`, Resend |
| `operative-lookup` | GET | Operative induction status + name autocomplete | none | `operative_induction` |
| `overtime-approve` | POST | Approve/reject/edit an overtime record | manager PIN + team check | `engineer_overtime` |
| `overtime-list` | GET | Overtime records, filterable | none | `engineer_overtime` |
| `overtime-signin` | POST | Start an overtime session | none | `engineer_overtime` |
| `overtime-signout` | POST | End an overtime session, upload photo | none | `engineer_overtime`, R2 |
| `rota` | GET/POST | Read / replace a week's rota assignments | GET: none; POST: manager PIN | `weekly_rota` |
| `rota-confirm` | POST | Mark a rota week confirmed | manager PIN | `weekly_rota` |
| `signin` | POST | Contractor sign-in | none | `contractor_log`, `operative_induction` |
| `signout` | POST | Contractor sign-out, upload photo | none | `contractor_log`, R2 |
| `trigger-notify` | POST | Manual "Send Overdue Alert" button on dashboard | **none** | `contractor_log`, `managers`, Resend |

## Data flow: contractor sign-in

1. `SignInForm` fires `GET /api/contractor-lookup?company=X` on company select (debounced for
   free-text "Other") and `GET /api/operative-lookup?name=X` / `?partial=X` on name entry to
   decide which H&S fields to show and pre-warn about expired compliance.
2. On blur of the 3-digit ID field, `GET /api/active-check?id=X` pre-warns of a duplicate.
3. On submit, `POST /api/signin` re-checks `findActiveSession(id, today)` server-side (the real
   duplicate guard — client pre-check is advisory only), then `appendRow()` into `contractor_log`
   with `status: 'Active'`.
4. If `inductionComplete === 'Yes'`, `signin.js` also calls `upsertOperativeInduction()` — see
   [BACKLOG.md](BACKLOG.md) B4 for the onConflict/unique-index mismatch risk. Failure here is
   caught and logged but does not fail the sign-in.
5. Sign-in is **never blocked** by outstanding RAMS/induction/insurance — the form only warns and
   flags it in the stored row (`RAMS Approved`, `Induction Complete`, `Insurance Valid` = "No").

## Data flow: contractor sign-out

1. `SignOutForm` step 1: `GET /api/active-check?id=X` looks up today's active session
   (`findActiveSession` — date-scoped to today, see [BACKLOG.md](BACKLOG.md) B8).
2. Step 2: `POST /api/signout` (multipart) re-runs `findActiveSession`, optionally uploads a photo
   to R2 (`uploadPhoto` — silently skipped if R2 env vars are missing or the upload throws), then
   `updateRow()` sets `Sign-Out Time`, `Work Completed`, `Status: 'Completed'`, `Photo URL`.
3. `calcDuration(signIn, signOut)` computes the displayed duration; not stored — recomputed on
   every dashboard read.

## Data flow: overtime lifecycle

1. `POST /api/overtime-signin` — blocks if `findActiveOvertimeSession(engineer)` already ACTIVE;
   else inserts row with `Status: 'ACTIVE'`, `Approval Status: ''`.
2. `POST /api/overtime-signout` (multipart) — requires a work description, optional photo to R2,
   sets `Status: 'COMPLETED'`, `Approval Status: 'PENDING'`.
3. Manager dashboard Approvals tab: manager self-selects their name in a plain dropdown (no
   identity check at selection time), sees only records where `canApprove(managerName, engineer)`
   is true (their own team, from `lib/config.js` `TEAMS`, or `OVERRIDE_APPROVER`).
4. `POST /api/overtime-approve` with `action: 'APPROVED'|'REJECTED'|'EDIT'` — verifies the PIN for
   `managerName` via `getManagerPin()`, re-checks `canApprove()` server-side, then updates
   `Approval Status` to `FULLY APPROVED` / `REJECTED` in one step (single-approval model, no
   dual-sign-off despite the legacy `approved_by_dean`/`approved_by_laurel` columns still present
   in the schema — see [DATABASE.md](DATABASE.md)).

## Data flow: overdue alerts

1. Vercel Cron calls `GET /api/notify-overdue` at `17:00 UTC` Mon–Fri ([vercel.json](vercel.json))
   with an automatic `Authorization: Bearer <CRON_SECRET>` header.
2. Manager dashboard's "Send Overdue Alert" button calls `POST /api/trigger-notify` instead — same
   logic, no auth check (see [BACKLOG.md](BACKLOG.md) B12).
3. Both handlers: `getAllRows()` → filter `Status === 'Active' && Date === today` → map to
   `{operativeName, companyName, buildings, pointOfContact, signInTime}` → `getManagerEmails()`
   → `sendOverdueAlerts()` builds one HTML email (unescaped interpolation, B6) and sends via
   Resend to every manager row that has a non-empty `email`.
4. Separately, the dashboard UI itself computes "overdue" for display as `isPast6PM` (current UK
   hour ≥ 18, client-computed) applied to any row still `Active` — this is independent of the
   cron/email logic and only affects red highlighting + the Force Sign-Out prompt.

## Time handling

All timestamps are stored as **UK wall-clock text** (`"YYYY-MM-DD HH:mm:ss"` /
`"YYYY-MM-DD"`), produced by [lib/ukTime.js](lib/ukTime.js) using `date-fns-tz` against
`Europe/London` — this is correct and DST-safe *at the point of writing*. Two places read these
strings back with plain `new Date(str)`, which is where DST/timezone ambiguity can bite (see
[BACKLOG.md](BACKLOG.md) B7): `calcDuration()` in `ukTime.js`, and several `addMonths()` /
expiry-comparison helpers duplicated across `pages/api/signin.js`, `pages/api/compliance-update.js`,
and `pages/api/contractor-lookup.js`. The Vercel cron schedule is UTC-fixed, not UK-time-aware,
so its real UK-local firing time shifts by an hour between BST and GMT (B7).
