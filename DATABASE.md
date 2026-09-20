# Database

Supabase Postgres. Schema lives in [supabase-schema.sql](supabase-schema.sql) — run manually in
the Supabase SQL Editor; there is no migration tool. Every column is `TEXT` (dates and datetimes
included) except `id` (`BIGSERIAL`) and `created_at` (`TIMESTAMPTZ`) — the app does all date
parsing/formatting in JS, not SQL. RLS is disabled on every table (see
[SECURITY_AND_DATA.md](SECURITY_AND_DATA.md)).

All access goes through [lib/db.js](lib/db.js), which wraps each table with a row-object mapper
translating `snake_case` DB columns to the legacy `'Title Case'` keys the app's business logic
still uses (a holdover from the original Excel-column-name data model — see
[DECISIONS.md](DECISIONS.md)).

## Tables

### `contractor_log`
One row per sign-in (a sign-out updates the same row).

| Column | App key (via mapper) | Notes |
|---|---|---|
| `id` | `_row` | PK, referenced as `rowId` in amend/force-sign-out requests |
| `date` | `Date` | `YYYY-MM-DD`, UK date at sign-in time |
| `company_name` | `Company Name` | |
| `operative_name` | `Operative Name` | |
| `id_number` | `ID Number` | 3-digit string, validated `^\d{3}$` server-side in `signin.js` |
| `buildings` | `Buildings` | comma-joined list of checked buildings |
| `point_of_contact` | `Point of Contact` | |
| `contact_number` | `Contact Number` | |
| `rams_submitted` | `RAMS Submitted` | legacy field, always written `''` by current `signin.js` (superseded by `rams_approved`) |
| `declaration_confirmed` | `Declaration Confirmed` | always `'Yes'` — form blocks submit otherwise |
| `sign_in_time` | `Sign-In Time` | `YYYY-MM-DD HH:mm:ss` UK wall-clock |
| `sign_out_time` | `Sign-Out Time` | same format, empty until sign-out |
| `work_completed` | `Work Completed` | |
| `status` | `Status` | `'Active'` \| `'Completed'` |
| `photo_url` | `Photo URL` | R2 presigned URL, **expires after 7 days** ([BACKLOG.md](BACKLOG.md) B3) |
| `contractor_type` | `Contractor Type` | `'FIRST_TIME'` \| `'RETURNING'`, set from `contractor-lookup` result at sign-in time |
| `permit_required` | `Permit Required` | `'Yes'`/`'No'` |
| `permit_types` | `Permit Types` | comma-joined |
| `fire_safety_affected` | `Fire Safety Affected` | free text, may embed sub-answers e.g. `"Yes (Alarm isolation: ..., Fire watch: ...)"` |
| `asbestos_checked` | `Asbestos Checked` | `'Yes'`/`'No'`/`'Not Applicable'` |
| `rams_approved` | `RAMS Approved` | `'Yes'`/`'No'`/`'Not Applicable'` |
| `induction_complete` | `Induction Complete` | |
| `insurance_valid` | `Insurance Valid` | |
| `last_rams_review_date` | `Last RAMS Review Date` | set to today if `rams_approved === 'Yes'` at this sign-in |
| `last_induction_date` | `Last Induction Date` | set to today if `induction_complete === 'Yes'` |
| `last_compliance_date` | `Last Compliance Date` | set to today if `insurance_valid === 'Yes'` |
| `amended_by` | `Amended By` | manager name, set by amend/force-sign-out only |
| `amended_at` | `Amended At` | |
| `created_at` | — | DB-managed, not mapped/used by the app |

### `engineer_overtime`
One row per overtime session.

| Column | App key | Notes |
|---|---|---|
| `id` | `_row` | PK |
| `engineer_name` | `Engineer Name` | must match a name in `lib/config.js` `ENGINEERS` for the UI dropdown, but not DB-enforced |
| `start_timestamp` / `end_timestamp` | `Start Timestamp` / `End Timestamp` | UK wall-clock text |
| `work_description` | `Work Description` | required at sign-out |
| `image_path` | `Image Path` | R2 presigned URL, same 7-day expiry issue as `photo_url` |
| `status` | `Status` | `'ACTIVE'` \| `'COMPLETED'` |
| `approval_status` | `Approval Status` | `''` \| `'PENDING'` \| `'PARTIALLY APPROVED'` (legacy) \| `'FULLY APPROVED'` \| `'REJECTED'` |
| `approved_by` | `Approved By` | manager name, suffixed `" (Override)"` when approved via `OVERRIDE_APPROVER` outside their own team |
| `approval_timestamp` | `Approval Timestamp` | |
| `notes` | `Notes` | optional, set at sign-in |
| `adjusted_duration` | `Adjusted Duration` | manager-editable override of the computed `Xh Ym` duration, e.g. for rounding |
| `approved_by_dean` / `approved_by_laurel` | `Approved By Dean` / `Approved By Laurel` | **legacy dual-approval columns**, added by an earlier migration; current single-approval logic (`overtime-approve.js`) never writes them — dead columns kept for old record compatibility |
| `dean_approval_timestamp` / `laurel_approval_timestamp` | ditto | same — legacy, unused by current code |

### `managers`
Source of truth for manager identity, PIN, and email.

| Column | App key | Notes |
|---|---|---|
| `id` | `_row` | |
| `manager_name` | `Manager Name` | must match names used in `lib/config.js` `TEAMS`/`OVERRIDE_APPROVER` for approvals to resolve correctly — no FK, just string equality (case-insensitive, trimmed) in `getManagerPin`/`canApprove` |
| `manager_pin` | `Manager Pin` | **plaintext** |
| `email` | `Email` | added by migration; empty string default; used for overdue alerts only |

### `contractor_compliance`
One row per company (`company_name UNIQUE`) — manager-entered compliance dates, separate from
the per-visit answers stored in `contractor_log`.

| Column | App key | Notes |
|---|---|---|
| `id` | `_row` | |
| `company_name` | `Company Name` | UNIQUE constraint — upsert target |
| `rams_date` / `induction_date` / `insurance_date` | matching `... Date` keys | manager-entered "last confirmed" dates |
| `rams_expiry` | `RAMS Expiry` | computed as `rams_date + 6 months` at write time in `compliance-update.js`, not recalculated later |
| `induction_expiry` / `insurance_expiry` | ditto | `+ 12 months` |
| `document_path` | `Document Path` | Storage folder prefix (the sanitized company name), not a specific file |
| `updated_by` / `updated_at` | | free-text manager name (no PIN check on this endpoint — [BACKLOG.md](BACKLOG.md) B13) |

### `operative_induction`
One row per **person** (not per company) — induction tracking independent of which company they
currently work for.

| Column | Notes |
|---|---|
| `id` | PK |
| `operative_name` | `NOT NULL`; unique index is on `lower(trim(operative_name))`, **not** the raw column — see B4 |
| `company_name` | most recent company this person signed in under |
| `induction_date` / `induction_expiry` | expiry = date + 12 months, computed in `signin.js` `addMonths()` |
| `updated_at` | |

Unlike the other tables, this one is read/written directly (no `_row`/mapper wrapper) — `db.js`
functions return/accept raw `snake_case` fields for this table.

### `weekly_rota`
One row per engineer per week (added by a later migration, appended at the bottom of
`supabase-schema.sql` rather than in the main `CREATE TABLE` block — the file is effectively two
generations of schema concatenated together).

| Column | Notes |
|---|---|
| `id` | PK |
| `week_start_date` / `week_end_date` | `YYYY-MM-DD`, `NOT NULL` |
| `engineer_name` | `NOT NULL` |
| `assigned_by` / `assigned_at` | set by `setRotaWeek()` |
| `confirmed_by` / `confirmed_at` | set by `confirmRotaWeek()` — separate step, not required for assignment to take effect |

`setRotaWeek()` replaces a week's assignments by **deleting all rows for that
`week_start_date` and re-inserting** ([lib/db.js:467-485](lib/db.js#L467-L485)) — not a diff/patch,
so `confirmed_by`/`confirmed_at` are lost if a week is re-edited after being confirmed.

## Storage

`compliance-docs` bucket (private, `public: false`). One `ALL`-action policy
(`"allow all compliance-docs"`) grants full read/write/delete to any caller using the anon key —
RLS is not actually restrictive here despite the bucket being marked private (see
[SECURITY_AND_DATA.md](SECURITY_AND_DATA.md)). Files live at `{safeCompanyName}/{timestamp}_{originalFilename}`.

## Function map (`lib/db.js`)

| Function | Table(s) |
|---|---|
| `getAllRows`, `appendRow`, `updateRow`, `deleteContractorRow`, `findActiveSession`, `getRowsByDate`, `findCompanyHistory`, `getOperativeNameSuggestions` | `contractor_log` |
| `getOperativeInduction`, `upsertOperativeInduction` | `operative_induction` |
| `getAllOvertimeRows`, `appendOvertimeRow`, `updateOvertimeRow`, `deleteOvertimeRow`, `findActiveOvertimeSession` | `engineer_overtime` |
| `getManagers`, `getManagerEmails`, `getManagerPin` | `managers` (+ `MANAGER_PINS`/`APPROVAL_PIN` env fallback) |
| `getAllComplianceRows`, `getComplianceForCompany`, `upsertComplianceRow`, `deleteComplianceRow` | `contractor_compliance` |
| `getRotaEntries`, `setRotaWeek`, `confirmRotaWeek` | `weekly_rota` |

## Known schema issues

- **B4** — `operative_induction` upsert conflict target mismatch (unique index is functional,
  upsert targets the raw column). Unverified whether this is currently erroring or silently
  duplicating in production — flagged, not fixed, per task constraints.
- No row-count limiting anywhere (**B5**) — every "get all" function will start truncating at
  Supabase's default 1000-row cap as tables grow.
- Legacy dual-approval columns (`approved_by_dean`, `approved_by_laurel`, and their timestamps)
  remain in `engineer_overtime` but are dead — current approval logic is single-approval only.
  `approval_status` still has a `'PARTIALLY APPROVED'` value in the app's vocabulary for backward
  compatibility with old rows created under the dual scheme.
- `supabase-schema.sql` is not idempotent as a single mental model — it's a `CREATE TABLE`
  section followed by an appended `-- MIGRATION` section with `ADD COLUMN IF NOT EXISTS` guards.
  Safe to re-run, but there's no version/changelog tracking which statements have already been
  applied to which environment.

## Migrations log

Everything below `-- MIGRATION` in [supabase-schema.sql](supabase-schema.sql) (lines 109–145),
in file order — this is the only migration history that exists (no separate migrations
directory):

1. `contractor_log.amended_by`, `amended_at` — amend/force-sign-out tracking.
2. `engineer_overtime.approved_by_dean`, `approved_by_laurel`, `dean_approval_timestamp`,
   `laurel_approval_timestamp` — legacy dual-approval scheme (now unused, see above).
3. `operative_induction` table creation (guarded, so safe alongside the main block).
4. `managers.email` — added for overdue-alert recipients, default `''`.
5. `weekly_rota` table creation, RLS disabled, permissive policy, plus `confirmed_by`/
   `confirmed_at` columns added after initial creation (visible as trailing `ADD COLUMN IF NOT
   EXISTS` lines even inside the same migration block).
