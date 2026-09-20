import { useState, useEffect, useCallback } from 'react';
import { ENGINEERS } from '../lib/config';
import EngineerOvertimeForm from './EngineerOvertimeForm';

const NAME_KEY   = 'gc_engineer_name';
const DEVICE_KEY = 'gc_device_id';

const EARLY_REASONS = [
  'Job finished / no more work today',
  'Off-site task, training or meeting',
  'Agreed with my manager',
  'Appointment or personal reason',
  'Unwell',
  'Other',
];

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

// signInStr is UK wall-clock text "YYYY-MM-DD HH:mm:ss" — just show the time part.
function fmtTime(signInStr) {
  if (!signInStr) return '';
  const time = signInStr.split(' ')[1];
  return time ? time.slice(0, 5) : signInStr;
}

export default function EngineerShiftForm() {
  const [engineerName, setEngineerName] = useState('');
  const [deviceId, setDeviceId]         = useState('');
  const [ready, setReady]               = useState(false);

  const [view, setView] = useState('picker'); // 'picker' | 'overtime'

  const [status, setStatus]               = useState(null); // { state, shift }
  const [statusLoading, setStatusLoading] = useState(false);

  const [earlyScreen, setEarlyScreen] = useState(false);
  const [reason, setReason]           = useState('');
  const [note, setNote]               = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  // ── Restore remembered engineer name + device id on mount ────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) setEngineerName(saved);
    } catch { /* localStorage blocked (private mode) — fall back to name picker */ }
    setDeviceId(getOrCreateDeviceId());
    setReady(true);
  }, []);

  const fetchStatus = useCallback(async (name) => {
    setStatusLoading(true);
    try {
      const res  = await fetch(`/api/shift-status?engineerName=${encodeURIComponent(name)}`);
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ state: 'NONE', shift: null });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (engineerName && view === 'picker') fetchStatus(engineerName);
  }, [engineerName, view, fetchStatus]);

  function chooseEngineer(name) {
    try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
    setResult(null);
    setEngineerName(name);
  }

  function notYou() {
    try { localStorage.removeItem(NAME_KEY); } catch { /* ignore */ }
    setEngineerName('');
    setStatus(null);
    setView('picker');
    setResult(null);
  }

  async function submitSignOut(chosenReason, chosenNote) {
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch('/api/shift-signout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ engineerName, earlyReason: chosenReason, earlyNote: chosenNote }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ type: 'success', message: data.message });
        setEarlyScreen(false);
        setReason('');
        setNote('');
        fetchStatus(engineerName);
      } else if (res.status === 400 && !chosenReason) {
        // Server determined the shift is under 8h and a reason is required —
        // the server's elapsed-time calculation is authoritative regardless
        // of what the phone's own clock thinks, so defer to it here rather
        // than trusting a client-side hours estimate.
        setEarlyScreen(true);
      } else {
        setResult({ type: 'error', message: data.message });
        setEarlyScreen(false);
      }
    } catch {
      setResult({ type: 'error', message: 'Network error. Please check your connection.' });
    } finally {
      setLoading(false);
    }
  }

  // ── Main "Shift" button: sign in, or hand off to the server for sign-out ────────
  async function handleShiftTap() {
    if (!status) return;
    setResult(null);

    if (status.state === 'NONE') {
      setLoading(true);
      try {
        const res  = await fetch('/api/shift-signin', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ engineerName, deviceId }),
        });
        const data = await res.json();
        if (data.success) {
          setResult({ type: 'success', message: data.message });
          fetchStatus(engineerName);
        } else {
          setResult({ type: 'error', message: data.message });
        }
      } catch {
        setResult({ type: 'error', message: 'Network error. Please check your connection.' });
      } finally {
        setLoading(false);
      }
      return;
    }

    if (status.state === 'OPEN') {
      // Always ask the server first, with no reason — it computes elapsed
      // hours itself and tells us (via a 400) if a reason is actually needed.
      // This keeps the phone's own clock out of the decision entirely.
      submitSignOut('', '');
    }
  }

  function confirmEarlySignOut() {
    if (!reason) {
      setResult({ type: 'error', message: 'Please choose a reason.' });
      return;
    }
    submitSignOut(reason, note);
  }

  if (!ready) return null;

  // ── Step 0: pick your name ────────────────────────────────────────────────────
  if (!engineerName) {
    return (
      <div className="card">
        <p className="card__title">Who's signing in?</p>
        <div className="picker-stack">
          {ENGINEERS.map((eng) => (
            <button
              key={eng}
              type="button"
              className="btn btn--secondary"
              onClick={() => chooseEngineer(eng)}
            >
              {eng}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Overtime sub-view (existing flow, unchanged) ────────────────────────────────
  if (view === 'overtime') {
    return (
      <div>
        <button
          type="button"
          style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', padding: '4px 0 12px', display: 'block' }}
          onClick={() => setView('picker')}
        >
          ← Back
        </button>
        <EngineerOvertimeForm />
      </div>
    );
  }

  // ── Early sign-out reason screen ────────────────────────────────────────────────
  if (earlyScreen) {
    return (
      <div>
        {result && (
          <div className={`alert alert--${result.type === 'success' ? 'success' : 'error'}`}>
            {result.message}
          </div>
        )}
        <div className="card">
          <p className="card__title">Where did today's time go?</p>
          <div className="chip-group">
            {EARLY_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className={`chip ${reason === r ? 'chip--selected' : ''}`}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="form-group mt-2">
            <label htmlFor="earlyNote">
              Anything to add? <span className="text-muted text-sm">(optional)</span>
            </label>
            <textarea
              id="earlyNote"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note…"
            />
          </div>
        </div>

        <button className="btn btn--primary" disabled={loading || !reason} onClick={confirmEarlySignOut}>
          {loading && <span className="spinner" />}
          {loading ? 'Signing Out…' : 'Confirm Sign Out'}
        </button>
        <button
          type="button"
          className="btn btn--secondary mt-2"
          onClick={() => { setEarlyScreen(false); setReason(''); setNote(''); }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Main two-button screen ──────────────────────────────────────────────────────
  return (
    <div>
      <div className="card">
        <p className="card__title">Hi, {engineerName}</p>
        <button
          type="button"
          onClick={notYou}
          style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}
        >
          Not you?
        </button>
      </div>

      {result && (
        <div className={`alert alert--${result.type === 'success' ? 'success' : 'error'}`}>
          {result.message}
        </div>
      )}

      {status?.state === 'MISSING_SIGNOUT' && (
        <div className="alert alert--info">
          Thanks for today — a manager will confirm your hours for today's shift.
        </div>
      )}

      {status?.state === 'COMPLETE_TODAY' && (
        <div className="alert alert--info">
          Your shift is complete for today. See you next time.
        </div>
      )}

      {(status?.state === 'NONE' || status?.state === 'OPEN') && (
        <button
          type="button"
          className="btn btn--primary btn--xl"
          disabled={statusLoading || loading}
          onClick={handleShiftTap}
        >
          {loading && <span className="spinner" />}
          {status?.state === 'OPEN'
            ? (loading ? 'Signing Out…' : `Sign Out (in since ${fmtTime(status.shift?.signInTime)})`)
            : (loading ? 'Starting…' : 'Shift')}
        </button>
      )}

      <button
        type="button"
        className="btn btn--secondary btn--xl mt-2"
        onClick={() => setView('overtime')}
      >
        Overtime
      </button>
    </div>
  );
}
