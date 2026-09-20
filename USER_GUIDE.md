# Goodenough College — Contractor Attendance App
## User Guide

Plain-English guide, grouped by who's using it. Technical setup is in
[SETUP_GUIDE.md](SETUP_GUIDE.md).

---

## For Engineers

### Signing in to a shift

1. Open the app, tap **Goodenough College Staff**.
2. Pick your name the first time — your phone remembers it after that (tap **Not you?** to change
   it).
3. Tap the big **Shift** button. That's it — you're signed in.

A shift is a fixed 8-hour block. You don't need to watch a clock or a running timer — the app
deliberately doesn't show you one.

### Signing out

1. Open the app on the same phone — it already knows you're mid-shift and shows **Sign Out**
   instead of **Shift**.
2. Tap it.

**If it's been 8 hours or more**, you're signed out immediately, no questions asked.

**If it's under 8 hours**, you'll see one screen: *"Where did today's time go?"* with a few
one-tap options — job finished / no more work today, off-site task or training, agreed with your
manager, an appointment, unwell, or other (with a short optional note). Pick one and confirm.
There's no lecture and nothing red on this screen — it's just recorded so your manager has
context later, not a warning.

### If you forget to sign out

If a shift is left open (you forgot, or something came up), the system automatically flags it as
needing attention at 17:00 UK time that day. You won't be able to sign yourself out of that shift
after that point — a manager closes it for you from the dashboard (Attendance tab → Live), and
your hours for that day are set correctly by them, with a short note on what happened. You don't
need to do anything except let a manager know if it wasn't obvious why.

### Overtime

Overtime is separate from a shift and the two can't overlap — if you try to start overtime while
a shift is still open (or vice versa), you'll get a message asking you to sign out of the other
one first. From the same two-button screen, tap **Overtime** instead of **Shift**: pick your name,
start a session, and later end it with a short description of the work and an optional photo.
It then goes to your line manager for approval — you'll just see it as pending until they act on
it.

---

## For Contractors

1. Open the app (usually by scanning the QR code at the entrance) and tap **Contractor**.
2. **To sign in**: pick your company (or type it under "Other"), fill in your name, contact
   number, and the 3-digit ID from your contractor card, select the building(s) you're working
   in and your point of contact, answer the Health & Safety questions shown (these adjust based
   on whether your company/you already have valid paperwork on file), tick the declaration, and
   submit. Outstanding paperwork (RAMS, induction, insurance) never blocks you from signing in —
   it's just flagged for the Estates team to chase up.
3. **To sign out**: enter your 3-digit ID, describe the work completed, optionally add a photo,
   and confirm.

If you're still signed in from before midnight, tell a manager — they can close your session for
you from the dashboard.

---

## For Managers / Admin

Go to `/dashboard` (a small link at the bottom of the main page) and enter the dashboard PIN.
This does more than unlock the screen — it creates a real, signed login for your browser that
every dashboard action checks, not just something remembered locally. It lasts until you press
**Lock**, close the tab, or 24 hours pass, whichever comes first.

### Contractors tab

Who's on site now and who's signed out, filterable by date range and company. **If anyone is
still signed in after 18:00**, a calm amber banner appears at the top listing them (name, company,
building, sign-in time) with a **Force Sign-Out** button right there — you don't need to hunt
through the table. (There used to be an automatic overdue email; it never actually delivered
because no sending domain was ever verified, so it's been replaced by this banner — see
[MEMORY.md](MEMORY.md) if you're curious why.)

### Attendance tab (engineer shifts)

Three views:
- **Live** — anyone currently signed into a shift, plus anything flagged **Missing sign-out** at
  the top with a **Correct** button.
- **Week** — a small filled bar per engineer per day, showing roughly how much of the 8-hour
  block they logged that day, for the whole team at a glance.
- **Month** — a calendar-style heat map per engineer, so a whole month is scannable in a couple
  of seconds.

**To correct a missing sign-out**: tap **Correct** on the flagged row (Live view, or from a
capsule/cell in Week or Month view), set the actual sign-out time, add a short note explaining
what happened, and confirm with your name. The record then shows as complete with your note
attached.

### Compliance tab

RAMS, induction, and insurance dates per contractor company: RAMS expires after 6 months,
induction and insurance after 12. Upload, view, or delete supporting documents per company.

### Parking tab

A standalone log of parking booked for visiting contractors — separate from the contractor
sign-in system on purpose, since not every booking corresponds to a sign-in and vice versa.

- **New Booking**: requester, project code, company, date, duration, vehicle registration, and
  who's entering it — pick from the "Estates staff" list (**Manage Staff** button adds/removes
  names; removing someone doesn't affect their past bookings).
- Each booking moves through **Requested → Booked → Completed**, or can be **Cancelled** at any
  point — nothing is ever hard-deleted, so the record stays traceable.
- Tap a booking to see its full history (who requested it, who booked it, every edit) and to
  edit or change its status.
- **Download Excel** exports whatever's currently filtered/searched.

### Planned Works tab — the weekly rhythm

This mirrors the paper/Excel sheet the Estates team already used, but everyone fills it in
together during the week instead of one person compiling it at the end.

1. **Through the week (roughly Wednesday to Friday)**, any of the four Planned Works managers
   (Arbaaz Nawab, Chris Vasta, Margarita Miller, Sarfraz Arfan) adds rows for the coming week as
   work gets confirmed — company, description, building, date, who's in charge, and so on. Pick
   your name once at the top ("Entered by") and it's remembered on that browser.
2. Opening a new week shows a **Review Last Week** panel at the top listing anything from the
   previous week that was never marked done. For each, tap **Completed** or **Carry Over** (which
   copies it into this week with the date cleared, ready to be given a new date) — nothing is
   silently dropped or auto-copied without you choosing.
3. A calm tracker shows how many rows each of the four managers has added this week — no
   red, no "you haven't done anything," just a neutral count.
4. **On Fridays**, Umayma Chakour downloads the week's Excel file (**Download Excel (Week NN)**
   button — anyone can click it, it's just labelled as her action) and emails it on herself; this
   app does not send the email automatically.
5. Use the search box to find anything from a past week by company, description, building, person
   in charge, comments, or the parking note — it jumps you straight to that week.

The on-call block (Estate Duty Manager / Call-out engineers) is typed in directly each week — it
is **not** pulled from the separate Weekly Rota tab, since the two serve different purposes.

### Overtime — Approvals

Each engineer has one line manager who approves their overtime (Sarfraz Arfan can additionally
approve anyone, as a senior override — useful when the usual approver is away). Pick your name at
the top of the Approvals tab to see only your own team's pending requests; approve or reject with
your personal PIN. One approval is enough.

### Weekly Rota

Assign engineers to duty per week; separate from — and not shown on — the Planned Works on-call
block.

### Amending and deleting records

Most dashboard write actions (amend/delete a contractor record, amend/delete overtime, delete a
compliance record, approve overtime, confirm the rota) ask for your personal manager PIN as a
second check, on top of already being logged in. A few (Parking, Planned Works) rely on the
dashboard login alone — see [SECURITY_AND_DATA.md](SECURITY_AND_DATA.md) if you want the exact
list.

---

## Managing lists (requires a code change + redeploy, except where noted)

| List | Where | Editable from the dashboard? |
|---|---|---|
| Manager names, PINs, emails | Supabase `managers` table | Yes — Table Editor, no redeploy |
| Parking "Estates staff" | `parking_staff` table | **Yes** — Parking tab → Manage Staff |
| Planned Works managers / admin | `lib/config.js` | No — code change required |
| Engineers (shift/overtime) | `lib/config.js` `ENGINEERS` | No — code change required |
| Overtime teams (who approves whom) | `lib/config.js` `TEAMS` | No — code change required |
| Contractor company dropdown | `components/SignInForm.js` `COMPANIES` | No — code change required (an "Other" free-text option always exists) |

---

## Frequently Asked Questions

**A contractor can't sign in — "already signed in today"**
They (or a manager, via Force Sign-Out) need to sign out first.

**What is the 3-digit contractor ID?**
The number on their physical ID card, unique for that day only (001–999) — not a permanent
identity.

**An engineer's shift shows "Missing sign-out" and they can't sign out themselves**
Expected once flagged (17:00 UK cutoff) — a manager corrects it from the Attendance tab.

**Why didn't the overdue email arrive?**
It's currently switched off — see the Contractors tab banner instead. Not a fault to chase.

**Where are photos stored?**
Cloudflare R2, if configured; otherwise sign-out/shift-out still works, just without a photo.

**Where are compliance documents stored?**
Supabase Storage (private bucket), accessible via the Compliance tab → Files.

**How do I change the dashboard PIN or a manager's personal PIN?**
Dashboard PIN: `DASHBOARD_PIN` in Vercel env vars, then redeploy. Manager PIN: edit
`manager_pin` directly in the Supabase `managers` table — takes effect immediately, no redeploy.

**How do I add/remove a Planned Works manager?**
Edit `PLANNED_WORKS_MANAGERS` in `lib/config.js` and redeploy — there's no in-app control for
this one (unlike the Parking staff list, which is editable live).
