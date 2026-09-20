/**
 * GET /api/planned-works-export?weekStart=YYYY-MM-DD (a Monday)
 *
 * Rebuilds the Estates weekly "Planned Works" sheet layout in code (full
 * spec recorded in MEMORY.md) — the real template file was never copied
 * into the repo because it contains staff phone numbers.
 *
 * Uses exceljs, not the repo's other Excel library (`xlsx` / SheetJS
 * Community Edition, used client-side elsewhere for simple data exports):
 * xlsx CE cannot reliably write merged cells, cell fills, or embedded
 * images, and this layout needs all three. exceljs was already a
 * dependency (lib/excel.js, scripts/setup-excel.js), so nothing new to add.
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { getPlannedWorksForWeek, getPlannedWorksOncall } from '../../lib/db';
import { requireSession } from '../../lib/session';
import { isoWeekInfo, weekRangeDates, formatDateRange, fmtDDMMYYYY } from '../../lib/plannedWorksWeek';

const HEADERS = [
  'Company Name', 'Brief Description of work', 'Building Name', 'Date', 'Location',
  'Name of person in charge of work', 'RAMs reviewed and signed off? Y/N',
  'Events Team notified where applicable', 'Is parking required (Please add in reg no.)', 'Comments',
];
const COL_WIDTHS = [2.3, 33.9, 57.7, 17.4, 30.9, 44.9, 24, 19.4, 24.7, 27.4, 43.3, 3.3];
const THIN = { style: 'thin' };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const ORCHID = 'FFDA70D6';
const YELLOW = 'FFFFFF00';
const GREY = 'FFD9D9D9';
const MIN_WEEKEND_ROWS = 3;
const MIN_WEEK_ROWS = 10;
const MIN_ONCALL_LINES = 3;

// Formula-injection guard, same mitigation used for the Parking export —
// every value written here is a plain string, never a { formula } object,
// and any free text starting with a risky character is quote-prefixed too.
function safeText(v) {
  const s = String(v ?? '');
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

function styleHeaderCell(cell, isYellow) {
  cell.font = { bold: true };
  cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isYellow ? YELLOW : ORCHID } };
  cell.border = BORDER;
}

function writeHeaderRow(sheet, rowNum) {
  const row = sheet.getRow(rowNum);
  HEADERS.forEach((text, i) => {
    const cell = row.getCell(i + 2); // B=2
    cell.value = text;
    styleHeaderCell(cell, i === 7); // "Events Team notified" -> yellow
  });
  row.commit();
}

function writeDataRow(sheet, rowNum, row) {
  const r = sheet.getRow(rowNum);
  const values = row ? [
    row.companyName, row.description, row.buildingName,
    formatDateRange(row.startDate, row.endDate), row.location, row.personInCharge,
    row.ramsSignedOff, row.eventsTeamNotified, row.parkingRequired, row.comments,
  ] : new Array(10).fill('');
  values.forEach((v, i) => {
    const cell = r.getCell(i + 2);
    cell.value = safeText(v);
    cell.alignment = { wrapText: true, vertical: 'top' };
    cell.border = BORDER;
  });
  r.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } }; // "Is parking required" column
  r.commit();
}

function writeOnCallGroup(sheet, startRow, groupLabel, lines) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const count = Math.max(safeLines.length, MIN_ONCALL_LINES);
  const padded = [...safeLines];
  while (padded.length < count) padded.push({ dateFrom: '', dateTo: '', name: '', phone: '' });

  sheet.mergeCells(startRow, 2, startRow + count - 1, 2);
  const labelCell = sheet.getCell(startRow, 2);
  labelCell.value = groupLabel;
  labelCell.font = { bold: true };
  labelCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for (let i = 0; i < count; i += 1) sheet.getCell(startRow + i, 2).border = BORDER;

  padded.forEach((line, i) => {
    const r = startRow + i;
    sheet.mergeCells(r, 3, r, 11);
    const cell = sheet.getCell(r, 3);
    const hasContent = (line.name || '').trim() || (line.phone || '').trim() || line.dateFrom || line.dateTo;
    const text = hasContent
      ? `${fmtDDMMYYYY(line.dateFrom)} - ${fmtDDMMYYYY(line.dateTo)} ${line.name || ''} ${line.phone || ''}`.replace(/\s+/g, ' ').trim()
      : '';
    cell.value = safeText(text);
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 3; c <= 11; c += 1) sheet.getCell(r, c).border = BORDER;
  });

  return startRow + count;
}

const byDateThenCompany = (a, b) => {
  if (!a.startDate && !b.startDate) return a.companyName.localeCompare(b.companyName);
  if (!a.startDate) return 1;
  if (!b.startDate) return -1;
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  return a.companyName.localeCompare(b.companyName);
};

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { weekStart } = req.query;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ success: false, message: 'weekStart (YYYY-MM-DD, a Monday) is required.' });
  }

  try {
    const [satBefore, sunBefore, , , , , fri] = weekRangeDates(weekStart);
    const { isoYear, isoWeek } = isoWeekInfo(weekStart);

    const [allRows, oncall] = await Promise.all([
      getPlannedWorksForWeek(weekStart),
      getPlannedWorksOncall(weekStart),
    ]);

    const weekendRows = allRows.filter((r) => r.startDate === satBefore || r.startDate === sunBefore);
    const weekRows = allRows.filter((r) => !(r.startDate === satBefore || r.startDate === sunBefore));
    weekendRows.sort(byDateThenCompany);
    weekRows.sort(byDateThenCompany);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Planned Works', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    sheet.columns = COL_WIDTHS.map((width) => ({ width }));

    // Logo — best-effort; a missing/unreadable file must never break the export.
    try {
      const logoPath = path.join(process.cwd(), 'public', 'goodenough-logo.png');
      const logoBuffer = fs.readFileSync(logoPath);
      const imageId = workbook.addImage({ buffer: logoBuffer, extension: 'png' });
      sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 110, height: 60 } });
      sheet.getRow(1).height = 34;
      sheet.getRow(2).height = 34;
    } catch (logoErr) {
      console.error('Planned works export: logo not embedded —', logoErr.message);
    }

    sheet.mergeCells('D3:G4');
    const titleCell = sheet.getCell('D3');
    titleCell.value = `PLANNED WORKS - WEEK ${isoWeek}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.getCell('B5').value = `Week No. ${isoWeek}  - ${isoYear}`;
    sheet.getCell('B5').font = { bold: true };
    sheet.getCell('B6').value = `WEEKEND WORKS: ${fmtDDMMYYYY(satBefore)} - ${fmtDDMMYYYY(sunBefore)}`;
    sheet.getCell('B6').font = { bold: true };

    let cursor = 7;
    writeHeaderRow(sheet, cursor); cursor += 1;

    const weekendCount = Math.max(weekendRows.length, MIN_WEEKEND_ROWS);
    for (let i = 0; i < weekendCount; i += 1) { writeDataRow(sheet, cursor, weekendRows[i] || null); cursor += 1; }

    sheet.getCell(`B${cursor}`).value = `WEEK : ${fmtDDMMYYYY(weekStart)}-${fmtDDMMYYYY(fri)}`;
    sheet.getCell(`B${cursor}`).font = { bold: true };
    cursor += 1;

    writeHeaderRow(sheet, cursor); cursor += 1;

    const weekCount = Math.max(weekRows.length, MIN_WEEK_ROWS);
    for (let i = 0; i < weekCount; i += 1) { writeDataRow(sheet, cursor, weekRows[i] || null); cursor += 1; }

    sheet.mergeCells(`C${cursor}:K${cursor}`);
    const onCallHeader = sheet.getCell(`C${cursor}`);
    onCallHeader.value = 'ON CALL';
    onCallHeader.font = { bold: true };
    onCallHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    cursor += 1;

    cursor = writeOnCallGroup(sheet, cursor, 'Estate Duty Manager', oncall.estateDutyManager);
    cursor = writeOnCallGroup(sheet, cursor, 'Call out engineers name', oncall.calloutEngineers);

    const lastRow = cursor - 1;
    sheet.pageSetup.printArea = `A1:L${lastRow}`;

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `Planned Works - Week ${isoWeek} ${isoYear}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error('Planned works export error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to generate export.' });
  }
}

export default requireSession(handler);
