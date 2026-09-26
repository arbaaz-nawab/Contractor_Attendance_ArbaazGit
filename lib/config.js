/**
 * Goodenough College — Engineer list and approver configuration.
 *
 * APPROVAL MODEL (team-based, single approval):
 *   • Each engineer belongs to one line manager's team (see TEAMS below).
 *   • Only that engineer's line manager can approve their overtime.
 *   • OVERRIDE_APPROVER can approve ANY engineer — used when a line manager
 *     is on leave, or for engineers not assigned to a team.
 *   • One approval is enough: PENDING -> FULLY APPROVED.
 */

export const ENGINEERS = [
  'David Onyenuforo',
  'Donnel Lewis',
  'Ethan Relf',
  'Krzysztof Niemalec',
  'Louis Ridley-Campbell',
  'Lukasz Sawicki',
  'Omar Ahmed',
  'Philip Abiodun',
  'Philip Bostock',
  'Slawomir Kwiatkowski',
  'William Owusu',

];

// ── Team assignment: line manager -> engineers they approve ────────────────
// To move an engineer, cut their name from one array and paste into the other.
export const TEAMS = {
  'Chris Vasta': [
    'David Onyenuforo',
    'Donnel Lewis',
    'Ethan Relf',
    'Krzysztof Niemalec',
    'Louis Ridley-Campbell',
  ],
  // Previously Dean Marsh's team; transferred to Sarfraz Arfan when Dean left.
  'Sarfraz Arfan': [
    'Lukasz Sawicki',
    'Omar Ahmed',
    'Philip Abiodun',
    'Philip Bostock',
    'Slawomir Kwiatkowski',
    'William Owusu',
  ],
};

// Senior line manager — can approve on any other manager's behalf (e.g. annual
// leave), and is the only approver for engineers not listed in any team.
// Also runs a team of his own, listed in TEAMS above.
export const OVERRIDE_APPROVER = 'Sarfraz Arfan';

// Everyone who may appear in the Approvals tab manager dropdown.
// Deduped: OVERRIDE_APPROVER also holds a team, so he appears in both sources.
export const APPROVERS = [
  ...new Set([...Object.keys(TEAMS), OVERRIDE_APPROVER]),
];

/** Returns the line manager for an engineer, or '' if unassigned. */
export function getLineManager(engineerName) {
  const target = String(engineerName || '').trim().toLowerCase();
  for (const [manager, team] of Object.entries(TEAMS)) {
    if (team.some((e) => e.trim().toLowerCase() === target)) return manager;
  }
  return '';
}

/** True if managerName is allowed to approve overtime for engineerName. */
export function canApprove(managerName, engineerName) {
  if (!managerName) return false;
  if (managerName === OVERRIDE_APPROVER) return true;
  return getLineManager(engineerName) === managerName;
}

// Engineers with no line manager — only OVERRIDE_APPROVER can approve these.
export const UNASSIGNED_ENGINEERS = ENGINEERS.filter((e) => !getLineManager(e));

// Week start day for the Weekly Duty Rota — payroll runs Monday–Sunday
export const WEEK_START_DAY = 1;

// All managers — used in amend/delete modals. Primary source is Supabase managers table.
export const MANAGERS = [
  'Arbaaz Nawab',
  'Chris Vasta',
  'Sarfraz Arfan',

];

// ── Planned Works — Estates weekly planned-works sheet ──────────────────────
// Separate from MANAGERS (the PIN/amend-dropdown list above): this is who may
// be picked as "entered by" / "edited by" on the Planned Works tab. Any of
// them can add or edit any row — there is no per-manager restriction here.
export const PLANNED_WORKS_MANAGERS = [
  'Arbaaz Nawab',
  'Chris Vasta',
  'Margarita Miller',
  'Sarfraz Arfan',
];

// Downloads the weekly Excel export and emails it on, manually, outside this
// app — no email sending is built into the Planned Works tab.
export const PLANNED_WORKS_ADMIN = 'Umayma Chakour';

// Fixed dropdown choices for the Planned Works row form. The full label
// (abbreviation included) is what gets stored in planned_works.building_name.
export const PLANNED_WORKS_BUILDINGS = [
  'Goodenough Hotel (GH)',
  'London House (LH)',
  'The Georgian houses (TGH)',
  'William Goodenough House (WGH)',
];
export const PLANNED_WORKS_EVENTS_OPTIONS = ['Yes', 'No', 'Not applicable'];
export const PLANNED_WORKS_RAMS_OPTIONS   = ['Yes', 'No'];
// "Name of person in charge" — the four managers plus the admin, one list.
export const PLANNED_WORKS_PEOPLE = [...PLANNED_WORKS_MANAGERS, PLANNED_WORKS_ADMIN];

// Rows saved before these fields became dropdowns hold older values ('Y'/'N',
// 'N/A', 'London House'). Map them onto the current options where the meaning
// is unambiguous; anything else is returned unchanged (never guessed at).
export function normalisePlannedWorksRams(v) {
  const s = String(v || '').trim();
  if (/^y(es)?$/i.test(s)) return 'Yes';
  if (/^no?$/i.test(s)) return 'No';
  return s;
}
export function normalisePlannedWorksEvents(v) {
  const s = String(v || '').trim();
  if (/^y(es)?$/i.test(s)) return 'Yes';
  if (/^no?$/i.test(s)) return 'No';
  if (/^(n\/a|na|not applicable)$/i.test(s)) return 'Not applicable';
  return s;
}
export function normalisePlannedWorksBuilding(v) {
  const s = String(v || '').trim();
  const hit = PLANNED_WORKS_BUILDINGS.find(
    (b) => b.toLowerCase() === s.toLowerCase() || b.replace(/\s*\([A-Z]+\)$/, '').toLowerCase() === s.toLowerCase()
  );
  return hit || s;
}
