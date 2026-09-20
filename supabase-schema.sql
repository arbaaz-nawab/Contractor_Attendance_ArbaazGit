-- ============================================================
-- Goodenough College — Contractor Attendance App
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. contractor_log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractor_log (
  id                      BIGSERIAL PRIMARY KEY,
  date                    TEXT,
  company_name            TEXT,
  operative_name          TEXT,
  id_number               TEXT,
  buildings               TEXT,
  point_of_contact        TEXT,
  contact_number          TEXT,
  rams_submitted          TEXT,
  declaration_confirmed   TEXT,
  sign_in_time            TEXT,
  sign_out_time           TEXT,
  work_completed          TEXT,
  status                  TEXT,
  photo_url               TEXT,
  contractor_type         TEXT,
  permit_required         TEXT,
  permit_types            TEXT,
  fire_safety_affected    TEXT,
  asbestos_checked        TEXT,
  rams_approved           TEXT,
  induction_complete      TEXT,
  insurance_valid         TEXT,
  last_rams_review_date   TEXT,
  last_induction_date     TEXT,
  last_compliance_date    TEXT,
  amended_by              TEXT,
  amended_at              TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. engineer_overtime ──────────────────────────────────
CREATE TABLE IF NOT EXISTS engineer_overtime (
  id                        BIGSERIAL PRIMARY KEY,
  engineer_name             TEXT,
  start_timestamp           TEXT,
  end_timestamp             TEXT,
  work_description          TEXT,
  image_path                TEXT,
  status                    TEXT,
  approval_status           TEXT,
  approved_by               TEXT,
  approval_timestamp        TEXT,
  notes                     TEXT,
  adjusted_duration         TEXT,
  approved_by_dean          TEXT,
  approved_by_laurel        TEXT,
  dean_approval_timestamp   TEXT,
  laurel_approval_timestamp TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. managers ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS managers (
  id            BIGSERIAL PRIMARY KEY,
  manager_name  TEXT,
  manager_pin   TEXT
);

-- ── 4. contractor_compliance ───────────────────────────────
CREATE TABLE IF NOT EXISTS contractor_compliance (
  id                BIGSERIAL PRIMARY KEY,
  company_name      TEXT UNIQUE,
  rams_date         TEXT,
  induction_date    TEXT,
  insurance_date    TEXT,
  rams_expiry       TEXT,
  induction_expiry  TEXT,
  insurance_expiry  TEXT,
  document_path     TEXT,
  updated_by        TEXT,
  updated_at        TEXT
);

-- ── 5. operative_induction (per-person, not per-company) ──
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

-- ── 6. Disable RLS (internal app — all ops via server-side API) ──
ALTER TABLE contractor_log         DISABLE ROW LEVEL SECURITY;
ALTER TABLE engineer_overtime      DISABLE ROW LEVEL SECURITY;
ALTER TABLE managers               DISABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_compliance  DISABLE ROW LEVEL SECURITY;
ALTER TABLE operative_induction    DISABLE ROW LEVEL SECURITY;

-- ── 7. Storage bucket for compliance documents ────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-docs', 'compliance-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "allow all compliance-docs" ON storage.objects
  FOR ALL USING (bucket_id = 'compliance-docs');

-- ============================================================
-- MIGRATION — run against existing database
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS guard)
-- ============================================================

-- contractor_log: amend tracking columns
ALTER TABLE contractor_log ADD COLUMN IF NOT EXISTS amended_by TEXT;
ALTER TABLE contractor_log ADD COLUMN IF NOT EXISTS amended_at TEXT;

-- engineer_overtime: dual approval columns
ALTER TABLE engineer_overtime ADD COLUMN IF NOT EXISTS approved_by_dean          TEXT;
ALTER TABLE engineer_overtime ADD COLUMN IF NOT EXISTS approved_by_laurel        TEXT;
ALTER TABLE engineer_overtime ADD COLUMN IF NOT EXISTS dean_approval_timestamp   TEXT;
ALTER TABLE engineer_overtime ADD COLUMN IF NOT EXISTS laurel_approval_timestamp TEXT;

-- operative_induction table (idempotent via CREATE TABLE IF NOT EXISTS above)

-- managers: email column for overdue notifications
ALTER TABLE managers ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';

-- ── 6b. weekly_rota (one row per engineer per week) ──
CREATE TABLE IF NOT EXISTS weekly_rota (
  id               BIGSERIAL PRIMARY KEY,
  week_start_date  TEXT NOT NULL,
  week_end_date    TEXT NOT NULL,
  engineer_name    TEXT NOT NULL,
  assigned_by      TEXT,
  assigned_at      TEXT,
  confirmed_by     TEXT,
  confirmed_at     TEXT
);
ALTER TABLE weekly_rota DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_weekly_rota" ON weekly_rota;
CREATE POLICY "allow_all_weekly_rota" ON weekly_rota FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE weekly_rota ADD COLUMN IF NOT EXISTS confirmed_by TEXT;
ALTER TABLE weekly_rota ADD COLUMN IF NOT EXISTS confirmed_at TEXT;

-- ── 6c. shift_log (daily engineer shift sign-in/out, separate from overtime) ──
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

-- Only one OPEN shift per engineer at a time — closes the race where two
-- phones sign in as the same engineer within the same check-then-insert
-- window and would otherwise both succeed.
CREATE UNIQUE INDEX IF NOT EXISTS shift_log_one_open_per_engineer_idx
  ON shift_log (engineer_name) WHERE status = 'OPEN';

-- Manager's note when correcting a MISSING_SIGNOUT (or forgotten OPEN) shift
-- from the dashboard Attendance tab.
ALTER TABLE shift_log ADD COLUMN IF NOT EXISTS correction_note TEXT;

-- ── 9. Parking tab (Estates log of parking booked for external contractors) ──
-- Standalone: deliberately no FK/link to contractor_log.
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

-- Editable "Estates staff" list for the requester/entered-by pickers.
-- Removing a name sets active=false (soft) — bookings store names as plain
-- text snapshots, never a foreign key, so removing a name never touches
-- historical rows.
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

-- One row per create/edit/status-change/cancel on a booking. `changes` is a
-- JSON-encoded array of {field, old, new} (TEXT, not JSONB — matches this
-- schema's existing all-TEXT-payload convention rather than introducing a
-- new column type just for this one table).
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
