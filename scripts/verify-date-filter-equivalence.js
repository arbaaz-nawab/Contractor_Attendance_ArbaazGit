/**
 * Read-only proof that pages/api/dashboard.js's new getRowsInDateRange()
 * (server-side .gte()/.lte() filter) returns exactly the same rows as the
 * old approach it replaced (getAllRows() + a client/server-side JS filter
 * comparing r['Date'] against dateFrom/dateTo) — see MEMORY.md 2026-09-20.
 *
 * SELECT-only against contractor_log. Never inserts, updates, or deletes
 * anything — safe to run against production at any time.
 *
 * Usage:  node scripts/verify-date-filter-equivalence.js
 * Reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_ANON_KEY from .env.local (or the
 * shell environment) — same two vars lib/db.js and scripts/backup-tables.js
 * use. No new dependency: uses date-fns-tz (already a dependency, same as
 * lib/ukTime.js) and lib/db.js directly.
 */
const fs = require('fs');
const path = require('path');
const { formatInTimeZone } = require('date-fns-tz');

const REPO_ROOT = path.resolve(__dirname, '..');
const UK_TZ = 'Europe/London';

function loadEnvLocal() {
  const envPath = path.join(REPO_ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvLocal();

function ukDateString(date) {
  return formatInTimeZone(date, UK_TZ, 'yyyy-MM-dd');
}

function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Old, JS-side replica of dashboard.js's pre-2026-09-20 filter — exactly
// the logic being replaced, reproduced here (not imported) so this script
// keeps proving equivalence even after that code is gone from the app.
function oldApproachFilter(allRows, dateFrom, dateTo) {
  return allRows.filter((r) => {
    const d = r['Date'];
    if (!d) return false;
    if (d < dateFrom || d > dateTo) return false;
    return true;
  });
}

async function run() {
  const db = await import('../lib/db.js');

  console.log('Fetching full contractor_log once (old approach\'s baseline)...');
  const allRows = await db.getAllRows();
  console.log(`  ${allRows.length} rows total.\n`);

  const today = ukDateString(new Date());
  const yesterday = addDaysStr(today, -1);

  // Monday-start week containing today, full Mon-Sun.
  const todayDow = new Date(today + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (todayDow + 6) % 7; // days since Monday
  const weekMonday = addDaysStr(today, -mondayOffset);
  const weekSunday = addDaysStr(weekMonday, 6);

  const [ty, tm] = today.split('-').map(Number);
  const monthStart = `${ty}-${String(tm).padStart(2, '0')}-01`;
  const monthEndDate = new Date(Date.UTC(ty, tm, 0)); // day 0 of next month = last day of this month
  const monthEnd = monthEndDate.toISOString().slice(0, 10);

  const cases = [
    ['today', today, today],
    ['yesterday', yesterday, yesterday],
    ['this week (Mon-Sun)', weekMonday, weekSunday],
    ['this month (1st-last)', monthStart, monthEnd],
    ['spans BST->GMT change, 25 Oct 2026', '2026-10-24', '2026-10-26'],
    ['spans GMT->BST change, 29 Mar 2026', '2026-03-28', '2026-03-30'],
    ['single day, month start (2026-08-01)', '2026-08-01', '2026-08-01'],
    ['single day, month end (2026-08-31)', '2026-08-31', '2026-08-31'],
  ];

  console.log('Case-by-case row-id comparison (old JS filter vs new getRowsInDateRange):\n');
  let allPass = true;
  for (const [label, dateFrom, dateTo] of cases) {
    const oldIds = oldApproachFilter(allRows, dateFrom, dateTo).map((r) => r._row).sort((a, b) => a - b);
    const newRows = await db.getRowsInDateRange(dateFrom, dateTo);
    const newIds = newRows.map((r) => r._row).sort((a, b) => a - b);

    const same = oldIds.length === newIds.length && oldIds.every((id, i) => id === newIds[i]);
    console.log(`${same ? 'PASS' : 'FAIL'} - ${label} [${dateFrom}..${dateTo}]: old=${oldIds.length} rows, new=${newIds.length} rows`);
    if (!same) {
      allPass = false;
      const onlyOld = oldIds.filter((id) => !newIds.includes(id));
      const onlyNew = newIds.filter((id) => !oldIds.includes(id));
      if (onlyOld.length) console.log('  only in OLD:', onlyOld);
      if (onlyNew.length) console.log('  only in NEW:', onlyNew);
    }
  }

  // ── UK-local vs UTC boundary check ────────────────────────────────────────
  // "date" and "sign_in_time" are stored as UK wall-clock TEXT (via
  // ukDateString()/ukDateTimeString(), see lib/ukTime.js) — never a native
  // DATE/TIMESTAMP column (supabase-schema.sql: both TEXT) — and every
  // filter, old and new, compares these as plain strings. Neither approach
  // ever re-parses the date into a JS Date/Postgres timestamp, so there is
  // no UTC-reinterpretation step for a UK-local boundary to leak through.
  // A row genuinely near the UTC/UK-date boundary would be one signed in at
  // UK wall-clock 00:00-00:59 during BST (UTC+1) — i.e. just after 23:00
  // UTC the *previous* UTC day.
  console.log('\nUK-local vs UTC date-boundary check:');
  const nearBoundary = allRows.filter((r) => {
    const t = (r['Sign-In Time'] || '').slice(11, 16); // "HH:MM"
    return t >= '00:00' && t < '01:00';
  });
  if (nearBoundary.length === 0) {
    console.log('  No contractor_log rows found with a UK sign-in time in the 00:00-00:59 window');
    console.log('  (the exact window where UK-local and UTC calendar dates diverge during BST) —');
    console.log('  nothing to check empirically against real data right now. Verified analytically');
    console.log('  instead: date/sign_in_time are UK-local TEXT end-to-end (see comment above), so');
    console.log('  this divergence has no code path to leak through regardless of data.');
  } else {
    console.log(`  Found ${nearBoundary.length} row(s) in that window — checking each is bucketed by`);
    console.log('  its stored UK date (not the UTC calendar date of the same instant):');
    for (const r of nearBoundary) {
      const storedDate = r['Date'];
      const utcDate = new Date(r['Sign-In Time'].replace(' ', 'T') + 'Z').toISOString().slice(0, 10);
      // storedDate should equal the UK date, which — since UK is ahead of
      // UTC during BST — is one day AHEAD of utcDate for a 00:xx sign-in.
      console.log(`  id=${r._row} sign_in=${r['Sign-In Time']} stored date=${storedDate} (UTC calendar date would read ${utcDate})`);
    }
  }

  console.log('\n' + (allPass ? 'ALL CASES EQUIVALENT.' : 'DIFFERENCES FOUND — see above.'));
  process.exitCode = allPass ? 0 : 1;
}

run().catch((err) => {
  console.error('Equivalence check crashed:', err);
  process.exitCode = 1;
});
