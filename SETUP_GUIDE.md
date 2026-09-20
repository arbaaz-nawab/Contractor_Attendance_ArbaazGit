# Goodenough College — Contractor Attendance App
## Setup Guide (Supabase + Vercel)

Complete, ordered setup for a fresh environment. Follow the steps in order — later steps
(env vars, seed data) depend on earlier ones (schema, credentials) already being in place.

---

## What You Need

- A **GitHub** account — hosts the code
- A **Supabase** account — hosts the database and file storage
- A **Vercel** account — hosts the website and runs the scheduled job
- (Optional, currently unused) A **Resend** account — see "Email alerts" note below

---

## Step 1 — Create the Supabase project

1. Go to [supabase.com](https://supabase.com), sign in, click **New Project**.
2. Name it (e.g. `contractor-attendance`), set a database password, choose the **EU West**
   region (closest to London), click **Create new project**, wait ~2 minutes.
3. **Project Settings → API** — copy the **Project URL** (this becomes
   `NEXT_PUBLIC_SUPABASE_URL`) and the **anon / public** key (this becomes `SUPABASE_ANON_KEY`).

## Step 2 — Run the database schema (once, top to bottom)

1. In Supabase, open **SQL Editor**.
2. Open `supabase-schema.sql` from this project, paste the **entire file**, click **Run**.
3. The file is idempotent — safe to run again in full if you're ever unsure what's been applied
   (every statement uses `IF NOT EXISTS` / `DROP POLICY IF EXISTS` guards).

This creates every table the app uses:
- `contractor_log` — contractor sign-in/out records
- `engineer_overtime` — staff overtime sessions
- `managers` — manager names, PINs and email addresses (PIN list for dashboard write actions)
- `contractor_compliance` — company-level RAMS/induction/insurance dates
- `operative_induction` — per-person induction tracking
- `weekly_rota` — engineer duty assignments per week
- `shift_log` — daily engineer shift sign-in/out (separate from overtime), plus a unique index
  enforcing one open shift per engineer and a `correction_note` column for manager corrections
- `parking_bookings`, `parking_staff`, `parking_history` — the Parking tab's booking log,
  editable staff picker list, and change history
- `planned_works`, `planned_works_oncall` — the weekly Planned Works log and its on-call block
- the `compliance-docs` private Storage bucket, for uploaded compliance documents

## Step 3 — Push the code to GitHub

1. Open **GitHub Desktop** (or the `git` CLI), add this project folder as a repository, commit,
   and publish it (private is fine).

## Step 4 — Deploy to Vercel

### 4a. Import the project
1. [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** → select this
   repo → **Import**. Framework auto-detects as Next.js — leave settings as-is.

### 4b. Add environment variables

Add these **before** clicking Deploy — set them for both the **Production** and **Preview**
Vercel environments (Vercel scopes env vars per environment; a value only in Production won't be
seen by a Preview deployment).

| Variable | Required? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Required** | Supabase project URL (Step 1) |
| `SUPABASE_ANON_KEY` | **Required** | Supabase anon/public key (Step 1) |
| `DASHBOARD_PIN` | **Required** | The PIN that unlocks the manager dashboard |
| `SESSION_SECRET` | **Required** | Signs the dashboard's login session cookie (see below) — the dashboard PIN screen fails closed (503) without this |
| `CRON_SECRET` | **Required in practice** | Protects the scheduled shift-correction sweep; if unset, that endpoint is open to anyone who finds the URL |
| `MANAGER_PINS` | Optional | Fallback manager PINs if the `managers` table is empty: `Name:PIN,Name:PIN` |
| `APPROVAL_PIN` | Optional | A single fallback PIN usable for any manager name not otherwise configured — a convenience, and a real access-control trade-off (see [SECURITY_AND_DATA.md](SECURITY_AND_DATA.md)) |
| `CF_ACCOUNT_ID` | Optional | Cloudflare account ID — only if using R2 for sign-in/shift/overtime photos |
| `CF_R2_ACCESS_KEY_ID` | Optional | R2 access key (needed alongside the other three `CF_*` vars, or none of them take effect) |
| `CF_R2_SECRET_ACCESS_KEY` | Optional | R2 secret key |
| `CF_R2_BUCKET` | Optional | R2 bucket name — **no default in code**, despite older docs implying one; must be set explicitly if using R2 |
| `RESEND_API_KEY` | Optional, **dormant** | Only used by the retired overdue-email feature — safe to leave unset |
| `RESEND_FROM` | Optional, **dormant** | Same — unused while email alerts are off |
| `NEXT_PUBLIC_APP_TITLE` | Not used | Documented in older guides as configuring the browser-tab title; the code does not actually read it — the title is hardcoded in `components/Layout.js`. Safe to ignore |
| `EXCEL_FILE_PATH` | Not needed | Only read by `lib/excel.js`, which nothing in the live app imports, and by the unrelated legacy `scripts/setup-excel.js`. Not needed for a Supabase-based deployment |

**Generating `SESSION_SECRET`**: any long random string works, e.g. run
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` locally and paste the
output. Use a different value per environment if you like — it only needs to be stable within
that environment.

### 4c. Deploy
Click **Deploy**, wait ~2 minutes.

### 4d. Disable Deployment Protection
Vercel blocks visitors behind a Vercel login by default. Turn this off so contractors can reach
the site: **Settings → Deployment Protection → None**.

## Step 5 — First-run seed data

The schema creates empty tables — a few need at least one row before parts of the dashboard are
usable:

1. **Managers (PINs)** — Supabase → **Table Editor → managers** → insert one row per manager who
   needs to approve/amend/correct things from the dashboard: `manager_name`, `manager_pin`
   (plaintext — see [SECURITY_AND_DATA.md](SECURITY_AND_DATA.md)), `email` (currently unused
   while alerts are dormant, but harmless to fill in for when they're revived).
2. **Parking "Estates staff"** — this is a *separate* list from `managers` above, used only for
   who can be picked as "entered by"/requester on a parking booking. It starts empty. On the
   dashboard **Parking** tab, click **Manage Staff** and add names directly — no SQL or redeploy
   needed, and the New Booking form shows a friendly prompt if this list is still empty.
3. **Planned Works managers** — unlike the two lists above, `PLANNED_WORKS_MANAGERS` (currently
   Arbaaz Nawab, Chris Vasta, Margarita Miller, Sarfraz Arfan) and `PLANNED_WORKS_ADMIN` (Umayma
   Chakour) are **fixed in code**, in `lib/config.js` — there is no dashboard UI to edit this
   list. Changing it requires editing that file and redeploying.
4. **Engineers** — the `ENGINEERS` list (who appears in the shift/overtime name picker) and the
   `TEAMS` object (who approves whose overtime) are also fixed in `lib/config.js`.

## Step 6 — Set up the QR code (contractor sign-in)

1. Use any QR generator (e.g. [qr.io](https://qr.io)), paste your Vercel URL.
2. Download and print it, place it at the sign-in desk/entrance.

## Step 7 — Test end to end

1. Open your Vercel URL, sign in a test contractor, confirm the row appears in Supabase →
   `contractor_log`, then sign them out.
2. As an engineer: sign in to a shift, then sign out (try both under-8h and a normal completion).
3. Go to `/dashboard`, enter `DASHBOARD_PIN` — confirm you land on the Contractors tab and the
   record from step 1 shows.
4. Open the browser dev tools → Application → Cookies and confirm a `gc_dash_session` cookie was
   set (httpOnly) — this is the real login session, separate from the PIN screen itself.
5. Check the Attendance, Parking, and Planned Works tabs each load without a "table not found"
   error (confirms Step 2 ran completely).

---

## Running Locally (Development)

```bash
npm install
cp .env.example .env.local   # fill in the values from Step 4b above
npm run dev
```

- Sign-in / shift / overtime forms: [http://localhost:3000](http://localhost:3000)
- Manager dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

`SESSION_SECRET` is required locally too — `check-pin` fails closed (503) without it, same as in
production.

---

## Vercel Cron

`vercel.json` schedules one job, twice, so it lands exactly at 17:00 UK time in both GMT and BST:

```json
{
  "crons": [
    { "path": "/api/flag-missing-shifts", "schedule": "0 16 * * *" },
    { "path": "/api/flag-missing-shifts", "schedule": "0 17 * * *" }
  ]
}
```

Both firings hit the same endpoint; its own `ukHour() < 17` check makes the "early" one a no-op
in winter and both act (harmlessly, idempotently) in summer. This flags any engineer shift still
open past the cutoff for manager correction on the Attendance tab. The older overdue-contractor
email cron has been removed — see "Email alerts" below.

---

## Updating the App

```bash
git add .
git commit -m "describe your change"
git push origin main
```
Vercel redeploys automatically within ~2 minutes. Schema changes (new tables/columns) are **not**
applied automatically — re-run the relevant part of `supabase-schema.sql` in the Supabase SQL
Editor yourself before or after deploying the code that needs it.

---

## Email alerts (currently dormant)

The overdue-contractor email never reliably delivered — no verified Resend sending domain means
Resend only accepts mail to the account owner, so every other manager's alert was silently lost.
It's been switched off: no cron entry calls it, and the dashboard button that triggered it
manually has been replaced with a plain on-screen banner instead. `lib/email.js`,
`pages/api/notify-overdue.js`, and `pages/api/trigger-notify.js` are all still in the codebase,
untouched, ready to be reconnected once a verified sending domain (or a Microsoft 365 route) is
available — see MEMORY.md for the exact steps to revive it.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Site asks for a Vercel login | Deployment Protection is still on — Settings → Deployment Protection → None |
| Database error on sign-in | Check `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_ANON_KEY` are set correctly |
| "relation does not exist" / table missing | Re-run the full `supabase-schema.sql` in the SQL Editor |
| Dashboard PIN screen returns a server error (503) | `SESSION_SECRET` is not set in this environment |
| Dashboard login works but every tab shows "Session expired" immediately | `SESSION_SECRET` differs between what issued the cookie and what's checking it (e.g. you changed it after someone logged in) — have them log in again |
| A specific manager's PIN doesn't work | Check `manager_pin` for that exact `manager_name` in the Supabase `managers` table (case-insensitive but otherwise must match) |
| Attendance tab shows a "table not found" error | The `shift_log` table (or its unique index / `correction_note` column) is missing — re-run `supabase-schema.sql` |
| Parking or Planned Works tabs show a "table not found" error | Same — those tables are in the same schema file, re-run it |
| New Booking on the Parking tab shows "Add an Estates staff member first" | Expected until at least one name is added via **Manage Staff** on that tab |
| Photos not uploading | Set all four `CF_*` vars — sign-in/shift/overtime sign-out still work without photos either way |
| Force Sign-Out (Contractors tab) gives a server error | Old database — run: `ALTER TABLE contractor_log ADD COLUMN IF NOT EXISTS amended_by TEXT; ALTER TABLE contractor_log ADD COLUMN IF NOT EXISTS amended_at TEXT;` |
| Overdue email not arriving | Expected — this feature is currently dormant by design, not a bug. See "Email alerts" above |
