import { useState, useEffect, useCallback } from 'react';

// Options are alphabetical with "Other" always last
const BUILDINGS = [
  'Goodenough Hotel',
  'House 15',
  'London House',
  'William Goodenough House',
  'Other',
];

const CONTACTS = [
  'Arbaaz Nawab',
  'Dean Marsh',
  'Frankie Sheekey',
  'Laurel Anderson',
  'Other',
];

const COMPANIES = [
  'Barrier',
  'CMBS',
  'CMM Buildings',
  'Crest Lifts',
  'Florin',
  'Interim Pest Control',
  'Marshwell Firedoor',
  'Pacific Fire Alarms',
  'Pro-Door',
  'Southern Commercial Kitchen',
  'West End Decs',
  'Other',
];

const PERMIT_TYPES = [
  'Hot Works',
  'Working at Height',
  'Electrical Isolation',
  'Confined Space',
  'Fire Alarm Isolation',
  'Other',
];

const BLANK = {
  buildings:     [],
  buildingOther: '',
  contact:       '',
  contactOther:  '',
  company:       '',
  companyOther:  '',
  operativeName: '',
  contactNumber: '',
  idNumber:      '',
  rams:          '',
  ramsOther:     '',
  declaration:   false,
};

const BLANK_HS = {
  permitTypes:        [],
  permitOther:        '',
  fireSafetyAffected: '',
  fireAlarmIsolation: '',
  fireWatch:          '',
  asbestosChecked:    '',
  ramsApproved:       '',
  inductionComplete:  '',
  insuranceValid:     '',
};

export default function SignInForm() {
  const [f, setF]           = useState(BLANK);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  // H&S state
  const [hs, setHs]                       = useState(BLANK_HS);
  const [contractorLookup, setLookup]     = useState(null); // null = not yet looked up
  const [lookingUp, setLookingUp]         = useState(false);

  function set(key, value) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function setH(key, value) {
    setHs((prev) => ({ ...prev, [key]: value }));
  }

  function toggleBuilding(b) {
    setF((prev) => ({
      ...prev,
      buildings: prev.buildings.includes(b)
        ? prev.buildings.filter((x) => x !== b)
        : [...prev.buildings, b],
    }));
  }

  function togglePermit(pt) {
    setHs((prev) => ({
      ...prev,
      permitTypes: prev.permitTypes.includes(pt)
        ? prev.permitTypes.filter((x) => x !== pt)
        : [...prev.permitTypes, pt],
    }));
  }

  // ── Company lookup ────────────────────────────────────────────────────────────
  const doLookup = useCallback(async (companyName) => {
    if (!companyName) { setLookup(null); return; }
    setLookingUp(true);
    setLookup(null);
    try {
      const res  = await fetch(`/api/contractor-lookup?company=${encodeURIComponent(companyName)}`);
      const data = await res.json();
      setLookup(data);
    } catch {
      setLookup({ contractorType: 'FIRST_TIME' }); // safe default on network error
    } finally {
      setLookingUp(false);
    }
  }, []);

  // Trigger immediately when a known company is selected from dropdown
  function handleCompanyChange(e) {
    set('company', e.target.value);
    if (e.target.value && e.target.value !== 'Other') {
      doLookup(e.target.value);
    } else if (!e.target.value) {
      setLookup(null);
    }
  }

  // Debounced lookup for "Other" free-text company
  useEffect(() => {
    if (f.company !== 'Other' || !f.companyOther.trim()) return;
    const timer = setTimeout(() => doLookup(f.companyOther.trim()), 600);
    return () => clearTimeout(timer);
  }, [f.company, f.companyOther, doLookup]);

  // ── Compliance expiry logic ───────────────────────────────────────────────────
  const isFirstTime   = contractorLookup?.contractorType === 'FIRST_TIME';
  const anyExpired    = contractorLookup?.ramsExpired || contractorLookup?.inductionExpired || contractorLookup?.complianceExpired;
  const showConditional = contractorLookup && (isFirstTime || anyExpired);

  // ── Validation ────────────────────────────────────────────────────────────────
  function validate() {
    if (f.buildings.length === 0)
      return 'Please select at least one building.';
    if (f.buildings.includes('Other') && !f.buildingOther.trim())
      return 'Please specify the building under "Other".';
    if (!f.contact)
      return 'Please select your point of contact.';
    if (f.contact === 'Other' && !f.contactOther.trim())
      return 'Please specify your point of contact.';
    if (!f.company)
      return 'Please select your company name.';
    if (f.company === 'Other' && !f.companyOther.trim())
      return 'Please specify your company name.';
    if (!f.operativeName.trim())
      return "Please enter the operative's full name.";
    if (!f.contactNumber.trim())
      return 'Please enter a contact number.';
    {
      const digits = f.contactNumber.trim().replace(/\s/g, '');
      if (!/^\d+$/.test(digits))
        return 'Contact number must contain digits only.';
      if (digits.startsWith('0')) {
        if (digits.length !== 11)
          return 'UK numbers starting with 0 must be 11 digits (e.g. 07700 900000).';
      } else {
        if (digits.length !== 10)
          return 'Contact number must be 10 digits.';
      }
    }
    if (!/^\d{3}$/.test(f.idNumber))
      return 'Contractor unique ID must be exactly three digits (e.g. 001).';
    {/*if (!f.rams)
      return 'Please answer the RAMS question.';*/}

    // H&S validation (only if lookup has run)
    if (contractorLookup) {
      if (!hs.fireSafetyAffected)
        return 'Please indicate whether your work will affect fire safety systems.';
      if (!hs.asbestosChecked)
        return 'Please confirm you have checked the asbestos register.';
      if (hs.asbestosChecked === 'No')
        return 'You must check the asbestos register for your work area before signing in.';
      if (showConditional && !hs.ramsApproved)
        return 'Please confirm RAMS approval status.';
      if (showConditional && !hs.inductionComplete)
        return 'Please confirm whether site induction has been completed.';
      if (showConditional && !hs.insuranceValid)
        return 'Please confirm insurance validity.';
    }

    if (!f.declaration)
      return 'You must confirm the declaration before signing in.';
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setResult(null);

    const err = validate();
    if (err) { setResult({ type: 'error', message: err }); return; }

    const buildingList   = f.buildings.map((b) => b === 'Other' ? f.buildingOther.trim() : b).join(', ');
    const contactDisplay = f.contact === 'Other' ? f.contactOther.trim() : f.contact;
    const companyDisplay = f.company === 'Other' ? f.companyOther.trim() : f.company;
    const ramsDisplay    = f.rams === 'Other' ? `Other – ${f.ramsOther.trim()}` : f.rams;

    const permitTypesDisplay = hs.permitTypes
      .map((pt) => pt === 'Other' ? (hs.permitOther.trim() || 'Other') : pt)
      .join(', ');

    const today = new Date().toISOString().split('T')[0];

    setLoading(true);
    try {
      const res = await fetch('/api/signin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          companyName:          companyDisplay,
          operativeName:        f.operativeName.trim(),
          idNumber:             f.idNumber.trim(),
          buildings:            buildingList,
          pointOfContact:       contactDisplay,
          contactNumber:        f.contactNumber.trim(),
          ramsSubmitted:        ramsDisplay,
          declarationConfirmed: 'Yes',
          // New H&S fields
          contractorType:       contractorLookup?.contractorType || '',
          permitRequired:       hs.permitTypes.length > 0 ? 'Yes' : 'No',
          permitTypes:          permitTypesDisplay,
          fireSafetyAffected:   hs.fireSafetyAffected
            ? hs.fireSafetyAffected + (
                hs.fireSafetyAffected === 'Yes'
                  ? ` (Alarm isolation: ${hs.fireAlarmIsolation || 'N/A'}, Fire watch: ${hs.fireWatch || 'N/A'})`
                  : ''
              )
            : '',
          asbestosChecked:      hs.asbestosChecked,
          ramsApproved:         hs.ramsApproved || '',
          inductionComplete:    hs.inductionComplete || '',
          insuranceValid:       hs.insuranceValid || '',
          lastRAMSReviewDate:   hs.ramsApproved === 'Yes' ? today : '',
          lastInductionDate:    hs.inductionComplete === 'Yes' ? today : '',
          lastComplianceDate:   hs.insuranceValid === 'Yes' ? today : '',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResult({ type: 'success', message: data.message });
        setF(BLANK);
        setHs(BLANK_HS);
        setLookup(null);
      } else {
        setResult({ type: 'error', message: data.message });
      }
    } catch {
      setResult({ type: 'error', message: 'Network error. Please check your connection.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {result && (
        <div className={`alert alert--${result.type === 'success' ? 'success' : 'error'}`}>
          {result.message}
        </div>
      )}

      <div className="card">
        <p className="card__title">Contractor Details</p>

        {/* Company */}
        <div className="form-group">
          <label htmlFor="company">Company name *</label>
          <select id="company" value={f.company} onChange={handleCompanyChange}>
            <option value="">— Select company —</option>
            {COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {f.company === 'Other' && (
            <input
              type="text"
              className="mt-2"
              value={f.companyOther}
              onChange={(e) => set('companyOther', e.target.value)}
              placeholder="Please specify your company…"
            />
          )}
          {lookingUp && (
            <p className="text-sm text-muted" style={{ marginTop: 4 }}>Checking contractor records…</p>
          )}
          {contractorLookup && !lookingUp && (
            <p className="text-sm" style={{ marginTop: 4, color: isFirstTime ? '#b45309' : '#15803d' }}>
              {isFirstTime
                ? 'First visit — all H&S questions are required.'
                : `Returning contractor (${contractorLookup.rowCount} previous visit${contractorLookup.rowCount !== 1 ? 's' : ''}).${anyExpired ? ' Some compliance has expired.' : ''}`}
            </p>
          )}
        </div>

        {/* Operative name */}
        <div className="form-group">
          <label htmlFor="operativeName">Operative's full name *</label>
          <input
            id="operativeName"
            type="text"
            value={f.operativeName}
            onChange={(e) => set('operativeName', e.target.value)}
            placeholder="e.g. John Smith"
            autoComplete="name"
          />
        </div>

        {/* Contact number */}
        <div className="form-group">
          <label htmlFor="contactNumber">Contact number *</label>
          <input
            id="contactNumber"
            type="tel"
            value={f.contactNumber}
            onChange={(e) => set('contactNumber', e.target.value)}
            placeholder="e.g. 07700 900000"
            autoComplete="tel"
          />
        </div>

        {/* Unique ID */}
        <div className="form-group">
          <label htmlFor="idNumber">
            Contractor unique ID *
            <span className="field-hint">Three-digit number printed on your ID card, e.g. 001</span>
          </label>
          <input
            id="idNumber"
            type="text"
            inputMode="numeric"
            value={f.idNumber}
            onChange={(e) => set('idNumber', e.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder="e.g. 001"
            maxLength={3}
            style={{ maxWidth: 120 }}
          />
        </div>
      </div>

      <div className="card">
        <p className="card__title">Site Information</p>

        {/* Buildings */}
        <div className="form-group">
          <label>
            Which building(s) are you working in today? *
            <span className="field-hint">Select all that apply</span>
          </label>
          <div className="checkbox-group">
            {BUILDINGS.map((b) => (
              <label key={b} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={f.buildings.includes(b)}
                  onChange={() => toggleBuilding(b)}
                />
                <span>{b}</span>
              </label>
            ))}
          </div>
          {f.buildings.includes('Other') && (
            <input
              type="text"
              className="mt-2"
              value={f.buildingOther}
              onChange={(e) => set('buildingOther', e.target.value)}
              placeholder="Please specify the building…"
            />
          )}
        </div>

        {/* Point of contact */}
        <div className="form-group">
          <label htmlFor="contact">Point of contact *</label>
          <select id="contact" value={f.contact} onChange={(e) => set('contact', e.target.value)}>
            <option value="">— Select contact —</option>
            {CONTACTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {f.contact === 'Other' && (
            <input
              type="text"
              className="mt-2"
              value={f.contactOther}
              onChange={(e) => set('contactOther', e.target.value)}
              placeholder="Please specify…"
            />
          )}
        </div>
      </div>

      {/* ── H&S Checks — shown after company lookup ─────────────────────────── */}
      {contractorLookup && (
        <div className="card">
          <p className="card__title">Health &amp; Safety Checks</p>

          {/* Compliance expiry warning — prominent banner */}
          {anyExpired && (
            <div className="alert alert--error" style={{ marginBottom: 16 }}>
              <strong>Compliance Expired</strong> — the following must be re-confirmed before proceeding:
              <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: '0.875rem', lineHeight: '1.6' }}>
                {contractorLookup.ramsExpired && (
                  <li>
                    RAMS
                    {contractorLookup.lastRAMSReviewDate
                      ? ` — last confirmed ${contractorLookup.lastRAMSReviewDate}`
                      : ' — never recorded'}
                    {contractorLookup.ramsExpiry ? ` (expired ${contractorLookup.ramsExpiry})` : ''}
                  </li>
                )}
                {contractorLookup.inductionExpired && (
                  <li>
                    Site Induction
                    {contractorLookup.lastInductionDate
                      ? ` — last confirmed ${contractorLookup.lastInductionDate}`
                      : ' — never recorded'}
                    {contractorLookup.inductionExpiry ? ` (expired ${contractorLookup.inductionExpiry})` : ''}
                  </li>
                )}
                {contractorLookup.complianceExpired && (
                  <li>
                    Insurance
                    {contractorLookup.lastComplianceDate
                      ? ` — last confirmed ${contractorLookup.lastComplianceDate}`
                      : ' — never recorded'}
                    {contractorLookup.insuranceExpiry ? ` (expired ${contractorLookup.insuranceExpiry})` : ''}
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Q1 — Permit to Work */}
          <div className="form-group">
            <label>Permit to Work required? <span className="field-hint">Select all that apply</span></label>
            <div className="checkbox-group">
              {PERMIT_TYPES.map((pt) => (
                <label key={pt} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hs.permitTypes.includes(pt)}
                    onChange={() => togglePermit(pt)}
                  />
                  <span>{pt}</span>
                </label>
              ))}
            </div>
            {hs.permitTypes.includes('Other') && (
              <input
                type="text"
                className="mt-2"
                value={hs.permitOther}
                onChange={(e) => setH('permitOther', e.target.value)}
                placeholder="Please specify permit type…"
              />
            )}
          </div>

          {/* Q2 — Fire safety */}
          <div className="form-group">
            <label htmlFor="fireSafety">Will your work affect fire safety systems? *</label>
            <select
              id="fireSafety"
              value={hs.fireSafetyAffected}
              onChange={(e) => setH('fireSafetyAffected', e.target.value)}
            >
              <option value="">— Select —</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>

            {hs.fireSafetyAffected === 'Yes' && (
              <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '3px solid #fbbf24' }}>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: '0.875rem' }}>Fire alarm isolation required?</label>
                  <select
                    value={hs.fireAlarmIsolation}
                    onChange={(e) => setH('fireAlarmIsolation', e.target.value)}
                  >
                    <option value="">— Select —</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.875rem' }}>Fire watch required?</label>
                  <select
                    value={hs.fireWatch}
                    onChange={(e) => setH('fireWatch', e.target.value)}
                  >
                    <option value="">— Select —</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Q3 — Asbestos register */}
          <div className="form-group">
            <label htmlFor="asbestos">Have you checked the asbestos register for your work area? *</label>
            <select
              id="asbestos"
              value={hs.asbestosChecked}
              onChange={(e) => setH('asbestosChecked', e.target.value)}
            >
              <option value="">— Select —</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="Not Applicable">Not Applicable</option>
            </select>
            {hs.asbestosChecked === 'No' && (
              <div className="alert alert--error" style={{ marginTop: 8 }}>
                You must check the asbestos register before proceeding on site.
              </div>
            )}
          </div>

          {/* Q4–Q6 — Conditional: first-time or any compliance expired */}
          {showConditional && (
            <>
              {isFirstTime && (
                <div className="alert alert--info" style={{ marginBottom: 12 }}>
                  First visit — please answer all compliance questions below.
                </div>
              )}
              {!isFirstTime && anyExpired && (
                <div className="alert alert--info" style={{ marginBottom: 12 }}>
                  Some compliance has expired — please re-confirm below.
                  {contractorLookup.ramsExpired && <> RAMS expired.</>}
                  {contractorLookup.inductionExpired && <> Induction expired.</>}
                  {contractorLookup.complianceExpired && <> Insurance expired.</>}
                </div>
              )}

              {/* Q4 — RAMS approved */}
              <div className="form-group">
                <label htmlFor="ramsApproved">RAMS submitted and approved? *</label>
                <select
                  id="ramsApproved"
                  value={hs.ramsApproved}
                  onChange={(e) => setH('ramsApproved', e.target.value)}
                >
                  <option value="">— Select —</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Q5 — Site induction */}
              <div className="form-group">
                <label htmlFor="inductionComplete">Site induction completed? *</label>
                <select
                  id="inductionComplete"
                  value={hs.inductionComplete}
                  onChange={(e) => setH('inductionComplete', e.target.value)}
                >
                  <option value="">— Select —</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
                {hs.inductionComplete === 'No' && (
                  <p className="text-sm" style={{ color: '#b45309', marginTop: 4 }}>
                    Warning: site induction not complete. You must not proceed.
                  </p>
                )}
              </div>

              {/* Q6 — Insurance */}
              <div className="form-group">
                <label htmlFor="insuranceValid">Insurance valid? *</label>
                <select
                  id="insuranceValid"
                  value={hs.insuranceValid}
                  onChange={(e) => setH('insuranceValid', e.target.value)}
                >
                  <option value="">— Select —</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
                {hs.insuranceValid === 'No' && (
                  <p className="text-sm" style={{ color: '#b45309', marginTop: 4 }}>
                    Warning: insurance not confirmed. You must not proceed.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <p className="card__title">Declaration</p>

        {/* RAMS */}
        {/*<div className="form-group">
          <label htmlFor="rams">Have you signed and submitted your RAMS? *</label>
          <select id="rams" value={f.rams} onChange={(e) => set('rams', e.target.value)}>
            <option value="">— Select —</option>
            <option value="No">No</option>
            <option value="Yes">Yes</option>
            <option value="Other">Other</option>
          </select>
          {f.rams === 'Other' && (
            <textarea
              className="mt-2"
              rows={3}
              value={f.ramsOther ?? ''}
              onChange={(e) => set('ramsOther', e.target.value)}
              placeholder="Please provide details…"
              style={{ resize: 'vertical' }}
            />
          )}
        </div>*/}

        {/* Declaration */}
        <div className="form-group">
          <label style={{ marginBottom: 8 }}>Declaration *</label>
          <label className="checkbox-label checkbox-label--declaration">
            <input
              type="checkbox"
              checked={f.declaration}
              onChange={(e) => set('declaration', e.target.checked)}
            />
            <span>
              I confirm I am signing in/out accurately, and will return my contractor ID
              card when signing out. Failure to do so will result in delayed payments.
            </span>
          </label>
        </div>
      </div>

      <button type="submit" className="btn btn--primary" disabled={loading}>
        {loading && <span className="spinner" />}
        {loading ? 'Signing In…' : 'Sign In'}
      </button>
    </form>
  );
}
