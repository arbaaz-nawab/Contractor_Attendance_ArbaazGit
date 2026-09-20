/**
 * Supabase database layer.
 * Drop-in replacement for lib/excel.js — same function signatures.
 *
 * Required env vars (set in .env.local and Vercel):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_ANON_KEY
 */
import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ANON_KEY must be set.');
  return createClient(url, key);
}

// PostgREST (Supabase's REST layer) caps a single response at this many rows
// (`db-max-rows`) regardless of how many match the query — a query that can
// return more must page with .range() or it silently truncates. Exported so
// scripts/test-pagination.js can exercise the real cap with a mock.
export const MAX_PAGE_ROWS = 1000;

/**
 * Runs a Supabase query to completion by paging with .range(). Use for any
 * query that lists a whole table or an unbounded filtered slice of one —
 * anything that could plausibly grow past MAX_PAGE_ROWS rows (see BACKLOG B5
 * / MEMORY.md 2026-09-20, where contractor_log crossing this exact limit
 * silently dropped rows from the dashboard).
 *
 * `buildQuery(supabase)` must return a fully filtered, ordered query with NO
 * .range()/.limit() of its own. The order MUST resolve to a unique, stable
 * key (e.g. `id`, or a compound order that ends in a unique column) — without
 * one, Postgres doesn't guarantee the same row order across the separate
 * requests this makes, and pages could silently skip or duplicate rows at
 * the boundary.
 */
async function fetchAllRows(buildQuery) {
  const supabase = getClient();
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(supabase).range(from, from + MAX_PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    all.push(...(data || []));
    if (!data || data.length < MAX_PAGE_ROWS) break;
    from += MAX_PAGE_ROWS;
  }
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// contractor_log row mappers
// ─────────────────────────────────────────────────────────────────────────────

function contractorRowToObj(r) {
  return {
    _row:                    r.id,
    'Date':                  r.date || '',
    'Company Name':          r.company_name || '',
    'Operative Name':        r.operative_name || '',
    'ID Number':             r.id_number || '',
    'Buildings':             r.buildings || '',
    'Point of Contact':      r.point_of_contact || '',
    'Contact Number':        r.contact_number || '',
    'RAMS Submitted':        r.rams_submitted || '',
    'Declaration Confirmed': r.declaration_confirmed || '',
    'Sign-In Time':          r.sign_in_time || '',
    'Sign-Out Time':         r.sign_out_time || '',
    'Work Completed':        r.work_completed || '',
    'Status':                r.status || '',
    'Photo URL':             r.photo_url || '',
    'Contractor Type':       r.contractor_type || '',
    'Permit Required':       r.permit_required || '',
    'Permit Types':          r.permit_types || '',
    'Fire Safety Affected':  r.fire_safety_affected || '',
    'Asbestos Checked':      r.asbestos_checked || '',
    'RAMS Approved':         r.rams_approved || '',
    'Induction Complete':    r.induction_complete || '',
    'Insurance Valid':       r.insurance_valid || '',
    'Last RAMS Review Date': r.last_rams_review_date || '',
    'Last Induction Date':   r.last_induction_date || '',
    'Last Compliance Date':  r.last_compliance_date || '',
    'Amended By':            r.amended_by || '',
    'Amended At':            r.amended_at || '',
  };
}

function contractorObjToRow(data) {
  const map = {
    'Date':                  'date',
    'Company Name':          'company_name',
    'Operative Name':        'operative_name',
    'ID Number':             'id_number',
    'Buildings':             'buildings',
    'Point of Contact':      'point_of_contact',
    'Contact Number':        'contact_number',
    'RAMS Submitted':        'rams_submitted',
    'Declaration Confirmed': 'declaration_confirmed',
    'Sign-In Time':          'sign_in_time',
    'Sign-Out Time':         'sign_out_time',
    'Work Completed':        'work_completed',
    'Status':                'status',
    'Photo URL':             'photo_url',
    'Contractor Type':       'contractor_type',
    'Permit Required':       'permit_required',
    'Permit Types':          'permit_types',
    'Fire Safety Affected':  'fire_safety_affected',
    'Asbestos Checked':      'asbestos_checked',
    'RAMS Approved':         'rams_approved',
    'Induction Complete':    'induction_complete',
    'Insurance Valid':       'insurance_valid',
    'Last RAMS Review Date': 'last_rams_review_date',
    'Last Induction Date':   'last_induction_date',
    'Last Compliance Date':  'last_compliance_date',
    'Amended By':            'amended_by',
    'Amended At':            'amended_at',
  };
  const row = {};
  for (const [legacy, col] of Object.entries(map)) {
    if (data[legacy] !== undefined) row[col] = data[legacy];
  }
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// engineer_overtime row mappers (includes dual-approval columns)
// ─────────────────────────────────────────────────────────────────────────────

function overtimeRowToObj(r) {
  return {
    _row:                      r.id,
    'Engineer Name':           r.engineer_name || '',
    'Start Timestamp':         r.start_timestamp || '',
    'End Timestamp':           r.end_timestamp || '',
    'Work Description':        r.work_description || '',
    'Image Path':              r.image_path || '',
    'Status':                  r.status || '',
    'Approval Status':         r.approval_status || '',
    'Approved By':             r.approved_by || '',
    'Approval Timestamp':      r.approval_timestamp || '',
    'Notes':                   r.notes || '',
    'Adjusted Duration':       r.adjusted_duration || '',
    'Approved By Dean':        r.approved_by_dean || '',
    'Approved By Laurel':      r.approved_by_laurel || '',
    'Dean Approval Timestamp': r.dean_approval_timestamp || '',
    'Laurel Approval Timestamp': r.laurel_approval_timestamp || '',
  };
}

function overtimeObjToRow(data) {
  const map = {
    'Engineer Name':             'engineer_name',
    'Start Timestamp':           'start_timestamp',
    'End Timestamp':             'end_timestamp',
    'Work Description':          'work_description',
    'Image Path':                'image_path',
    'Status':                    'status',
    'Approval Status':           'approval_status',
    'Approved By':               'approved_by',
    'Approval Timestamp':        'approval_timestamp',
    'Notes':                     'notes',
    'Adjusted Duration':         'adjusted_duration',
    'Approved By Dean':          'approved_by_dean',
    'Approved By Laurel':        'approved_by_laurel',
    'Dean Approval Timestamp':   'dean_approval_timestamp',
    'Laurel Approval Timestamp': 'laurel_approval_timestamp',
  };
  const row = {};
  for (const [legacy, col] of Object.entries(map)) {
    if (data[legacy] !== undefined) row[col] = data[legacy];
  }
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// contractor_compliance row mapper
// ─────────────────────────────────────────────────────────────────────────────

function complianceRowToObj(r) {
  return {
    _row:              r.id,
    'Company Name':    r.company_name || '',
    'RAMS Date':       r.rams_date || '',
    'Induction Date':  r.induction_date || '',
    'Insurance Date':  r.insurance_date || '',
    'RAMS Expiry':     r.rams_expiry || '',
    'Induction Expiry': r.induction_expiry || '',
    'Insurance Expiry': r.insurance_expiry || '',
    'Document Path':   r.document_path || '',
    'Updated By':      r.updated_by || '',
    'Updated At':      r.updated_at || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// contractor_log
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllRows() {
  const data = await fetchAllRows((supabase) =>
    supabase.from('contractor_log').select('*').order('id', { ascending: true })
  );
  return data.map(contractorRowToObj);
}

export async function appendRow(rowData) {
  const supabase = getClient();
  const { error } = await supabase
    .from('contractor_log')
    .insert(contractorObjToRow(rowData));
  if (error) throw new Error(error.message);
}

export async function updateRow(id, updates) {
  const supabase = getClient();
  const { error } = await supabase
    .from('contractor_log')
    .update(contractorObjToRow(updates))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteContractorRow(id) {
  const supabase = getClient();
  const { error } = await supabase
    .from('contractor_log')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getContractorRowById(id) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('contractor_log')
    .select('*')
    .eq('id', id)
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? contractorRowToObj(data[0]) : null;
}

/**
 * contractor_log rows with date in [dateFrom, dateTo], optionally filtered
 * by company — the server-side equivalent of what pages/api/dashboard.js
 * used to do by downloading the whole table via getAllRows() and filtering
 * in JS. Pushing the date/company filter into the query keeps the common
 * case (today only, every 60s auto-refresh) small instead of re-fetching
 * the entire table on every poll; still paged via fetchAllRows for
 * correctness if a manager picks a wide custom range.
 */
export async function getRowsInDateRange(dateFrom, dateTo, company) {
  const data = await fetchAllRows((supabase) => {
    let query = supabase
      .from('contractor_log')
      .select('*')
      .gte('date', dateFrom)
      .lte('date', dateTo);
    if (company) query = query.ilike('company_name', `%${company}%`);
    return query.order('id', { ascending: true });
  });
  return data.map(contractorRowToObj);
}

export async function findActiveSession(idNumber, todayDate) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('contractor_log')
    .select('*')
    .eq('id_number', String(idNumber).trim())
    .eq('status', 'Active')
    .eq('date', todayDate)
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? contractorRowToObj(data[0]) : null;
}

export async function getRowsByDate(date, company) {
  const supabase = getClient();
  let query = supabase
    .from('contractor_log')
    .select('*')
    .eq('date', date);
  if (company) query = query.ilike('company_name', `%${company}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(contractorRowToObj);
}

export async function findCompanyHistory(companyName) {
  const data = await fetchAllRows((supabase) =>
    supabase
      .from('contractor_log')
      .select('*')
      .ilike('company_name', companyName.trim())
      .order('id', { ascending: true })
  );

  const rows = data.map(contractorRowToObj);
  if (rows.length === 0) return null;

  let lastRAMSDate = null, lastInductionDate = null, lastComplianceDate = null;

  for (const r of rows) {
    if (r['Last RAMS Review Date'] && (!lastRAMSDate || r['Last RAMS Review Date'] > lastRAMSDate))
      lastRAMSDate = r['Last RAMS Review Date'];
    else if ((r['RAMS Approved'] === 'Yes' || r['RAMS Submitted'] === 'Yes') && r['Date'])
      if (!lastRAMSDate || r['Date'] > lastRAMSDate) lastRAMSDate = r['Date'];

    if (r['Last Induction Date'] && (!lastInductionDate || r['Last Induction Date'] > lastInductionDate))
      lastInductionDate = r['Last Induction Date'];
    else if (r['Induction Complete'] === 'Yes' && r['Date'])
      if (!lastInductionDate || r['Date'] > lastInductionDate) lastInductionDate = r['Date'];

    if (r['Last Compliance Date'] && (!lastComplianceDate || r['Last Compliance Date'] > lastComplianceDate))
      lastComplianceDate = r['Last Compliance Date'];
    else if (r['Insurance Valid'] === 'Yes' && r['Date'])
      if (!lastComplianceDate || r['Date'] > lastComplianceDate) lastComplianceDate = r['Date'];
  }

  return {
    found: true,
    rowCount: rows.length,
    lastRAMSReviewDate: lastRAMSDate,
    lastInductionDate,
    lastComplianceDate,
  };
}

/**
 * Returns distinct operative names that match a partial string (case-insensitive).
 * Used for autocomplete in the sign-in form.
 */
export async function getOperativeNameSuggestions(partial) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('contractor_log')
    .select('operative_name')
    .ilike('operative_name', `%${partial.trim()}%`)
    .limit(20);
  if (error) return [];
  const seen = new Set();
  const names = [];
  for (const r of data || []) {
    const n = (r.operative_name || '').trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (!seen.has(key)) { seen.add(key); names.push(n); }
  }
  return names.slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// operative_induction (per-person induction tracking)
// ─────────────────────────────────────────────────────────────────────────────

export async function getOperativeInduction(operativeName) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('operative_induction')
    .select('*')
    .ilike('operative_name', operativeName.trim())
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0] : null;
}

export async function upsertOperativeInduction(operativeName, rowData) {
  const supabase = getClient();
  const { error } = await supabase
    .from('operative_induction')
    .upsert(
      {
        operative_name:   operativeName.trim(),
        company_name:     rowData.company_name || '',
        induction_date:   rowData.induction_date || '',
        induction_expiry: rowData.induction_expiry || '',
        updated_at:       rowData.updated_at || '',
      },
      { onConflict: 'operative_name' }
    );
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// engineer_overtime
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllOvertimeRows() {
  const data = await fetchAllRows((supabase) =>
    supabase.from('engineer_overtime').select('*').order('id', { ascending: true })
  );
  return data.map(overtimeRowToObj);
}

export async function appendOvertimeRow(rowData) {
  const supabase = getClient();
  const { error } = await supabase
    .from('engineer_overtime')
    .insert(overtimeObjToRow(rowData));
  if (error) throw new Error(error.message);
}

export async function updateOvertimeRow(id, updates) {
  const supabase = getClient();
  const { error } = await supabase
    .from('engineer_overtime')
    .update(overtimeObjToRow(updates))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteOvertimeRow(id) {
  const supabase = getClient();
  const { error } = await supabase
    .from('engineer_overtime')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function findActiveOvertimeSession(engineerName) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('engineer_overtime')
    .select('*')
    .eq('engineer_name', engineerName.trim())
    .eq('status', 'ACTIVE')
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? overtimeRowToObj(data[0]) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// shift_log row mapper (daily engineer shift, separate from overtime)
// ─────────────────────────────────────────────────────────────────────────────

function shiftRowToObj(r) {
  return {
    _row:              r.id,
    'Engineer Name':   r.engineer_name || '',
    'Shift Date':      r.shift_date || '',
    'Sign-In Time':    r.sign_in_time || '',
    'Sign-Out Time':   r.sign_out_time || '',
    'Hours':           r.hours || '',
    'Status':          r.status || '',
    'Early Reason':    r.early_reason || '',
    'Early Note':      r.early_note || '',
    'Device Id':       r.device_id || '',
    'Corrected By':    r.corrected_by || '',
    'Corrected At':    r.corrected_at || '',
    'Correction Note': r.correction_note || '',
  };
}

function shiftObjToRow(data) {
  const map = {
    'Engineer Name':   'engineer_name',
    'Shift Date':      'shift_date',
    'Sign-In Time':    'sign_in_time',
    'Sign-Out Time':   'sign_out_time',
    'Hours':           'hours',
    'Status':          'status',
    'Early Reason':    'early_reason',
    'Early Note':      'early_note',
    'Device Id':       'device_id',
    'Corrected By':    'corrected_by',
    'Corrected At':    'corrected_at',
    'Correction Note': 'correction_note',
  };
  const row = {};
  for (const [legacy, col] of Object.entries(map)) {
    if (data[legacy] !== undefined) row[col] = data[legacy];
  }
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// shift_log
// ─────────────────────────────────────────────────────────────────────────────

export async function appendShiftRow(rowData) {
  const supabase = getClient();
  const { error } = await supabase
    .from('shift_log')
    .insert(shiftObjToRow(rowData));
  if (error) throw new Error(error.message);
}

export async function updateShiftRow(id, updates) {
  const supabase = getClient();
  const { error } = await supabase
    .from('shift_log')
    .update(shiftObjToRow(updates))
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** The engineer's currently OPEN shift, if any (not date-scoped — an OPEN
 *  shift left over from an earlier day is still "active" until flagged). */
export async function findActiveShift(engineerName) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('shift_log')
    .select('*')
    .eq('engineer_name', engineerName.trim())
    .eq('status', 'OPEN')
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? shiftRowToObj(data[0]) : null;
}

/** Any shift row (regardless of status) for this engineer on this date —
 *  used to block a second sign-in on a day already completed or flagged. */
export async function findShiftForDate(engineerName, dateStr) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('shift_log')
    .select('*')
    .eq('engineer_name', engineerName.trim())
    .eq('shift_date', dateStr)
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? shiftRowToObj(data[0]) : null;
}

/** All OPEN shifts dated on or before dateStr — used by the missing-signout
 *  cron sweep to flag today's still-open shifts plus any missed earlier ones. */
export async function getOpenShiftsUpTo(dateStr) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('shift_log')
    .select('*')
    .eq('status', 'OPEN')
    .lte('shift_date', dateStr);
  if (error) throw new Error(error.message);
  return (data || []).map(shiftRowToObj);
}

/** Flag a single shift as MISSING_SIGNOUT with no hours credited — used by
 *  the lazy fallback when an engineer opens the app past the cutoff. */
export async function markShiftMissing(id) {
  const supabase = getClient();
  const { error } = await supabase
    .from('shift_log')
    .update({ status: 'MISSING_SIGNOUT', hours: '' })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Flag many shifts as MISSING_SIGNOUT at once — used by the cron sweep. */
export async function markShiftsMissing(ids) {
  if (!ids || ids.length === 0) return;
  const supabase = getClient();
  const { error } = await supabase
    .from('shift_log')
    .update({ status: 'MISSING_SIGNOUT', hours: '' })
    .in('id', ids);
  if (error) throw new Error(error.message);
}

/** A single shift row by id — used when correcting a specific shift. */
export async function getShiftById(id) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('shift_log')
    .select('*')
    .eq('id', id)
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? shiftRowToObj(data[0]) : null;
}

/**
 * All shift rows with shift_date in [fromDate, toDate] — used by the
 * dashboard Attendance tab (Week/Month views fetch a date range once).
 * statuses, if given, restricts to those Status values (e.g. the Live view
 * only wants OPEN/MISSING_SIGNOUT, not the full history).
 */
export async function getShiftRowsInRange(fromDate, toDate, statuses) {
  const data = await fetchAllRows((supabase) => {
    let query = supabase
      .from('shift_log')
      .select('*')
      .gte('shift_date', fromDate)
      .lte('shift_date', toDate)
      .order('shift_date', { ascending: true })
      .order('engineer_name', { ascending: true })
      .order('id', { ascending: true });
    if (statuses && statuses.length > 0) query = query.in('status', statuses);
    return query;
  });
  return data.map(shiftRowToObj);
}

// ─────────────────────────────────────────────────────────────────────────────
// managers
// ─────────────────────────────────────────────────────────────────────────────

export async function getManagers() {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('managers')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    _row:           r.id,
    'Manager Name': r.manager_name || '',
    'Manager Pin':  r.manager_pin  || '',
    'Email':        r.email        || '',
  }));
}

/** Returns array of { name, email } for managers who have an email set. */
export async function getManagerEmails() {
  const managers = await getManagers();
  return managers
    .filter((m) => m['Email'])
    .map((m) => ({ name: m['Manager Name'], email: m['Email'] }));
}

export async function getManagerPin(managerName) {
  // 1. Supabase managers table
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

  // 3. Universal fallback
  return process.env.APPROVAL_PIN || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// contractor_compliance
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllComplianceRows() {
  const data = await fetchAllRows((supabase) =>
    supabase
      .from('contractor_compliance')
      .select('*')
      .order('company_name', { ascending: true })
      .order('id', { ascending: true })
  );
  return data.map(complianceRowToObj);
}

export async function getComplianceForCompany(companyName) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('contractor_compliance')
    .select('*')
    .ilike('company_name', companyName.trim())
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? complianceRowToObj(data[0]) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// weekly_rota
// ─────────────────────────────────────────────────────────────────────────────

export async function getRotaEntries(fromDate, toDate) {
  const supabase = getClient();
  let query = supabase
    .from('weekly_rota')
    .select('*')
    .order('week_start_date', { ascending: true })
    .order('engineer_name',   { ascending: true });
  if (fromDate) query = query.gte('week_start_date', fromDate);
  if (toDate)   query = query.lte('week_start_date', toDate);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function setRotaWeek(weekStartDate, weekEndDate, engineerNames, managerName) {
  const supabase = getClient();
  const { error: delError } = await supabase
    .from('weekly_rota')
    .delete()
    .eq('week_start_date', weekStartDate);
  if (delError) throw new Error(delError.message);
  if (engineerNames && engineerNames.length > 0) {
    const rows = engineerNames.map((name) => ({
      week_start_date: weekStartDate,
      week_end_date:   weekEndDate,
      engineer_name:   name,
      assigned_by:     managerName || '',
      assigned_at:     new Date().toISOString(),
    }));
    const { error: insError } = await supabase.from('weekly_rota').insert(rows);
    if (insError) throw new Error(insError.message);
  }
}

export async function confirmRotaWeek(weekStartDate, managerName) {
  const supabase = getClient();
  const { error } = await supabase
    .from('weekly_rota')
    .update({ confirmed_by: managerName, confirmed_at: new Date().toISOString() })
    .eq('week_start_date', weekStartDate);
  if (error) throw new Error(error.message);
}

export async function deleteComplianceRow(id) {
  const supabase = getClient();
  const { error } = await supabase
    .from('contractor_compliance')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function upsertComplianceRow(companyName, rowData) {
  const supabase = getClient();
  const row = {
    company_name:     companyName,
    rams_date:        rowData['RAMS Date']        || '',
    induction_date:   rowData['Induction Date']   || '',
    insurance_date:   rowData['Insurance Date']   || '',
    rams_expiry:      rowData['RAMS Expiry']       || '',
    induction_expiry: rowData['Induction Expiry'] || '',
    insurance_expiry: rowData['Insurance Expiry'] || '',
    document_path:    rowData['Document Path']    || '',
    updated_by:       rowData['Updated By']       || '',
    updated_at:       rowData['Updated At']       || '',
  };
  const { error } = await supabase
    .from('contractor_compliance')
    .upsert(row, { onConflict: 'company_name' });
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// parking_bookings / parking_staff / parking_history
//
// No Excel-era legacy for this feature, so — unlike contractor_log /
// engineer_overtime / contractor_compliance above — these return plain
// camelCase objects directly rather than the 'Title Case' mapper shape.
// Matches the precedent already set by weekly_rota (also a post-migration
// table with no mapper layer).
// ─────────────────────────────────────────────────────────────────────────────

export function dedupeNames(list) {
  const seen = new Set();
  const out = [];
  for (const n of list) {
    const trimmed = (n || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(trimmed); }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function parkingBookingToObj(r) {
  return {
    id:           r.id,
    requester:    r.requester || '',
    projectCode:  r.project_code || '',
    company:      r.company || '',
    bookingDate:  r.booking_date || '',
    durationType: r.duration_type || '',
    vehicleReg:   r.vehicle_reg || '',
    bookedBy:     r.booked_by || '',
    requestedAt:  r.requested_at || '',
    bookedAt:     r.booked_at || '',
    status:       r.status || '',
  };
}

export async function getParkingBookings({ dateFrom, dateTo, status, company, search } = {}) {
  const data = await fetchAllRows((supabase) => {
    let query = supabase.from('parking_bookings').select('*');
    if (dateFrom) query = query.gte('booking_date', dateFrom);
    if (dateTo)   query = query.lte('booking_date', dateTo);
    if (status)   query = query.eq('status', status);
    if (company)  query = query.ilike('company', `%${company}%`);
    return query.order('booking_date', { ascending: true }).order('id', { ascending: true });
  });

  let rows = data.map(parkingBookingToObj);
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    rows = rows.filter((r) =>
      r.projectCode.toLowerCase().includes(s) ||
      r.company.toLowerCase().includes(s) ||
      r.vehicleReg.toLowerCase().includes(s) ||
      r.requester.toLowerCase().includes(s)
    );
  }
  return rows;
}

export async function getParkingBookingById(id) {
  const supabase = getClient();
  const { data, error } = await supabase.from('parking_bookings').select('*').eq('id', id).limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? parkingBookingToObj(data[0]) : null;
}

/** True if another non-cancelled booking already has this reg on this date. */
export async function findParkingConflict(vehicleReg, bookingDate, excludeId) {
  const supabase = getClient();
  let query = supabase
    .from('parking_bookings')
    .select('id')
    .eq('vehicle_reg', vehicleReg)
    .eq('booking_date', bookingDate)
    .neq('status', 'Cancelled');
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  return !!(data && data.length > 0);
}

export async function createParkingBooking(fields) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('parking_bookings')
    .insert({
      requester:     fields.requester,
      project_code:  fields.projectCode,
      company:       fields.company,
      booking_date:  fields.bookingDate,
      duration_type: fields.durationType,
      vehicle_reg:   fields.vehicleReg,
      booked_by:     fields.bookedBy,
      requested_at:  fields.requestedAt,
      booked_at:     '',
      status:        'Requested',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return parkingBookingToObj(data);
}

export async function updateParkingBooking(id, updates) {
  const supabase = getClient();
  const map = {
    requester: 'requester', projectCode: 'project_code', company: 'company',
    bookingDate: 'booking_date', durationType: 'duration_type', vehicleReg: 'vehicle_reg',
    status: 'status', bookedAt: 'booked_at',
  };
  const row = {};
  for (const [k, col] of Object.entries(map)) {
    if (updates[k] !== undefined) row[col] = updates[k];
  }
  const { error } = await supabase.from('parking_bookings').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Used only to roll back a just-created booking whose parking_history
 *  insert failed — see pages/api/parking-save.js. */
export async function deleteParkingBooking(id) {
  const supabase = getClient();
  const { error } = await supabase.from('parking_bookings').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getDistinctParkingRequesters() {
  try {
    const data = await fetchAllRows((supabase) =>
      supabase.from('parking_bookings').select('id, requester').order('id', { ascending: true })
    );
    return dedupeNames(data.map((r) => r.requester));
  } catch {
    return [];
  }
}

export async function getDistinctParkingCompanies() {
  try {
    const data = await fetchAllRows((supabase) =>
      supabase.from('parking_bookings').select('id, company').order('id', { ascending: true })
    );
    return dedupeNames(data.map((r) => r.company));
  } catch {
    return [];
  }
}

/** Company names already known from the contractor side of the app — read
 *  only, no link/FK back to contractor_log, purely for suggestion text. */
export async function getKnownContractorCompanies() {
  try {
    const [logRows, compRows] = await Promise.all([
      fetchAllRows((supabase) => supabase.from('contractor_log').select('id, company_name').order('id', { ascending: true })),
      fetchAllRows((supabase) => supabase.from('contractor_compliance').select('id, company_name').order('id', { ascending: true })),
    ]);
    return dedupeNames([
      ...logRows.map((r) => r.company_name),
      ...compRows.map((r) => r.company_name),
    ]);
  } catch {
    return [];
  }
}

export async function getParkingHistory(bookingId) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('parking_history')
    .select('*')
    .eq('booking_id', bookingId)
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id:         r.id,
    changedBy:  r.changed_by,
    changedAt:  r.changed_at,
    changeType: r.change_type,
    changes:    r.changes ? JSON.parse(r.changes) : null,
  }));
}

export async function addParkingHistory(entry) {
  const supabase = getClient();
  const { error } = await supabase.from('parking_history').insert({
    booking_id:  entry.bookingId,
    changed_by:  entry.changedBy,
    changed_at:  entry.changedAt,
    change_type: entry.changeType,
    changes:     entry.changes ? JSON.stringify(entry.changes) : null,
  });
  if (error) throw new Error(error.message);
}

// ── parking_staff ───────────────────────────────────────────────────────────

export async function getParkingStaff(includeInactive = false) {
  const supabase = getClient();
  let query = supabase.from('parking_staff').select('*').order('name', { ascending: true });
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({ id: r.id, name: r.name, active: r.active }));
}

/** Adds a new staff name, or reactivates one previously removed — avoids
 *  creating a duplicate row when the same name is added back later. */
export async function addOrRestoreParkingStaff(name) {
  const supabase = getClient();
  const trimmed = name.trim();

  const { data: existing, error: findErr } = await supabase
    .from('parking_staff').select('*').ilike('name', trimmed).limit(1);
  if (findErr) throw new Error(findErr.message);

  if (existing && existing.length > 0) {
    const { error } = await supabase.from('parking_staff').update({ active: true }).eq('id', existing[0].id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('parking_staff').insert({ name: trimmed, active: true });
  if (error) {
    // A concurrent add can win the race between the select above and this
    // insert — the unique index rejects the second one; treat as success.
    if (error.message && error.message.toLowerCase().includes('duplicate key')) return;
    throw new Error(error.message);
  }
}

/** Soft-remove: bookings store names as plain text, never a foreign key, so
 *  this never affects historical rows. */
export async function removeParkingStaff(name) {
  const supabase = getClient();
  const { error } = await supabase
    .from('parking_staff')
    .update({ active: false })
    .ilike('name', name.trim());
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// planned_works / planned_works_oncall
//
// No Excel-era legacy here either — same plain-camelCase convention as the
// parking_* functions above, following the weekly_rota precedent.
// ─────────────────────────────────────────────────────────────────────────────

function plannedWorksRowToObj(r) {
  return {
    id:                 r.id,
    weekStart:          r.week_start,
    companyName:        r.company_name || '',
    description:        r.description || '',
    buildingName:       r.building_name || '',
    startDate:          r.start_date || '',
    endDate:            r.end_date || '',
    location:           r.location || '',
    personInCharge:     r.person_in_charge || '',
    ramsSignedOff:      r.rams_signed_off || '',
    eventsTeamNotified: r.events_team_notified || '',
    parkingRequired:    r.parking_required || '',
    comments:           r.comments || '',
    addedBy:            r.added_by || '',
    createdAt:          r.created_at || '',
    lastEditedBy:       r.last_edited_by || '',
    lastEditedAt:       r.last_edited_at || '',
    reviewStatus:       r.review_status || '',
    carriedFromId:      r.carried_from_id || null,
    deletedAt:          r.deleted_at || null,
  };
}

/** All non-deleted rows for one Monday-based week, sorted by start date
 *  (undated rows last) then company name. */
export async function getPlannedWorksForWeek(weekStart) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('planned_works')
    .select('*')
    .eq('week_start', weekStart)
    .is('deleted_at', null)
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('company_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(plannedWorksRowToObj);
}

export async function getPlannedWorksRowById(id) {
  const supabase = getClient();
  const { data, error } = await supabase.from('planned_works').select('*').eq('id', id).limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? plannedWorksRowToObj(data[0]) : null;
}

export async function createPlannedWorksRow(fields) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('planned_works')
    .insert({
      week_start:           fields.weekStart,
      company_name:         fields.companyName,
      description:          fields.description,
      building_name:        fields.buildingName || '',
      start_date:           fields.startDate || '',
      end_date:             fields.endDate || '',
      location:             fields.location || '',
      person_in_charge:     fields.personInCharge || '',
      rams_signed_off:      fields.ramsSignedOff || '',
      events_team_notified: fields.eventsTeamNotified || '',
      parking_required:     fields.parkingRequired || '',
      comments:             fields.comments || '',
      added_by:             fields.addedBy,
      created_at:           fields.createdAt || '',
      carried_from_id:      fields.carriedFromId || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return plannedWorksRowToObj(data);
}

export async function updatePlannedWorksRow(id, updates) {
  const supabase = getClient();
  const map = {
    companyName: 'company_name', description: 'description', buildingName: 'building_name',
    startDate: 'start_date', endDate: 'end_date', location: 'location',
    personInCharge: 'person_in_charge', ramsSignedOff: 'rams_signed_off',
    eventsTeamNotified: 'events_team_notified', parkingRequired: 'parking_required',
    comments: 'comments', lastEditedBy: 'last_edited_by', lastEditedAt: 'last_edited_at',
    reviewStatus: 'review_status', deletedAt: 'deleted_at',
  };
  const row = {};
  for (const [k, col] of Object.entries(map)) {
    if (updates[k] !== undefined) row[col] = updates[k];
  }
  const { error } = await supabase.from('planned_works').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

/** True if a carried-over copy of sourceId already exists in targetWeek —
 *  makes the carry-over review action idempotent. */
export async function findCarriedPlannedWorksCopy(sourceId, targetWeek) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('planned_works')
    .select('id')
    .eq('carried_from_id', sourceId)
    .eq('week_start', targetWeek)
    .limit(1);
  if (error) throw new Error(error.message);
  return !!(data && data.length > 0);
}

export async function searchPlannedWorks(query) {
  const supabase = getClient();
  const q = `%${query.trim()}%`;
  const { data, error } = await supabase
    .from('planned_works')
    .select('*')
    .is('deleted_at', null)
    .or(`company_name.ilike.${q},description.ilike.${q},building_name.ilike.${q},person_in_charge.ilike.${q},comments.ilike.${q},parking_required.ilike.${q}`)
    .order('week_start', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data || []).map(plannedWorksRowToObj);
}

// ── planned_works_oncall ─────────────────────────────────────────────────────

/** { estateDutyManager: [...lines], calloutEngineers: [...lines] } for a week. */
export async function getPlannedWorksOncall(weekStart) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('planned_works_oncall')
    .select('*')
    .eq('week_start', weekStart)
    .order('group_name', { ascending: true })
    .order('line_order', { ascending: true });
  if (error) throw new Error(error.message);

  const grouped = { estateDutyManager: [], calloutEngineers: [] };
  for (const r of data || []) {
    const line = {
      dateFrom: r.date_from || '', dateTo: r.date_to || '',
      name: r.person_name || '', phone: r.phone || '',
    };
    if (r.group_name === 'Estate Duty Manager') grouped.estateDutyManager.push(line);
    else grouped.calloutEngineers.push(line);
  }
  return grouped;
}

/**
 * Full-replace save for a week's on-call lines (same pattern as
 * weekly_rota.setRotaWeek) — `lines` is a flat array of
 * `{group, order, dateFrom, dateTo, name, phone}`. Never logs phone numbers;
 * callers must not either (see pages/api/planned-works-save.js).
 */
export async function savePlannedWorksOncall(weekStart, lines, updatedBy, updatedAt) {
  const supabase = getClient();
  const { error: delError } = await supabase.from('planned_works_oncall').delete().eq('week_start', weekStart);
  if (delError) throw new Error(delError.message);
  if (!lines || lines.length === 0) return;
  const rows = lines.map((l) => ({
    week_start:  weekStart,
    group_name:  l.group,
    line_order:  l.order,
    date_from:   l.dateFrom || '',
    date_to:     l.dateTo || '',
    person_name: (l.name || '').trim(),
    phone:       (l.phone || '').trim(),
    updated_by:  updatedBy,
    updated_at:  updatedAt,
  }));
  const { error: insError } = await supabase.from('planned_works_oncall').insert(rows);
  if (insError) throw new Error(insError.message);
}
