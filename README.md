# Contractor Attendance App

A web application for Goodenough College Estates: contractors sign in/out without a login
(typically via a QR code at the site entrance), engineers log daily shifts and overtime, and
managers get a dashboard covering attendance, compliance, parking, and weekly planned works.

## Features

* No login for contractors or engineers — sign in/out from any phone or kiosk
* Engineer daily shifts (fixed 8h block) separate from overtime, with a calm "why did you leave
  early" prompt under 8h and automatic flagging + manager correction for a forgotten sign-out
* Manager dashboard behind a PIN, backed by a real server-side session (not just a client flag)
* Contractor compliance tracking (RAMS, induction, insurance) with document uploads
* Parking booking log and a weekly "Planned Works" log with a ready-to-email Excel export
* Built with React / Next.js, data in Supabase (Postgres + Storage)

## How It Works

1. A contractor scans a QR code (or opens the site URL) and signs in — no account needed
2. Engineers pick their name and sign in/out of a shift or start overtime
3. Everything is written straight to Supabase — there is no local file to keep in sync
4. Managers unlock `/dashboard` with a PIN, which also grants a signed session the API checks on
   every request — the PIN screen is a login, not just a UI convenience

## Tech Stack

* React / Next.js (Pages Router)
* Supabase (Postgres database + Storage for photos/documents)
* Cloudflare R2 (sign-in and overtime/shift photos)
* Vercel (hosting + a scheduled cron job)
* `exceljs` for the Planned Works Excel export (merged cells, fills, an embedded logo);
  `xlsx` for the simpler Monthly Summary export

## Project Structure

```
/pages            → Next.js pages: public sign-in/out (index.js) and the manager dashboard
/pages/api        → API routes — one file per endpoint
/components       → React components used by the pages above
/lib              → Supabase data layer (db.js), config, session auth, UK time helpers
/styles           → global CSS
/supabase-schema.sql → hand-maintained database schema (run manually in Supabase)
```

## Clone and Run the Project

```bash
git clone <this repo's URL>
cd Contractor_attendance-main
npm install
cp .env.local.example .env.local   # then fill in the values — see SETUP_GUIDE.md
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Full setup (Supabase, environment variables,
Vercel deployment, first-run seed data) is in [SETUP_GUIDE.md](SETUP_GUIDE.md); day-to-day usage
for engineers and managers is in [USER_GUIDE.md](USER_GUIDE.md).

## Requirements

* Node.js v18 or later
* npm
* Git
* A Supabase project and a Vercel account (see [SETUP_GUIDE.md](SETUP_GUIDE.md))

## Documentation

- [CLAUDE.md](CLAUDE.md) — orientation for anyone (human or AI) making code changes
- [SETUP_GUIDE.md](SETUP_GUIDE.md) — full environment setup, in order
- [USER_GUIDE.md](USER_GUIDE.md) — plain-English guide for engineers and managers
- [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md),
  [BUSINESS_RULES.md](BUSINESS_RULES.md) — how it's built and why
- [SECURITY_AND_DATA.md](SECURITY_AND_DATA.md) — auth model, personal data held, open questions
- [BACKLOG.md](BACKLOG.md) — known issues and ideas
- [MEMORY.md](MEMORY.md) — dated log of what's changed and why

## Status

Email alerts (overdue contractors) are currently **dormant** — no verified sending domain exists
yet, so the code is kept in place but unreferenced; an on-screen banner covers the same need in
the meantime. See [MEMORY.md](MEMORY.md) for the reasoning and how to revive it.
