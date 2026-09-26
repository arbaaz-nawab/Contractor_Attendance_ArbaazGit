# Decisions

"Chose X over Y because Z" records. Each tagged `[confirmed in code/comments]` (there's an
explicit comment or doc statement backing the reasoning) or `[inferred]` (reasoning inferred from
the code's shape and git history — no explicit statement found). Nothing here is invented; where
no reasoning trace exists at all, the item isn't listed.

## Supabase over local Excel file `[confirmed in code/comments]`

`lib/db.js` opens with: *"Supabase database layer. Drop-in replacement for lib/excel.js — same
function signatures."* The original architecture (still described in `README.md` and
`PROJECT_EXPLANATION.txt`) stored everything in a `.xlsx` file synced via OneDrive, written with
file-locking (`withLock()` in `lib/excel.js`) to avoid concurrent-write corruption. The current
app calls only `lib/db.js`. The mapper functions in `lib/db.js` (`contractorRowToObj`, etc.)
deliberately preserve the old `'Title Case'` key names from the Excel column headers so the rest
of the app (API routes, dashboard) didn't need to change when the storage layer was swapped —
[confirmed in code/comments] via the matching key names and the "same function signatures" claim.

## Single-approval, team-based overtime over dual-approval `[confirmed in code/comments]`

`pages/api/overtime-approve.js`'s header comment explicitly describes the current model as
replacing an older one: *"Legacy PARTIALLY APPROVED records (from the old dual-approval scheme)
can still be approved through to FULLY APPROVED."* The `engineer_overtime` schema still carries
`approved_by_dean`, `approved_by_laurel`, and their timestamp columns — a name-specific dual
sign-off model (two named approvers, "Dean" and "Laurel") that predates the current
team/line-manager model. The switch to team-based single approval is `[confirmed in code/comments]`;
the specific business reason for abandoning dual-approval is `[inferred]` (plausibly: faster
turnaround, fewer people blocked waiting on two signatures) — no comment states the "why", only
the "what changed".

## Photos on Cloudflare R2, documents on Supabase Storage `[inferred]`

Sign-in/out and overtime photos go to R2; compliance documents (RAMS/induction/insurance PDFs) go
to Supabase Storage. No comment explains why two different storage backends are used for what are
both "file uploads." `[inferred]`: R2 was likely wired up first (its helper `lib/r2Upload.js`
predates the compliance-document feature going by its simpler, single-purpose API), and
Supabase Storage was added later for compliance docs because it was already available alongside
the Supabase database migration and needed listing/delete/signed-URL features that R2's minimal
helper doesn't provide (`compliance-files.js` lists and deletes; `r2Upload.js` only uploads).

## Sign-in never blocked by expired compliance `[confirmed in code/comments]`

`SignInForm.js`'s H&S section shows a "Compliance Outstanding" warning banner but does not
prevent submission for expired RAMS/induction/insurance, and the recent commit history
(`9df6d01 Reword RAMS and compliance warnings so contractors know they can sign in`) confirms this
was a deliberate, revisited choice — contractors are explicitly told they *can* sign in with
outstanding RAMS, with the paperwork flagged for the Estates team to chase afterward rather than
gatekeeping site access at the kiosk. The one exception that *is* a hard block is the asbestos
register check (`asbestosChecked === 'No'` fails validation) — `[confirmed in code/comments]` via
the on-screen copy: *"You must check the asbestos register before proceeding on site."*

## Dashboard does not auto-lock on tab switch/hide `[confirmed in code/comments]`

Explicit comment in `pages/dashboard.js`: *"the dashboard deliberately does NOT auto-lock when the
tab is hidden. Managers switch tabs constantly while working, and being thrown back to the PIN
gate every time made the dashboard unusable."* Confirmed by git history:
`74376a1 Keep dashboard unlocked across tab switches and reloads` and
`37b4704 Remove auto-lock on tab switch` — an auto-lock behavior existed previously and was
deliberately removed for usability. This is a security/usability trade-off made consciously, not
an oversight — worth knowing before "fixing" it as a bug.

## Universal `APPROVAL_PIN` fallback `[inferred]`

`getManagerPin()`'s three-tier fallback (Supabase row → `MANAGER_PINS` env → `APPROVAL_PIN` env)
has no comment explaining the third tier's purpose. `[inferred]` from the shape of the code and
`SETUP_GUIDE.md` marking it optional: likely a deployment convenience so the app is usable
immediately after setup (before anyone has populated the `managers` table or per-manager PINs),
or a break-glass fallback for a manager whose row is missing a PIN. The security trade-off this
creates (any manager name + the universal PIN can act as that manager) is not discussed anywhere
in code or docs — see [BACKLOG.md](BACKLOG.md) B19.

## Legacy manager/contact lists kept alongside the Supabase `managers` table `[inferred]`

`lib/config.js` `MANAGERS` and `SignInForm.js` `CONTACTS` both hardcode name lists that overlap
with, but are separately maintained from, the Supabase `managers` table (which is fetched live by
the dashboard via `/api/managers` and is described in `USER_GUIDE.md` as the actual source of
truth for adding managers "no code change or redeploy needed"). `[inferred]`: the hardcoded lists
exist as fallback defaults (`MANAGERS` is used as the initial React state before the live fetch
resolves, and as the "point of contact" list which isn't a managers-table concept at all) rather
than a deliberate second source of truth — but no comment confirms this, and the resulting drift
risk is real (see [BACKLOG.md](BACKLOG.md) B9).
