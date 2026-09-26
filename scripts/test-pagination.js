/**
 * Re-runnable, mock-only proof that lib/db.js's fetchAllRows() pagination
 * actually returns every row once a table crosses PostgREST's 1000-row
 * per-request cap — the exact failure mode recorded in MEMORY.md
 * 2026-09-20 (a ZZTEST contractor silently dropped from the dashboard once
 * contractor_log passed 1000 rows).
 *
 * Runs entirely against a local mock HTTP server standing in for Supabase's
 * REST API (offset/limit query params, same as postgrest-js's .range()) —
 * no real Supabase project is contacted, no production data is read or
 * written. Safe to run repeatedly, any time, against any environment.
 *
 * Usage:  node scripts/test-pagination.js
 * Exits 0 if every case passes, 1 (with a diagnostic) otherwise.
 */
import http from 'http';

const MOCK_PORT = 41823;

// ── Mock PostgREST server ───────────────────────────────────────────────────
// Serves GET /rest/v1/<table>?...&offset=N&limit=M as a slice of a synthetic,
// id-ordered row set sized per `rowCounts[table]` — mirrors the shape
// postgrest-js actually sends (see node_modules/@supabase/postgrest-js
// PostgrestTransformBuilder.range(): offset/limit query params, not a Range
// header, in the version this repo depends on).
function startMockServer(rowCounts) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const match = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
    if (!match) { res.writeHead(404).end('not found'); return; }
    const table = match[1];
    const total = rowCounts[table] ?? 0;
    const offset = Number(url.searchParams.get('offset') || '0');
    const limit  = Number(url.searchParams.get('limit')  || String(total || 1));

    const from = offset;
    const to   = Math.min(offset + limit, total);
    const rows = [];
    for (let id = from + 1; id <= to; id += 1) {
      // Enough fields for either mapper (contractorRowToObj / overtimeRowToObj)
      // to round-trip without throwing; extra unknown fields are harmless.
      rows.push({ id, date: '2026-01-01', company_name: 'MOCK', engineer_name: 'MOCK', status: 'MOCK' });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rows));
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, '127.0.0.1', () => resolve(server)));
}

async function run() {
  const failures = [];

  function check(label, actualIds, expectedCount) {
    const ok = actualIds.length === expectedCount
      && new Set(actualIds).size === expectedCount
      && (expectedCount === 0 || (Math.min(...actualIds) === 1 && Math.max(...actualIds) === expectedCount));
    console.log(`${ok ? 'PASS' : 'FAIL'} - ${label} (expected ${expectedCount} unique sequential rows, got ${actualIds.length}, ${new Set(actualIds).size} unique)`);
    if (!ok) failures.push(label);
  }

  // Cases chosen to hit the exact boundaries fetchAllRows' loop cares about:
  // exactly one full page (the loop can only tell it's the last page by
  // seeing a short read, so this makes one extra, correctly-empty request —
  // that's expected, not a bug), one page + 1 (must fetch a second page),
  // a multi-page case spanning 3 requests, and the zero-row edge case.
  const cases = {
    contractor_log:    2500,  // 3 pages: 1000 + 1000 + 500
    engineer_overtime: 1001,  // 2 pages: 1000 + 1
    contractor_compliance: 1000, // exactly 1 full page
    parking_bookings:  0,     // empty table
  };

  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${MOCK_PORT}`;
  process.env.SUPABASE_ANON_KEY = 'mock-anon-key-not-a-real-secret';

  const server = await startMockServer(cases);
  try {
    const db = await import('../lib/db.js');

    if (db.MAX_PAGE_ROWS !== 1000) {
      console.log(`FAIL - MAX_PAGE_ROWS is ${db.MAX_PAGE_ROWS}, expected 1000 (mock cases above assume this)`);
      failures.push('MAX_PAGE_ROWS');
    }

    const allRows = await db.getAllRows();
    check('getAllRows() (contractor_log, 3-page case)', allRows.map((r) => r._row), cases.contractor_log);

    const overtimeRows = await db.getAllOvertimeRows();
    check('getAllOvertimeRows() (engineer_overtime, page-boundary+1 case)', overtimeRows.map((r) => r._row), cases.engineer_overtime);

    const complianceRows = await db.getAllComplianceRows();
    // getAllComplianceRows orders by company_name first — every mock row has
    // the same company_name, so id order within the tie isn't guaranteed by
    // this mock; check count/uniqueness only, not id ordering.
    const complianceIds = complianceRows.map((r) => r._row);
    const complianceOk = complianceIds.length === cases.contractor_compliance && new Set(complianceIds).size === cases.contractor_compliance;
    console.log(`${complianceOk ? 'PASS' : 'FAIL'} - getAllComplianceRows() (exactly-one-full-page case) (expected ${cases.contractor_compliance} unique rows, got ${complianceIds.length}, ${new Set(complianceIds).size} unique)`);
    if (!complianceOk) failures.push('getAllComplianceRows() exact-page-boundary');

    const parkingRows = await db.getParkingBookings();
    check('getParkingBookings() (parking_bookings, zero-row case)', parkingRows.map((r) => r.id), cases.parking_bookings);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('');
  if (failures.length === 0) {
    console.log(`All pagination checks passed (${Object.keys(cases).length + 1} cases).`);
    process.exitCode = 0;
  } else {
    console.log(`${failures.length} pagination check(s) failed: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('Pagination test crashed:', err);
  process.exitCode = 1;
});
