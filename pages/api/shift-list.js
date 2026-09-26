/**
 * GET /api/shift-list?from=YYYY-MM-DD&to=YYYY-MM-DD&status=OPEN,MISSING_SIGNOUT
 *
 * Returns shift_log rows in a UK date range for the manager dashboard's
 * Attendance tab. `status` is optional and comma-separated — the Live view
 * uses it to fetch only OPEN/MISSING_SIGNOUT rows without pulling history;
 * Week/Month views omit it to also get COMPLETE rows for the fill/heat-map.
 *
 * Auth: requires a dashboard session (lib/session.js) — this and every
 * other dashboard-only list route now check the session cookie set by
 * /api/check-pin, closing what was previously a client-side-only PIN gate
 * (see SECURITY_AND_DATA.md / BACKLOG.md B2).
 */
import { getShiftRowsInRange } from '../../lib/db';
import { requireSession } from '../../lib/session';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { from, to, status } = req.query;

  if (!from || !to) {
    return res.status(400).json({ success: false, message: 'from and to parameters required' });
  }

  try {
    const statuses = status ? String(status).split(',').map((s) => s.trim()).filter(Boolean) : null;
    const rows = await getShiftRowsInRange(from, to, statuses);

    const records = rows.map((r) => ({
      _row:            r._row,
      engineerName:    r['Engineer Name'],
      shiftDate:       r['Shift Date'],
      signInTime:      r['Sign-In Time'],
      signOutTime:     r['Sign-Out Time'],
      hours:           r['Hours'],
      status:          r['Status'],
      earlyReason:     r['Early Reason'],
      earlyNote:       r['Early Note'],
      correctedBy:     r['Corrected By'],
      correctedAt:     r['Corrected At'],
      correctionNote:  r['Correction Note'],
    }));

    return res.status(200).json({ success: true, records });
  } catch (err) {
    console.error('Shift list error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

export default requireSession(handler);
