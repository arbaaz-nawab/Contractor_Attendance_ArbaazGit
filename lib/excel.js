/**
 * Excel file helper using exceljs.
 *
 * Reads and writes a local .xlsx file directly.
 * If the file lives in your OneDrive folder, it syncs automatically.
 *
 * Set EXCEL_FILE_PATH in .env.local to the full path of your .xlsx file.
 * e.g. EXCEL_FILE_PATH=/Users/you/OneDrive/ContractorLog.xlsx
 */
import ExcelJS from 'exceljs';
import path from 'path';

const SHEET         = 'ContractorLog';
const OVERTIME_SHEET  = 'EngineerOvertime';
const MANAGERS_SHEET  = 'Managers';

// Existing 14 columns + 11 new H&S columns appended at end.
// Old records simply return '' for the new columns — fully backward safe.
const COLUMNS = [
  'Date',
  'Company Name',
  'Operative Name',
  'ID Number',
  'Buildings',
  'Point of Contact',
  'Contact Number',
  'RAMS Submitted',
  'Declaration Confirmed',
  'Sign-In Time',
  'Sign-Out Time',
  'Work Completed',
  'Status',
  'Photo URL',
  // ── New H&S columns (optional for old records) ──────────────────────────────
  'Contractor Type',
  'Permit Required',
  'Permit Types',
  'Fire Safety Affected',
  'Asbestos Checked',
  'RAMS Approved',
  'Induction Complete',
  'Insurance Valid',
  'Last RAMS Review Date',
  'Last Induction Date',
  'Last Compliance Date',
];

const OVERTIME_COLUMNS = [
  'Engineer Name',
  'Start Timestamp',
  'End Timestamp',
  'Work Description',
  'Image Path',
  'Status',
  'Approval Status',
  'Approved By',
  'Approval Timestamp',
  'Notes',
  'Adjusted Duration',
];

const MANAGERS_COLUMNS = ['Manager Name', 'Manager Pin'];

function getFilePath() {
  let p = process.env.EXCEL_FILE_PATH;
  if (!p) throw new Error('EXCEL_FILE_PATH is not set in .env.local');
  // Strip surrounding quotes if present (e.g. EXCEL_FILE_PATH='/path/...')
  p = p.replace(/^['"]|['"]$/g, '');
  return path.resolve(p);
}

// ── Shared write lock — prevents concurrent writes corrupting the file ────────
// One lock for ALL sheets since they share the same .xlsx file.
let writeLock = Promise.resolve();
function withLock(fn) {
  writeLock = writeLock.then(fn).catch(fn);
  return writeLock;
}

// ── Ensure the ContractorLog sheet exists, creating it if needed ──────────────
async function load() {
  const filePath = getFilePath();
  const wb = new ExcelJS.Workbook();

  const fileExists = (await import('fs')).existsSync(filePath);

  if (fileExists) {
    await wb.xlsx.readFile(filePath);
  }

  let ws = wb.getWorksheet(SHEET);

  if (!ws) {
    // Sheet missing (or brand-new file) — create it with styled headers
    ws = wb.addWorksheet(SHEET);
    const WIDE_COLS = new Set(['Buildings', 'RAMS Submitted', 'Work Completed', 'Photo URL', 'Permit Types']);
    ws.columns = COLUMNS.map((col) => ({ header: col, key: col, width: WIDE_COLS.has(col) ? 45 : 22 }));

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    headerRow.height = 20;
    headerRow.commit();

    await wb.xlsx.writeFile(filePath);
    console.log(`[excel] Created sheet "${SHEET}" in ${filePath}`);
  }

  return { wb, ws };
}

// ── Generic sheet loader / creator for secondary sheets ───────────────────────
async function loadSheet(sheetName, sheetColumns) {
  const filePath = getFilePath();
  const wb = new ExcelJS.Workbook();

  const fileExists = (await import('fs')).existsSync(filePath);
  if (fileExists) await wb.xlsx.readFile(filePath);

  // Always ensure the main ContractorLog exists
  if (!wb.getWorksheet(SHEET)) {
    const mainWs = wb.addWorksheet(SHEET);
    const WIDE = new Set(['Buildings', 'RAMS Submitted', 'Work Completed', 'Photo URL', 'Permit Types']);
    mainWs.columns = COLUMNS.map((col) => ({ header: col, key: col, width: WIDE.has(col) ? 45 : 22 }));
    const hRow = mainWs.getRow(1);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    hRow.height = 20;
    hRow.commit();
  }

  let targetWs = wb.getWorksheet(sheetName);
  if (!targetWs) {
    targetWs = wb.addWorksheet(sheetName);
    targetWs.columns = sheetColumns.map((col) => ({ header: col, key: col, width: 30 }));
    const hRow = targetWs.getRow(1);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    hRow.height = 20;
    hRow.commit();
    await wb.xlsx.writeFile(filePath);
    console.log(`[excel] Created sheet "${sheetName}" in ${filePath}`);
  }

  return { wb, ws: targetWs };
}

// ── Row object → array in column order ───────────────────────────────────────
function rowToValues(rowData) {
  return COLUMNS.map((col) => rowData[col] ?? '');
}

// ── Array → row object ────────────────────────────────────────────────────────
function valuesToRow(arr, excelRowNumber) {
  const obj = { _row: excelRowNumber };
  COLUMNS.forEach((col, i) => {
    obj[col] = arr[i] ?? '';
  });
  return obj;
}

// ── Read all data rows (skips header row 1) ───────────────────────────────────
export async function getAllRows() {
  const { ws } = await load();
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const values = row.values.slice(1); // exceljs row.values is 1-indexed, slice off index 0
    rows.push(valuesToRow(values, rowNumber));
  });
  return rows;
}

// ── Append a new sign-in row ──────────────────────────────────────────────────
export async function appendRow(rowData) {
  return withLock(async () => {
    const { wb, ws } = await load();
    ws.addRow(rowToValues(rowData));
    await wb.xlsx.writeFile(getFilePath());
  });
}

// ── Update a row by its Excel row number ─────────────────────────────────────
export async function updateRow(excelRowNumber, updates) {
  return withLock(async () => {
    const { wb, ws } = await load();
    const row = ws.getRow(excelRowNumber);

    COLUMNS.forEach((col, i) => {
      if (updates[col] !== undefined) {
        row.getCell(i + 1).value = updates[col];
      }
    });

    row.commit();
    await wb.xlsx.writeFile(getFilePath());
  });
}

// ── Find the active session for an ID on a given date ────────────────────────
export async function findActiveSession(idNumber, todayDate) {
  const rows = await getAllRows();
  return rows.find(
    (r) =>
      String(r['ID Number']).trim() === String(idNumber).trim() &&
      r['Status'] === 'Active' &&
      r['Date'] === todayDate
  ) ?? null;
}

// ── Get rows for a specific date (optionally filtered by company) ─────────────
export async function getRowsByDate(date, company) {
  const rows = await getAllRows();
  return rows.filter((r) => {
    if (r['Date'] !== date) return false;
    if (company && !r['Company Name'].toLowerCase().includes(company.toLowerCase())) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ── NEW: Company compliance history lookup ────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export async function findCompanyHistory(companyName) {
  const rows = await getAllRows();
  const companyRows = rows.filter(
    (r) => r['Company Name'].toLowerCase().trim() === companyName.toLowerCase().trim()
  );

  if (companyRows.length === 0) return null;

  let lastRAMSDate       = null;
  let lastInductionDate  = null;
  let lastComplianceDate = null;

  for (const r of companyRows) {
    // Check explicit stored compliance date columns (from new sign-ins)
    if (r['Last RAMS Review Date'] &&
        (!lastRAMSDate || r['Last RAMS Review Date'] > lastRAMSDate)) {
      lastRAMSDate = r['Last RAMS Review Date'];
    } else if ((r['RAMS Approved'] === 'Yes' || r['RAMS Submitted'] === 'Yes') && r['Date']) {
      if (!lastRAMSDate || r['Date'] > lastRAMSDate) lastRAMSDate = r['Date'];
    }

    if (r['Last Induction Date'] &&
        (!lastInductionDate || r['Last Induction Date'] > lastInductionDate)) {
      lastInductionDate = r['Last Induction Date'];
    } else if (r['Induction Complete'] === 'Yes' && r['Date']) {
      if (!lastInductionDate || r['Date'] > lastInductionDate) lastInductionDate = r['Date'];
    }

    if (r['Last Compliance Date'] &&
        (!lastComplianceDate || r['Last Compliance Date'] > lastComplianceDate)) {
      lastComplianceDate = r['Last Compliance Date'];
    } else if (r['Insurance Valid'] === 'Yes' && r['Date']) {
      if (!lastComplianceDate || r['Date'] > lastComplianceDate) lastComplianceDate = r['Date'];
    }
  }

  return {
    found: true,
    rowCount: companyRows.length,
    lastRAMSReviewDate: lastRAMSDate,
    lastInductionDate,
    lastComplianceDate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── NEW: EngineerOvertime sheet ───────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllOvertimeRows() {
  const { ws } = await loadSheet(OVERTIME_SHEET, OVERTIME_COLUMNS);
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1);
    const obj = { _row: rowNumber };
    OVERTIME_COLUMNS.forEach((col, i) => { obj[col] = values[i] ?? ''; });
    rows.push(obj);
  });
  return rows;
}

export async function appendOvertimeRow(rowData) {
  return withLock(async () => {
    const { wb, ws } = await loadSheet(OVERTIME_SHEET, OVERTIME_COLUMNS);
    ws.addRow(OVERTIME_COLUMNS.map((col) => rowData[col] ?? ''));
    await wb.xlsx.writeFile(getFilePath());
  });
}

export async function updateOvertimeRow(excelRowNumber, updates) {
  return withLock(async () => {
    const { wb, ws } = await loadSheet(OVERTIME_SHEET, OVERTIME_COLUMNS);
    const row = ws.getRow(excelRowNumber);
    OVERTIME_COLUMNS.forEach((col, i) => {
      if (updates[col] !== undefined) row.getCell(i + 1).value = updates[col];
    });
    row.commit();
    await wb.xlsx.writeFile(getFilePath());
  });
}

export async function findActiveOvertimeSession(engineerName) {
  const rows = await getAllOvertimeRows();
  return rows.find(
    (r) =>
      String(r['Engineer Name']).trim() === String(engineerName).trim() &&
      r['Status'] === 'ACTIVE'
  ) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── NEW: Managers sheet (name + PIN) ─────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export async function getManagers() {
  const { ws } = await loadSheet(MANAGERS_SHEET, MANAGERS_COLUMNS);
  const managers = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1);
    managers.push({
      _row: rowNumber,
      'Manager Name': String(values[0] ?? ''),
      'Manager Pin':  String(values[1] ?? ''),
    });
  });
  return managers;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── NEW: ContractorCompliance sheet (manager-set dates, per company) ──────────
// ─────────────────────────────────────────────────────────────────────────────

const COMPLIANCE_SHEET = 'ContractorCompliance';

const COMPLIANCE_COLUMNS = [
  'Company Name',
  'RAMS Date',
  'Induction Date',
  'Insurance Date',
  'RAMS Expiry',
  'Induction Expiry',
  'Insurance Expiry',
  'Document Path',
  'Updated By',
  'Updated At',
];

export async function getAllComplianceRows() {
  const { ws } = await loadSheet(COMPLIANCE_SHEET, COMPLIANCE_COLUMNS);
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1);
    const obj = { _row: rowNumber };
    COMPLIANCE_COLUMNS.forEach((col, i) => { obj[col] = values[i] ?? ''; });
    rows.push(obj);
  });
  return rows;
}

export async function getComplianceForCompany(companyName) {
  const rows = await getAllComplianceRows();
  return rows.find(
    (r) => String(r['Company Name']).toLowerCase().trim() === companyName.toLowerCase().trim()
  ) ?? null;
}

/** Create or update the single compliance row for a company (one row per company). */
export async function upsertComplianceRow(companyName, rowData) {
  return withLock(async () => {
    const { wb, ws } = await loadSheet(COMPLIANCE_SHEET, COMPLIANCE_COLUMNS);

    let existingRowNum = null;
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const name = String(row.getCell(1).value ?? '').trim().toLowerCase();
      if (name === companyName.toLowerCase().trim()) existingRowNum = rowNumber;
    });

    if (existingRowNum) {
      const row = ws.getRow(existingRowNum);
      COMPLIANCE_COLUMNS.forEach((col, i) => {
        if (rowData[col] !== undefined) row.getCell(i + 1).value = rowData[col];
      });
      row.commit();
    } else {
      ws.addRow(COMPLIANCE_COLUMNS.map((col) => rowData[col] ?? ''));
    }

    await wb.xlsx.writeFile(getFilePath());
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ── NEW: Managers sheet (name + PIN) ─────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a manager's PIN.
 * Priority: 1) Managers Excel sheet  2) MANAGER_PINS env var  3) APPROVAL_PIN env var (universal fallback)
 */
export async function getManagerPin(managerName) {
  // 1. Excel Managers sheet
  const managers = await getManagers();
  const m = managers.find(
    (mgr) => mgr['Manager Name'].trim().toLowerCase() === String(managerName).trim().toLowerCase()
  );
  if (m && m['Manager Pin']) return m['Manager Pin'];

  // 2. MANAGER_PINS env var: "Name1:PIN1,Name2:PIN2"
  const env = process.env.MANAGER_PINS || '';
  if (env) {
    for (const entry of env.split(',')) {
      const colonIdx = entry.lastIndexOf(':');
      if (colonIdx === -1) continue;
      const name = entry.slice(0, colonIdx).trim();
      const pin  = entry.slice(colonIdx + 1).trim();
      if (name.toLowerCase() === String(managerName).trim().toLowerCase()) return pin;
    }
  }

  // 3. Universal fallback PIN
  return process.env.APPROVAL_PIN || null;
}
