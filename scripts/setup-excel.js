/**
 * Run ONCE to create ContractorLog.xlsx with the correct headers and table style.
 *
 *   node scripts/setup-excel.js
 *
 * Reads EXCEL_FILE_PATH from .env.local.
 * If the file already exists it will NOT be overwritten.
 */

const path = require('path');
const fs = require('fs');

// Load .env.local manually (no dotenv needed — just read the file)
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  });
}

const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'Date',          key: 'date',       width: 14 },
  { header: 'Company Name',  key: 'company',    width: 24 },
  { header: 'Operative Name',key: 'operative',  width: 22 },
  { header: 'ID Number',     key: 'id',         width: 12 },
  { header: 'Sign-In Time',  key: 'signin',     width: 20 },
  { header: 'Sign-Out Time', key: 'signout',    width: 20 },
  { header: 'Status',        key: 'status',     width: 12 },
  { header: 'Photo URL',     key: 'photo',      width: 40 },
  { header: 'Notes',         key: 'notes',      width: 40 },
];

async function main() {
  const filePath = process.env.EXCEL_FILE_PATH;
  if (!filePath) {
    console.error('Error: EXCEL_FILE_PATH is not set in .env.local');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);

  if (fs.existsSync(resolved)) {
    console.log(`File already exists at: ${resolved}`);
    console.log('Nothing to do — setup is complete.');
    return;
  }

  // Ensure the directory exists
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ContractorLog');

  ws.columns = COLUMNS;

  // Style the header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 20;
  headerRow.commit();

  await wb.xlsx.writeFile(resolved);

  console.log(`✅ Created: ${resolved}`);
  console.log('Your app is ready. Start it with: npm run dev');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
