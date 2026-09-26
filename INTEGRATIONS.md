# Integrations

## Supabase (Postgres)

- **Usage**: primary data store for all 6 tables (see [DATABASE.md](DATABASE.md)). Accessed via
  `@supabase/supabase-js`, a fresh client constructed per call (`getClient()` in `lib/db.js`, plus
  three more ad-hoc `getSupabase()` copies in `compliance-files.js`, `compliance-serve.js`,
  `compliance-update.js` — not shared code).
- **Naming**: tables are `snake_case`; the app's business logic works in `'Title Case'` legacy
  Excel-style keys via row mappers in `lib/db.js` (except `operative_induction`, accessed raw).
- **Triggers**: none server-side (no Postgres functions/triggers in the schema) — all
  derived/computed values (expiry dates, durations, statuses) are computed in JS at read or write
  time, never in SQL.
- **Failure behaviour**: every `lib/db.js` function throws `new Error(error.message)` on a
  Supabase error; calling API routes catch this and return `500` with a generic message (plus
  `detail` in non-production). No retry logic anywhere.

## Supabase Storage

- **Usage**: one bucket, `compliance-docs`, holds manager-uploaded RAMS/induction/insurance
  documents. Not used for sign-in/out photos (those go to R2 instead — two different storage
  systems for two different kinds of file, no technical reason found in code for the split beyond
  historical decision, see [DECISIONS.md](DECISIONS.md)).
- **Naming**: `{safeCompanyName}/{timestamp}_{originalSanitizedFilename}` — `safeFolder()` strips
  `<>:"/\\|?*` and control characters from the company name; uploaded filenames are sanitized to
  `[a-zA-Z0-9._-]` only, prefixed with `Date.now()` to avoid collisions.
- **Triggers**: none — plain upload/list/delete calls from `compliance-update.js`,
  `compliance-files.js`.
- **Failure behaviour**: `compliance-update.js` uploads files in a loop; a failed individual file
  upload is logged and skipped (`savedCount` just doesn't increment) rather than failing the whole
  request — so a partial multi-file upload can silently save some files and drop others.
  `compliance-serve.js` returns `404` if the signed URL can't be generated.

## Cloudflare R2

- **Usage**: contractor sign-out photos and engineer overtime photos only, via
  [lib/r2Upload.js](lib/r2Upload.js) using the AWS S3 SDK pointed at R2's S3-compatible endpoint
  (`https://{CF_ACCOUNT_ID}.r2.cloudflarestorage.com`).
- **Naming**: `buildPhotoKey(date, idOrName, suffix)` → `{date}_{sanitizedIdOrName}{_suffix}.jpg`
  — e.g. `2026-09-19_123.jpg` for a contractor, `2026-09-19_JohnSmith_overtime.jpg` for overtime
  (suffix `'overtime'` is hardcoded in `overtime-signout.js`).
- **Triggers**: none — plain `PutObjectCommand` on upload, immediately followed by generating a
  `GetObjectCommand` **presigned URL valid for 7 days** (`expiresIn: 60 * 60 * 24 * 7`,
  [lib/r2Upload.js:54](lib/r2Upload.js#L54)) which is stored permanently in the DB row. After 7
  days the stored link 404s even though the underlying object is still in the bucket — see
  [BACKLOG.md](BACKLOG.md) B3.
- **Failure behaviour**: `isR2Configured()` gate means upload is skipped entirely (not attempted)
  if any of the 4 `CF_*` vars is missing. If configured but the upload call itself throws
  (network error, bad credentials, etc.), both `signout.js` and `overtime-signout.js` catch it,
  log a warning, and continue the sign-out/sign-out flow with `photoSkipped: true` in the
  response — **photo failure never blocks the underlying workflow**.

## Resend (email)

- **Usage**: single purpose — overdue-contractor alert emails, via [lib/email.js](lib/email.js).
  No other transactional email exists in the app (no sign-in confirmation emails, no password
  reset, etc. — there are no user accounts to send those to).
- **Naming/triggers**: subject line is
  `"⚠ {count} contractor(s) still on site — {UK date string}"`; triggered either by the Vercel
  Cron hitting `/api/notify-overdue`, or a manager clicking "Send Overdue Alert" on the dashboard
  (`/api/trigger-notify`, no auth — see B12).
- **Failure behaviour**: `isEmailConfigured()` gate returns `{sent: 0, skipped: 'RESEND_API_KEY
  not set'}` without attempting anything if the key is missing. Otherwise, sends are attempted
  per-recipient in a loop; a failure for one manager's email is caught, pushed into an `errors[]`
  array, and does not stop sends to the remaining recipients. HTML body is built with
  **unescaped string interpolation** of contractor-entered fields — see [BACKLOG.md](BACKLOG.md)
  B6.

## Vercel Cron

- **Usage**: one scheduled job defined in [vercel.json](vercel.json) —
  `GET /api/notify-overdue` at `"0 17 * * 1-5"` (17:00 UTC, Mon–Fri). Vercel automatically attaches
  an `Authorization: Bearer <CRON_SECRET>` header to cron-triggered requests.
- **Naming/triggers**: platform-managed; no code exists to configure or verify the schedule beyond
  this one JSON entry. There's no separate cron for anything else (no daily digest, no cleanup
  job, no retention sweep).
- **Failure behaviour**: if the handler throws, it returns `500`; Vercel Cron does not appear to
  retry (unverified — Vercel platform behaviour, outside this codebase). Because the schedule is a
  fixed UTC time, its effective UK-local firing time shifts by an hour across the DST boundary
  (see [BACKLOG.md](BACKLOG.md) B7) — this is a scheduling limitation, not a code bug, but affects
  the "past 18:00 UK" business intent stated in the email copy.

## Excel export/legacy `excel.js`

Two unrelated things share the word "Excel" in this repo — worth keeping distinct:

1. **`lib/excel.js`** — a full local-file data-engine (read/write `.xlsx` via `exceljs`, file
   locking, 4 sheets) that was the **original** data layer before the Supabase migration. It is
   **not imported by any page or API route** today — confirmed by grep across
   `pages/`, `pages/api/`, `components/`. Dead code, kept only for reference/rollback. See
   [BACKLOG.md](BACKLOG.md) B1.
2. **`xlsx` (SheetJS) in `pages/dashboard.js`** — used client-side only, to build the Monthly
   Summary `.xlsx` export the manager downloads from the browser (`exportCsv()` function,
   [pages/dashboard.js:1365-1445](pages/dashboard.js#L1365-L1445)). Runs entirely in the browser
   from data already fetched; no server round-trip, no relation to `lib/excel.js`. See
   [BACKLOG.md](BACKLOG.md) B18.
3. **`scripts/setup-excel.js`** — a standalone one-time CLI script (`node scripts/setup-excel.js`)
   that also uses `exceljs` directly (not via `lib/excel.js`) to create a starter `.xlsx` file.
   Belongs to the pre-Supabase setup flow described in `README.md`; not run as part of the current
   Supabase-based deployment process described in `SETUP_GUIDE.md`.
