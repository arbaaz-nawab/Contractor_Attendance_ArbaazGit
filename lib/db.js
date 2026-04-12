/**
 * Supabase database layer.
 *
 * Drop-in replacement for lib/excel.js — exports the exact same function
 * signatures so no API routes need logic changes.
 *
 * Set in .env.local (and Vercel env vars):
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

// ─────────────────────────────────────────────────────────────────────────────
// Column mappers: Supabase snake_case ↔ legacy Title Case (Excel header) keys
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
  };
}

function contractorObjToRow(data) {
  const row = {};
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
  };
  for (const [legacy, col] of Object.entries(map)) {
    if (data[legacy] !== undefined) row[col] = data[legacy];
  }
  return row;
}

function overtimeRowToObj(r) {
  return {
    _row:                r.id,
    'Engineer Name':     r.engineer_name || '',
    'Start Timestamp':   r.start_timestamp || '',
    'End Timestamp':     r.end_timestamp || '',
    'Work Description':  r.work_description || '',
    'Image Path':        r.image_path || '',
    'Status':            r.status || '',
    'Approval Status':   r.approval_status || '',
    'Approved By':       r.approved_by || '',
    'Approval Timestamp': r.approval_timestamp || '',
    'Notes':             r.notes || '',
    'Adjusted Duration': r.adjusted_duration || '',
  };
}

function overtimeObjToRow(data) {
  const row = {};
  const map = {
    'Engineer Name':      'engineer_name',
    'Start Timestamp':    'start_timestamp',
    'End Timestamp':      'end_timestamp',
    'Work Description':   'work_description',
    'Image Path':         'image_path',
    'Status':             'status',
    'Approval Status':    'approval_status',
    'Approved By':        'approved_by',
    'Approval Timestamp': 'approval_timestamp',
    'Notes':              'notes',
    'Adjusted Duration':  'adjusted_duration',
  };
  for (const [legacy, col] of Object.entries(map)) {
    if (data[legacy] !== undefined) row[col] = data[legacy];
  }
  return row;
}

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
  const supabase = getClient();
  const { data, error } = await supabase
    .from('contractor_log')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(contractorRowToObj);
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
  const supabase = getClient();
  const { data, error } = await supabase
    .from('contractor_log')
    .select('*')
    .ilike('company_name', companyName.trim());
  if (error) throw new Error(error.message);

  const rows = (data || []).map(contractorRowToObj);
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

// ─────────────────────────────────────────────────────────────────────────────
// engineer_overtime
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllOvertimeRows() {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('engineer_overtime')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(overtimeRowToObj);
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
  }));
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
  const supabase = getClient();
  const { data, error } = await supabase
    .from('contractor_compliance')
    .select('*')
    .order('company_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map(complianceRowToObj);
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
