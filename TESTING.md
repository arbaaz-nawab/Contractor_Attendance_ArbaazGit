# Testing

No automated test suite exists in this repo (no test runner in `package.json`, no `__tests__`
directory). Everything below is a manual test scenario list. Run against a local dev server
(`npm run dev`) pointed at a **non-production** Supabase project — several scenarios are
destructive or security-probing.

## Midnight sign-in / overnight session

1. Sign in a contractor a few minutes before local midnight.
2. Wait until after midnight (or adjust system clock in a test environment).
3. Attempt sign-out via the normal flow (`/api/active-check?id=X`).
   **Expected finding**: reports "No active sign-in found" — confirms [BACKLOG.md](BACKLOG.md) B8.
4. Confirm the session is still visible and Force-Sign-Out-able from the manager dashboard
   Contractors tab regardless of date filter defaults (today-only by default — you'll need to
   widen `dateFrom` to include the sign-in day).

## Clock change (BST ↔ GMT)

1. Around the UK clock-change weekend (late March / late October), sign in a test session that
   spans the transition (or simulate by editing the stored `sign_in_time`/`sign_out_time` strings
   directly in Supabase to straddle 01:00–02:00 on the transition date).
2. Compare the dashboard-displayed duration (`calcDuration`) against the actual wall-clock
   difference. **Expected finding**: off by ~1 hour — confirms B7.
3. Separately, check what UK-local time the Vercel Cron actually fires at during GMT months vs
   BST months (Vercel deployment logs) — confirms the 17:00-UTC-fixed-schedule issue.

## Duplicate ID

1. Sign in with ID `007`.
2. Without signing out, attempt to sign in again with `007` (same day). **Expected**: blocked with
   `409` / "already signed in today" message, both from the client pre-check (`active-check` on
   blur) and the server-side re-check in `signin.js`.
3. Sign out `007`, then immediately sign in again with `007` the same day. **Expected**: succeeds
   — the uniqueness constraint is "one *active* session per ID per day", not "one use per day".
4. Directly `POST /api/signin` (bypassing the UI, e.g. via curl) with a duplicate active ID to
   confirm the server-side check is real and not just client-side — this is the actual guard.

## Offline / network failure

1. Disable network mid-submit on `SignInForm`/`SignOutForm`/`EngineerOvertimeForm`. **Expected**:
   each form catches the fetch failure and shows "Network error. Please check your connection." —
   no partial/corrupt state, no retry-on-reconnect (user must resubmit manually).
2. Disable network specifically during the photo upload step of sign-out. **Expected**: per
   `signout.js`, an R2 upload failure is caught and sign-out still completes with
   `photoSkipped: true` — confirm this actually happens rather than failing the whole request.

## Approver matrix

1. As a manager whose team includes Engineer A (per `lib/config.js` `TEAMS`), open Approvals,
   select your own name from the dropdown, approve one of Engineer A's pending overtime records
   with your correct PIN. **Expected**: succeeds, status → `FULLY APPROVED`, `Approved By` = your
   plain name.
2. Attempt the same action but select a *different* manager's name in the dropdown while entering
   *your own* PIN (or vice versa) for an engineer not on that manager's team. **Expected**: `403`
   from `overtime-approve.js`'s `canApprove()` check — confirms server-side enforcement isn't just
   cosmetic UI filtering.
3. As `OVERRIDE_APPROVER` (Sarfraz Arfan), approve an engineer outside your own team. **Expected**:
   succeeds, `Approved By` recorded as `"Sarfraz Arfan (Override)"`.
4. Attempt to approve/reject/edit directly via `POST /api/overtime-approve` with a `managerName`
   that has no PIN configured anywhere (not in `managers` table, not in `MANAGER_PINS`) and no
   `APPROVAL_PIN` set. **Expected**: `403 "No PIN configured for {name}."`
5. If `APPROVAL_PIN` **is** set, repeat step 4 with an arbitrary fictitious manager name + the
   `APPROVAL_PIN` value. **Expected finding**: succeeds and records the fictitious name as
   `Approved By` — confirms B19; useful to demonstrate the risk to stakeholders even if not fixed.

## R2 / Resend failure

1. Temporarily unset one of the four `CF_R2_*`/`CF_ACCOUNT_ID` env vars locally, restart dev
   server, attempt a sign-out with a photo. **Expected**: `isR2Configured()` returns false, sign-
   out succeeds with "(Photo could not be saved — storage not configured.)" appended to the
   success message.
2. Set an intentionally invalid R2 credential (all 4 vars present but wrong secret), attempt
   sign-out with a photo. **Expected**: upload throws, caught in `signout.js`, `photoSkipped:
   true`, sign-out still succeeds — confirm this differs from scenario 1 only in the console
   warning logged, not in user-facing behaviour.
3. Unset `RESEND_API_KEY`, trigger `/api/trigger-notify` with at least one active contractor on
   site. **Expected**: `{success: true, sent: 0, skipped: 'RESEND_API_KEY not set'}`.
4. Set an invalid `RESEND_API_KEY`, repeat. **Expected**: per-recipient error captured in the
   `errors[]` array of the response; other recipients (if the key were partially valid, which it
   won't be) would still be attempted independently — confirm the loop-based error isolation in
   `lib/email.js`.

## >1000 rows

1. Seed (via direct SQL insert, not the UI) more than 1000 rows into `contractor_log` or
   `engineer_overtime` in a test Supabase project.
2. Load the dashboard Contractors/Overtime tab, or trigger a company/operative lookup that should
   match an older row past the 1000-row mark. **Expected finding**: older rows silently missing
   from results (Supabase's default 1000-row cap on unbounded `.select('*')`) — confirms B5. Watch
   specifically for company-history/compliance lookups silently treating a real returning
   contractor as `FIRST_TIME` because their old rows fell outside the fetched window.

## Unauthenticated API calls

For each route marked "N" or "Partial" in the auth column of
[SECURITY_AND_DATA.md](SECURITY_AND_DATA.md)'s table, call it directly (curl/Postman) with no
dashboard session, no PIN, no `CRON_SECRET`:

1. `GET /api/dashboard?dateFrom=2020-01-01&dateTo=2026-12-31` — **expected finding**: full
   contractor log returned with no PIN, confirming B2.
2. `GET /api/overtime-list`, `GET /api/compliance-list`, `GET /api/managers`,
   `GET /api/rota?from=2020-01-01&to=2026-12-31` — same pattern, confirm each returns full data.
3. `POST /api/compliance-update` with a fabricated `companyName` and no `pin` field at all —
   **expected finding**: succeeds and silently overwrites/creates that company's compliance
   record, confirming B13.
4. `DELETE /api/compliance-files?company=X&file=Y` for a real file — **expected finding**:
   succeeds with no PIN, confirming B14.
5. `POST /api/trigger-notify` with no auth — **expected finding**: sends the overdue email to all
   configured managers, confirming B12 (careful: this is a real send if `RESEND_API_KEY` is live —
   only run against a test Resend config).
6. `GET /api/notify-overdue` with no `Authorization` header, once with `CRON_SECRET` set in the
   environment and once with it unset — **expected finding**: `401` when set, but fully succeeds
   with no header at all when `CRON_SECRET` is unset, confirming B15.
