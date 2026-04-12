import { useState, useRef } from 'react';

export default function SignOutForm() {
  const [idNumber, setIdNumber]     = useState('');
  const [session, setSession]       = useState(null);
  const [checking, setChecking]     = useState(false);
  const [workCompleted, setWorkCompleted] = useState('');
  const [photo, setPhoto]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState(null);
  const fileInputRef = useRef();

  // ── Step 1: look up ID ────────────────────────────────────────────────────
  async function handleLookup(e) {
    e.preventDefault();
    if (!idNumber.trim()) return;

    setChecking(true);
    setSession(null);
    setResult(null);

    try {
      const res = await fetch(`/api/active-check?id=${encodeURIComponent(idNumber.trim())}`);
      const data = await res.json();

      if (data.active) {
        setSession(data.session);
      } else {
        setResult({ type: 'error', message: `No active sign-in found for ID ${idNumber} today.` });
      }
    } catch {
      setResult({ type: 'error', message: 'Network error. Please check your connection.' });
    } finally {
      setChecking(false);
    }
  }

  // ── Photo ─────────────────────────────────────────────────────────────────
  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhoto({ file, preview: URL.createObjectURL(file) });
  }

  function removePhoto() {
    setPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Step 2: submit sign-out ───────────────────────────────────────────────
  async function handleSignOut(e) {
    e.preventDefault();

    if (!workCompleted.trim()) {
      setResult({ type: 'error', message: 'Please describe the work completed on site today.' });
      return;
    }

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('idNumber', idNumber.trim());
    formData.append('workCompleted', workCompleted.trim());
    if (photo) formData.append('photo', photo.file);

    try {
      const res = await fetch('/api/signout', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        setResult({ type: 'success', message: data.message });
        setIdNumber('');
        setSession(null);
        setWorkCompleted('');
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

      {/* Step 1: Enter ID */}
      {!session && (
        <form onSubmit={handleLookup}>
          <div className="card">
            <p className="card__title">Sign Out</p>

            <div className="form-group">
              <label htmlFor="idNumberOut">
                Contractor unique ID *{' '}
                <span className="text-muted text-sm">(three-digit number, e.g. 001)</span>
              </label>
              <input
                id="idNumberOut"
                type="text"
                inputMode="numeric"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="e.g. 001"
                maxLength={3}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn--danger" disabled={checking}>
            {checking && <span className="spinner" />}
            {checking ? 'Looking up…' : 'FIND MY RECORD'}
          </button>
        </form>
      )}

      {/* Step 2: Confirm details + work completed + optional photo */}
      {session && (
        <form onSubmit={handleSignOut} noValidate>
          <div className="card">
            <p className="card__title">Confirm Sign Out</p>

            <div className="alert alert--info">
              Signing out: <strong>{session.operativeName}</strong><br />
              Company: {session.companyName}<br />
              Signed in at: {session.signInTime}
            </div>

            {/* Work completed (required) */}
            <div className="form-group">
              <label htmlFor="workCompleted">
                What work was completed on site today? *
              </label>
              <textarea
                id="workCompleted"
                rows={3}
                value={workCompleted}
                onChange={(e) => setWorkCompleted(e.target.value)}
                placeholder="Briefly describe the work carried out…"
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
                    capture="user"
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
            {loading ? 'Signing Out…' : 'CONFIRM SIGN OUT'}
          </button>

          <button
            type="button"
            className="btn btn--secondary mt-2"
            onClick={() => { setSession(null); setPhoto(null); setWorkCompleted(''); setResult(null); }}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
