# Config and Environment

No real values are recorded here or should ever be added — see [SECURITY_AND_DATA.md](SECURITY_AND_DATA.md)
for how these are handled once set.

## Environment variables (every one found by grepping `process.env` across the codebase)

| Variable | Required? | Purpose | Used in |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL | `lib/db.js`, `pages/api/compliance-files.js`, `pages/api/compliance-serve.js`, `pages/api/compliance-update.js` (each constructs its own client with the same two vars rather than sharing `lib/db.js`'s `getClient()`) |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public key | same files as above |
| `DASHBOARD_PIN` | Yes | Shared PIN gating the dashboard UI | `pages/api/check-pin.js` only |
| `MANAGER_PINS` | No | Fallback manager PIN source, format `"Name1:PIN1,Name2:PIN2"`, parsed with `lastIndexOf(':')` so names cannot contain a colon | `lib/db.js` `getManagerPin()` (2nd priority) |
| `APPROVAL_PIN` | No | Universal fallback PIN for any manager name not otherwise configured | `lib/db.js` `getManagerPin()` (3rd/last priority) — see [BACKLOG.md](BACKLOG.md) B19 for the security implication |
| `RESEND_API_KEY` | No (alerts silently disabled without it) | Resend API key for overdue-contractor emails | `lib/email.js` `isEmailConfigured()`/`sendOverdueAlerts()` |
| `RESEND_FROM` | No | Verified sender address; defaults to `'onboarding@resend.dev'` in code if unset | `lib/email.js` |
| `CRON_SECRET` | No, but should be set | Bearer/header secret protecting `/api/notify-overdue`; **if unset, that route has no auth at all** | `pages/api/notify-overdue.js` |
| `CF_ACCOUNT_ID` | No (R2 disabled without all 4 CF_* vars) | Cloudflare account ID for R2 endpoint | `lib/r2Upload.js` |
| `CF_R2_ACCESS_KEY_ID` | No | R2 access key | `lib/r2Upload.js` |
| `CF_R2_SECRET_ACCESS_KEY` | No | R2 secret key | `lib/r2Upload.js` |
| `CF_R2_BUCKET` | No | R2 bucket name — **no default in code** despite `SETUP_GUIDE.md`/`USER_GUIDE.md` claiming a `contractor-photos` default; `isR2Configured()` requires it non-empty | `lib/r2Upload.js` |
| `EXCEL_FILE_PATH` | No (only used by dead code) | Path to a local `.xlsx` file | `lib/excel.js` (unused, see B1) and `scripts/setup-excel.js` (standalone legacy setup script, separate from `lib/excel.js`) |
| `NODE_ENV` | Set by Next.js/Vercel, not user-configured | Gates whether error `detail` messages are included in API error responses (`process.env.NODE_ENV !== 'production'`) | every `pages/api/*.js` error handler |
| `NEXT_PUBLIC_APP_TITLE` | No | Documented in `SETUP_GUIDE.md`/`USER_GUIDE.md` as configuring the browser-tab title | **not read anywhere in the codebase** — `components/Layout.js` hardcodes `appTitle = 'Estates Contractor Log'`. Dead/aspirational env var — see [BACKLOG.md](BACKLOG.md) B11 |

R2 is treated as a unit: `isR2Configured()` requires all four `CF_*` vars to be non-empty strings
(trimmed) — partial configuration is treated as "not configured" and photo upload is skipped
gracefully rather than erroring.

## Per-environment differences

- No environment-specific branching in code beyond `NODE_ENV` (affects only whether error
  `detail` strings are included in 500 responses — see table above). There is no
  staging/production feature-flag system.
- Local dev (`npm run dev`) and Vercel production both read the same env var names — local values
  go in `.env.local` (gitignored, present at repo root as of this doc but never read for its
  contents by this documentation pass), production values are set in Vercel project settings.
- `vercel.json` defines exactly one platform-level difference from local dev: the Cron job
  (`/api/notify-overdue` at `17:00 UTC` Mon–Fri) only fires on Vercel — it does nothing locally
  unless manually curled.

## `lib/config.js` structure (no env vars — static, code-only config)

Not sensitive, but centralizes several judgment calls that would otherwise need env vars:

- `ENGINEERS` — flat array of staff names shown in the overtime sign-in dropdown.
- `TEAMS` — `{ managerName: [engineerNames] }`, defines who approves whose overtime.
- `OVERRIDE_APPROVER` — single name who can approve/reject any engineer's overtime regardless of
  team, and is the sole approver for anyone not listed in `TEAMS`.
- `APPROVERS` — deduped union of `TEAMS` keys and `OVERRIDE_APPROVER`, used to populate the
  Approvals-tab manager dropdown.
- `getLineManager()`, `canApprove()`, `UNASSIGNED_ENGINEERS` — derived helpers/values.
- `WEEK_START_DAY` — hardcoded `1` (Monday); no runtime toggle exists (see BACKLOG B16).
- `MANAGERS` — separate flat list used only as a fallback default for dashboard modal manager
  dropdowns before the live `/api/managers` fetch resolves, or if it fails.

Changes to `TEAMS`/`ENGINEERS`/`MANAGERS` require a code commit + redeploy — there is no
database-backed equivalent for these (unlike PINs/emails, which live in the `managers` table and
take effect immediately).

## Feature-toggle-by-env behaviour

There is no formal feature-flag system. The closest equivalents are graceful-degradation checks
that behave like implicit toggles based on which optional env vars are set:

- **R2 photo upload**: silently skipped (sign-in/out and overtime sign-out still succeed) if any
  of the four `CF_*` vars is missing — `isR2Configured()`.
- **Overdue email alerts**: silently return `{sent: 0, skipped: 'RESEND_API_KEY not set'}` if
  `RESEND_API_KEY` is missing — `isEmailConfigured()` in `lib/email.js`.
- **Cron endpoint auth**: becomes fully open (no toggle-off message, just no check performed) if
  `CRON_SECRET` is unset — this one is a silent security regression rather than an intentional
  toggle (see BACKLOG B15).
