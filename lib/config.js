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
