import { useState, useEffect, useCallback } from 'react';
import { dashFetch } from '../lib/sessionClient';
import {
  PLANNED_WORKS_MANAGERS, PLANNED_WORKS_ADMIN, PLANNED_WORKS_BUILDINGS, PLANNED_WORKS_PEOPLE,
  PLANNED_WORKS_RAMS_OPTIONS, PLANNED_WORKS_EVENTS_OPTIONS,
  normalisePlannedWorksBuilding, normalisePlannedWorksRams, normalisePlannedWorksEvents,
} from '../lib/config';
import { defaultWeekStart, addDaysStr, formatDateRange } from '../lib/plannedWorksWeek';

/**
 * Estates weekly "Planned Works" log. Managers enter the week's work here;
 * Umayma downloads one Excel file that matches the existing weekly sheet
 * and emails it on manually (no email sending built here).
 *
 * Design: skips a spreadsheet-in-a-table. Adding a row is a short modal
 * with the date defaulted to the week and "entered by" remembered per
 * browser, so it's fast mid-conversation. Reviewing last week is a
 * dedicated triage panel (Completed / Carry over, two taps, nothing else)
 * rather than editing old rows in place. The export button always shows
 * what's about to go out and flags anything missing a date before download,
 * so Friday's export is never a surprise.
 */

const ENTERED_BY_KEY = 'gc_planned_works_entered_by';

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16,
};

function blankLine() { return { dateFrom: '', dateTo: '', name: '', phone: '' }; }
function padLines(lines) {
  const out = Array.isArray(lines) ? [...lines] : [];
  while (out.length < 3) out.push(blankLine());
  return out;
}

function reviewBadge(row) {
  if (row.carriedFromId && !row.startDate) return { text: 'Carried over - needs date', cls: 'badge--requested' };
  if (row.carriedFromId) return { text: 'Carried over', cls: 'badge--completed' };
  if (!row.startDate) return { text: 'Needs date', cls: 'badge--requested' };
  if (row.reviewStatus === 'Completed') return { text: 'Completed', cls: 'badge--completed' };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

function RowCard({ row, onEdit, onDelete }) {
  const badge = reviewBadge(row);
  return (
    <div className="pw-row" onClick={() => onEdit(row)}>
      <div className="pw-row__date">{formatDateRange(row.startDate, row.endDate) || '—'}</div>
      <div className="pw-row__main">
        <div className="pw-row__company">{row.companyName}</div>
        <div className="pw-row__sub">{row.description}</div>
        {(row.buildingName || row.personInCharge) && (
          <div className="pw-row__meta">
            {row.buildingName}{row.buildingName && row.personInCharge ? ' · ' : ''}{row.personInCharge}
          </div>
        )}
      </div>
      {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
      <button className="btn btn--secondary btn--sm" onClick={(e) => { e.stopPropagation(); onDelete(row); }}>Delete</button>
    </div>
  );
}

function ReviewPanel({ pendingRows, onReview }) {
  if (!pendingRows || pendingRows.length === 0) return null;
  return (
    <div className="card" style={{ background: 'var(--bg-subtle)', marginBottom: 16 }}>
      <p className="card__title">Review Last Week — {pendingRows.length} pending</p>
      {pendingRows.map((row) => (
        <div key={row.id} className="pw-review-row">
          <div>
            <div className="text-strong">{row.companyName}</div>
            <div className="text-sm text-muted">{row.description}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--secondary btn--sm" onClick={() => onReview(row, 'complete')}>Completed</button>
            <button className="btn btn--secondary btn--sm" onClick={() => onReview(row, 'carry-over')}>Carry Over</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Tracker({ tracker }) {
  return (
    <div className="pw-tracker">
      {Object.entries(tracker || {}).map(([name, count]) => (
        <div key={name} className="pw-tracker__chip">
          <span className="text-strong">{name}</span>
          <span className="text-muted text-sm">{count === 0 ? 'nothing added yet' : `${count} row${count !== 1 ? 's' : ''}`}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// Dropdown that also shows a row's existing value when it isn't one of the
// fixed options (legacy free-text rows), so opening + saving a row never
// silently blanks that field.
function ChoiceSelect({ value, options, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Select —</option>
      {value && !options.includes(value) && <option value={value}>{value}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function RowModal({ mode, initial, weekStart, enteredBy, companySuggestions, onSave, onCancel }) {
  const [f, setF] = useState(initial ? {
    ...initial,
    buildingName:       normalisePlannedWorksBuilding(initial.buildingName),
    ramsSignedOff:      normalisePlannedWorksRams(initial.ramsSignedOff),
    eventsTeamNotified: normalisePlannedWorksEvents(initial.eventsTeamNotified),
  } : {
    companyName: '', description: '', buildingName: '', startDate: weekStart, endDate: '',
    location: '', personInCharge: '', ramsSignedOff: '', eventsTeamNotified: '',
    parkingRequired: '', comments: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(key, val) { setF((p) => ({ ...p, [key]: val })); }

  async function handleSubmit() {
    setError('');
    if (!f.companyName.trim() || !f.description.trim() || (mode === 'new' && !f.startDate)) {
      setError(`Company, description${mode === 'new' ? ' and start date' : ''} are required.`);
      return;
    }
    setSaving(true);
    try {
      const body = mode === 'new'
        ? { action: 'create-row', weekStart, ...f, addedBy: enteredBy }
        : { action: 'update-row', id: initial.id, ...f, editedBy: enteredBy };
      const res  = await dashFetch('/api/planned-works-save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) onSave();
      else setError(json.message);
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div className="card" style={{ maxWidth: 520, width: '92%', margin: 0, maxHeight: '90vh', overflowY: 'auto' }}>
        <p className="card__title">{mode === 'new' ? 'New Planned Work' : 'Edit Planned Work'}</p>
        <p className="text-sm text-muted mb-2">Entered by: <strong>{enteredBy}</strong></p>
        {error && <div className="alert alert--error">{error}</div>}

        <div className="form-group">
          <label htmlFor="pwCompany">Company Name *</label>
          <input id="pwCompany" list="pwCompanyList" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} />
          <datalist id="pwCompanyList">
            {companySuggestions.map((n) => <option key={n} value={n} />)}
          </datalist>
        </div>
        <div className="form-group"><label>Brief Description of Work *</label><textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
        <div className="form-group">
          <label>Building Name</label>
          <ChoiceSelect value={f.buildingName} options={PLANNED_WORKS_BUILDINGS} onChange={(v) => set('buildingName', v)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group"><label>Start Date {mode === 'new' && '*'}</label><input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></div>
          <div className="form-group"><label>End Date <span className="text-muted text-sm">(optional)</span></label><input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></div>
        </div>

        <div className="form-group"><label>Location</label><input value={f.location} onChange={(e) => set('location', e.target.value)} /></div>
        <div className="form-group">
          <label>Name of Person in Charge of Work</label>
          <ChoiceSelect value={f.personInCharge} options={PLANNED_WORKS_PEOPLE} onChange={(v) => set('personInCharge', v)} />
        </div>

        <div className="form-group">
          <label>RAMs Reviewed and Signed Off?</label>
          <ChoiceSelect value={f.ramsSignedOff} options={PLANNED_WORKS_RAMS_OPTIONS} onChange={(v) => set('ramsSignedOff', v)} />
        </div>

        <div className="form-group">
          <label>Events Team Notified Where Applicable</label>
          <ChoiceSelect value={f.eventsTeamNotified} options={PLANNED_WORKS_EVENTS_OPTIONS} onChange={(v) => set('eventsTeamNotified', v)} />
        </div>
        <div className="form-group">
          <label>Is Parking Required <span className="text-muted text-sm">(Y/N and reg no. — free text)</span></label>
          <input value={f.parkingRequired} onChange={(e) => set('parkingRequired', e.target.value)} placeholder="e.g. Y - AB12 CDE" />
        </div>
        <div className="form-group"><label>Comments</label><textarea rows={2} value={f.comments} onChange={(e) => set('comments', e.target.value)} /></div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--primary" disabled={saving} onClick={handleSubmit}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function OnCallLineEditor({ line, onChange, onRemove, canRemove }) {
  return (
    <div className="pw-oncall-line">
      <input type="date" value={line.dateFrom} onChange={(e) => onChange({ ...line, dateFrom: e.target.value })} />
      <input type="date" value={line.dateTo} onChange={(e) => onChange({ ...line, dateTo: e.target.value })} />
      <input type="text" placeholder="Name" value={line.name} onChange={(e) => onChange({ ...line, name: e.target.value })} />
      <input type="tel" placeholder="Phone" value={line.phone} onChange={(e) => onChange({ ...line, phone: e.target.value })} />
      {canRemove && <button type="button" className="btn btn--secondary btn--sm" onClick={onRemove}>Remove</button>}
    </div>
  );
}

function OnCallPanel({ form, setForm, onSave, saving, message }) {
  if (!form) return null;

  function updateLine(group, idx, updated) {
    setForm((p) => ({ ...p, [group]: p[group].map((l, i) => (i === idx ? updated : l)) }));
  }
  function addLine(group) {
    setForm((p) => ({ ...p, [group]: [...p[group], blankLine()] }));
  }
  function removeLine(group, idx) {
    setForm((p) => ({ ...p, [group]: p[group].filter((_, i) => i !== idx) }));
  }

  return (
    <div className="card">
      <p className="card__title">On Call</p>
      {message && <div className={`alert alert--${message.type}`}>{message.text}</div>}

      {[['estateDutyManager', 'Estate Duty Manager'], ['calloutEngineers', 'Call-out Engineers']].map(([key, label]) => (
        <div key={key} className="mb-4">
          <p className="text-sm text-strong mb-2">{label}</p>
          {form[key].map((line, i) => (
            <OnCallLineEditor
              key={i} line={line}
              onChange={(u) => updateLine(key, i, u)}
              onRemove={() => removeLine(key, i)}
              canRemove={form[key].length > 3}
            />
          ))}
          <button type="button" className="btn btn--secondary btn--sm mt-2" onClick={() => addLine(key)}>+ Add line</button>
        </div>
      ))}

      <button className="btn btn--primary" disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save On-Call'}</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PlannedWorksTab() {
  const [weekStart, setWeekStart] = useState(() => defaultWeekStart());
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const [enteredBy, setEnteredBy] = useState(() => {
    try { return localStorage.getItem(ENTERED_BY_KEY) || ''; } catch { return ''; }
  });

  const [companySuggestions, setCompanySuggestions] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const res  = await dashFetch('/api/planned-works?suggestions=1');
        const json = await res.json();
        if (json.success) setCompanySuggestions(json.companySuggestions);
      } catch { /* ignore — suggestions are non-critical */ }
    })();
  }, []);

  const [rowModal, setRowModal] = useState(null); // { mode: 'new'|'edit', initial? }
  const [message, setMessage]   = useState(null);

  const [mode, setMode]                 = useState('week'); // 'week' | 'search'
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]       = useState(false);

  const [oncallForm, setOncallForm]   = useState(null);
  const [oncallSaving, setOncallSaving] = useState(false);
  const [oncallMsg, setOncallMsg]     = useState('');

  const fetchWeek = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await dashFetch(`/api/planned-works?weekStart=${weekStart}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        const hasSaved = json.oncall.estateDutyManager.length > 0 || json.oncall.calloutEngineers.length > 0;
        setOncallForm({
          estateDutyManager: padLines(hasSaved ? json.oncall.estateDutyManager : json.previousOncall.estateDutyManager),
          calloutEngineers:  padLines(hasSaved ? json.oncall.calloutEngineers : json.previousOncall.calloutEngineers),
        });
      } else {
        setError(json.message || 'Failed to load this week.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { fetchWeek(); }, [fetchWeek]);

  useEffect(() => {
    if (mode !== 'search' || !searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await dashFetch(`/api/planned-works-search?q=${encodeURIComponent(searchQuery.trim())}`);
        const json = await res.json();
        if (json.success) setSearchResults(json.results);
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [mode, searchQuery]);

  function pickEnteredBy(name) {
    setEnteredBy(name);
    try { localStorage.setItem(ENTERED_BY_KEY, name); } catch { /* ignore */ }
  }

  function handleRowSaved() {
    setRowModal(null);
    setMessage({ type: 'success', text: 'Saved.' });
    fetchWeek();
  }

  async function handleDelete(row) {
    if (!enteredBy) { setMessage({ type: 'error', text: 'Select who you are first.' }); return; }
    if (!confirm(`Delete the row for "${row.companyName}"? This can't be undone from here.`)) return;
    try {
      const res  = await dashFetch('/api/planned-works-save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-row', id: row.id, editedBy: enteredBy }),
      });
      const json = await res.json();
      if (json.success) { setMessage({ type: 'success', text: 'Deleted.' }); fetchWeek(); }
      else setMessage({ type: 'error', text: json.message });
    } catch {
      setMessage({ type: 'error', text: 'Network error.' });
    }
  }

  async function handleReview(row, reviewAction) {
    if (!enteredBy) { setMessage({ type: 'error', text: 'Select who you are first.' }); return; }
    try {
      const res  = await dashFetch('/api/planned-works-save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review-row', id: row.id, reviewAction, performedBy: enteredBy }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: reviewAction === 'complete' ? 'Marked completed.' : 'Carried over to this week.' });
        fetchWeek();
      } else {
        setMessage({ type: 'error', text: json.message });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error.' });
    }
  }

  async function handleSaveOncall() {
    if (!enteredBy) { setOncallMsg({ type: 'error', text: 'Select who you are first.' }); return; }
    setOncallSaving(true); setOncallMsg('');
    try {
      const res  = await dashFetch('/api/planned-works-save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-oncall', weekStart, ...oncallForm, updatedBy: enteredBy }),
      });
      const json = await res.json();
      if (json.success) setOncallMsg({ type: 'success', text: 'On-call saved.' });
      else setOncallMsg({ type: 'error', text: json.message });
    } catch {
      setOncallMsg({ type: 'error', text: 'Network error.' });
    } finally {
      setOncallSaving(false);
    }
  }

  if (loading && !data) return <p className="text-muted text-sm">Loading…</p>;
  if (error && !data) return <div className="alert alert--error">{error}</div>;
  if (!data) return null;

  const weekendRows = data.rows.filter((r) => r.startDate === data.weekendStart || r.startDate === data.weekendEnd);
  const weekRows     = data.rows.filter((r) => !(r.startDate === data.weekendStart || r.startDate === data.weekendEnd));
  const undatedCount = data.rows.filter((r) => !r.startDate).length;

  return (
    <div>
      {rowModal && (
        <RowModal
          mode={rowModal.mode}
          initial={rowModal.initial}
          weekStart={weekStart}
          enteredBy={enteredBy}
          companySuggestions={companySuggestions}
          onSave={handleRowSaved}
          onCancel={() => setRowModal(null)}
        />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 240 }}>
          <label htmlFor="pwEnteredBy">Entered by</label>
          <select id="pwEnteredBy" value={enteredBy} onChange={(e) => pickEnteredBy(e.target.value)}>
            <option value="">— Select —</option>
            {PLANNED_WORKS_MANAGERS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <button
          className="btn btn--secondary btn--sm"
          onClick={() => setMode(mode === 'week' ? 'search' : 'week')}
        >
          {mode === 'week' ? 'Search all weeks' : '← Back to week view'}
        </button>
      </div>

      {mode === 'search' ? (
        <div>
          <div className="form-group">
            <input
              type="text" placeholder="Search company, description, building, person in charge, comments, parking…"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searching && <p className="text-muted text-sm">Searching…</p>}
          {!searching && searchQuery.trim() && searchResults.length === 0 && (
            <p className="text-muted text-sm">No matches.</p>
          )}
          {searchResults.map((r) => (
            <div
              key={r.id} className="pw-row"
              onClick={() => { setWeekStart(r.weekStart); setMode('week'); setSearchQuery(''); }}
            >
              <div className="pw-row__date">Week {r.isoWeek}</div>
              <div className="pw-row__main">
                <div className="pw-row__company">{r.companyName}</div>
                <div className="pw-row__sub">{r.description}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="pw-nav">
            <button className="btn btn--secondary btn--sm" onClick={() => setWeekStart(addDaysStr(weekStart, -7))}>← Prev week</button>
            <span className="pw-nav__label">Week {data.isoWeek} — {data.isoYear}</span>
            <button className="btn btn--secondary btn--sm" onClick={() => setWeekStart(addDaysStr(weekStart, 7))}>Next week →</button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <a
              className="btn btn--primary btn--sm"
              href={`/api/planned-works-export?weekStart=${weekStart}`}
              onClick={(e) => {
                if (undatedCount > 0 && !confirm(`${undatedCount} row(s) need a date. They'll be included at the bottom of the week table. Continue with export?`)) {
                  e.preventDefault();
                }
              }}
            >
              Download Excel (Week {data.isoWeek}) — for {PLANNED_WORKS_ADMIN}
            </a>
            {undatedCount > 0 && (
              <span className="text-sm" style={{ color: '#92400e' }}>
                {undatedCount} row{undatedCount !== 1 ? 's' : ''} need{undatedCount === 1 ? 's' : ''} a date
              </span>
            )}
          </div>

          {message && (
            <div className={`alert alert--${message.type === 'error' ? 'error' : 'success'}`}>{message.text}</div>
          )}

          <ReviewPanel pendingRows={data.previousWeekPending} onReview={handleReview} />

          <Tracker tracker={data.tracker} />

          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p className="card__title" style={{ marginBottom: 0 }}>
                Weekend Works — {formatDateRange(data.weekendStart, data.weekendEnd)}
              </p>
              <button
                className="btn btn--secondary btn--sm"
                disabled={!enteredBy}
                title={!enteredBy ? 'Select who you are first' : ''}
                onClick={() => setRowModal({ mode: 'new' })}
              >
                + Add Row
              </button>
            </div>
            {weekendRows.length === 0 && <p className="text-muted text-sm">No weekend works logged yet.</p>}
            {weekendRows.map((r) => (
              <RowCard key={r.id} row={r} onEdit={(row) => setRowModal({ mode: 'edit', initial: row })} onDelete={handleDelete} />
            ))}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p className="card__title" style={{ marginBottom: 0 }}>
                Week — {formatDateRange(weekStart, data.weekEnd)}
              </p>
              <button
                className="btn btn--secondary btn--sm"
                disabled={!enteredBy}
                title={!enteredBy ? 'Select who you are first' : ''}
                onClick={() => setRowModal({ mode: 'new' })}
              >
                + Add Row
              </button>
            </div>
            {weekRows.length === 0 && <p className="text-muted text-sm">No planned works logged yet.</p>}
            {weekRows.map((r) => (
              <RowCard key={r.id} row={r} onEdit={(row) => setRowModal({ mode: 'edit', initial: row })} onDelete={handleDelete} />
            ))}
          </div>

          <OnCallPanel form={oncallForm} setForm={setOncallForm} onSave={handleSaveOncall} saving={oncallSaving} message={oncallMsg} />
        </>
      )}
    </div>
  );
}
