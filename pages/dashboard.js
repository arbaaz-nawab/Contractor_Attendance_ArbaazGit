import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import Link from 'next/link';
import { MANAGERS } from '../lib/config';

// Format datetime for display: "09:30"
function fmtTime(dt) {
  if (!dt) return '-';
  const d = new Date(dt);
  if (isNaN(d)) return dt;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

// Format date for display: "05/04/2026"
function fmtDate(dt) {
  if (!dt) return '-';
  const d = new Date(dt);
  if (isNaN(d)) {
    const parts = String(dt).split(' ')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dt;
  }
  return d.toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
}

// Convert "Xh Ym" duration string to decimal hours
function parseHours(durationStr) {
  if (!durationStr || durationStr === '-') return 0;
  const h = durationStr.match(/(\d+)h/);
  const m = durationStr.match(/(\d+)m/);
  return (h ? parseInt(h[1]) : 0) + (m ? parseInt(m[1]) : 0) / 60;
}

// Format decimal hours back to "Xh Ym"
function formatHours(decimal) {
  if (!decimal || decimal <= 0) return '0m';
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Parse "Xh Ym" into { h, m } strings
function parseDurationHM(str) {
  if (!str || str === '-') return { h: '', m: '' };
  const hm = str.match(/(\d+)h/);
  const mm = str.match(/(\d+)m/);
  return { h: hm ? hm[1] : '', m: mm ? mm[1] : '' };
}

// Compliance status badge
function ComplianceBadge({ status }) {
  const color = status === 'Active' ? '#15803d' : status === 'Expired' ? '#b91c1c' : '#b45309';
  return <span style={{ fontSize: '0.8rem', fontWeight: 600, color }}>{status}</span>;
}

// Approval status badge
function ApprovalBadge({ status }) {
  const color = status === 'FULLY APPROVED' ? '#15803d'
              : status === 'PARTIALLY APPROVED' ? '#b45309'
              : status === 'REJECTED' ? '#b91c1c'
              : '#92400e';
  return <span style={{ fontSize: '0.8rem', fontWeight: 600, color }}>{status}</span>;
}

// ── Compliance Files Modal ────────────────────────────────────────────────────
function ComplianceFilesModal({ companyName, onClose }) {
  const [files,       setFiles]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [preview,     setPreview]     = useState(null);
  const [deleting,    setDeleting]    = useState('');
  const [replaceFor,  setReplaceFor]  = useState('');
  const [uploading,   setUploading]   = useState(false);
  const replaceInputRef = useRef();

  function loadFiles() {
    setLoading(true);
    setError('');
    fetch(`/api/compliance-files?company=${encodeURIComponent(companyName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setFiles(data.files);
        else setError('Could not load files.');
      })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadFiles(); }, [companyName]); // eslint-disable-line react-hooks/exhaustive-deps

  function displayName(name) {
    return name.replace(/^\d+_/, '');
  }

  async function handleDelete(filename) {
    if (!confirm(`Delete "${displayName(filename)}"? This cannot be undone.`)) return;
    setDeleting(filename);
    setError('');
    try {
      const res  = await fetch(
        `/api/compliance-files?company=${encodeURIComponent(companyName)}&file=${encodeURIComponent(filename)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (data.success) {
        if (preview?.name === filename) setPreview(null);
        loadFiles();
      } else {
        setError(data.message || 'Delete failed.');
      }
    } catch {
      setError('Network error during delete.');
    } finally {
      setDeleting('');
    }
  }

  async function handleReplace(oldFilename, newFile) {
    if (!newFile) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('companyName', companyName);
      fd.append('document', newFile);
      const upRes  = await fetch('/api/compliance-update', { method: 'POST', body: fd });
      const upData = await upRes.json();
      if (!upData.success) { setError(upData.message || 'Upload failed.'); return; }

      await fetch(
        `/api/compliance-files?company=${encodeURIComponent(companyName)}&file=${encodeURIComponent(oldFilename)}`,
        { method: 'DELETE' }
      );

      if (preview?.name === oldFilename) setPreview(null);
      setReplaceFor('');
      loadFiles();
    } catch {
      setError('Network error during replace.');
    } finally {
      setUploading(false);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div className="card" style={{
        width: '100%', maxWidth: preview ? 900 : 520,
        maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', margin: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p className="card__title" style={{ margin: 0 }}>
            Documents — {companyName}
            {preview && (
              <button
                style={{ marginLeft: 12, background: 'none', border: 'none', color: '#1e40af',
                         fontSize: '0.85rem', cursor: 'pointer' }}
                onClick={() => setPreview(null)}
              >
                ← Back to list
              </button>
            )}
          </p>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.25rem',
                     cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}
            aria-label="Close">
            ✕
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && <p className="text-muted text-sm">Loading files…</p>}
          {error   && <div className="alert alert--error">{error}</div>}

          {!preview && files && files.length === 0 && (
            <p className="text-muted text-sm">No documents uploaded yet for this company.</p>
          )}

          {!preview && files && files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {files.map((f, i) => (
                <div key={i} style={{
                  padding: '10px 12px', border: '1px solid var(--border)',
                  borderRadius: 6, background: 'var(--bg)',
                }}>
                  <div style={{ fontSize: '0.875rem', wordBreak: 'break-all', marginBottom: 8 }}>
                    {f.isPdf ? '📄' : '🖼️'} <strong>{displayName(f.name)}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn--primary btn--sm" onClick={() => setPreview(f)}>
                      Preview
                    </button>
                    <a href={f.serveUrl} download={displayName(f.name)}
                       className="btn btn--secondary btn--sm"
                       style={{ textDecoration: 'none' }}>
                      Download
                    </a>
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={() => setReplaceFor(replaceFor === f.name ? '' : f.name)}
                    >
                      Replace
                    </button>
                    <button
                      className="btn btn--danger btn--sm"
                      disabled={deleting === f.name}
                      onClick={() => handleDelete(f.name)}
                    >
                      {deleting === f.name ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                  {replaceFor === f.name && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        ref={replaceInputRef}
                        type="file"
                        accept=".pdf,image/*"
                        style={{ fontSize: '0.8rem', flex: 1 }}
                        onChange={(e) => handleReplace(f.name, e.target.files[0] || null)}
                      />
                      {uploading && <span className="spinner" />}
                      <button className="btn btn--secondary btn--sm"
                        onClick={() => setReplaceFor('')}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {preview && (
            <div style={{ width: '100%' }}>
              {preview.isPdf ? (
                <iframe
                  src={preview.serveUrl}
                  title={displayName(preview.name)}
                  style={{ width: '100%', height: '65vh', border: 'none', borderRadius: 4 }}
                />
              ) : (
                <img
                  src={preview.serveUrl}
                  alt={displayName(preview.name)}
                  style={{ maxWidth: '100%', maxHeight: '65vh', display: 'block',
                           margin: '0 auto', borderRadius: 4 }}
                />
              )}
              <p style={{ textAlign: 'center', marginTop: 8, fontSize: '0.8rem', color: '#6b7280' }}>
                {displayName(preview.name)}
              </p>
            </div>
          )}
        </div>

        <button className="btn btn--secondary" style={{ marginTop: 12 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

// ── Simple PIN gate ───────────────────────────────────────────────────────────
function PinGate({ onUnlock }) {
  const [pin, setPin]         = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/check-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.ok) { onUnlock(); } else { setError('Incorrect PIN. Please try again.'); setPin(''); }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  return (
    <Layout title="Dashboard">
      <div className="card" style={{ maxWidth: 340, margin: '40px auto' }}>
        <p className="card__title">Manager Dashboard</p>
        <p className="text-muted text-sm mb-2">Enter the dashboard PIN to continue.</p>
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert--error">{error}</div>}
          <div className="form-group">
            <label htmlFor="pin">PIN</label>
            <input id="pin" type="password" inputMode="numeric" value={pin}
              onChange={(e) => setPin(e.target.value)} placeholder="Enter PIN"
              maxLength={20} required autoFocus />
          </div>
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading && <span className="spinner" />}
            {loading ? 'Checking...' : 'Unlock Dashboard'}
          </button>
        </form>
      </div>
    </Layout>
  );
}

// ── Amend contractor record modal ─────────────────────────────────────────────
function AmendModal({ record, onConfirm, onCancel, managers = MANAGERS }) {
  const [managerName, setManagerName] = useState('');
  const [pin,         setPin]         = useState('');
  const [fields, setFields] = useState({
    workCompleted:  record.notes          || '',
    signOutTime:    record.signOutTime    || '',
    contactNumber:  record.contactNumber  || '',
    buildings:      record.buildings      || '',
    pointOfContact: record.pointOfContact || '',
  });
  const [deleteMode, setDeleteMode] = useState(false);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  function setF(key, val) { setFields((p) => ({ ...p, [key]: val })); }

  function pinValid() {
    if (!managerName) { setError('Please select your manager name.'); return false; }
    if (!pin)         { setError('Please enter your PIN.'); return false; }
    return true;
  }

  async function callApi(body) {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/amend-contractor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId: record._row, managerName, pin, ...body }),
      });
      const data = await res.json();
      if (data.success) onConfirm(data.message);
      else { setError(data.message || 'Failed. Please try again.'); setPin(''); }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  function handleSave() {
    if (!pinValid()) return;
    callApi({
      workCompleted:  fields.workCompleted,
      signOutTime:    fields.signOutTime,
      contactNumber:  fields.contactNumber,
      buildings:      fields.buildings,
      pointOfContact: fields.pointOfContact,
    });
  }

  function handleDelete() {
    if (!pinValid()) return;
    callApi({ action: 'delete' });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ maxWidth: 480, width: '90%', margin: 0, maxHeight: '90vh', overflowY: 'auto' }}>
        <p className="card__title">{deleteMode ? 'Delete Record' : 'Amend Record'} — {record.operativeName}</p>
        <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
          {record.companyName} · {fmtDate(record.signInTime)}
        </p>

        {error && <div className="alert alert--error">{error}</div>}

        {!deleteMode && (
          <>
            <div className="form-group">
              <label>Work completed</label>
              <textarea rows={3} value={fields.workCompleted}
                onChange={(e) => setF('workCompleted', e.target.value)}
                style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group">
              <label>Sign-out time <span className="text-muted text-sm">(YYYY-MM-DD HH:mm or leave blank)</span></label>
              <input type="text" value={fields.signOutTime}
                onChange={(e) => setF('signOutTime', e.target.value)}
                placeholder="e.g. 2026-05-17 16:30" />
            </div>
            <div className="form-group">
              <label>Contact number</label>
              <input type="text" value={fields.contactNumber}
                onChange={(e) => setF('contactNumber', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Buildings</label>
              <input type="text" value={fields.buildings}
                onChange={(e) => setF('buildings', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Point of contact</label>
              <input type="text" value={fields.pointOfContact}
                onChange={(e) => setF('pointOfContact', e.target.value)} />
            </div>
          </>
        )}

        {deleteMode && (
          <div className="alert alert--error" style={{ marginBottom: 12 }}>
            This will permanently delete this contractor entry. This cannot be undone.
          </div>
        )}

        <div className="form-group">
          <label>Your name (manager) *</label>
          <select value={managerName} onChange={(e) => setManagerName(e.target.value)}>
            <option value="">— Select —</option>
            {managers.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Manager PIN *</label>
          <input type="password" inputMode="numeric" value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (deleteMode ? handleDelete() : handleSave())}
            placeholder="Enter PIN" maxLength={20} />
        </div>

        {!deleteMode ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={handleSave} disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
            <button className="btn btn--danger" onClick={() => { setDeleteMode(true); setError(''); }}
              disabled={loading}>
              Delete Entry
            </button>
            <button className="btn btn--secondary" onClick={onCancel} disabled={loading}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--danger" onClick={handleDelete} disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? 'Deleting…' : 'Confirm Delete'}
            </button>
            <button className="btn btn--secondary" onClick={() => { setDeleteMode(false); setError(''); }}
              disabled={loading}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Amend engineer overtime modal ─────────────────────────────────────────────
function AmendOvertimeModal({ record, onConfirm, onCancel, managers = MANAGERS }) {
  const parsed = parseDurationHM(record.adjustedDuration || record.duration || '');
  const [managerName, setManagerName] = useState('');
  const [pin,         setPin]         = useState('');
  const [fields, setFields] = useState({
    workDescription:  record.workDescription || '',
    startTimestamp:   (record.startTimestamp || '').replace(' ', 'T').slice(0, 16),
    endTimestamp:     (record.endTimestamp   || '').replace(' ', 'T').slice(0, 16),
    adjH:             parsed.h,
    adjM:             parsed.m,
    notes:            record.notes || '',
  });
  const [deleteMode, setDeleteMode] = useState(false);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  function setF(key, val) { setFields((p) => ({ ...p, [key]: val })); }

  function pinValid() {
    if (!managerName) { setError('Please select your manager name.'); return false; }
    if (!pin)         { setError('Please enter your PIN.'); return false; }
    return true;
  }

  async function callApi(body) {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/amend-overtime', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId: record._row, managerName, pin, ...body }),
      });
      const data = await res.json();
      if (data.success) onConfirm(data.message);
      else { setError(data.message || 'Failed. Please try again.'); setPin(''); }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  function handleSave() {
    if (!pinValid()) return;
    const adjDuration = (fields.adjH || fields.adjM)
      ? `${fields.adjH || 0}h ${String(fields.adjM || 0).padStart(2, '0')}m`
      : '';
    callApi({
      workDescription:  fields.workDescription,
      startTimestamp:   fields.startTimestamp ? fields.startTimestamp.replace('T', ' ') + ':00' : undefined,
      endTimestamp:     fields.endTimestamp   ? fields.endTimestamp.replace('T', ' ')   + ':00' : undefined,
      adjustedDuration: adjDuration,
      notes:            fields.notes,
    });
  }

  function handleDelete() {
    if (!pinValid()) return;
    callApi({ action: 'delete' });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ maxWidth: 480, width: '90%', margin: 0, maxHeight: '90vh', overflowY: 'auto' }}>
        <p className="card__title">{deleteMode ? 'Delete Overtime' : 'Amend Overtime'} — {record.engineerName}</p>
        <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
          {fmtDate(record.startTimestamp)} · Recorded: {record.duration}
        </p>

        {error && <div className="alert alert--error">{error}</div>}

        {!deleteMode && (
          <>
            <div className="form-group">
              <label>Work description</label>
              <textarea rows={3} value={fields.workDescription}
                onChange={(e) => setF('workDescription', e.target.value)}
                style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Start time</label>
                <input type="datetime-local" value={fields.startTimestamp}
                  onChange={(e) => setF('startTimestamp', e.target.value)} />
              </div>
              <div className="form-group">
                <label>End time</label>
                <input type="datetime-local" value={fields.endTimestamp}
                  onChange={(e) => setF('endTimestamp', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Adjusted duration</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min="0" max="23" value={fields.adjH}
                    onChange={(e) => setF('adjH', e.target.value)} style={{ width: 64 }} placeholder="0" />
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>h</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min="0" max="59" value={fields.adjM}
                    onChange={(e) => setF('adjM', e.target.value)} style={{ width: 64 }} placeholder="0" />
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>m</span>
                </div>
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input type="text" value={fields.notes}
                onChange={(e) => setF('notes', e.target.value)} />
            </div>
          </>
        )}

        {deleteMode && (
          <div className="alert alert--error" style={{ marginBottom: 12 }}>
            This will permanently delete this overtime record. This cannot be undone.
          </div>
        )}

        <div className="form-group">
          <label>Your name (manager) *</label>
          <select value={managerName} onChange={(e) => setManagerName(e.target.value)}>
            <option value="">— Select —</option>
            {managers.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Manager PIN *</label>
          <input type="password" inputMode="numeric" value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (deleteMode ? handleDelete() : handleSave())}
            placeholder="Enter PIN" maxLength={20} />
        </div>

        {!deleteMode ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={handleSave} disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
            <button className="btn btn--danger" onClick={() => { setDeleteMode(true); setError(''); }}
              disabled={loading}>
              Delete Entry
            </button>
            <button className="btn btn--secondary" onClick={onCancel} disabled={loading}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--danger" onClick={handleDelete} disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? 'Deleting…' : 'Confirm Delete'}
            </button>
            <button className="btn btn--secondary" onClick={() => { setDeleteMode(false); setError(''); }}
              disabled={loading}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Force sign-out modal (manager override for overdue active sessions) ───────
function ForceSignOutModal({ record, onConfirm, onCancel, managers = MANAGERS }) {
  // Default sign-out time: today 18:00 UK
  const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD
  const [managerName, setManagerName] = useState('');
  const [pin,         setPin]         = useState('');
  const [signOutTime, setSignOutTime] = useState(`${todayLocal}T18:00`);
  const [notes,       setNotes]       = useState('');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);

  async function handleConfirm() {
    if (!managerName) { setError('Please select your manager name.'); return; }
    if (!pin)         { setError('Please enter your PIN.'); return; }
    setLoading(true); setError('');
    try {
      const outTs = signOutTime ? signOutTime.replace('T', ' ') + ':00' : undefined;
      const res  = await fetch('/api/amend-contractor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowId:        record._row,
          managerName,
          pin,
          action:       'forceSignOut',
          signOutTime:  outTs,
          workCompleted: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) onConfirm(data.message);
      else { setError(data.message || 'Failed. Please try again.'); setPin(''); }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ maxWidth: 420, width: '90%', margin: 0 }}>
        <p className="card__title" style={{ color: '#b91c1c' }}>Force Sign-Out — {record.operativeName}</p>
        <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
          {record.companyName} · Signed in at {fmtTime(record.signInTime)}
        </p>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="form-group">
          <label>Sign-out time</label>
          <input type="datetime-local" value={signOutTime}
            onChange={(e) => setSignOutTime(e.target.value)} />
          <span className="field-hint">Adjust if the actual departure time differs from now</span>
        </div>
        <div className="form-group">
          <label>Notes <span className="text-muted text-sm">(optional)</span></label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Left site at 18:00, no response to calls" />
        </div>
        <div className="form-group">
          <label>Your name (manager) *</label>
          <select value={managerName} onChange={(e) => setManagerName(e.target.value)}>
            <option value="">— Select —</option>
            {managers.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Manager PIN *</label>
          <input type="password" inputMode="numeric" value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            placeholder="Enter PIN" maxLength={20} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--danger" onClick={handleConfirm} disabled={loading}>
            {loading && <span className="spinner" />}
            {loading ? 'Closing Session…' : 'Force Sign-Out'}
          </button>
          <button className="btn btn--secondary" onClick={onCancel} disabled={loading}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Delete compliance record modal ────────────────────────────────────────────
function DeleteComplianceModal({ companyName, onConfirm, onCancel, managers = MANAGERS }) {
  const [managerName, setManagerName] = useState('');
  const [pin,         setPin]         = useState('');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);

  async function handleDelete() {
    if (!managerName) { setError('Please select your manager name.'); return; }
    if (!pin)         { setError('Please enter your PIN.'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/compliance-delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, managerName, pin }),
      });
      const data = await res.json();
      if (data.success) onConfirm(data.message);
      else { setError(data.message || 'Failed. Please try again.'); setPin(''); }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ maxWidth: 420, width: '90%', margin: 0 }}>
        <p className="card__title" style={{ color: '#b91c1c' }}>Delete Compliance Record</p>
        <p className="text-sm text-muted" style={{ marginBottom: 12 }}>{companyName}</p>

        <div className="alert alert--error" style={{ marginBottom: 12 }}>
          This will permanently delete all compliance dates for this company. Files in storage are not deleted.
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="form-group">
          <label>Your name (manager) *</label>
          <select value={managerName} onChange={(e) => setManagerName(e.target.value)}>
            <option value="">— Select —</option>
            {managers.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Manager PIN *</label>
          <input type="password" inputMode="numeric" value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDelete()}
            placeholder="Enter PIN" maxLength={20} autoFocus />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--danger" onClick={handleDelete} disabled={loading}>
            {loading && <span className="spinner" />}
            {loading ? 'Deleting…' : 'Confirm Delete'}
          </button>
          <button className="btn btn--secondary" onClick={onCancel} disabled={loading}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Approval PIN modal ────────────────────────────────────────────────────────
function ApprovalModal({ target, action, managerName, onConfirm, onCancel }) {
  const parsed = parseDurationHM(target.duration || '');
  const [adjH,  setAdjH]  = useState(parsed.h);
  const [adjM,  setAdjM]  = useState(parsed.m);
  const [pin,   setPin]   = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (!pin) { setError('Please enter your PIN.'); return; }
    setLoading(true); setError('');
    try {
      const adjDuration = (adjH || adjM)
        ? `${adjH || 0}h ${String(adjM || 0).padStart(2, '0')}m`
        : '';
      const body = { rowNumber: target._row, action, managerName, pin };
      if (action === 'APPROVED' && adjDuration) body.adjustedDuration = adjDuration;
      const res  = await fetch('/api/overtime-approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) { onConfirm(data.message); }
      else { setError(data.message || 'Failed. Please try again.'); setPin(''); }
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ maxWidth: 360, width: '90%', margin: 0 }}>
        <p className="card__title">Confirm {action === 'APPROVED' ? 'Approval' : 'Rejection'}</p>
        <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
          Engineer: <strong>{target.engineerName}</strong><br />
          Date: {fmtDate(target.startTimestamp)}<br />
          Manager: {managerName}
        </p>
        {action === 'APPROVED' && (
          <div className="form-group">
            <label>Duration</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number" min="0" max="23"
                  value={adjH}
                  onChange={(e) => setAdjH(e.target.value)}
                  style={{ width: 64 }}
                  placeholder="0"
                />
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>h</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number" min="0" max="59"
                  value={adjM}
                  onChange={(e) => setAdjM(e.target.value)}
                  style={{ width: 64 }}
                  placeholder="0"
                />
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>m</span>
              </div>
            </div>
            <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
              Recorded duration: {target.duration}
            </p>
          </div>
        )}
        <p className="text-sm" style={{ marginBottom: 8 }}>Enter your manager PIN to confirm.</p>
        {error && <div className="alert alert--error">{error}</div>}
        <div className="form-group">
          <label htmlFor="approvalPin">Manager PIN</label>
          <input id="approvalPin" type="password" inputMode="numeric" value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            placeholder="Enter PIN" maxLength={20} autoFocus />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${action === 'APPROVED' ? 'btn--primary' : 'btn--danger'}`}
            onClick={handleConfirm} disabled={loading}>
            {loading && <span className="spinner" />}
            {loading ? 'Processing…' : `Confirm ${action === 'APPROVED' ? 'Approve' : 'Reject'}`}
          </button>
          <button className="btn btn--secondary" onClick={onCancel} disabled={loading}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const today = new Date().toISOString().split('T')[0];

  const [unlocked, setUnlocked] = useState(false);
  const [dashTab,  setDashTab]  = useState('contractors');

  // Contractors tab
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo,   setDateTo]   = useState(today);
  const [company,  setCompany]  = useState('');
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Dynamic manager list (fetched from Supabase, falls back to config)
  const [managersList, setManagersList] = useState(MANAGERS);

  // Amend / force sign-out state
  const [amendModal,        setAmendModal]        = useState(null);
  const [amendMessage,      setAmendMessage]      = useState('');
  const [forceSignOutModal, setForceSignOutModal] = useState(null);
  const [forceSignOutMsg,   setForceSignOutMsg]   = useState('');
  const [notifyLoading,     setNotifyLoading]     = useState(false);
  const [notifyMsg,         setNotifyMsg]         = useState('');

  // Amend overtime state
  const [amendOvertimeModal,   setAmendOvertimeModal]   = useState(null);
  const [amendOvertimeMessage, setAmendOvertimeMessage] = useState('');

  // Overtime tab
  const [overtimeData,    setOvertimeData]    = useState(null);
  const [overtimeLoading, setOvertimeLoading] = useState(false);
  const [overtimeError,   setOvertimeError]   = useState(null);

  // Approvals tab
  const [currentManager,  setCurrentManager]  = useState('');
  const [approvalModal,   setApprovalModal]   = useState(null);
  const [approvalMessage, setApprovalMessage] = useState('');

  // Monthly summary tab
  const [summaryMonth,    setSummaryMonth]    = useState(today.slice(0, 7));
  const [summaryEngineer, setSummaryEngineer] = useState('');
  const [summaryFrom,     setSummaryFrom]     = useState('');
  const [summaryTo,       setSummaryTo]       = useState('');

  // Compliance tab
  const [complianceData,       setComplianceData]       = useState(null);
  const [complianceLoading,    setComplianceLoading]    = useState(false);
  const [complianceError,      setComplianceError]      = useState(null);
  const [complianceMsg,        setComplianceMsg]        = useState('');
  const [complianceSubmitting, setComplianceSubmitting] = useState(false);
  const [filesModalCompany,    setFilesModalCompany]    = useState(null);
  const [deleteComplianceModal, setDeleteComplianceModal] = useState(null);
  const [compForm, setCompForm] = useState({
    companyName: '', ramsDate: '', inductionDate: '', insuranceDate: '',
  });
  const [compDoc, setCompDoc] = useState(null);
  const compDocRef = useRef();

  // Auto-lock when user leaves the page
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        setUnlocked(false);
        setData(null);
        setOvertimeData(null);
        setComplianceData(null);
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // ── Fetchers ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (company) params.append('company', company);
      const res  = await fetch(`/api/dashboard?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        setLastRefresh(new Date().toLocaleTimeString('en-GB'));
      } else {
        setError(json.message);
      }
    } catch { setError('Failed to load data. Check your connection.'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, company]);

  const fetchOvertimeData = useCallback(async () => {
    setOvertimeLoading(true); setOvertimeError(null);
    try {
      const res  = await fetch('/api/overtime-list');
      const json = await res.json();
      if (json.success) { setOvertimeData(json.records); }
      else { setOvertimeError('Failed to load overtime data.'); }
    } catch { setOvertimeError('Failed to load overtime data. Check your connection.'); }
    finally { setOvertimeLoading(false); }
  }, []);

  const fetchComplianceData = useCallback(async () => {
    setComplianceLoading(true); setComplianceError(null);
    try {
      const res  = await fetch('/api/compliance-list');
      const json = await res.json();
      if (json.success) { setComplianceData(json.records); }
      else { setComplianceError('Failed to load compliance data.'); }
    } catch { setComplianceError('Failed to load compliance data.'); }
    finally { setComplianceLoading(false); }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    fetch('/api/managers')
      .then((r) => r.json())
      .then((d) => { if (d.success && d.names.length) setManagersList(d.names); })
      .catch(() => {});
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    fetchData();
    fetchOvertimeData();
    fetchComplianceData();
    const interval = setInterval(() => {
      fetchData();
      fetchOvertimeData();
      fetchComplianceData();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchData, fetchOvertimeData, fetchComplianceData, unlocked]);

  if (!unlocked) {
    return <PinGate onUnlock={() => setUnlocked(true)} />;
  }

  // ── Derived: is it past 18:00 UK time? ──────────────────────────────────────
  const isPast6PM = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(new Date())
  ) >= 18;

  // ── Derived: approvals (dual approval — each manager sees what they haven't approved) ──
  const pendingForManager = (overtimeData || []).filter((r) => {
    if (!currentManager) return false;
    if (r.status !== 'COMPLETED') return false;
    if (r.approvalStatus === 'FULLY APPROVED' || r.approvalStatus === 'REJECTED') return false;
    if (currentManager === 'Dean Marsh'      && r.approvedByDean)   return false;
    if (currentManager === 'Laurel Anderson' && r.approvedByLaurel) return false;
    return true;
  });

  const approvedByCurrentManager = (overtimeData || []).filter((r) => {
    if (!currentManager) return false;
    if (currentManager === 'Dean Marsh')      return !!r.approvedByDean;
    if (currentManager === 'Laurel Anderson') return !!r.approvedByLaurel;
    return false;
  });

  // ── Derived: monthly summary (FULLY APPROVED only) ───────────────────────────
  const useDateRange = !!(summaryFrom && summaryTo);

  const approvedRecords = (overtimeData || []).filter((r) => {
    if (r.approvalStatus !== 'FULLY APPROVED') return false;
    if (useDateRange) {
      const dateStr = r.startTimestamp ? String(r.startTimestamp).slice(0, 10) : '';
      if (!dateStr || dateStr < summaryFrom || dateStr > summaryTo) return false;
    } else {
      if (!r.startTimestamp?.startsWith(summaryMonth)) return false;
    }
    if (summaryEngineer && !r.engineerName.toLowerCase().includes(summaryEngineer.toLowerCase())) return false;
    return true;
  });

  const summaryByEngineer = approvedRecords.reduce((acc, r) => {
    const name = r.engineerName;
    if (!acc[name]) acc[name] = { sessions: 0, totalHours: 0 };
    acc[name].sessions++;
    acc[name].totalHours += parseHours(r.adjustedDuration || r.duration);
    return acc;
  }, {});

  // ── Actions ───────────────────────────────────────────────────────────────────
  function openApproval(record, action) {
    setApprovalMessage('');
    setApprovalModal({ target: record, action });
  }

  function handleApprovalConfirm(message) {
    setApprovalModal(null);
    setApprovalMessage(message);
    fetchOvertimeData();
  }

  function handleAmendConfirm(message) {
    setAmendModal(null);
    setAmendMessage(message);
    fetchData();
  }

  function handleAmendOvertimeConfirm(message) {
    setAmendOvertimeModal(null);
    setAmendOvertimeMessage(message);
    fetchOvertimeData();
  }

  function handleForceSignOutConfirm(message) {
    setForceSignOutModal(null);
    setForceSignOutMsg(message);
    fetchData();
  }

  // ── CSV export for monthly summary ───────────────────────────────────────────
  function exportCsv() {
    const headers = ['Engineer', 'Date', 'Start', 'End', 'Duration', 'Adjusted Duration', 'Work Description'];
    const csvRows = approvedRecords.map((r) => [
      r.engineerName,
      fmtDate(r.startTimestamp),
      fmtTime(r.startTimestamp),
      fmtTime(r.endTimestamp),
      r.duration,
      r.adjustedDuration || r.duration,
      r.workDescription || '',
    ]);
    const csv = [headers, ...csvRows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `overtime-${useDateRange ? `${summaryFrom}-to-${summaryTo}` : summaryMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Compliance form submit ────────────────────────────────────────────────────
  async function handleComplianceSubmit(e) {
    e.preventDefault();
    if (!compForm.companyName.trim()) {
      setComplianceMsg('error:Please enter a company name.');
      return;
    }
    setComplianceSubmitting(true);
    setComplianceMsg('');

    const fd = new FormData();
    fd.append('companyName',   compForm.companyName.trim());
    fd.append('ramsDate',      compForm.ramsDate);
    fd.append('inductionDate', compForm.inductionDate);
    fd.append('insuranceDate', compForm.insuranceDate);
    fd.append('managerName',   currentManager || 'Manager');
    if (compDoc) {
      const fileList = compDoc instanceof FileList ? Array.from(compDoc) : [compDoc];
      fileList.forEach((f) => fd.append('document', f));
    }

    try {
      const res  = await fetch('/api/compliance-update', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success) {
        setComplianceMsg('success:' + json.message);
        setCompForm({ companyName: '', ramsDate: '', inductionDate: '', insuranceDate: '' });
        setCompDoc(null);
        if (compDocRef.current) compDocRef.current.value = '';
        fetchComplianceData();
      } else {
        setComplianceMsg('error:' + (json.message || 'Failed to update.'));
      }
    } catch {
      setComplianceMsg('error:Network error. Please try again.');
    } finally {
      setComplianceSubmitting(false);
    }
  }

  const [compMsgType, compMsgText] = complianceMsg.includes(':')
    ? complianceMsg.split(/:(.+)/)
    : ['', complianceMsg];

  const tabs = [
    { id: 'contractors', label: 'Contractors' },
    { id: 'overtime',    label: 'Engineer Overtime' },
    { id: 'approvals',   label: 'Approvals' },
    { id: 'monthly',     label: 'Monthly Summary' },
    { id: 'compliance',  label: 'Contractor Compliance' },
  ];

  return (
    <Layout title="Dashboard" wide>
      {filesModalCompany && (
        <ComplianceFilesModal
          companyName={filesModalCompany}
          onClose={() => setFilesModalCompany(null)}
        />
      )}

      {deleteComplianceModal && (
        <DeleteComplianceModal
          companyName={deleteComplianceModal}
          onConfirm={(msg) => {
            setDeleteComplianceModal(null);
            setComplianceMsg('success:' + msg);
            fetchComplianceData();
          }}
          onCancel={() => setDeleteComplianceModal(null)}
          managers={managersList}
        />
      )}

      {approvalModal && (
        <ApprovalModal
          target={approvalModal.target}
          action={approvalModal.action}
          managerName={currentManager}
          onConfirm={handleApprovalConfirm}
          onCancel={() => setApprovalModal(null)}
        />
      )}

      {amendModal && (
        <AmendModal
          record={amendModal}
          onConfirm={handleAmendConfirm}
          onCancel={() => setAmendModal(null)}
          managers={managersList}
        />
      )}

      {amendOvertimeModal && (
        <AmendOvertimeModal
          record={amendOvertimeModal}
          onConfirm={handleAmendOvertimeConfirm}
          onCancel={() => setAmendOvertimeModal(null)}
          managers={managersList}
        />
      )}

      {forceSignOutModal && (
        <ForceSignOutModal
          record={forceSignOutModal}
          onConfirm={handleForceSignOutConfirm}
          onCancel={() => setForceSignOutModal(null)}
          managers={managersList}
        />
      )}

      <div className="mb-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" style={{ color: '#6b7280', fontSize: '0.875rem' }}>← Back to Sign In/Out</Link>
        <button
          className="btn btn--secondary btn--sm"
          onClick={() => { setUnlocked(false); setData(null); setOvertimeData(null); setComplianceData(null); }}
        >
          Lock
        </button>
      </div>

      <div className="card">
        <p className="card__title">Manager Dashboard</p>

        <div className="nav-tabs" style={{ marginBottom: 0 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`nav-tab ${dashTab === t.id ? 'nav-tab--active' : ''}`}
              onClick={() => {
                setDashTab(t.id);
                setApprovalMessage('');
                setComplianceMsg('');
                setAmendMessage('');
                setAmendOvertimeMessage('');
                setForceSignOutMsg('');
                setNotifyMsg('');
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Per-tab filter rows */}
        {dashTab === 'contractors' && (
          <div className="filter-row" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={today} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} max={today} min={dateFrom} />
            </div>
            <input type="text" placeholder="Filter by company..." value={company}
              onChange={(e) => setCompany(e.target.value)} />
            <button className="btn btn--secondary btn--sm" onClick={fetchData} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              className="btn btn--secondary btn--sm"
              style={{ borderColor: '#b91c1c', color: '#b91c1c' }}
              disabled={notifyLoading}
              onClick={async () => {
                setNotifyLoading(true); setNotifyMsg('');
                try {
                  const res  = await fetch('/api/trigger-notify', { method: 'POST' });
                  const json = await res.json();
                  if (json.success) {
                    setNotifyMsg(
                      json.overdueCount === 0
                        ? 'No active contractors on site — no email sent.'
                        : `Alert sent to ${json.sent} manager(s) — ${json.overdueCount} overdue contractor(s).`
                    );
                  } else {
                    setNotifyMsg('error:' + (json.message || 'Failed to send notification.'));
                  }
                } catch { setNotifyMsg('error:Network error.'); }
                finally { setNotifyLoading(false); }
              }}
            >
              {notifyLoading ? 'Sending…' : 'Send Overdue Alert'}
            </button>
          </div>
        )}

        {dashTab === 'overtime' && (
          <div className="filter-row" style={{ marginTop: 12 }}>
            <button className="btn btn--secondary btn--sm" onClick={fetchOvertimeData} disabled={overtimeLoading}>
              {overtimeLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        )}

        {dashTab === 'approvals' && (
          <div className="filter-row" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>Manager</label>
              <select value={currentManager}
                onChange={(e) => { setCurrentManager(e.target.value); setApprovalMessage(''); }}>
                <option value="">— Select your name —</option>
                {managersList.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <button className="btn btn--secondary btn--sm" onClick={fetchOvertimeData} disabled={overtimeLoading}>
              {overtimeLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        )}

        {dashTab === 'monthly' && (
          <div className="filter-row" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>Month</label>
              <input type="month" value={summaryMonth}
                onChange={(e) => { setSummaryMonth(e.target.value); setSummaryFrom(''); setSummaryTo(''); }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>From</label>
              <input type="date" value={summaryFrom} onChange={(e) => setSummaryFrom(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>To</label>
              <input type="date" value={summaryTo} min={summaryFrom}
                onChange={(e) => setSummaryTo(e.target.value)} />
            </div>
            {(summaryFrom || summaryTo) && (
              <button className="btn btn--secondary btn--sm"
                onClick={() => { setSummaryFrom(''); setSummaryTo(''); }}>
                Reset Range
              </button>
            )}
            <input type="text" placeholder="Filter by engineer..." value={summaryEngineer}
              onChange={(e) => setSummaryEngineer(e.target.value)} />
            <button className="btn btn--secondary btn--sm" onClick={fetchOvertimeData} disabled={overtimeLoading}>
              {overtimeLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        )}

        {dashTab === 'compliance' && (
          <div className="filter-row" style={{ marginTop: 12 }}>
            <button className="btn btn--secondary btn--sm" onClick={fetchComplianceData} disabled={complianceLoading}>
              {complianceLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        )}

        {lastRefresh && dashTab === 'contractors' && (
          <p className="text-sm text-muted mb-2">Last updated: {lastRefresh} (auto-refreshes every 60s)</p>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── CONTRACTORS TAB ──────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {dashTab === 'contractors' && (
        <>
          {error           && <div className="alert alert--error">{error}</div>}
          {amendMessage    && <div className="alert alert--success">{amendMessage}</div>}
          {forceSignOutMsg && <div className="alert alert--success">{forceSignOutMsg}</div>}
          {notifyMsg && (
            <div className={`alert alert--${notifyMsg.startsWith('error:') ? 'error' : 'success'}`}>
              {notifyMsg.startsWith('error:') ? notifyMsg.slice(6) : notifyMsg}
            </div>
          )}

          {data && (
            <>
              <div className="stats-row">
                <div className="stat-card stat-card--active">
                  <div className="stat-card__value">{data.totals.onSite}</div>
                  <div className="stat-card__label">On Site</div>
                </div>
                <div className="stat-card stat-card--completed">
                  <div className="stat-card__value">{data.totals.signedOut}</div>
                  <div className="stat-card__label">Signed Out</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card__value">{data.totals.onSite + data.totals.signedOut}</div>
                  <div className="stat-card__label">Total</div>
                </div>
              </div>

              {/* Currently on site */}
              <div className="card">
                <p className="card__title" style={{ color: '#15803d' }}>
                  Currently On Site ({data.active.length})
                </p>
                {data.active.length === 0 ? (
                  <p className="text-muted text-sm">No contractors currently on site.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>ID</th><th>Name</th><th>Company</th><th>Signed In</th>
                          <th>Contact No.</th><th>Building(s)</th><th>Point of Contact</th>
                          <th>Status</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.active.map((row, i) => {
                          const overdue = isPast6PM;
                          return (
                            <tr key={i} style={overdue ? { background: '#fef2f2' } : undefined}>
                              <td>{row.id}</td>
                              <td><strong>{row.operativeName}</strong></td>
                              <td>{row.companyName}</td>
                              <td>{fmtTime(row.signInTime)}</td>
                              <td>{row.contactNumber  || <span className="text-muted">—</span>}</td>
                              <td>{row.buildings      || <span className="text-muted">—</span>}</td>
                              <td>{row.pointOfContact || <span className="text-muted">—</span>}</td>
                              <td>
                                <span className="badge badge--active">Active</span>
                                {overdue && (
                                  <span style={{
                                    marginLeft: 6, fontSize: '0.75rem', fontWeight: 700,
                                    color: '#b91c1c', background: '#fee2e2',
                                    padding: '2px 6px', borderRadius: 4,
                                  }}>
                                    Overdue
                                  </span>
                                )}
                              </td>
                              <td>
                                {overdue && (
                                  <button
                                    className="btn btn--danger btn--sm"
                                    onClick={() => { setForceSignOutMsg(''); setForceSignOutModal(row); }}
                                  >
                                    Force Sign-Out
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Signed out */}
              <div className="card">
                <p className="card__title" style={{ color: '#6b7280' }}>
                  Signed Out ({data.completed.length})
                </p>
                {data.completed.length === 0 ? (
                  <p className="text-muted text-sm">No sign-outs recorded yet.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>ID</th><th>Name</th><th>Company</th>
                          <th>Date</th><th>In</th><th>Out</th><th>Duration</th>
                          <th>Contact No.</th><th>Building(s)</th><th>Point of Contact</th>
                          <th>Work Completed</th>
                          <th>Permit</th><th>Fire Safety</th><th>Asbestos</th>
                          <th>RAMS</th><th>Induction</th><th>Insurance</th>
                          <th>Photo</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.completed.map((row, i) => (
                          <tr key={i}>
                            <td>{row.id}</td>
                            <td>
                              <strong>{row.operativeName}</strong>
                              {row.amendedBy && (
                                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                                  Amended by {row.amendedBy}
                                  {row.amendedAt ? ` · ${fmtDate(row.amendedAt)}` : ''}
                                </div>
                              )}
                            </td>
                            <td>{row.companyName}</td>
                            <td>{fmtDate(row.signInTime)}</td>
                            <td>{fmtTime(row.signInTime)}</td>
                            <td>{fmtTime(row.signOutTime)}</td>
                            <td>{row.duration}</td>
                            <td>{row.contactNumber  || <span className="text-muted">—</span>}</td>
                            <td>{row.buildings      || <span className="text-muted">—</span>}</td>
                            <td>{row.pointOfContact || <span className="text-muted">—</span>}</td>
                            <td style={{ maxWidth: 180, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {row.notes || <span className="text-muted">—</span>}
                            </td>
                            <td style={{ fontSize: '0.8rem' }}>
                              {row.permitRequired === 'Yes'
                                ? <span style={{ color: '#b45309' }}>{row.permitTypes || 'Yes'}</span>
                                : (row.permitRequired || <span className="text-muted">—</span>)}
                            </td>
                            <td style={{ fontSize: '0.8rem' }}>{row.fireSafetyAffected || <span className="text-muted">—</span>}</td>
                            <td style={{ fontSize: '0.8rem' }}>{row.asbestosChecked    || <span className="text-muted">—</span>}</td>
                            <td style={{ fontSize: '0.8rem', color: row.ramsApproved === 'No' ? '#b91c1c' : undefined }}>
                              {row.ramsApproved || <span className="text-muted">—</span>}
                            </td>
                            <td style={{ fontSize: '0.8rem', color: row.inductionComplete === 'No' ? '#b91c1c' : undefined }}>
                              {row.inductionComplete || <span className="text-muted">—</span>}
                            </td>
                            <td style={{ fontSize: '0.8rem', color: row.insuranceValid === 'No' ? '#b91c1c' : undefined }}>
                              {row.insuranceValid || <span className="text-muted">—</span>}
                            </td>
                            <td>
                              {row.photoUrl
                                ? <a href={row.photoUrl} target="_blank" rel="noreferrer"
                                     style={{ color: '#1e40af', fontSize: '0.85rem' }}>View</a>
                                : <span className="text-muted">—</span>}
                            </td>
                            <td>
                              <button className="btn btn--secondary btn--sm"
                                onClick={() => setAmendModal(row)}>
                                Amend
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {loading && !data && (
            <div className="card text-center"><p className="text-muted">Loading dashboard...</p></div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── ENGINEER OVERTIME TAB ────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {dashTab === 'overtime' && (
        <>
          {overtimeError        && <div className="alert alert--error">{overtimeError}</div>}
          {amendOvertimeMessage && <div className="alert alert--success">{amendOvertimeMessage}</div>}

          <div className="card">
            <p className="card__title">Engineer Overtime Records</p>

            {overtimeLoading && !overtimeData && (
              <p className="text-muted text-sm">Loading overtime data…</p>
            )}
            {overtimeData && overtimeData.length === 0 && (
              <p className="text-muted text-sm">No overtime records found.</p>
            )}
            {overtimeData && overtimeData.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Engineer</th><th>Date</th><th>Start</th><th>End</th>
                      <th>Duration</th><th>Work Description</th>
                      <th>Status</th><th>Approval</th><th>Approved By</th><th>Image</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overtimeData.map((row, i) => (
                      <tr key={i}>
                        <td><strong>{row.engineerName}</strong></td>
                        <td>{fmtDate(row.startTimestamp)}</td>
                        <td>{fmtTime(row.startTimestamp)}</td>
                        <td>
                          {row.endTimestamp
                            ? fmtTime(row.endTimestamp)
                            : <span className="badge badge--active">Active</span>}
                        </td>
                        <td>
                          {row.adjustedDuration
                            ? <><strong>{row.adjustedDuration}</strong>{' '}
                                <span className="text-muted" style={{ fontSize: '0.75rem' }}>(adj.)</span></>
                            : row.duration}
                        </td>
                        <td style={{ maxWidth: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {row.workDescription || <span className="text-muted">—</span>}
                        </td>
                        <td>
                          <span className={`badge badge--${row.status === 'ACTIVE' ? 'active' : 'completed'}`}>
                            {row.status}
                          </span>
                        </td>
                        <td>
                          {row.approvalStatus
                            ? <ApprovalBadge status={row.approvalStatus} />
                            : <span className="text-muted">—</span>}
                        </td>
                        <td style={{ fontSize: '0.78rem' }}>
                          {row.approvedByDean   && <div>Dean: {fmtDate(row.deanApprovalTimestamp)}</div>}
                          {row.approvedByLaurel && <div>Laurel: {fmtDate(row.laurelApprovalTimestamp)}</div>}
                          {!row.approvedByDean && !row.approvedByLaurel && <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {row.imagePath
                            ? <a href={row.imagePath} target="_blank" rel="noreferrer"
                                 style={{ color: '#1e40af', fontSize: '0.85rem' }}>View</a>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          <button className="btn btn--secondary btn--sm"
                            onClick={() => { setAmendOvertimeMessage(''); setAmendOvertimeModal(row); }}>
                            Amend / Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── APPROVALS TAB ────────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {dashTab === 'approvals' && (
        <>
          {approvalMessage && <div className="alert alert--success">{approvalMessage}</div>}
          {overtimeError   && <div className="alert alert--error">{overtimeError}</div>}

          {!currentManager ? (
            <div className="card">
              <p className="text-muted text-sm">Select your manager name above to view your approval queue.</p>
            </div>
          ) : (
            <>
              {/* ── A. Pending / Partially Approved ─────────────────────── */}
              <div className="card">
                <p className="card__title">
                  Awaiting Your Approval — {currentManager} ({pendingForManager.length})
                </p>
                <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
                  Includes PENDING and PARTIALLY APPROVED records you have not yet approved.
                </p>

                {overtimeLoading && !overtimeData && (
                  <p className="text-muted text-sm">Loading…</p>
                )}
                {overtimeData && pendingForManager.length === 0 && (
                  <p className="text-muted text-sm">No records awaiting your approval.</p>
                )}
                {pendingForManager.length > 0 && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Engineer</th><th>Date</th><th>Start</th><th>End</th>
                          <th>Duration</th><th>Work Description</th>
                          <th>Status</th><th>Other Approver</th><th>Image</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingForManager.map((row, i) => {
                          const otherApproved = currentManager === 'Dean Marsh'
                            ? (row.approvedByLaurel ? `Laurel ✓ ${fmtDate(row.laurelApprovalTimestamp)}` : 'Laurel: pending')
                            : (row.approvedByDean   ? `Dean ✓ ${fmtDate(row.deanApprovalTimestamp)}`     : 'Dean: pending');
                          return (
                            <tr key={i}>
                              <td><strong>{row.engineerName}</strong></td>
                              <td>{fmtDate(row.startTimestamp)}</td>
                              <td>{fmtTime(row.startTimestamp)}</td>
                              <td>{fmtTime(row.endTimestamp)}</td>
                              <td>{row.duration}</td>
                              <td style={{ maxWidth: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {row.workDescription || <span className="text-muted">—</span>}
                              </td>
                              <td><ApprovalBadge status={row.approvalStatus || 'PENDING'} /></td>
                              <td style={{ fontSize: '0.78rem', color: '#6b7280' }}>{otherApproved}</td>
                              <td>
                                {row.imagePath
                                  ? <a href={row.imagePath} target="_blank" rel="noreferrer"
                                       style={{ color: '#1e40af', fontSize: '0.85rem' }}>View</a>
                                  : <span className="text-muted">—</span>}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="btn btn--primary btn--sm"
                                    onClick={() => openApproval(row, 'APPROVED')}>
                                    Approve
                                  </button>
                                  <button className="btn btn--danger btn--sm"
                                    onClick={() => openApproval(row, 'REJECTED')}>
                                    Reject
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── B. Already Approved by this manager ─────────────────── */}
              <div className="card">
                <p className="card__title" style={{ color: '#15803d' }}>
                  Your Approved Records — {currentManager} ({approvedByCurrentManager.length})
                </p>

                {overtimeData && approvedByCurrentManager.length === 0 && (
                  <p className="text-muted text-sm">No records approved by {currentManager} yet.</p>
                )}
                {approvedByCurrentManager.length > 0 && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Engineer</th><th>Date</th><th>Start</th><th>End</th>
                          <th>Duration</th><th>Work Description</th>
                          <th>Overall Status</th><th>Your Approval</th><th>Image</th>
                        </tr>
                      </thead>
                      <tbody>
                        {approvedByCurrentManager.map((row, i) => (
                          <tr key={i}>
                            <td><strong>{row.engineerName}</strong></td>
                            <td>{fmtDate(row.startTimestamp)}</td>
                            <td>{fmtTime(row.startTimestamp)}</td>
                            <td>{fmtTime(row.endTimestamp)}</td>
                            <td>
                              {row.adjustedDuration
                                ? <><strong>{row.adjustedDuration}</strong>{' '}
                                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>(adj. from {row.duration})</span></>
                                : row.duration}
                            </td>
                            <td style={{ maxWidth: 180, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {row.workDescription || <span className="text-muted">—</span>}
                            </td>
                            <td><ApprovalBadge status={row.approvalStatus} /></td>
                            <td style={{ fontSize: '0.78rem' }}>
                              {currentManager === 'Dean Marsh'
                                ? fmtDate(row.deanApprovalTimestamp)
                                : fmtDate(row.laurelApprovalTimestamp)}
                            </td>
                            <td>
                              {row.imagePath
                                ? <a href={row.imagePath} target="_blank" rel="noreferrer"
                                     style={{ color: '#1e40af', fontSize: '0.85rem' }}>View</a>
                                : <span className="text-muted">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── MONTHLY SUMMARY TAB ──────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {dashTab === 'monthly' && (
        <>
          {overtimeError && <div className="alert alert--error">{overtimeError}</div>}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <p className="card__title" style={{ margin: 0 }}>
                Overtime Summary —{' '}
                {useDateRange ? `${summaryFrom} to ${summaryTo}` : summaryMonth}
                {summaryEngineer && ` (${summaryEngineer})`}
              </p>
              {Object.keys(summaryByEngineer).length > 0 && (
                <button className="btn btn--secondary btn--sm" onClick={exportCsv}>
                  Export CSV
                </button>
              )}
            </div>
            <p className="text-sm text-muted" style={{ marginBottom: 12, marginTop: 4 }}>
              Includes only FULLY APPROVED overtime sessions.
              {useDateRange && <> Date range overrides month filter.</>}
            </p>

            {overtimeLoading && !overtimeData && (
              <p className="text-muted text-sm">Loading…</p>
            )}
            {overtimeData && Object.keys(summaryByEngineer).length === 0 && (
              <p className="text-muted text-sm">No fully approved overtime for this period.</p>
            )}

            {Object.keys(summaryByEngineer).length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Engineer</th><th>Total Approved Hours</th><th>Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summaryByEngineer)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([name, stats], i) => (
                        <tr key={i}>
                          <td><strong>{name}</strong></td>
                          <td>{formatHours(stats.totalHours)}</td>
                          <td>{stats.sessions}</td>
                        </tr>
                      ))}
                    <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 600 }}>
                      <td>Total</td>
                      <td>{formatHours(Object.values(summaryByEngineer).reduce((s, v) => s + v.totalHours, 0))}</td>
                      <td>{Object.values(summaryByEngineer).reduce((s, v) => s + v.sessions, 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── CONTRACTOR COMPLIANCE TAB ────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {dashTab === 'compliance' && (
        <>
          {complianceError && <div className="alert alert--error">{complianceError}</div>}

          <div className="card">
            <p className="card__title">Update Contractor Compliance</p>
            <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
              Enter the date compliance was last confirmed. Expiry is calculated automatically
              (RAMS: +6 months, Induction &amp; Insurance: +12 months).
              Only fields you fill in will be updated — existing dates are preserved.
            </p>

            {compMsgText && (
              <div className={`alert alert--${compMsgType === 'success' ? 'success' : 'error'}`}>
                {compMsgText}
              </div>
            )}

            <form onSubmit={handleComplianceSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="compCompany">Company name *</label>
                <input
                  id="compCompany"
                  type="text"
                  list="companyList"
                  value={compForm.companyName}
                  onChange={(e) => setCompForm((p) => ({ ...p, companyName: e.target.value }))}
                  placeholder="Type or select company name…"
                />
                <datalist id="companyList">
                  {(complianceData || []).map((r) => (
                    <option key={r.companyName} value={r.companyName} />
                  ))}
                </datalist>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label htmlFor="compRams">RAMS Date</label>
                  <input id="compRams" type="date" value={compForm.ramsDate}
                    onChange={(e) => setCompForm((p) => ({ ...p, ramsDate: e.target.value }))} />
                  <span className="field-hint">Expiry = +6 months</span>
                </div>
                <div className="form-group">
                  <label htmlFor="compInduction">Induction Date</label>
                  <input id="compInduction" type="date" value={compForm.inductionDate}
                    onChange={(e) => setCompForm((p) => ({ ...p, inductionDate: e.target.value }))} />
                  <span className="field-hint">Expiry = +12 months</span>
                </div>
                <div className="form-group">
                  <label htmlFor="compInsurance">Insurance Date</label>
                  <input id="compInsurance" type="date" value={compForm.insuranceDate}
                    onChange={(e) => setCompForm((p) => ({ ...p, insuranceDate: e.target.value }))} />
                  <span className="field-hint">Expiry = +12 months</span>
                </div>
              </div>

              <div className="form-group">
                <label>
                  Document <span className="text-muted text-sm">(optional PDF or image)</span>
                  <span className="field-hint">Compliance certificate or equivalent</span>
                </label>
                <input ref={compDocRef} type="file" accept=".pdf,image/*" multiple
                  onChange={(e) => setCompDoc(e.target.files.length > 0 ? e.target.files : null)} />
              </div>

              <button type="submit" className="btn btn--primary" disabled={complianceSubmitting}>
                {complianceSubmitting && <span className="spinner" />}
                {complianceSubmitting ? 'Saving…' : 'Save Compliance'}
              </button>
            </form>
          </div>

          <div className="card">
            <p className="card__title">Compliance Status Overview</p>

            {complianceLoading && !complianceData && (
              <p className="text-muted text-sm">Loading compliance data…</p>
            )}
            {complianceData && complianceData.length === 0 && (
              <p className="text-muted text-sm">
                No compliance records yet. Use the form above to add a contractor.
              </p>
            )}

            {complianceData && complianceData.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>RAMS Expiry</th>
                      <th>Induction Expiry</th>
                      <th>Insurance Expiry</th>
                      <th>Status</th>
                      <th>Document</th>
                      <th>Updated By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complianceData
                      .sort((a, b) => a.companyName.localeCompare(b.companyName))
                      .map((row, i) => (
                        <tr key={i}>
                          <td><strong>{row.companyName}</strong></td>
                          <td style={{
                            color: row.ramsExpired === true ? '#b91c1c'
                                 : row.ramsExpired === false ? '#15803d' : '#6b7280',
                          }}>
                            {row.ramsExpiry ? fmtDate(row.ramsExpiry) : <span className="text-muted">—</span>}
                            {row.ramsExpired === true && <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>⚠</span>}
                          </td>
                          <td style={{
                            color: row.inductionExpired === true ? '#b91c1c'
                                 : row.inductionExpired === false ? '#15803d' : '#6b7280',
                          }}>
                            {row.inductionExpiry ? fmtDate(row.inductionExpiry) : <span className="text-muted">—</span>}
                            {row.inductionExpired === true && <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>⚠</span>}
                          </td>
                          <td style={{
                            color: row.insuranceExpired === true ? '#b91c1c'
                                 : row.insuranceExpired === false ? '#15803d' : '#6b7280',
                          }}>
                            {row.insuranceExpiry ? fmtDate(row.insuranceExpiry) : <span className="text-muted">—</span>}
                            {row.insuranceExpired === true && <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>⚠</span>}
                          </td>
                          <td><ComplianceBadge status={row.complianceStatus} /></td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn btn--secondary btn--sm"
                                onClick={() => setFilesModalCompany(row.companyName)}
                              >
                                Files
                              </button>
                              <button
                                className="btn btn--danger btn--sm"
                                onClick={() => setDeleteComplianceModal(row.companyName)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                            {row.updatedBy || <span className="text-muted">—</span>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
