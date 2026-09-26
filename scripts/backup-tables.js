/**
 * Read-only backup of every existing Supabase table, before applying new
 * schema to a live project. SELECT-only — never writes, updates, or deletes
 * anything in the database. Never prints row contents or API keys to the
 * console, only table names and row counts.
 *
 * Usage:  node scripts/backup-tables.js
 * Reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_ANON_KEY from .env.local (or the
 * shell environment, which takes priority) — the same two vars lib/db.js
 * uses. No new dependency: uses the @supabase/supabase-js already installed
 * for the app, and a tiny inline .env parser instead of adding dotenv.
 *
 * Writes one JSON file per table into a new timestamped folder OUTSIDE this
 * repo (under the user's home directory), so the backup can never be
 * accidentally committed. That folder contains personal data (contractor
 * and operative names, phone numbers, etc.) — keep it private and delete it
 * once it's no longer needed.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');

const REPO_ROOT = path.resolve(__dirname, '..');
const PAGE_SIZE = 1000;

// Every table supabase-schema.sql defines for the *existing* (pre-this-work)
// app. operative_induction is included as "if it exists" — some projects
// (including the test project checked earlier) don't have it yet.
const TABLES = [
  'contractor_log',
  'managers',
  'engineer_overtime',
  'contractor_compliance',
  'weekly_rota',
  'operative_induction',
];

function loadEnvLocal() {
  const envPath = path.join(REPO_ROOT, '.env.local');
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

async function backupTable(supabase, table, outDir) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      // Table missing entirely (e.g. operative_induction not yet applied) —
      // report and move on, don't fail the whole backup over it.
      if (error.code === 'PGRST205' || /Could not find the table/i.test(error.message || '')) {
        console.log(`${table}: not present, skipped`);
        return null;
      }
      throw new Error(`${table}: ${error.message}`);
    }

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
  console.log(`${table}: ${rows.length} row(s)`);
  return rows.length;
}

async function main() {
  const env = { ...loadEnvLocal(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ANON_KEY must be set (.env.local or env).');
    process.exit(1);
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const outDir = path.join(os.homedir(), `contractor-signin-backup-${dateStr}`);

  // Hard guarantee: never write the backup inside this repo.
  if (outDir === REPO_ROOT || outDir.startsWith(REPO_ROOT + path.sep)) {
    console.error(`Refusing to write backup inside the repo: ${outDir}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Backup folder: ${outDir}`);
  console.log('(contains personal data — contractor/operative names etc. Keep private, delete when done.)\n');

  const supabase = createClient(url, key);
  const summary = {};
  for (const table of TABLES) {
    summary[table] = await backupTable(supabase, table, outDir);
  }

  fs.writeFileSync(
    path.join(outDir, '_summary.json'),
    JSON.stringify({ takenAt: new Date().toISOString(), rowCounts: summary }, null, 2)
  );

  console.log(`\nDone. Backup folder: ${outDir}`);
}

main().catch((err) => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});
