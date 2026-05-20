# Goodenough College — Contractor Attendance App
## User Guide & Deployment Instructions

---

## What This App Does

A web app for Goodenough College Estates staff that:
- Lets **contractors** sign in and out when visiting site
- Captures **Health & Safety** checks (RAMS, permits, asbestos, induction, insurance)
- Lets **Goodenough College staff** log and get overtime approved
- Gives **managers** a dashboard to see who is on site, view attendance history, manage compliance records, approve overtime, and receive email alerts for overdue contractors

---

## User Roles

### 1. Contractor (Sign In / Sign Out)
Go to the **main page** (`/`).

**To sign in:**
1. Tap **Contractor**
2. Select your **company name** (or type it under "Other")
3. Wait for the compliance check (green = returning, amber = first visit or expired compliance)
4. Fill in your **operative name** (autocomplete will suggest returning operatives), **contact number** (UK format: `07700 900000` or `+44 7700 900000`), **3-digit ID** (from your ID card)
5. Select the **building(s)** you're working in and your **point of contact**
6. Answer the **Health & Safety questions** (permits, fire safety, asbestos, RAMS, induction, insurance)
7. Tick the **declaration** and tap **Sign In**

**To sign out:**
1. Tap **Contractor → Sign Out**
2. Enter your **3-digit ID number**
3. Describe the work completed
4. Optionally take or upload a **photo** of completed work
5. Tap **Sign Out**

---

### 2. Goodenough College Staff (Overtime)
Go to the **main page** (`/`) and tap **Goodenough College Staff**.

**To start overtime:**
1. Select your name from the list
2. Tap **Start Overtime**

**To end overtime:**
1. Select your name
2. Describe the work you completed
3. Optionally upload a photo
4. Tap **End Overtime** — your record goes to your manager for approval

---

### 3. Manager (Dashboard)
Go to `/dashboard` (there is a small link at the bottom of the main page).

Enter the **dashboard PIN** (set via `DASHBOARD_PIN` in Vercel environment variables).

**Dashboard tabs:**

| Tab | What it shows |
|-----|---------------|
| **Contractors** | Who is currently on site + completed visits. Filter by date range and company. Overdue contractors (past 18:00) are highlighted in red. |
| **Overtime** | All engineer overtime sessions. Amend or delete records with manager PIN. |
| **Approvals** | Pending overtime records awaiting your approval. Approve or reject using your manager PIN. |
| **Monthly Summary** | Hours summary per engineer for any month or date range. Export to CSV. |
| **Compliance** | RAMS, induction and insurance dates per company. Upload, view and delete compliance documents. |

**Overdue contractor alerts:**
- After 18:00, active contractors on site are highlighted red with an **Overdue** badge
- Click **Force Sign-Out** on any overdue row to close their session (requires manager PIN)
- Click **Send Overdue Alert** in the filter bar to manually email all managers
- An automatic email is also sent every weekday at 18:00 UK time via Vercel Cron

**Amending and deleting records:**
- In the **Contractors** tab, each signed-out record has an **Amend** button — edit work notes, sign-out time, contact details, or delete the entry entirely (requires manager PIN)
- In the **Overtime** tab, each record has an **Amend / Delete** button (requires manager PIN)
- In the **Compliance** tab, each company row has a **Delete** button (requires manager PIN)

**Manager PINs** are stored in the Supabase `managers` table — see [Managing Managers](#managing-managers) below. Do not write PINs in this document.

---

## Compliance Expiry Rules

| Document | Expires after |
|----------|--------------|
| RAMS | 6 months from last confirmation |
| Site Induction | 12 months from last confirmation |
| Insurance | 12 months from last confirmation |

When a contractor's compliance expires (or it is their first visit), the sign-in form automatically shows extra H&S questions.

---

## One-Time Setup: Supabase Database

Before deploying, run the SQL schema in your Supabase project:

1. Go to [supabase.com](https://supabase.com) → your project → **SQL Editor**
2. Open the file `supabase-schema.sql` from this project
3. Paste it all in and click **Run**

This creates the following tables and a private storage bucket:
- `contractor_log` — all sign-in/out records
- `engineer_overtime` — staff overtime sessions
- `managers` — manager names, PINs and email addresses
- `contractor_compliance` — company compliance dates
- `compliance-docs` storage bucket — uploaded PDF/image documents

---

## Deploying to Vercel

### Step 1 — Push to GitHub

1. Open **GitHub Desktop**
2. Click **Add an Existing Repository from your Hard Drive**
3. Browse to the project folder and click **Add Repository**
4. Click **Publish repository**

### Step 2 — Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account
2. Click **Add New → Project**
3. Find and select your GitHub repo
4. Click **Import** — framework will auto-detect as **Next.js**
5. Add the environment variables listed below
6. Click **Deploy**
7. Wait ~2 minutes for the URL to go live

### Step 3 — Optional: Custom Domain

In Vercel → your project → **Settings → Domains** → add your own domain.

### Step 4 — Disable Deployment Protection

By default Vercel requires visitors to log in. To make the site publicly accessible:

1. Vercel → your project → **Settings → Deployment Protection**
2. Set to **None** and save

---

## Updating the App

Whenever you make code changes:
```
git add .
git commit -m "describe your change"
git push origin main
```
Vercel automatically redeploys within ~2 minutes.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `DASHBOARD_PIN` | Yes | PIN to access the manager dashboard |
| `RESEND_API_KEY` | Yes (for email alerts) | API key from resend.com |
| `RESEND_FROM` | Yes (for email alerts) | Sender address e.g. `alerts@yourdomain.com` or `onboarding@resend.dev` |
| `CRON_SECRET` | Yes (for email alerts) | Any random string — protects the cron endpoint |
| `NEXT_PUBLIC_APP_TITLE` | No | App title shown in the browser tab |
| `MANAGER_PINS` | No | Fallback if Supabase managers table is empty. Format: `Name:PIN,Name:PIN` |
| `APPROVAL_PIN` | No | Universal fallback PIN for all managers |
| `CF_ACCOUNT_ID` | No | Cloudflare account ID (for R2 photo uploads) |
| `CF_R2_ACCESS_KEY_ID` | No | Cloudflare R2 access key |
| `CF_R2_SECRET_ACCESS_KEY` | No | Cloudflare R2 secret key |
| `CF_R2_BUCKET` | No | R2 bucket name (default: `contractor-photos`) |

---

## Managing Managers

Managers are stored in the **Supabase `managers` table** with three columns:

| Column | Description |
|--------|-------------|
| `manager_name` | Full name — must match exactly what appears in dropdowns |
| `manager_pin` | The manager's individual PIN for approvals and amendments |
| `email` | Email address for overdue contractor alerts (optional) |

To add a new manager:
1. Go to Supabase → **Table Editor** → `managers`
2. Insert a new row with their name, PIN and email
3. The manager will appear in all dropdowns immediately — no code change or redeploy needed

To change a PIN: edit the `manager_pin` value directly in the table.

---

## Adding or Removing Engineers

Edit [lib/config.js](lib/config.js):
- `ENGINEERS` — list of staff names shown in the overtime sign-in form

After editing, commit and push — Vercel redeploys automatically.

---

## Adding Companies to the Sign-In Dropdown

Edit [components/SignInForm.js](components/SignInForm.js) — find the `COMPANIES` array near the top and add/remove names. There is also an "Other" option that lets contractors type any company name.

---

## Frequently Asked Questions

**A contractor can't sign in — it says "already signed in today"**
They must sign out first using their 3-digit ID, or a manager can use the dashboard to force sign-out.

**What is the 3-digit ID?**
It is the number printed on the contractor's physical ID card. It identifies a person uniquely for that day. Range: 001–999.

**Can two people share an ID?**
No — only one active session per ID per day is allowed.

**Where are photos stored?**
If Cloudflare R2 is configured, photos are uploaded there and a link is stored in the database. If R2 is not configured, no photo is stored but sign-out still works.

**Where are compliance documents stored?**
In Supabase Storage (private bucket: `compliance-docs`). Files are accessible to managers via the Compliance tab → Files button.

**How do I change the dashboard PIN?**
Update `DASHBOARD_PIN` in Vercel → your project → Settings → Environment Variables, then redeploy.

**How do I change a manager's PIN?**
Edit the `manager_pin` value directly in the Supabase `managers` table. No redeploy needed.

**Why did I get "Alert sent to 0 manager(s)"?**
The `email` column in the Supabase `managers` table is empty. Add email addresses to each manager row.

**The overdue email is not arriving**
Check: (1) `RESEND_API_KEY`, `RESEND_FROM` and `CRON_SECRET` are set in Vercel env vars and the project has been redeployed. (2) Manager email addresses are filled in the Supabase `managers` table. (3) On Resend's free plan, emails can only be sent to the account owner's email — verify your domain to send to any address.

**The app is deployed but shows a database error**
Check that you ran `supabase-schema.sql` in your Supabase SQL Editor and that all environment variables are set correctly in Vercel.

**Force Sign-Out shows a server error**
Run this in Supabase SQL Editor to ensure the amend tracking columns exist:
```sql
ALTER TABLE contractor_log ADD COLUMN IF NOT EXISTS amended_by TEXT;
ALTER TABLE contractor_log ADD COLUMN IF NOT EXISTS amended_at TEXT;
```
