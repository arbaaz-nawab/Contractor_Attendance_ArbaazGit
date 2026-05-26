# Goodenough College — Contractor Attendance App
## Setup Guide (Supabase + Vercel)

This guide walks you through setting up the app from scratch on a new machine or for a new deployment.

---

## What You Need

- A **GitHub** account (free) — hosts the code
- A **Supabase** account (free) — hosts the database and file storage
- A **Vercel** account (free) — hosts the website and runs scheduled jobs
- A **Resend** account (free) — sends overdue contractor alert emails

---

## Step 1 — Set Up Supabase

### 1a. Create a project
1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Give it a name (e.g. `contractor-attendance`) and set a database password
4. Choose the **EU West** region (closest to London)
5. Click **Create new project** and wait ~2 minutes

### 1b. Run the database schema
1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Open the file `supabase-schema.sql` from this project folder
3. Paste the entire contents into the SQL Editor
4. Click **Run**

This creates all the required tables:
- `contractor_log` — contractor sign-in/out records
- `engineer_overtime` — staff overtime sessions
- `managers` — manager names, PINs and email addresses
- `contractor_compliance` — company compliance dates
- `compliance-docs` — private storage bucket for uploaded documents

### 1c. Get your API credentials
1. In Supabase, go to **Project Settings → API**
2. Copy the **Project URL** — this is your `NEXT_PUBLIC_SUPABASE_URL`
3. Copy the **anon / public** key — this is your `SUPABASE_ANON_KEY`

### 1d. Add manager rows
1. Go to **Table Editor → managers**
2. Insert one row per manager with:
   - `manager_name` — their full name (e.g. `Dean Marsh`)
   - `manager_pin` — their personal PIN for approvals
   - `email` — their email address for overdue alerts

---

## Step 2 — Set Up Resend (Email Alerts)

1. Go to [resend.com](https://resend.com) and sign up for a free account
2. Go to **API Keys → Create API Key** — copy the key
3. Note your sender address:
   - **Free / testing:** use `onboarding@resend.dev` (can only send to your own Resend account email)
   - **Production:** go to **Domains → Add Domain** and verify your own domain, then use `alerts@yourdomain.com`

---

## Step 3 — Push Code to GitHub

1. Open **GitHub Desktop**
2. Click **Add an Existing Repository from your Hard Drive**
3. Browse to the project folder and click **Add Repository**
4. Click **Publish repository** (keep private if preferred)

---

## Step 4 — Deploy to Vercel

### 4a. Import the project
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New → Project**
3. Find and select your GitHub repo, click **Import**
4. Framework will auto-detect as **Next.js** — leave all settings as-is

### 4b. Add environment variables
Before clicking Deploy, add the following environment variables:

| Variable | Required | Value |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Your Supabase anon key |
| `DASHBOARD_PIN` | Yes | PIN to unlock the manager dashboard |
| `RESEND_API_KEY` | Yes | API key from resend.com |
| `RESEND_FROM` | Yes | `onboarding@resend.dev` or your verified domain email |
| `CRON_SECRET` | Yes | Any random string — protects the scheduled email endpoint |
| `NEXT_PUBLIC_APP_TITLE` | No | App title shown in browser tab (e.g. `Estates Contractor Log`) |
| `MANAGER_PINS` | No | Fallback if Supabase managers table is empty. Format: `Name:PIN,Name:PIN` |
| `APPROVAL_PIN` | No | Universal fallback PIN for all managers |
| `CF_ACCOUNT_ID` | No | Cloudflare account ID (only if using R2 for photo storage) |
| `CF_R2_ACCESS_KEY_ID` | No | Cloudflare R2 access key |
| `CF_R2_SECRET_ACCESS_KEY` | No | Cloudflare R2 secret key |
| `CF_R2_BUCKET` | No | R2 bucket name (default: `contractor-photos`) |

### 4c. Deploy
Click **Deploy** and wait ~2 minutes. Vercel will give you a URL like `https://your-app.vercel.app`.

### 4d. Disable Deployment Protection
By default Vercel requires visitors to log in with Vercel. Turn this off so contractors can access the site:
1. Vercel → your project → **Settings → Deployment Protection**
2. Set to **None** and save

---

## Step 5 — Test the App

1. Open your Vercel URL
2. Sign in a test contractor and check the record appears in Supabase → `contractor_log`
3. Sign out the contractor
4. Go to `/dashboard`, enter the dashboard PIN, and check the record shows in the Contractors tab
5. Click **Send Overdue Alert** and confirm the email arrives

---

## Step 6 — Set Up the QR Code

1. Go to [qr.io](https://qr.io) or [qrcode-monkey.com](https://qrcode-monkey.com)
2. Paste your Vercel URL
3. Download the QR code as PNG
4. Print and place at the sign-in desk

---

## Running Locally (Development)

### Install dependencies
```
npm install
```

### Create a local environment file
Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials and other variables.

### Start the dev server
```
npm run dev
```

- Sign-in form: [http://localhost:3000](http://localhost:3000)
- Manager dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

---

## Updating the App

After making code changes:
```
git add .
git commit -m "describe your change"
git push origin main
```
Vercel automatically redeploys within ~2 minutes.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Site asks for Vercel login | Disable Deployment Protection: Vercel → Settings → Deployment Protection → None |
| Database error on sign-in | Check `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in Vercel env vars |
| Schema/table missing error | Run `supabase-schema.sql` in Supabase SQL Editor |
| Dashboard PIN not working | Check `DASHBOARD_PIN` in Vercel env vars and redeploy |
| Manager PIN not working | Check the `manager_pin` value in Supabase `managers` table |
| Overdue emails not sending | Check `RESEND_API_KEY`, `RESEND_FROM`, `CRON_SECRET` are set and project redeployed. Add email addresses to the `managers` table in Supabase |
| Force Sign-Out server error | Run in Supabase SQL Editor: `ALTER TABLE contractor_log ADD COLUMN IF NOT EXISTS amended_by TEXT; ALTER TABLE contractor_log ADD COLUMN IF NOT EXISTS amended_at TEXT;` |
| Photos not uploading | Set `CF_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_R2_BUCKET` in Vercel env vars. Sign-out still works without photos. |
