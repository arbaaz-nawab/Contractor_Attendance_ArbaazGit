# Goodenough College — Contractor Attendance App
## User Guide & Deployment Instructions

---

## What This App Does

A web app for Goodenough College Estates staff that:
- Lets **contractors** sign in and out when visiting site
- Captures **Health & Safety** checks (RAMS, permits, asbestos, induction, insurance)
- Lets **Goodenough College staff** log and get overtime approved
- Gives **managers** a dashboard to see who is on site, view attendance history, manage compliance records and approve overtime

---

## User Roles

### 1. Contractor (Sign In / Sign Out)
Go to the **main page** (`/`).

**To sign in:**
1. Tap **Contractor**
2. Select your **company name** (or type it under "Other")
3. Wait for the compliance check (green = returning, amber = first visit or expired compliance)
4. Fill in your **operative name**, **contact number**, **3-digit ID** (from your ID card)
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

Enter the **dashboard PIN** (default: `4321` — change this in Vercel env vars).

**Dashboard tabs:**

| Tab | What it shows |
|-----|---------------|
| **Contractors** | Who is currently on site + completed visits. Filter by date range and company. |
| **Overtime** | All engineer overtime sessions. |
| **Approvals** | Pending overtime records for your team. Approve or reject using your manager PIN. |
| **Monthly Summary** | Hours summary per engineer for any month. |
| **Compliance** | RAMS, induction and insurance dates per company. Upload compliance documents. |

**Manager PINs** (set in Vercel env vars under `MANAGER_PINS`):
- Arbaaz Nawab: 9999
- Dean Marsh: 1212
- Frankie Sheekey: 7777
- Laurel Anderson: 6666

---

## Compliance Expiry Rules

| Document | Expires after |
|----------|--------------|
| RAMS | 6 months from last confirmation |
| Site Induction | 12 months from last confirmation |
| Insurance | 12 months from last confirmation |

When a contractor's compliance expires (or it's their first visit), the sign-in form automatically shows extra H&S questions.

---

## One-Time Setup: Supabase Database

Before deploying, run the SQL schema in your Supabase project:

1. Go to [supabase.com](https://supabase.com) → your project → **SQL Editor**
2. Open the file `supabase-schema.sql` from this project
3. Paste it all in and click **Run**

This creates four tables and a private storage bucket:
- `contractor_log` — all sign-in/out records
- `engineer_overtime` — staff overtime sessions
- `managers` — manager names and PINs (optional, env vars work too)
- `contractor_compliance` — company compliance dates
- `compliance-docs` storage bucket — uploaded PDF/image documents

---

## Deploying to Vercel

### Step 1 — Push to GitHub

1. Open **GitHub Desktop**
2. Click **Add an Existing Repository from your Hard Drive**
3. Browse to: `C:\Users\arbaaz.nawab\OneDrive - Goodenough College\contractor attendance\Contractor_attendance-main`
4. Click **Add Repository** (or **Create Repository** if prompted)
5. Click **Publish repository** → uncheck "Keep this code private" if you want, or leave it private
6. Click **Publish Repository**

### Step 2 — Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account
2. Click **Add New → Project**
3. Find and select your GitHub repo (`Contractor_attendance-main` or similar)
4. Click **Import**
5. Framework will auto-detect as **Next.js** — leave all settings as-is
6. Click **Environment Variables** and add the following:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://caiyqhnbztxbnobmdapj.supabase.co` |
| `SUPABASE_ANON_KEY` | *(your anon key — see .env.local)* |
| `DASHBOARD_PIN` | `1234` (or choose your own) |
| `MANAGER_PINS` | `Arbaaz Nawab:9999,Dean Marsh:1212,Frankie Sheekey:7777,Laurel Anderson:6666,Sarfraz Arfan:5555` |
| `NEXT_PUBLIC_APP_TITLE` | `Estates Contractor Log` |
| `CF_ACCOUNT_ID` | *(only if using Cloudflare R2 for photos — optional)* |
| `CF_R2_ACCESS_KEY_ID` | *(optional)* |
| `CF_R2_SECRET_ACCESS_KEY` | *(optional)* |
| `CF_R2_BUCKET` | `contractor-photos` *(optional)* |

7. Click **Deploy**
8. Wait ~2 minutes — Vercel will give you a URL like `https://contractor-attendance-xxx.vercel.app`

### Step 3 — Optional: Custom Domain

In Vercel → your project → **Settings → Domains** → add your own domain.

---

## Updating the App

Whenever you make changes:
1. Open **GitHub Desktop**
2. Review the changed files, write a short summary, click **Commit to main**
3. Click **Push origin**
4. Vercel automatically redeploys within ~2 minutes

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `DASHBOARD_PIN` | Yes | PIN to access the manager dashboard |
| `MANAGER_PINS` | Yes | Comma-separated `Name:PIN` pairs for overtime approval |
| `NEXT_PUBLIC_APP_TITLE` | No | App title shown in the browser tab |
| `APPROVAL_PIN` | No | Universal fallback PIN for overtime approval |
| `CF_ACCOUNT_ID` | No | Cloudflare account ID (for R2 photo uploads) |
| `CF_R2_ACCESS_KEY_ID` | No | Cloudflare R2 access key |
| `CF_R2_SECRET_ACCESS_KEY` | No | Cloudflare R2 secret key |
| `CF_R2_BUCKET` | No | R2 bucket name (default: `contractor-photos`) |

---

## Adding or Removing Engineers / Managers

Edit [lib/config.js](lib/config.js):
- `ENGINEERS` — list of staff names shown in the overtime sign-in form
- `MANAGERS` — list of managers shown in the overtime approval dropdown
- `ENGINEER_MANAGER_MAP` — which manager approves each engineer's overtime

After editing, commit and push via GitHub Desktop — Vercel redeploys automatically.

---

## Adding Companies to the Sign-In Dropdown

Edit [components/SignInForm.js](components/SignInForm.js) — find the `COMPANIES` array near the top and add/remove names. There is also an "Other" option that lets contractors type any company name.

---

## Frequently Asked Questions

**A contractor can't sign in — it says "already signed in today"**
They must sign out first using their 3-digit ID, or a manager can check the dashboard.

**What is the 3-digit ID?**
It is the number printed on the contractor's physical ID card. It identifies a person uniquely for that day. Range: 001–999.

**Can two people share an ID?**
No — only one active session per ID per day is allowed.

**Where are photos stored?**
If Cloudflare R2 is configured, photos are uploaded there and a link is stored in the database. If R2 is not configured, no photo is stored but sign-out still works.

**Where are compliance documents stored?**
In Supabase Storage (private bucket: `compliance-docs`). Files are accessible to managers via the Compliance tab.

**How do I change the dashboard PIN?**
Update `DASHBOARD_PIN` in Vercel → your project → Settings → Environment Variables, then redeploy.

**The app is deployed but shows a database error**
Check that you ran `supabase-schema.sql` in your Supabase SQL Editor and that all environment variables are set correctly in Vercel.
