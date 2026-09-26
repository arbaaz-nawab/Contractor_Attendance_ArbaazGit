import { useState, useEffect, useCallback } from 'react';
import { dashFetch } from '../lib/sessionClient';

/**
 * Estates parking log — standalone, no link to contractor sign-ins.
 *
 * Design: skips the generic "table + edit modal" pattern for the one thing
 * that actually gets asked later — "who booked this, for which project,
 * when did it happen." The list is compact rows (date/duration/company/
 * requester/reg/status) that open a detail view built around a short
 * timeline (requested → booked → each edit), so that question is answered
 * in one glance instead of cross-referencing a table and a change log.
 * Adding a booking is a single short form with sensible defaults (today's
 * date, duration as one-tap chips, "entered by" remembered per browser) so
 * someone taking a phone call can log it in a few taps.
 */

const ENTERED_BY_KEY = 'gc_parking_entered_by';

const DURATION_OPTIONS = [
  { code: '1H', label: '1 hr' },
  { code: '2H', label: '2 hrs' },
  { code: '3H', label: '3 hrs' },
  { code: '4H', label: '4 hrs' },
  { code: 'FULL_DAY', label: 'Full day (over 4 hrs)' },
];

// Only Requested/Booked can be set. Legacy Completed/Cancelled rows keep their
// stored value but display as a read-only "Archived" (filterable, not editable).
const STATUS_OPTIONS = ['Requested', 'Booked'];
const ARCHIVED_STATUSES = ['Completed', 'Cancelled'];

function durationLabel(code) {
  return DURATION_OPTIONS.find((d) => d.code === code)?.label || code;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }

function fmtDateLabel(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function summarizeHistory(h) {
  if (h.changeType === 'CREATED') return 'Booking created';
  if (!h.changes || h.changes.length === 0) return h.changeType;
  return h.changes.map((c) => `${c.field} changed from "${c.old || '—'}" to "${c.new || '—'}"`).join('; ');
}

function StatusBadge({ status }) {
  const archived = ARCHIVED_STATUSES.includes(status);
  const cls = archived ? 'badge--completed' : {
    Requested: 'badge--requested',
    Booked: 'badge--booked',
  }[status] || '';
  return <span className={`badge ${cls}`}>{archived ? 'Archived' : status}</span>;
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16,
};
const linkButtonStyle = {
  background: 'none', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', padding: 0,
};

// Excel/LibreOffice can interpret a cell starting with = + - @ as a formula
// even when it's really just free text a contractor/requester typed in
// (company, requester, project code) — prefix with a literal quote to force
// text interpretation, the standard mitigation for spreadsheet export of
// user-controlled strings.
function sanitizeCell(v) {
  const s = String(v ?? '');
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

// Shown instead of any form/action that needs a staff-list pick when the
// list is empty, so the user gets a way forward instead of a dropdown that
// can never be filled in.
function EmptyStaffPrompt({ onManageStaff, onCancel }) {
  return (
    <div>
      <p className="text-sm mb-2">
        Add an Estates staff member first — every booking needs someone to attribute it to.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--primary btn--sm" onClick={onManageStaff}>Manage Staff</button>
        {onCancel && <button className="btn btn--secondary btn--sm" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function BookingFields({ f, setF, meta }) {
  function set(key, val) { setF((prev) => ({ ...prev, [key]: val })); }

  return (
    <>
      <div className="form-group">
        <label htmlFor="pkRequester">Requester *</label>
        <input
          id="pkRequester" list="pkRequesterList" value={f.requester}
          onChange={(e) => set('requester', e.target.value)} placeholder="Who is this for?"
        />
        <datalist id="pkRequesterList">
          {meta.requesterSuggestions.map((n) => <option key={n} value={n} />)}
        </datalist>
      </div>

      <div className="form-group">
        <label htmlFor="pkProject">Project code *</label>
        <input id="pkProject" value={f.projectCode} onChange={(e) => set('projectCode', e.target.value)} />
      </div>

      <div className="form-group">
        <label htmlFor="pkCompany">Company *</label>
        <input id="pkCompany" list="pkCompanyList" value={f.company} onChange={(e) => set('company', e.target.value)} />
        <datalist id="pkCompanyList">
          {meta.companySuggestions.map((n) => <option key={n} value={n} />)}
        </datalist>
      </div>

      <div className="form-group">
        <label htmlFor="pkDate">Booking date *</label>
        <input id="pkDate" type="date" value={f.bookingDate} onChange={(e) => set('bookingDate', e.target.value)} />
      </div>

      <div className="form-group">
        <label>Duration *</label>
        <div className="chip-group">
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d.code} type="button"
              className={`chip ${f.durationType === d.code ? 'chip--selected' : ''}`}
              onClick={() => set('durationType', d.code)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="pkReg">Vehicle registration *</label>
        <input
          id="pkReg" value={f.vehicleReg} onChange={(e) => set('vehicleReg', e.target.value)}
          placeholder="e.g. AB12 CDE" style={{ textTransform: 'uppercase' }}
        />
      </div>
    </>
  );
}

function AddBookingModal({ meta, onConfirm, onCancel, onManageStaff }) {
  const [f, setF] = useState({
    requester: '', projectCode: '', company: '', bookingDate: toDateStr(new Date()),
    durationType: '', vehicleReg: '',
  });
  const [enteredBy, setEnteredBy] = useState(() => {
    try { return localStorage.getItem(ENTERED_BY_KEY) || ''; } catch { return ''; }
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function valid() {
    return !!(f.requester.trim() && f.projectCode.trim() && f.company.trim() && f.bookingDate
      && f.durationType && f.vehicleReg.trim() && enteredBy.trim());
  }

  async function handleSave() {
    setError('');
    if (!valid()) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      const res = await dashFetch('/api/parking-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          requester: f.requester.trim(), projectCode: f.projectCode.trim(), company: f.company.trim(),
          bookingDate: f.bookingDate, durationType: f.durationType, vehicleReg: f.vehicleReg.trim(),
          enteredBy: enteredBy.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        try { localStorage.setItem(ENTERED_BY_KEY, enteredBy.trim()); } catch { /* ignore */ }
        onConfirm(data.warning
          ? { type: 'warning', text: data.warning }
          : { type: 'success', text: `Booking created for ${f.company.trim()}.` });
      } else {
        setError(data.message);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div className="card" style={{ maxWidth: 440, width: '90%', margin: 0, maxHeight: '90vh', overflowY: 'auto' }}>
        <p className="card__title">New Parking Booking</p>
        {error && <div className="alert alert--error">{error}</div>}

        {meta.staff.length === 0 ? (
          <EmptyStaffPrompt onManageStaff={onManageStaff} onCancel={onCancel} />
        ) : (
          <>
            <BookingFields f={f} setF={setF} meta={meta} />

            <div className="form-group">
              <label htmlFor="pkEnteredBy">Entered by *</label>
              <select id="pkEnteredBy" value={enteredBy} onChange={(e) => setEnteredBy(e.target.value)}>
                <option value="">— Select —</option>
                {meta.staff.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" disabled={loading} onClick={handleSave}>
                {loading ? 'Saving…' : 'Save Booking'}
              </button>
              <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function BookingDetailModal({ bookingId, meta, onClose, onChanged, onManageStaff }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [f, setF] = useState(null);
  const [editChangedBy, setEditChangedBy] = useState('');
  const [pendingStatus, setPendingStatus] = useState('');
  const [actorName, setActorName] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const res  = await dashFetch(`/api/parking-list?id=${bookingId}`);
      const json = await res.json();
      if (json.success) setData(json);
      else setLoadError(json.message || 'Failed to load booking.');
    } catch {
      setLoadError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    setF({
      requester: data.booking.requester, projectCode: data.booking.projectCode,
      company: data.booking.company, bookingDate: data.booking.bookingDate,
      durationType: data.booking.durationType, vehicleReg: data.booking.vehicleReg,
    });
    setEditChangedBy('');
    setActionError('');
    setMode('edit');
  }

  async function saveEdit() {
    setActionError('');
    if (!f.requester.trim() || !f.projectCode.trim() || !f.company.trim() || !f.bookingDate
      || !f.durationType || !f.vehicleReg.trim() || !editChangedBy.trim()) {
      setActionError('Please fill in all fields, including who is making this change.');
      return;
    }
    setSaving(true);
    try {
      const res  = await dashFetch('/api/parking-save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: bookingId, changedBy: editChangedBy.trim(), ...f }),
      });
      const json = await res.json();
      if (json.success) {
        setMode('view');
        await load();
        onChanged(json.warning ? { type: 'warning', text: json.warning } : { type: 'success', text: 'Booking updated.' });
      } else {
        setActionError(json.message);
      }
    } catch {
      setActionError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  function confirmStatus(status) {
    setPendingStatus(status);
    setActorName('');
    setActionError('');
  }

  async function submitStatus() {
    if (!actorName.trim()) { setActionError('Please select who is making this change.'); return; }
    setSaving(true); setActionError('');
    try {
      const res  = await dashFetch('/api/parking-save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', id: bookingId, status: pendingStatus, changedBy: actorName.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setPendingStatus('');
        await load();
        onChanged({ type: 'success', text: `Marked ${pendingStatus}.` });
      } else {
        setActionError(json.message);
      }
    } catch {
      setActionError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div className="card" style={{ maxWidth: 480, width: '90%', margin: 0, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <p className="card__title" style={{ marginBottom: 0 }}>Booking Detail</p>
          <button style={linkButtonStyle} onClick={onClose}>Close</button>
        </div>

        {loading && <p className="text-muted text-sm">Loading…</p>}
        {loadError && <div className="alert alert--error">{loadError}</div>}

        {data && mode === 'view' && (
          <>
            <StatusBadge status={data.booking.status} />
            <h3 style={{ margin: '10px 0 2px', fontSize: '1.05rem' }}>{data.booking.company}</h3>
            <p className="text-sm text-muted" style={{ marginBottom: 12 }}>Project {data.booking.projectCode}</p>

            <div className="parking-timeline">
              <div className="parking-timeline__item">
                <div>Requested by <strong>{data.booking.bookedBy}</strong></div>
                <div className="parking-timeline__when">{data.booking.requestedAt}</div>
              </div>
              {data.booking.bookedAt && (
                <div className="parking-timeline__item">
                  <div>Booked</div>
                  <div className="parking-timeline__when">{data.booking.bookedAt}</div>
                </div>
              )}
              {data.history.filter((h) => h.changeType !== 'CREATED').map((h) => (
                <div key={h.id} className="parking-timeline__item">
                  <div>{summarizeHistory(h)} — <strong>{h.changedBy}</strong></div>
                  <div className="parking-timeline__when">{h.changedAt}</div>
                </div>
              ))}
            </div>

            <div className="divider" />

            <p className="text-sm mb-2"><strong>Requester:</strong> {data.booking.requester}</p>
            <p className="text-sm mb-2"><strong>Booking date:</strong> {fmtDateLabel(data.booking.bookingDate)}</p>
            <p className="text-sm mb-2"><strong>Duration:</strong> {durationLabel(data.booking.durationType)}</p>
            <p className="text-sm mb-2"><strong>Vehicle reg:</strong> {data.booking.vehicleReg}</p>

            {actionError && <div className="alert alert--error mt-2">{actionError}</div>}

            {meta.staff.length === 0 ? (
              <div style={{ marginTop: 16 }}>
                <EmptyStaffPrompt onManageStaff={() => { onClose(); onManageStaff(); }} />
              </div>
            ) : pendingStatus ? (
              <div className="card" style={{ background: 'var(--bg-subtle)', marginTop: 12, marginBottom: 0 }}>
                <p className="text-sm mb-2">Who is marking this <strong>{pendingStatus}</strong>?</p>
                <select value={actorName} onChange={(e) => setActorName(e.target.value)}>
                  <option value="">— Select —</option>
                  {meta.staff.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn--primary btn--sm" disabled={saving} onClick={submitStatus}>Confirm</button>
                  <button className="btn btn--secondary btn--sm" onClick={() => setPendingStatus('')}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                {data.booking.status === 'Requested' && (
                  <button className="btn btn--secondary btn--sm" onClick={() => confirmStatus('Booked')}>Mark Booked</button>
                )}
                {data.booking.status === 'Booked' && (
                  <button className="btn btn--secondary btn--sm" onClick={() => confirmStatus('Requested')}>Mark Requested</button>
                )}
                <button className="btn btn--secondary btn--sm" onClick={startEdit}>Edit</button>
              </div>
            )}
          </>
        )}

        {data && mode === 'edit' && f && (
          <>
            <BookingFields f={f} setF={setF} meta={meta} />

            <div className="form-group">
              <label htmlFor="pkChangedBy">Changed by *</label>
              <select id="pkChangedBy" value={editChangedBy} onChange={(e) => setEditChangedBy(e.target.value)}>
                <option value="">— Select —</option>
                {meta.staff.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {actionError && <div className="alert alert--error">{actionError}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" disabled={saving} onClick={saveEdit}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button className="btn btn--secondary" onClick={() => setMode('view')}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function StaffManagerModal({ staff, onClose, onChanged }) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function addName() {
    if (!newName.trim()) return;
    setBusy(true); setError('');
    try {
      const res  = await dashFetch('/api/parking-staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', name: newName.trim() }),
      });
      const data = await res.json();
      if (data.success) { setNewName(''); onChanged(); } else { setError(data.message); }
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  }

  async function removeName(name) {
    if (!confirm(`Remove "${name}" from the staff list? Existing bookings keep their history.`)) return;
    setBusy(true); setError('');
    try {
      const res  = await dashFetch('/api/parking-staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', name }),
      });
      const data = await res.json();
      if (data.success) onChanged(); else setError(data.message);
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div className="card" style={{ maxWidth: 400, width: '90%', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <p className="card__title" style={{ marginBottom: 0 }}>Manage Estates Staff</p>
          <button style={linkButtonStyle} onClick={onClose}>Close</button>
        </div>
        {error && <div className="alert alert--error">{error}</div>}
        <div className="parking-staff-list">
          {staff.map((n) => (
            <span key={n} className="parking-staff-chip">
              {n}
              <button type="button" disabled={busy} onClick={() => removeName(n)} title={`Remove ${n}`}>×</button>
            </span>
          ))}
          {staff.length === 0 && <p className="text-muted text-sm">No staff added yet.</p>}
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="newStaffName">Add a name</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="newStaffName" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
            <button className="btn btn--secondary btn--sm" disabled={busy} onClick={addName}>Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ParkingTab() {
  const today     = toDateStr(new Date());
  const yesterday = toDateStr(addDays(new Date(), -1));

  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo]     = useState('');
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const [meta, setMeta] = useState({ staff: [], requesterSuggestions: [], companySuggestions: [] });

  const [showAddModal, setShowAddModal]     = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [detailId, setDetailId]             = useState(null);
  const [message, setMessage]               = useState(null);

  const fetchMeta = useCallback(async () => {
    try {
      const res  = await dashFetch('/api/parking-staff');
      const data = await res.json();
      if (data.success) {
        setMeta({
          staff: data.staff,
          requesterSuggestions: data.requesterSuggestions,
          companySuggestions: data.companySuggestions,
        });
      }
    } catch { /* ignore — suggestions are non-critical */ }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo)   params.set('dateTo', dateTo);
      if (search.trim())        params.set('search', search.trim());
      if (statusFilter)         params.set('status', statusFilter);
      if (companyFilter.trim()) params.set('company', companyFilter.trim());
      const res  = await dashFetch(`/api/parking-list?${params}`);
      const data = await res.json();
      if (data.success) setRecords(data.records);
      else setError(data.message || 'Failed to load bookings.');
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, search, statusFilter, companyFilter]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  // Debounce free-text filters so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(fetchList, 300);
    return () => clearTimeout(t);
  }, [fetchList]);

  function showUpcoming() { setDateFrom(today); setDateTo(''); }
  function showHistory()  { setDateFrom(''); setDateTo(yesterday); }
  const isUpcoming = dateFrom === today && !dateTo;
  const isHistory  = !dateFrom && dateTo === yesterday;

  function handleModalDone(msg) {
    setShowAddModal(false);
    setMessage(msg);
    fetchList();
    fetchMeta();
  }

  function handleDetailChanged(msg) {
    setMessage(msg);
    fetchList();
  }

  function handleStaffChanged() {
    fetchMeta();
  }

  function exportExcel() {
    import('xlsx').then((XLSX) => {
      const header = ['Date', 'Duration', 'Company', 'Project Code', 'Requester', 'Vehicle Reg', 'Status', 'Entered By', 'Requested At', 'Booked At'];
      const rows = records.map((r) => [
        r.bookingDate, durationLabel(r.durationType), r.company, r.projectCode, r.requester,
        r.vehicleReg, r.status, r.bookedBy, r.requestedAt, r.bookedAt,
      ].map(sanitizeCell));
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Parking Bookings');
      XLSX.writeFile(wb, `parking-bookings-${today}.xlsx`);
    });
  }

  return (
    <div>
      {showAddModal && (
        <AddBookingModal
          meta={meta}
          onConfirm={handleModalDone}
          onCancel={() => setShowAddModal(false)}
          onManageStaff={() => { setShowAddModal(false); setShowStaffModal(true); }}
        />
      )}
      {showStaffModal && (
        <StaffManagerModal staff={meta.staff} onClose={() => setShowStaffModal(false)} onChanged={handleStaffChanged} />
      )}
      {detailId && (
        <BookingDetailModal
          bookingId={detailId}
          meta={meta}
          onClose={() => setDetailId(null)}
          onChanged={handleDetailChanged}
          onManageStaff={() => setShowStaffModal(true)}
        />
      )}

      {message && (
        <div className={`alert alert--${message.type === 'warning' ? 'error' : 'success'}`}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <button className="btn btn--primary btn--sm" onClick={() => setShowAddModal(true)}>+ New Booking</button>
        <button className="btn btn--secondary btn--sm" onClick={() => setShowStaffModal(true)}>Manage Staff</button>
        <button className="btn btn--secondary btn--sm" onClick={exportExcel} disabled={records.length === 0}>
          Download Excel
        </button>
      </div>

      <div className="nav-tabs" style={{ marginBottom: 12, maxWidth: 320 }}>
        <button className={`nav-tab ${isUpcoming ? 'nav-tab--active' : ''}`} onClick={showUpcoming}>Today &amp; Upcoming</button>
        <button className={`nav-tab ${isHistory ? 'nav-tab--active' : ''}`} onClick={showHistory}>History</button>
      </div>

      <div className="filter-row">
        <input type="text" placeholder="Search project, company, reg or requester…" value={search}
          onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          <option value="Archived">Archived</option>
        </select>
        <input type="text" placeholder="Filter by company…" value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {loading && <p className="text-muted text-sm">Loading…</p>}
      {error && <div className="alert alert--error">{error}</div>}

      {!loading && !error && records.length === 0 && (
        <p className="text-muted text-sm">No parking bookings match this view.</p>
      )}

      {records.map((r) => (
        <div key={r.id} className="parking-row" onClick={() => setDetailId(r.id)}>
          <div className="parking-row__date">{fmtDateLabel(r.bookingDate)}</div>
          <div className="parking-row__main">
            <div className="parking-row__company">{r.company} <span className="text-muted text-sm">— {r.projectCode}</span></div>
            <div className="parking-row__sub">{r.requester} · {r.vehicleReg} · {durationLabel(r.durationType)}</div>
          </div>
          <StatusBadge status={r.status} />
        </div>
      ))}
    </div>
  );
}
