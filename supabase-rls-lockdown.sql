-- ============================================================
-- Goodenough College — Contractor Attendance App
-- RLS lockdown: enable Row Level Security on every application table,
-- with NO policies attached.
--
-- DO NOT RUN THIS until the server is confirmed to be authenticating with
-- SUPABASE_SERVICE_ROLE_KEY (see lib/db.js getClient() and SETUP_GUIDE.md).
-- The service_role key bypasses RLS entirely, so once it's in use, "RLS on,
-- zero policies" simply means: the server (service_role) can still do
-- everything, while anon/authenticated callers (anyone hitting Supabase's
-- REST API directly with the public anon key, bypassing this app's own API
-- routes) get denied by default instead of the current wide-open access.
--
-- Do NOT run this against a project whose server is still using
-- SUPABASE_ANON_KEY — that reproduces the 2026-09-28 outage (RLS enabled
-- on contractor_log with zero policies while the server used the anon key;
-- see MEMORY.md), except this time on every table instead of just one.
--
-- Verification and rollback sections are below the lockdown statements.
-- ============================================================

-- ── Legacy tables (created before this app had a policy convention) ──────
ALTER TABLE contractor_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineer_overtime     ENABLE ROW LEVEL SECURITY;
ALTER TABLE managers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE operative_induction   ENABLE ROW LEVEL SECURITY;

-- ── Newer tables (already had DISABLE ROW LEVEL SECURITY + an explicit
--    "allow_all" policy each — this drops that policy too, since the goal
--    here is zero policies everywhere, not just "RLS enabled") ───────────
DROP POLICY IF EXISTS "allow_all_weekly_rota" ON weekly_rota;
ALTER TABLE weekly_rota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_shift_log" ON shift_log;
ALTER TABLE shift_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_shift_log_deletions" ON shift_log_deletions;
ALTER TABLE shift_log_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_parking_bookings" ON parking_bookings;
ALTER TABLE parking_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_parking_staff" ON parking_staff;
ALTER TABLE parking_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_parking_history" ON parking_history;
ALTER TABLE parking_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_planned_works" ON planned_works;
ALTER TABLE planned_works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_planned_works_oncall" ON planned_works_oncall;
ALTER TABLE planned_works_oncall ENABLE ROW LEVEL SECURITY;

-- ── Deliberately NOT touched by this file ─────────────────────────────────
-- storage.objects (the compliance-docs bucket policy, "allow all
-- compliance-docs") is Storage's own RLS, not a table in the list above,
-- and wasn't part of the ask. It's unaffected either way once the server
-- uses the service_role key (which also bypasses Storage RLS), but if you
-- want the same "zero policies" posture there too, that's a separate,
-- explicit follow-up — don't fold it into this file silently.

-- ============================================================
-- VERIFICATION — run after the ALTERs above, before trusting the result
-- ============================================================

-- Expect every listed table to show relrowsecurity = true.
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN (
  'contractor_log', 'engineer_overtime', 'managers', 'contractor_compliance',
  'operative_induction', 'weekly_rota', 'shift_log', 'shift_log_deletions',
  'parking_bookings', 'parking_staff', 'parking_history', 'planned_works',
  'planned_works_oncall'
)
ORDER BY relname;

-- Expect ZERO rows — if anything comes back, a policy still exists and
-- that table is not actually locked down to service_role-only.
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN (
  'contractor_log', 'engineer_overtime', 'managers', 'contractor_compliance',
  'operative_induction', 'weekly_rota', 'shift_log', 'shift_log_deletions',
  'parking_bookings', 'parking_staff', 'parking_history', 'planned_works',
  'planned_works_oncall'
);

-- Smoke test from the app itself, once the two checks above pass: contractor
-- sign-in, sign-out, and one dashboard tab load without a 500. If any of
-- them fail, check that Vercel's SUPABASE_SERVICE_ROLE_KEY is actually set
-- for the environment you just tested (Production vs Preview are scoped
-- separately) before assuming the lockdown itself is wrong.

-- ============================================================
-- ROLLBACK — only if the lockdown breaks something and you need the old
-- (wide-open, no-RLS) behaviour back immediately. Uncomment and run the
-- block below; it does NOT restore the newer tables' "allow_all" policies
-- automatically — re-run the relevant CREATE POLICY statements from
-- supabase-schema.sql for those if you want that middle ground back
-- instead of fully-open.
-- ============================================================

-- ALTER TABLE contractor_log         DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE engineer_overtime      DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE managers               DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE contractor_compliance  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE operative_induction    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE weekly_rota            DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE shift_log              DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE shift_log_deletions    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE parking_bookings       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE parking_staff          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE parking_history        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE planned_works          DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE planned_works_oncall   DISABLE ROW LEVEL SECURITY;
