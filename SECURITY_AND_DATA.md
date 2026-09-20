# Security and Data

Reflects the app as built through the 2026-09-20 sessions (server-side dashboard sessions,
Attendance/Parking/Planned Works tabs, dormant email). See [MEMORY.md](MEMORY.md) for how each
piece got here.

## Auth model, in one paragraph

The dashboard PIN screen (`DASHBOARD_PIN`) is a real login: on success it issues a signed,
httpOnly session cookie (`lib/session.js`, HMAC-SHA256 via `node:crypto`, 24h hard ceiling), and
every dashboard-only API route is wrapped in `requireSession()`, which 401s before running if
that cookie is missing/invalid/expired. This closed the previous gap (BACKLOG B2) where the PIN
was only a client-side `sessionStorage` flag and every API route answered anyone. On top of the
session, several *write* routes additionally check an individual manager's own PIN
(`getManagerPin()`) as defence in depth — but not all of them; see the table below.

## API route auth table

| Route | Session (`requireSession`) | Manager PIN too? | Returns personal data | Notes |
|---|---|---|---|---|
| `signin` / `signout` | — (public by design) | — | Y | contractor kiosk flow |
| `active-check` | — (public) | — | Y (name, company, sign-in time) | |
| `contractor-lookup` / `operative-lookup` | — (public) | — | Y (operative names, induction dates) | |
| `overtime-signin` / `overtime-signout` | — (public) | — | Y | engineer self-service |
| `shift-signin` / `shift-signout` / `shift-status` | — (public) | — | Y (shift times, early-leave reason/note) | `shift-status` only ever returns the querying engineer's own record |
| `overtime-list` | Conditional | — | Y | narrow `engineer`+`status=ACTIVE` query stays public with 4 minimal fields; any other query requires a session |
| `check-pin` | — (issues the session) | — | N | fails closed (503) if `SESSION_SECRET` unset |
| `logout` | — (clears the cookie; harmless to call unauthenticated) | — | N | |
| `dashboard` | **Y** | — | Y (names, phone numbers) | |
| `managers` | **Y** | — | Y (manager names) | |
| `compliance-list` / `compliance-files` GET | **Y** | — | N / filenames only | |
| `compliance-files` DELETE | **Y** | — | N | deletes a document — session only, no manager PIN |
| `compliance-serve` | **Y** | — | Y (document contents via redirect) | |
| `compliance-update` | **Y** | **No** | N | still B13 — `Updated By` is free text, unverified against any PIN |
| `compliance-delete` | **Y** | Y | N | |
| `amend-contractor` / `amend-overtime` | **Y** | Y | Y | |
| `overtime-approve` | **Y** | Y (+ team check) | Y | |
| `rota` GET | **Y** | — | Y | |
| `rota` POST / `rota-confirm` | **Y** | Y | — | |
| `shift-list` | **Y** | — | Y (shift times, early-leave reason/note, correction notes) | |
| `shift-correct` | **Y** | Y | Y | |
| `parking-list` / `parking-save` / `parking-staff` | **Y** | **No** (by design) | Y (requester/company names, vehicle registrations) | any signed-in manager can add/edit/review any booking or staff name |
| `planned-works` / `planned-works-save` / `planned-works-search` / `planned-works-export` | **Y** | **No** (by design) | Y (names, **on-call phone numbers**) | any of the four Planned Works managers can add/edit any row or the on-call block |
| `trigger-notify` | **Y** | — | Y (triggers an email listing names/companies) | dormant — no longer called from the UI, but still callable and still gated |
| `notify-overdue` | — (CRON_SECRET, **skipped if env var unset**) | — | Y (sent via email) | dormant — no longer scheduled by `vercel.json`, route itself unchanged |
| `flag-missing-shifts` | — (CRON_SECRET, **skipped if env var unset**) | — | N | active — scheduled twice daily |

**Net effect**: every dashboard route now requires a session (the B2 gap is closed). Within that,
most *write* routes for contractor/overtime/compliance/rota data add a personal manager PIN as a
second factor — except `compliance-update` (a pre-existing, still-open gap, B13) and the entire
Parking and Planned Works feature areas (a **deliberate** design choice for those two — the task
that built them explicitly said not to add per-manager PINs there, reasoning that the shared
dashboard PIN was sufficient since there's one shared login for all managers anyway). Whether that
reasoning should also extend to routes touching phone numbers and vehicle registrations is listed
under "Decisions needed" below, not assumed.

## PIN handling

- **Dashboard PIN**: single shared secret. Correct entry issues the session cookie described
  above — this is now the real access-control boundary, not the PIN check itself.
- **Manager PINs**: unchanged from before — `getManagerPin()` resolves, in order, the Supabase
  `managers.manager_pin` (plaintext), then `MANAGER_PINS` env var, then `APPROVAL_PIN` as a
  universal fallback usable for **any** manager name not otherwise configured. Plain string
  equality, no hashing, no timing-safe comparison, no attempt limiting anywhere.
- Session cookie comparison (`hasValidSession`) *does* use `crypto.timingSafeEqual` for the
  signature check — a narrower, more deliberate guarantee than the manager-PIN comparisons above.

## RLS / keys

Unchanged: Row Level Security is disabled on every table, the app uses the anon key everywhere
(no service-role key), and the `compliance-docs` Storage bucket's one policy allows any operation
regardless of caller. All access control is inside the Next.js API route handlers (the session +
PIN checks above), not the database. This now includes the newer tables (`shift_log`,
`parking_*`, `planned_works*`) — same convention, same caveat.

## Personal data inventory

| Data | Where stored | Who can read it |
|---|---|---|
| Contractor names, phone numbers, employer | `contractor_log` | any dashboard session |
| Contractor / overtime / shift photos | R2 bucket, URL in the relevant table | any dashboard session (via the URL stored in gated data); URL itself expires after 7 days |
| Engineer shift times, **early-leave reason and note** (free text — may include health-related wording, e.g. "Unwell") | `shift_log` | any dashboard session, via the Attendance tab |
| Engineer overtime notes/work descriptions | `engineer_overtime` | any dashboard session |
| Manager names, PINs (plaintext), emails | `managers` | names/emails: any dashboard session. PINs: never returned by any API response |
| Compliance documents (RAMS/insurance/induction) | Supabase Storage `compliance-docs` | any dashboard session |
| Operative induction history | `operative_induction` | public (`operative-lookup`, including a name-autocomplete that surfaces other people's names — unchanged, still open) |
| Parking requester/company names, **vehicle registrations** | `parking_bookings`, `parking_history` | any dashboard session |
| Estates staff names (Parking tab) | `parking_staff` | any dashboard session |
| Planned Works row detail (company, description, person in charge, comments) | `planned_works` | any dashboard session |
| **On-call staff phone numbers** | `planned_works_oncall` | any dashboard session — deliberately never written to a server console log (checked directly: every `console.error` in the planned-works routes logs `err.message` only, never the request body) |

## Retention / GDPR gaps — unchanged in kind, now broader in scope

No retention/expiry job exists for any table. This previously applied to `contractor_log`,
`engineer_overtime`, `operative_induction`; it now also applies to `shift_log` (including
early-leave text), `parking_bookings`/`parking_history`, and `planned_works`/
`planned_works_oncall` (including phone numbers). Manual delete/soft-delete exists per row on
several of these (session- and sometimes PIN-gated), but there is no bulk or automatic policy, and
no data-subject access/export tooling beyond ad-hoc exports and querying Supabase directly.

## Audit-trail gaps — unchanged in kind

`Amended By`/`Approved By`/`last_edited_by`/`changed_by` fields across every table are
caller-supplied free text validated only by whichever check gates that route — a session alone
for Parking/Planned Works, a session **and** the universal `APPROVAL_PIN` fallback for several
others — so none of these fields are cryptographically tied to a real identity. No read-access
audit log exists anywhere (who viewed a record, downloaded a document) — only some writes leave a
trace.

## Decisions needed

Not code gaps to silently fix — genuine policy questions this document can't answer on its own.
Recorded here so they don't get lost, and so a future session doesn't invent an answer either.

1. **Retention periods** — how long should each of these be kept: contractor sign-in/out records
   (incl. photos), engineer overtime records (incl. photos), engineer shift records (incl.
   early-leave reason/note text), parking bookings/history, planned works rows, operative
   induction history, compliance documents, on-call phone numbers? No answer is assumed here.
2. **Who may see early-leave reasons** — currently any manager with a dashboard session can see
   any engineer's early-leave reason and note (which may include health-related text like
   "Unwell") via the Attendance tab. Should this be restricted to a line manager, or is
   "any dashboard user" the intended policy for this team's size?
3. **`compliance-update` trusting a typed manager name** (B13, still open) — no PIN check at all
   on this route, unlike its sibling `compliance-delete`. Worth a deliberate decision (fix it to
   match the sibling, or confirm the current looser behaviour is intentional) rather than leaving
   it as an oversight.
4. **No per-manager PIN on Parking/Planned Works writes** — built this way deliberately (see the
   route table above), but now that phone numbers and vehicle registrations are involved, worth
   revisiting whether the original reasoning (one shared dashboard login is enough) should still
   hold, or whether these two areas should gain the same second-factor PIN check most other write
   routes already have.
5. **Remaining pre-existing gaps, still open, not touched by any of the sessions that added
   sessions/Attendance/Parking/Planned Works**: `APPROVAL_PIN` universal fallback (BACKLOG B19),
   plaintext manager PINs with no rate limiting (B10), `operative-lookup`'s public
   name-autocomplete (part of B2's original scope, deliberately left public since it's used by
   the public contractor sign-in form), `compliance-files` DELETE has a session but no manager
   PIN (unlike `compliance-delete`). See [BACKLOG.md](BACKLOG.md) for the full history of what's
   been fixed versus what remains.
