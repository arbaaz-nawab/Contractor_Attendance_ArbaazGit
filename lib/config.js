/**
 * Goodenough College — Engineer list and line manager mapping.
 * Update this file to reflect the actual org structure.
 * Safe to import from both client (pages/components) and server (API routes).
 */

export const ENGINEERS = [
  'Chris (Krzysztof)',
  'David',
  'Donnel',
  'Frankie Sheekey',
  'Louis',
  'Lukasz',
  'Phil',
  'Phil B',
  'Shrek',
  'Omar',
];

export const MANAGERS = [
  'Arbaaz Nawab',
  'Dean Marsh',
  'Frankie Sheekey',
  'Laurel Anderson',
];

// Each engineer must be assigned to exactly one line manager.
// Used by the dashboard to build per-manager approval queues.
export const ENGINEER_MANAGER_MAP = {
  'Chris (Krzysztof)': 'Arbaaz Nawab',
  'David':             'Dean Marsh',
  'Donnel':            'Arbaaz Nawab',
  'Frankie Sheekey':   'Arbaaz Nawab',
  'Louis':             'Arbaaz Nawab',
  'Lukasz':            'Arbaaz Nawab',
  'Phil':              'Arbaaz Nawab',
  'Phil B':            'Arbaaz Nawab',
  'Shrek':             'Arbaaz Nawab',
  'Omar':              'Arbaaz Nawab',
};
