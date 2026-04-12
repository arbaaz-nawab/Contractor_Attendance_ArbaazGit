import { useState, useRef } from 'react';
import { ENGINEERS } from '../lib/config';

export default function EngineerOvertimeForm() {
  const [engineerName, setEngineerName]       = useState('');
  const [session, setSession]                 = useState(null);  // active overtime session if found
  const [checking, setChecking]               = useState(false);
  const [notes, setNotes]                     = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [photo, setPhoto]                     = useState(null);
  const [loading, setLoading]                 = useState(false);
  const [result, setResult]                   = useState(null);
  const fileInputRef = useRef();

  // ── Look up active session when engineer is selected ─────────────────────────
  async function handleEngineerChange(name) {
    setEngineerName(name);
    setSession(null);
    setResult(null);
    setNotes('');
    setWorkDescription('');
    setPhoto(null);

    if (!name) return;

    setChecking(true);
    try {
      const res  = await fetch(
        `/api/overtime-list?engineer=${encodeURIComponent(name)}&status=ACTIVE`
      );
      const data = await res.json();
      const active = data.records?.find(
        (r) => r.engineerName === name && r.status === 'ACTIVE'
      );
      setSession(active || null);
    } catch {
      setSession(null);
    } finally {
      setChecking(false);
    }
  }

  // ── Photo helpers ─────────────────────────────────────────────────────────────
  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhoto({ file, preview: URL.createObjectURL(file) });
  }

  function removePhoto() {
    setPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Sign in (start overtime) ──────────────────────────────────────────────────
  async function handleSignIn(e) {
    e.preventDefault();
    if (!engineerName) {
      setResult({ type: 'error', message: 'Please select your name.' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/overtime-signin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ engineerName, notes: notes.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        setResult({ type: 'success', message: data.message });
        setEngineerName('');
        setNotes('');
        setSession(null);
      } else {
        setResult({ type: 'error', message: data.message });
      }
    } catch {
      setResult({ type: 'error', message: 'Network error. Please check your connection.' });
    } finally {
      setLoading(false);
    }
  }

  // ── Sign out (end overtime) ───────────────────────────────────────────────────
  async function handleSignOut(e) {
    e.preventDefault();

    if (!workDescription.trim()) {
      setResult({ type: 'error', message: 'Please describe the work completed during overtime.' });
      return;
    }

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('engineerName',    engineerName);
    formData.append('workDescription', workDescription.trim());
    if (photo) formData.append('photo', photo.file);

    try {
      const res  = await fetch('/api/overtime-signout', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        setResult({ type: 'success', message: data.message });
        setEngineerName('');
        setNotes('');
        setSession(null);
        setWorkDescription('');
        setPhoto(null);
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
    <div>
      {result && (
        <div className={`alert alert--${result.type === 'success' ? 'success' : 'error'}`}>
          {result.message}
        </div>
      )}

      {/* Engineer selection */}
      <div className="card">
        <p className="card__title">Engineer Overtime</p>

        <div className="form-group">
          <label htmlFor="engineerName">Your name *</label>
          <select
            id="engineerName"
            value={engineerName}
            onChange={(e) => handleEngineerChange(e.target.value)}
          >
            <option value="">— Select your name —</option>
            {ENGINEERS.map((eng) => (
              <option key={eng} value={eng}>{eng}</option>
            ))}
          </select>
        </div>

        {checking && (
          <p className="text-sm text-muted">Checking for active session…</p>
        )}
      </div>

      {/* ── Sign-out mode: active session found ──────────────────────────────── */}
      {engineerName && !checking && session && (
        <form onSubmit={handleSignOut} noValidate>
          <div className="card">
            <p className="card__title">End Overtime Session</p>

            <div className="alert alert--info">
              Overtime started: <strong>{session.startTimestamp}</strong>
              {session.notes && <><br />Notes: {session.notes}</>}
            </div>

            <div className="form-group">
              <label htmlFor="workDescription">Work completed *</label>
              <textarea
                id="workDescription"
                rows={3}
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                placeholder="Describe the work carried out during overtime…"
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Optional photo */}
            <div className="form-group">
              <label>
                Photo <span className="text-muted text-sm">(optional)</span>
              </label>

              {!photo ? (
                <div className="photo-upload" onClick={() => fileInputRef.current?.click()}>
                  <p style={{ fontSize: '2rem' }}>📷</p>
                  <p style={{ fontWeight: 600, marginTop: 8 }}>Tap to add a photo</p>
                  <p className="text-sm text-muted">Optional — stored securely</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoChange}
                  />
                </div>
              ) : (
                <div className="photo-upload photo-upload--has-file">
                  <img src={photo.preview} alt="Preview" className="photo-upload__preview" />
                  <button
                    type="button"
                    onClick={removePhoto}
                    style={{ marginTop: 8, background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '0.875rem' }}
                  >
                    Remove photo
                  </button>
                </div>
              )}
            </div>
          </div>

          <button type="submit" className="btn btn--danger" disabled={loading}>
            {loading && <span className="spinner" />}
            {loading ? 'Saving…' : 'END OVERTIME'}
          </button>

          <button
            type="button"
            className="btn btn--secondary mt-2"
            onClick={() => { setEngineerName(''); setSession(null); setResult(null); }}
          >
            Cancel
          </button>
        </form>
      )}

      {/* ── Sign-in mode: no active session ──────────────────────────────────── */}
      {engineerName && !checking && !session && (
        <form onSubmit={handleSignIn} noValidate>
          <div className="card">
            <p className="card__title">Start Overtime Session</p>

            <div className="form-group">
              <label htmlFor="overtimeNotes">
                Notes <span className="text-muted text-sm">(optional)</span>
              </label>
              <textarea
                id="overtimeNotes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about the overtime task…"
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading && <span className="spinner" />}
            {loading ? 'Starting…' : 'START OVERTIME'}
          </button>
        </form>
      )}
    </div>
  );
}
