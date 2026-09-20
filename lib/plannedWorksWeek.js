/**
 * Pure date-math helpers for the Planned Works feature — Monday-based weeks,
 * ISO week numbers, and the "weekend belongs to the following week" rule.
 * No side effects (no DB, no node:crypto), so this is safe to import from
 * both API routes and the client component. Deliberately a new, isolated
 * file rather than extending lib/ukTime.js — this feature's date math is
 * different in kind (week identity, not UK-timezone timestamp formatting)
 * and keeping it separate means zero risk of a mistake here affecting the
 * shift/overtime/contractor features that already depend on lib/ukTime.js.
 */
import { WEEK_START_DAY } from './config';

export function pad2(n) { return String(n).padStart(2, '0'); }
export function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

export function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
export function addDaysStr(s, n) { return toDateStr(addDays(parseDateStr(s), n)); }

/** Monday (per WEEK_START_DAY) of the week containing d. */
export function mondayOf(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const diff = (c.getDay() - WEEK_START_DAY + 7) % 7;
  c.setDate(c.getDate() - diff);
  return c;
}

/** { isoYear, isoWeek } for the Monday-based week starting at weekStartStr. */
export function isoWeekInfo(weekStartStr) {
  const monday = parseDateStr(weekStartStr);
  const d = new Date(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { isoYear: d.getUTCFullYear(), isoWeek };
}

/**
 * The 7 valid placement dates for a Planned Works week: the weekend
 * immediately BEFORE weekStartStr, then Mon..Fri of weekStartStr itself.
 * Order: [Sat, Sun, Mon, Tue, Wed, Thu, Fri].
 */
export function weekRangeDates(weekStartStr) {
  const monday = parseDateStr(weekStartStr);
  return [-2, -1, 0, 1, 2, 3, 4].map((n) => toDateStr(addDays(monday, n)));
}

export function isDateInWeek(weekStartStr, dateStr) {
  return weekRangeDates(weekStartStr).includes(dateStr);
}

/**
 * Default week to open: the coming week if today is Wed-Sun, otherwise the
 * current week (Mon/Tue) — per the agreed rule. Returns a Monday date string.
 */
export function defaultWeekStart(today = new Date()) {
  const day = today.getDay(); // 0=Sun..6=Sat
  const monday = mondayOf(today);
  const isWedToSun = day === 0 || day === 3 || day === 4 || day === 5 || day === 6;
  return toDateStr(isWedToSun ? addDays(monday, 7) : monday);
}

export function fmtDDMM(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

export function fmtDDMMYYYY(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** "21/09" for a single day, "21/09 - 23/09" for a multi-day span. */
export function formatDateRange(start, end) {
  if (!start) return '';
  if (!end || end === start) return fmtDDMM(start);
  return `${fmtDDMM(start)} - ${fmtDDMM(end)}`;
}
