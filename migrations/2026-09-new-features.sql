-- ============================================================
-- Goodenough College — Contractor Attendance App
-- New-feature migration: operative_induction, shift_log, Parking,
-- Planned Works, and one storage-policy idempotency fix.
--
-- Paste-ready for the Supabase SQL Editor on the PRODUCTION project.
-- Idempotent — safe to run more than once. Contains ONLY additive
-- statements (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS / DISABLE ROW LEVEL SECURITY, which is a
-- no-op if already disabled) plus DROP POLICY IF EXISTS immediately
-- paired with an identical CREATE POLICY. Nothing here touches rows
-- in, or drops, any existing table (contractor_log, managers,
-- engineer_overtime, contractor_compliance, weekly_rota).
--
-- Extracted from supabase-schema.sql (the full, hand-maintained
-- schema file in the repo) — run that file's contents for a fresh
-- project instead of this one; this file is only for bringing an
-- existing production project up to date with the features added
-- since it was last migrated.
-- ============================================================

-- ── operative_induction (per-person induction tracking) ──────────────────
-- Confirmed missing on production as of 2026-09-20 (checked directly via
-- the REST API), so included here with CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS operative_induction (
  id               BIGSERIAL PRIMARY KEY,
  operative_name   TEXT NOT NULL,
  company_name     TEXT,
  induction_date   TEXT,
  induction_expiry TEXT,
  updated_at       TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS operative_induction_name_idx
  ON operative_induction (lower(trim(operative_name)));
ALTER TABLE operative_induction DISABLE ROW LEVEL SECURITY;

-- ── shift_log (daily engineer shift sign-in/out, separate from overtime) ──
CREATE TABLE IF NOT EXISTS shift_log (
  id               BIGSERIAL PRIMARY KEY,
  engineer_name    TEXT NOT NULL,
  shift_date       TEXT NOT NULL,
  sign_in_time     TEXT,
  sign_out_time    TEXT,
  hours            TEXT,
  status           TEXT NOT NULL DEFAULT 'OPEN',
  early_reason     TEXT,
  early_note       TEXT,
  device_id        TEXT,
  corrected_by     TEXT,
  corrected_at     TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE shift_log DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_shift_log" ON shift_log;
CREATE POLICY "allow_all_shift_log" ON shift_log FOR ALL USING (true) WITH CHECK (true);

-- Only one OPEN shift per engineer at a time.
CREATE UNIQUE INDEX IF NOT EXISTS shift_log_one_open_per_engineer_idx
  ON shift_log (engineer_name) WHERE status = 'OPEN';

-- Manager's note when correcting a MISSING_SIGNOUT (or forgotten OPEN) shift.
ALTER TABLE shift_log ADD COLUMN IF NOT EXISTS correction_note TEXT;

-- ── Parking tab (Estates log of parking booked for external contractors) ──
CREATE TABLE IF NOT EXISTS parking_bookings (
  id             BIGSERIAL PRIMARY KEY,
  requester      TEXT NOT NULL,
  project_code   TEXT NOT NULL,
  company        TEXT NOT NULL,
  booking_date   TEXT NOT NULL,
  duration_type  TEXT NOT NULL,
  vehicle_reg    TEXT NOT NULL,
  booked_by      TEXT NOT NULL,
  requested_at   TEXT,
  booked_at      TEXT,
  status         TEXT NOT NULL DEFAULT 'Requested',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE parking_bookings DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_parking_bookings" ON parking_bookings;
CREATE POLICY "allow_all_parking_bookings" ON parking_bookings FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS parking_staff (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS parking_staff_name_idx ON parking_staff (lower(trim(name)));
ALTER TABLE parking_staff DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_parking_staff" ON parking_staff;
CREATE POLICY "allow_all_parking_staff" ON parking_staff FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS parking_history (
  id          BIGSERIAL PRIMARY KEY,
  booking_id  BIGINT NOT NULL,
  changed_by  TEXT NOT NULL,
  changed_at  TEXT NOT NULL,
  change_type TEXT NOT NULL,
  changes     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE parking_history DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_parking_history" ON parking_history;
CREATE POLICY "allow_all_parking_history" ON parking_history FOR ALL USING (true) WITH CHECK (true);

-- ── Planned Works (Estates weekly planned-works sheet) ────────────────────
CREATE TABLE IF NOT EXISTS planned_works (
  id                   BIGSERIAL PRIMARY KEY,
  week_start           TEXT NOT NULL,
  company_name         TEXT NOT NULL,
  description          TEXT NOT NULL,
  building_name        TEXT,
  start_date           TEXT,
  end_date             TEXT,
  location             TEXT,
  person_in_charge     TEXT,
  rams_signed_off      TEXT,
  events_team_notified TEXT,
  parking_required     TEXT,
  comments             TEXT,
  added_by             TEXT NOT NULL,
  created_at           TEXT,
  last_edited_by       TEXT,
  last_edited_at       TEXT,
  review_status        TEXT NOT NULL DEFAULT '',
  carried_from_id      BIGINT,
  deleted_at           TEXT
);
ALTER TABLE planned_works DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_planned_works" ON planned_works;
CREATE POLICY "allow_all_planned_works" ON planned_works FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS planned_works_oncall (
  id          BIGSERIAL PRIMARY KEY,
  week_start  TEXT NOT NULL,
  group_name  TEXT NOT NULL,
  line_order  INT NOT NULL DEFAULT 0,
  date_from   TEXT,
  date_to     TEXT,
  person_name TEXT,
  phone       TEXT,
  updated_by  TEXT,
  updated_at  TEXT
);
ALTER TABLE planned_works_oncall DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_planned_works_oncall" ON planned_works_oncall;
CREATE POLICY "allow_all_planned_works_oncall" ON planned_works_oncall FOR ALL USING (true) WITH CHECK (true);

-- ── compliance-docs storage policy idempotency fix ────────────────────────
-- The existing policy was missing this DROP guard, so a second run of the
-- full schema file would have errored on it. Drops and immediately
-- recreates the identical "allow all" policy for the compliance-docs
-- bucket only — does not touch any stored file or any other bucket.
DROP POLICY IF EXISTS "allow all compliance-docs" ON storage.objects;
CREATE POLICY "allow all compliance-docs" ON storage.objects
  FOR ALL USING (bucket_id = 'compliance-docs');
