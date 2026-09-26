# Deployment Runbook

Platform: Vercel (Next.js auto-detected), GitHub-connected for auto-deploy on push to `main`.
Full first-time setup steps are in [SETUP_GUIDE.md](SETUP_GUIDE.md) — this file is the
day-to-day operational reference, not first-time setup.

## Deploy

1. Commit and push to `main`: `git push origin main`.
2. Vercel auto-builds and deploys — no manual trigger needed, no staging environment exists in
   this repo's config (`vercel.json` has no environment-specific sections beyond the one cron
   job). Typical deploy time ~2 minutes per `SETUP_GUIDE.md`.
3. No build-time tests run (none exist) and no DB migration step runs automatically — schema
   changes require manually pasting SQL into the Supabase SQL Editor (see [DATABASE.md](DATABASE.md)
   "Migrations log" and the procedure below).
4. Verify after deploy: open `/`, complete one test sign-in on a non-production-looking test
   company/ID; open `/dashboard`, unlock, confirm the row appears.

## Schema-change procedure

There is no migration framework — `supabase-schema.sql` is a hand-maintained, manually-applied
file.

1. Add new SQL to `supabase-schema.sql`, using `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT
   EXISTS` guards so the whole file stays safely re-runnable (matches the existing pattern under
   the `-- MIGRATION` heading).
2. Paste the **new statements only** (or the whole file — it's idempotent) into Supabase Dashboard
   → SQL Editor → Run, against the target project.
3. Update [DATABASE.md](DATABASE.md)'s table docs and migrations log to match.
4. Deploy the corresponding code change. Because there's no automatic migration-on-deploy, a code
   deploy that depends on a new column **must** have the SQL run first, or the deployed code will
   start erroring on that column (Supabase returns a column-not-found error, surfaced as a `500`
   with the DB error message in non-production, or a generic "Server error" in production).

## Rollback

- **Code**: revert the bad commit and push (`git revert <sha>` then `git push`), or redeploy a
  previous deployment directly from the Vercel dashboard (Deployments tab → select a prior
  successful build → "Promote to Production"). No feature-flag kill switch exists for individual
  features — rollback is all-or-nothing at the deployment level.
- **Schema**: no automatic down-migrations. A column/table added in error must be manually dropped
  via the Supabase SQL Editor — write the reverse SQL yourself (`ALTER TABLE ... DROP COLUMN ...`)
  and confirm no deployed code still reads/writes it first.
- **Data**: no application-level backup/restore tooling. Rely on Supabase's own point-in-time
  recovery / backup features (plan-dependent, outside this codebase — check Supabase project
  settings before assuming a specific retention window).

## Backup

Nothing in this codebase performs backups. What exists is entirely Supabase-platform-managed
(point-in-time recovery availability depends on the Supabase plan tier — verify current tier
before relying on any specific RPO/RTO). The Monthly Summary Excel export
(`pages/dashboard.js` `exportCsv()`) is a manual, on-demand snapshot of overtime data only — not
a systematic backup mechanism, and does not cover `contractor_log`, `contractor_compliance`, or
`operative_induction`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Site prompts for a Vercel login page instead of the app | Vercel Deployment Protection enabled | Vercel → Project → Settings → Deployment Protection → set to **None** |
| "Database error" on sign-in/sign-out | `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_ANON_KEY` missing/wrong in Vercel env vars | Check Vercel → Settings → Environment Variables; redeploy after fixing |
| "relation does not exist" / schema/table missing error | `supabase-schema.sql` never run against this Supabase project | Run the full file in Supabase SQL Editor |
| Dashboard PIN doesn't work | `DASHBOARD_PIN` not set, or set but not redeployed | Set in Vercel env vars, redeploy (env var changes require a redeploy to take effect) |
| A specific manager's PIN doesn't work | Wrong/missing `manager_pin` value in Supabase `managers` table for that exact `manager_name` (case-insensitive but must otherwise match) | Update the row directly in Supabase Table Editor — takes effect immediately, no redeploy |
| Overdue emails not sending | `RESEND_API_KEY`/`RESEND_FROM`/`CRON_SECRET` missing, or no manager has an `email` set | Check env vars + Table Editor `managers.email` column; see [INTEGRATIONS.md](INTEGRATIONS.md) Resend failure behaviour |
| "Force Sign-Out" gives a server error | `contractor_log.amended_by`/`amended_at` columns missing (pre-migration DB) | Run: `ALTER TABLE contractor_log ADD COLUMN IF NOT EXISTS amended_by TEXT; ALTER TABLE contractor_log ADD COLUMN IF NOT EXISTS amended_at TEXT;` |
| Photos not uploading | One or more `CF_*` R2 env vars missing | Set all four in Vercel; sign-out/overtime-signout still work without photos in the meantime (see [BUSINESS_RULES.md](BUSINESS_RULES.md)) |
| Weekly Rota tab errors | `weekly_rota` table missing (pre-migration DB) | Run the `weekly_rota` block from `supabase-schema.sql` (`CREATE TABLE IF NOT EXISTS weekly_rota ...` through the `ALTER TABLE` lines) |
| Dashboard shows stale/missing older records at scale | Supabase default 1000-row cap on unbounded selects ([BACKLOG.md](BACKLOG.md) B5) | No config fix currently — needs a code change (pagination/`.range()`) to resolve; not a deploy/env issue |
| A contractor from yesterday can't sign out today | Same-day-only active-session lookup ([BACKLOG.md](BACKLOG.md) B8) | Manager must Force Sign-Out from the dashboard Contractors tab (widen the date filter to include the sign-in date first) |
| Anyone can view dashboard data by hitting the API directly | No server-side auth on read routes ([BACKLOG.md](BACKLOG.md) B2) | No config fix — requires a code change; not something achievable by redeploying with different env vars |
