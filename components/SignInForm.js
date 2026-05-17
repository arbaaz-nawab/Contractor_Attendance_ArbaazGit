import { useState, useEffect, useCallback } from 'react';

const BUILDINGS = [
  'Goodenough Hotel',
  'House 15',
  'London House',
  'The Georgian House',
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
  const [f, setF]             = useState(BLANK);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  // H&S state
  const [hs, setHs]                   = useState(BLANK_HS);
  const [contractorLookup, setLookup] = useState(null);
  const [lookingUp, setLookingUp]     = useState(false);

  // Operative-level induction lookup + name suggestions
  const [operativeLookup, setOpLookup]         = useState(null);
  const [nameSuggestions, setNameSuggestions]  = useState([]);

  // Duplicate ID pre-check
  const [idConflict, setIdConflict] = useState(null);

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
      setLookup({ contractorType: 'FIRST_TIME' });
    } finally {
      setLookingUp(false);
    }
  }, []);

  function handleCompanyChange(e) {
    set('company', e.target.value);
    if (e.target.value && e.target.value !== 'Other') {
      doLookup(e.target.value);
    } else if (!e.target.value) {
      setLookup(null);
    }
  }

  useEffect(() => {
    if (f.company !== 'Other' || !f.companyOther.trim()) return;
    const timer = setTimeout(() => doLookup(f.companyOther.trim()), 600);
    return () => clearTimeout(timer);
  }, [f.company, f.companyOther, doLookup]);

  // ── Operative name: suggestions + induction lookup ───────────────────────────
  useEffect(() => {
    const name = f.operativeName.trim();
    if (name.length < 2) {
      setNameSuggestions([]);
      setOpLookup(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const [sugRes, lookupRes] = await Promise.all([
          fetch(`/api/operative-lookup?partial=${encodeURIComponent(name)}`),
          fetch(`/api/operative-lookup?name=${encodeURIComponent(name)}`),
        ]);
        if (cancelled) return;
        const [sugData, lookupData] = await Promise.all([sugRes.json(), lookupRes.json()]);
        if (cancelled) return;
        if (sugData.names) setNameSuggestions(sugData.names);
        setOpLookup(lookupData);
      } catch { /* ignore */ }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [f.operativeName]);

  // ── Duplicate ID pre-check on blur ───────────────────────────────────────────
  async function handleIdBlur() {
    if (!/^\d{3}$/.test(f.idNumber)) { setIdConflict(null); return; }
    try {
      const res  = await fetch(`/api/active-check?id=${encodeURIComponent(f.idNumber)}`);
      const data = await res.json();
      setIdConflict(data.active
        ? `ID ${f.idNumber} is already signed in today. Please sign out first.`
        : null);
    } catch {
      setIdConflict(null);
    }
  }

  // ── Compliance expiry logic ───────────────────────────────────────────────────
  const isFirstTime = contractorLookup?.contractorType === 'FIRST_TIME';

  // Use operative-level induction if available, fall back to company-level
  const inductionExpired    = operativeLookup?.inductionExpired    ?? contractorLookup?.inductionExpired;
  const lastInductionDate   = operativeLookup?.lastInductionDate   || contractorLookup?.lastInductionDate;
  const inductionExpiry     = operativeLookup?.inductionExpiry     || contractorLookup?.inductionExpiry;

  const anyExpired = contractorLookup?.ramsExpired || inductionExpired || contractorLookup?.complianceExpired;

  // RAMS and Induction shown whenever lookup has run; Insurance only on first visit / expired
  const showInsurance = !!(contractorLookup && (isFirstTime || contractorLookup.complianceExpired));

  // ── Validation ────────────────────────────────────────────────────────────────
  function validate() {
    if (idConflict) return idConflict;
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

    if (contractorLookup) {
      if (!hs.fireSafetyAffected)
        return 'Please indicate whether your work will affect fire safety systems.';
      if (!hs.asbestosChecked)
        return 'Please confirm you have checked the asbestos register.';
      if (hs.asbestosChecked === 'No')
        return 'You must check the asbestos register for your work area before signing in.';
      if (!hs.ramsApproved)
        return 'Please confirm RAMS approval status.';
      if (!hs.inductionComplete)
        return 'Please confirm whether site induction has been completed.';
      if (showInsurance && !hs.insuranceValid)
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
          ramsSubmitted:        '',
          declarationConfirmed: 'Yes',
          contractorType:       contractorLookup?.contractorType || '',
          permitRequired:       hs.permitTypes.length > 0 ? 'Yes' : 'No',
          permitTypes:          permitTypesDisplay,
          fireSafetyAffected:   hs.fireSafetyAffected === 'Yes'
            ? `Yes (Alarm isolation: ${hs.fireAlarmIsolation || 'N/A'}, Fire watch: ${hs.fireWatch || 'N/A'})`
            : (hs.fireSafetyAffected || ''),
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
        setOpLookup(null);
        setIdConflict(null);
        setNameSuggestions([]);
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

        {/* Operative name with autocomplete */}
        <div className="form-group">
          <label htmlFor="operativeName">Operative's full name *</label>
          <input
            id="operativeName"
            type="text"
            list="operative-suggestions"
            value={f.operativeName}
            onChange={(e) => set('operativeName', e.target.value)}
            placeholder="e.g. John Smith"
            autoComplete="off"
          />
          <datalist id="operative-suggestions">
            {nameSuggestions.map((name) => <option key={name} value={name} />)}
          </datalist>
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
            onChange={(e) => { set('idNumber', e.target.value.replace(/\D/g, '').slice(0, 3)); setIdConflict(null); }}
            onBlur={handleIdBlur}
            placeholder="e.g. 001"
            maxLength={3}
            style={{ maxWidth: 120 }}
          />
          {idConflict && (
            <div className="alert alert--error" style={{ marginTop: 8 }}>
              {idConflict}
            </div>
          )}
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

          {/* Compliance expiry warning banner */}
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
                {inductionExpired && (
                  <li>
                    Site Induction
                    {lastInductionDate ? ` — last confirmed ${lastInductionDate}` : ' — never recorded'}
                    {inductionExpiry ? ` (expired ${inductionExpiry})` : ''}
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
              <option value="Not Applicable">Not Applicable</option>
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

          {/* Q4 — RAMS approved (always shown) */}
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
              <option value="Not Applicable">Not Applicable</option>
            </select>
            {hs.ramsApproved === 'No' && (
              <p className="text-sm" style={{ color: '#b45309', marginTop: 4 }}>
                Warning: RAMS not submitted. You may not proceed on site without approved RAMS.
              </p>
            )}
          </div>

          {/* Q5 — Site induction (always shown; uses operative-level expiry) */}
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
              <option value="Not Applicable">Not Applicable</option>
            </select>
            {hs.inductionComplete === 'No' && (
              <p className="text-sm" style={{ color: '#b45309', marginTop: 4 }}>
                Warning: site induction not complete. You must not proceed.
              </p>
            )}
          </div>

          {/* Q6 — Insurance (first visit or expired only) */}
          {showInsurance && (
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
                <option value="Not Applicable">Not Applicable</option>
              </select>
              {hs.insuranceValid === 'No' && (
                <p className="text-sm" style={{ color: '#b45309', marginTop: 4 }}>
                  Warning: insurance not confirmed. You must not proceed.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <p className="card__title">Declaration</p>
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
