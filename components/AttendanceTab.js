import { useState, useEffect, useCallback, Fragment } from 'react';
import { ENGINEERS, WEEK_START_DAY } from '../lib/config';
import { dashFetch } from '../lib/sessionClient';

/**
 * Manager-only view of engineer SHIFT data (shift_log) — Live / Week / Month.
 *
 * Design: avoids a stock table-plus-chart. Week uses small vertical "capsule"
 * cells that fill from the bottom toward 8h, so a whole team's week reads as
 * a skyline at a glance. Month uses a per-engineer calendar heat-map (small
 * multiples) so one engineer's whole month is scannable as a single shape in
 * a couple of seconds, the same idea as a GitHub contribution graph. Both
 * reuse one shared tooltip (positioned at the tapped/hovered cell) rather
 * than a cell-per-tooltip DOM, so it always renders on top regardless of any
 * scroll container and works identically for mouse hover and touch tap.
 */

const FULL_SHIFT_HOURS = 8;

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function isWeekendDay(d) { const day = d.getDay(); return day === 0 || day === 6; }

// Start-of-week date (JS getDay() convention: 0=Sun..6=Sat) containing d.
function weekStartOf(d, weekStartDay) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const diff = (c.getDay() - weekStartDay + 7) % 7;
  c.setDate(c.getDate() - diff);
  return c;
}

function parseHours(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Value is UK wall-clock text "YYYY-MM-DD HH:mm:ss" (or a datetime-local
// "YYYY-MM-DDTHH:mm") — just take the time part, no Date arithmetic needed.
function fmtTimeOfDay(str) {
  if (!str) return '';
  const t = str.includes('T') ? str.split('T')[1] : str.split(' ')[1];
  return t ? t.slice(0, 5) : '';
}

function fmtDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function heatClass(hours) {
  const ratio = hours / FULL_SHIFT_HOURS;
  if (hours <= 0) return 'attn-heat-0';
  if (ratio < 0.25) return 'attn-heat-1';
  if (ratio < 0.5) return 'attn-heat-2';
  if (ratio < 0.85) return 'attn-heat-3';
  return 'attn-heat-4';
}

function tooltipBody(rec) {
  const lines = [];
  lines.push(`Signed in: ${fmtTimeOfDay(rec.signInTime) || '—'}`);
  if (rec.status === 'MISSING_SIGNOUT') {
    lines.push('Status: missing sign-out');
  } else if (rec.signOutTime) {
    lines.push(`Signed out: ${fmtTimeOfDay(rec.signOutTime)}`);
  }
  if (rec.earlyReason) {
    lines.push(`Reason: ${rec.earlyReason}${rec.earlyNote ? ' — ' + rec.earlyNote : ''}`);
  }
  if (rec.correctedBy) {
    lines.push(`Corrected by ${rec.correctedBy}${rec.correctionNote ? ': ' + rec.correctionNote : ''}`);
  }
  return lines.join('\n');
}

function buildMonthGrid(monthAnchor) {
  const monthStart = monthAnchor;
  const monthEnd = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
  const gridStart = weekStartOf(monthStart, WEEK_START_DAY);
  const gridEnd = addDays(weekStartOf(monthEnd, WEEK_START_DAY), 6);
  const days = [];
  for (let cur = gridStart; cur <= gridEnd; cur = addDays(cur, 1)) days.push(cur);
  return { days, monthStart, monthEnd };
}

// ─────────────────────────────────────────────────────────────────────────────

function LiveView({ records, loading, error, onCorrect, onDelete }) {
  if (loading) return <p className="text-muted text-sm">Loading…</p>;
  if (error) return <div className="alert alert--error">{error}</div>;

  const missing = records
    .filter((r) => r.status === 'MISSING_SIGNOUT')
    .sort((a, b) => a.shiftDate.localeCompare(b.shiftDate));
  const open = records
    .filter((r) => r.status === 'OPEN')
    .sort((a, b) => (a.signInTime || '').localeCompare(b.signInTime || ''));

  if (missing.length === 0 && open.length === 0) {
    return <p className="text-muted text-sm">No one is currently on shift.</p>;
  }

  return (
    <div className="attn-live-list">
      {missing.map((r) => (
        <div key={r._row} className="attn-live-row attn-live-row--missing">
          <div>
            <div className="text-strong">{r.engineerName}</div>
            <div className="text-sm text-muted">
              Missing sign-out — signed in {fmtTimeOfDay(r.signInTime)} on {fmtDateLabel(r.shiftDate)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--secondary btn--sm" onClick={() => onCorrect(r)}>Correct</button>
            <button className="btn btn--secondary btn--sm" onClick={() => onDelete(r)}>Delete</button>
          </div>
        </div>
      ))}
      {open.map((r) => (
        <div key={r._row} className="attn-live-row">
          <div>
            <div className="text-strong">{r.engineerName}</div>
            <div className="text-sm text-muted">On shift since {fmtTimeOfDay(r.signInTime)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge badge--active">Active</span>
            <button className="btn btn--secondary btn--sm" onClick={() => onDelete(r)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CorrectShiftModal({ shift, managers, onConfirm, onCancel }) {
  const [managerName, setManagerName] = useState('');
  const [pin, setPin] = useState('');
  const [signOutTime, setSignOutTime] = useState(`${shift.shiftDate}T17:00`);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function valid() {
    return !!(managerName && pin.trim() && signOutTime && note.trim());
  }

  async function handleSave() {
    setError('');
    if (!valid()) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      const res = await dashFetch('/api/shift-correct', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rowId: shift._row, managerName, pin, signOutTime, note: note.trim() }),
      });
      const data = await res.json();
      if (data.success) onConfirm(data.message);
      else setError(data.message);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
      <div className="card" style={{ maxWidth: 420, width: '90%', margin: 0 }}>
        <p className="card__title">Correct Shift — {shift.engineerName}</p>
        {error && <div className="alert alert--error">{error}</div>}

        <p className="text-sm text-muted mb-2">
          Signed in {fmtTimeOfDay(shift.signInTime) || '—'} on {fmtDateLabel(shift.shiftDate)}.
        </p>

        <div className="form-group">
          <label htmlFor="corrSignOut">Sign-out time *</label>
          <input
            id="corrSignOut"
            type="datetime-local"
            value={signOutTime}
            onChange={(e) => setSignOutTime(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="corrNote">Note *</label>
          <textarea
            id="corrNote"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened / why this time…"
          />
        </div>

        <div className="form-group">
          <label htmlFor="corrManager">Manager name *</label>
          <select id="corrManager" value={managerName} onChange={(e) => setManagerName(e.target.value)}>
            <option value="">— Select —</option>
            {managers.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="corrPin">Your PIN *</label>
          <input id="corrPin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--primary" disabled={loading} onClick={handleSave}>
            {loading ? 'Saving…' : 'Save Correction'}
          </button>
          <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function DeleteShiftModal({ shift, managers, onConfirm, onCancel }) {
  const [managerName, setManagerName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setError('');
    if (!managerName || !pin.trim()) { setError('Please select your name and enter your PIN.'); return; }
    setLoading(true);
    try {
      const res = await dashFetch('/api/shift-delete', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rowId: shift._row, managerName, pin }),
      });
      const data = await res.json();
      if (data.success) onConfirm(data.message);
      else setError(data.message);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
      <div className="card" style={{ maxWidth: 420, width: '90%', margin: 0 }}>
        <p className="card__title">Delete Shift — {shift.engineerName}</p>
        {error && <div className="alert alert--error">{error}</div>}

        <div className="alert alert--error">
          This permanently deletes this record and cannot be undone.
        </div>
        <p className="text-sm text-muted mb-2">
          {fmtDateLabel(shift.shiftDate)}, signed in {fmtTimeOfDay(shift.signInTime) || '—'}
          {shift.signOutTime ? `, out ${fmtTimeOfDay(shift.signOutTime)}` : ''}
          {parseHours(shift.hours) > 0 ? ` (${parseHours(shift.hours).toFixed(2)}h)` : ''}.
        </p>

        <div className="form-group">
          <label htmlFor="delManager">Manager name *</label>
          <select id="delManager" value={managerName} onChange={(e) => setManagerName(e.target.value)}>
            <option value="">— Select —</option>
            {managers.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="delPin">Your PIN *</label>
          <input id="delPin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--primary" disabled={loading} onClick={handleDelete}>
            {loading ? 'Deleting…' : 'Delete permanently'}
          </button>
          <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AttendanceTab({ managers = [] }) {
  const [view, setView] = useState('live'); // 'live' | 'week' | 'month'

  const [liveRecords, setLiveRecords] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError]     = useState(null);

  const [weekAnchor, setWeekAnchor]   = useState(weekStartOf(new Date(), WEEK_START_DAY));
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  const [rangeRecords, setRangeRecords] = useState([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError]     = useState(null);

  const [correctModal, setCorrectModal] = useState(null);
  const [correctMsg, setCorrectMsg]     = useState('');
  const [deleteModal, setDeleteModal]   = useState(null);
  const [tooltip, setTooltip]           = useState(null); // { rec, x, y, label }

  const fetchLive = useCallback(async () => {
    setLiveLoading(true); setLiveError(null);
    try {
      const now  = new Date();
      const to   = toDateStr(now);
      const from = toDateStr(addDays(now, -14));
      const res  = await dashFetch(`/api/shift-list?from=${from}&to=${to}&status=OPEN,MISSING_SIGNOUT`);
      const data = await res.json();
      if (data.success) setLiveRecords(data.records);
      else setLiveError('Failed to load attendance data.');
    } catch {
      setLiveError('Network error.');
    } finally {
      setLiveLoading(false);
    }
  }, []);

  const fetchRange = useCallback(async (from, to) => {
    setRangeLoading(true); setRangeError(null);
    try {
      const res  = await dashFetch(`/api/shift-list?from=${from}&to=${to}`);
      const data = await res.json();
      if (data.success) setRangeRecords(data.records);
      else setRangeError('Failed to load attendance data.');
    } catch {
      setRangeError('Network error.');
    } finally {
      setRangeLoading(false);
    }
  }, []);

  // Fetch whichever view's data is currently needed — a whole week, or a
  // whole month padded out to full calendar weeks so the grid never shows a
  // partial, data-less edge week.
  useEffect(() => {
    if (view === 'live') { fetchLive(); return; }
    if (view === 'week') {
      fetchRange(toDateStr(weekAnchor), toDateStr(addDays(weekAnchor, 6)));
      return;
    }
    const monthEnd = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
    fetchRange(
      toDateStr(weekStartOf(monthAnchor, WEEK_START_DAY)),
      toDateStr(addDays(weekStartOf(monthEnd, WEEK_START_DAY), 6))
    );
  }, [view, weekAnchor, monthAnchor, fetchLive, fetchRange]);

  // Close the shared tooltip on any click outside it — cell clicks already
  // stopPropagation, so only genuine outside clicks reach the document.
  useEffect(() => {
    if (!tooltip) return;
    const close = () => setTooltip(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [tooltip]);

  function refetchCurrentRange() {
    if (view === 'live') { fetchLive(); return; }
    if (view === 'week') {
      fetchRange(toDateStr(weekAnchor), toDateStr(addDays(weekAnchor, 6)));
      return;
    }
    const monthEnd = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
    fetchRange(
      toDateStr(weekStartOf(monthAnchor, WEEK_START_DAY)),
      toDateStr(addDays(weekStartOf(monthEnd, WEEK_START_DAY), 6))
    );
  }

  function openCorrect(rec) {
    setTooltip(null);
    setCorrectMsg('');
    setCorrectModal(rec);
  }

  function openDelete(rec) {
    setTooltip(null);
    setCorrectMsg('');
    setDeleteModal(rec);
  }

  function handleDeleted(msg) {
    setDeleteModal(null);
    setCorrectMsg(msg);
    refetchCurrentRange();
  }

  function handleCorrected(msg) {
    setCorrectModal(null);
    setCorrectMsg(msg);
    refetchCurrentRange();
  }

  // Position is read from the cell's DOM rect and turned into plain numbers
  // immediately, synchronously, before setTooltip is ever called. A
  // SyntheticEvent's currentTarget is only valid while React is actively
  // dispatching that event — reading it lazily inside a setState updater
  // (the previous shape) can run on a later tick (batching, Strict Mode's
  // double-invoke), by which point currentTarget reads as null. Capturing
  // the rect here and passing only numbers into state sidesteps that
  // entirely; nothing downstream ever touches the event or the DOM node.
  function showTooltip(el, rec, label) {
    const rect = el.getBoundingClientRect();
    const maxX = (typeof window !== 'undefined' ? window.innerWidth : 400) - 120;
    const x = Math.min(Math.max(rect.left + rect.width / 2, 120), Math.max(120, maxX));
    const y = rect.bottom + 8;
    setTooltip({ rec, x, y, label });
  }

  // Shared by click (mouse and touch-tap both fire this), hover, and
  // keyboard focus. Deliberately does not toggle closed on a repeat
  // activation of the same cell — it just (re)shows it — so a second tap on
  // the same cell is a harmless no-op rather than a close. The only way to
  // dismiss is activating a different cell or the outside-tap/click listener
  // below.
  function handleCellActivate(e, rec, label) {
    e.stopPropagation();
    showTooltip(e.currentTarget, rec, label);
  }

  function handleCellHover(e, rec, label) {
    showTooltip(e.currentTarget, rec, label);
  }

  const recordMap = {};
  for (const r of rangeRecords) recordMap[`${r.engineerName}|${r.shiftDate}`] = r;

  function renderCapsule(eng, dateObj) {
    const dateStr = toDateStr(dateObj);
    const rec     = recordMap[`${eng}|${dateStr}`];
    const weekend = isWeekendDay(dateObj);

    if (!rec) {
      return <div key={dateStr} className={`attn-capsule ${weekend ? 'attn-capsule--weekend' : 'attn-capsule--empty'}`} />;
    }

    if (rec.status === 'MISSING_SIGNOUT') {
      const missingLabel = `${eng} — Missing sign-out`;
      return (
        <div
          key={dateStr}
          className="attn-capsule attn-capsule--missing"
          tabIndex={0}
          role="button"
          aria-label={missingLabel}
          onClick={(e) => handleCellActivate(e, rec, missingLabel)}
          onMouseEnter={(e) => handleCellHover(e, rec, missingLabel)}
          onFocus={(e) => handleCellHover(e, rec, missingLabel)}
        />
      );
    }

    const hrs = parseHours(rec.hours);
    const fillPct = Math.min(100, Math.round((hrs / FULL_SHIFT_HOURS) * 100));
    const filledLabel = `${eng} — ${hrs.toFixed(2)}h`;

    return (
      <div
        key={dateStr}
        className={`attn-capsule attn-capsule--filled ${weekend ? 'attn-capsule--weekend-filled' : ''}`}
        tabIndex={0}
        role="button"
        aria-label={filledLabel}
        onClick={(e) => handleCellActivate(e, rec, filledLabel)}
        onMouseEnter={(e) => handleCellHover(e, rec, filledLabel)}
        onFocus={(e) => handleCellHover(e, rec, filledLabel)}
      >
        <div className="attn-capsule__fill" style={{ height: `${fillPct}%` }} />
        {rec.earlyReason && <span className="attn-capsule__icon" />}
      </div>
    );
  }

  function renderMonthCell(eng, dateObj) {
    const dateStr = toDateStr(dateObj);
    const outside = dateObj.getMonth() !== monthAnchor.getMonth();
    if (outside) return <div key={dateStr} className="attn-cal-cell attn-cal-cell--outside" />;

    const rec     = recordMap[`${eng}|${dateStr}`];
    const weekend = isWeekendDay(dateObj);

    let cls = 'attn-cal-cell';
    if (rec && rec.status === 'MISSING_SIGNOUT') cls += ' attn-cal-cell--missing';
    else if (rec) cls += ' ' + heatClass(parseHours(rec.hours));
    else cls += weekend ? ' attn-cal-cell--weekend' : ' attn-cal-cell--empty';

    const label = rec
      ? `${eng} — ${dateStr}${rec.status === 'MISSING_SIGNOUT' ? ' — Missing sign-out' : ` — ${parseHours(rec.hours).toFixed(2)}h`}`
      : '';

    return (
      <div
        key={dateStr}
        className={cls}
        tabIndex={rec ? 0 : undefined}
        role={rec ? 'button' : undefined}
        aria-label={rec ? label : undefined}
        onClick={rec ? (e) => handleCellActivate(e, rec, label) : undefined}
        onMouseEnter={rec ? (e) => handleCellHover(e, rec, label) : undefined}
        onFocus={rec ? (e) => handleCellHover(e, rec, label) : undefined}
      >
        <span className="attn-cal-cell__num">{dateObj.getDate()}</span>
        {rec && rec.earlyReason && <span className="attn-capsule__icon attn-capsule__icon--sm" />}
      </div>
    );
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i));
  const { days: monthDays, monthStart, monthEnd } = buildMonthGrid(monthAnchor);

  return (
    <div>
      {correctModal && (
        <CorrectShiftModal
          shift={correctModal}
          managers={managers}
          onConfirm={handleCorrected}
          onCancel={() => setCorrectModal(null)}
        />
      )}

      {deleteModal && (
        <DeleteShiftModal
          shift={deleteModal}
          managers={managers}
          onConfirm={handleDeleted}
          onCancel={() => setDeleteModal(null)}
        />
      )}

      {tooltip && (
        <div
          className="attn-tooltip"
          style={{ position: 'fixed', left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="attn-tooltip__title">{tooltip.label}</div>
          <div style={{ whiteSpace: 'pre-line' }}>{tooltipBody(tooltip.rec)}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tooltip.rec.status === 'MISSING_SIGNOUT' && (
              <button className="btn btn--secondary btn--sm mt-2" onClick={() => { setTooltip(null); openCorrect(tooltip.rec); }}>
                Correct
              </button>
            )}
            <button className="btn btn--secondary btn--sm mt-2" onClick={() => { setTooltip(null); openDelete(tooltip.rec); }}>
              Delete
            </button>
          </div>
        </div>
      )}

      {correctMsg && <div className="alert alert--success">{correctMsg}</div>}

      <div className="nav-tabs" style={{ marginBottom: 16, maxWidth: 320 }}>
        {[['live', 'Live'], ['week', 'Week'], ['month', 'Month']].map(([id, label]) => (
          <button
            key={id}
            className={`nav-tab ${view === id ? 'nav-tab--active' : ''}`}
            onClick={() => { setView(id); setTooltip(null); }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'live' && (
        <LiveView records={liveRecords} loading={liveLoading} error={liveError} onCorrect={openCorrect} onDelete={openDelete} />
      )}

      {view === 'week' && (
        <div>
          <div className="attn-nav">
            <button className="btn btn--secondary btn--sm" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}>← Prev week</button>
            <span className="attn-nav__label">{fmtDateLabel(toDateStr(weekDays[0]))} – {fmtDateLabel(toDateStr(weekDays[6]))}</span>
            <button className="btn btn--secondary btn--sm" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}>Next week →</button>
          </div>

          {rangeLoading && <p className="text-muted text-sm">Loading…</p>}
          {rangeError && <div className="alert alert--error">{rangeError}</div>}

          <div className="table-wrap">
            <div className="attn-week-grid">
              <div className="attn-week-grid__corner" />
              {weekDays.map((d) => (
                <div key={toDateStr(d)} className={`attn-day-head ${isWeekendDay(d) ? 'attn-day-head--weekend' : ''}`}>
                  <div>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                  <div className="text-muted text-xs">{d.getDate()}</div>
                </div>
              ))}

              {ENGINEERS.map((eng) => (
                <Fragment key={eng}>
                  <div className="attn-week-grid__name">{eng}</div>
                  {weekDays.map((d) => renderCapsule(eng, d))}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'month' && (
        <div>
          <div className="attn-nav">
            <button className="btn btn--secondary btn--sm" onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))}>← Prev month</button>
            <span className="attn-nav__label">{monthAnchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
            <button className="btn btn--secondary btn--sm" onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))}>Next month →</button>
          </div>

          {rangeLoading && <p className="text-muted text-sm">Loading…</p>}
          {rangeError && <div className="alert alert--error">{rangeError}</div>}

          {ENGINEERS.map((eng) => {
            const total = rangeRecords
              .filter((r) => r.engineerName === eng && r.status === 'COMPLETE'
                && r.shiftDate >= toDateStr(monthStart) && r.shiftDate <= toDateStr(monthEnd))
              .reduce((sum, r) => sum + parseHours(r.hours), 0);

            return (
              <div key={eng} className="attn-month-block">
                <div className="attn-month-header">
                  <span className="text-strong">{eng}</span>
                  <span className="text-muted text-sm">{total.toFixed(1)}h this month</span>
                </div>
                <div className="table-wrap">
                  <div className="attn-cal-grid">
                    {monthDays.map((d) => renderMonthCell(eng, d))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
