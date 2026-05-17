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
