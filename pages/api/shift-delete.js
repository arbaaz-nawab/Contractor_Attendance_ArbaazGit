/**
 * POST /api/shift-delete
 *
 * PERMANENT delete of one shift_log row (Attendance tab). Same auth pattern
 * as /api/shift-correct: dashboard session + the manager's personal PIN
 * verified server-side via lib/db.js getManagerPin. The deletion itself is
 * recorded in shift_log_deletions (who / when / which engineer, date, hours).
 *
 * Body: { rowId: number, managerName: string, pin: string }
 */
import { getShiftById, deleteShiftRowWithAudit, getManagerPin } from '../../lib/db';
import { ukDateTimeString } from '../../lib/ukTime';
import { requireSession } from '../../lib/session';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { rowId, managerName, pin } = req.body || {};
  const id = Number(rowId);

  if (!Number.isFinite(id) || !managerName || pin === undefined || String(pin).trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'rowId, managerName and pin are all required.',
    });
  }

  try {
    const expectedPin = await getManagerPin(managerName);
    if (!expectedPin) {
      return res.status(403).json({ success: false, message: `No PIN configured for ${managerName}.` });
    }
    if (String(pin).trim() !== String(expectedPin).trim()) {
      return res.status(401).json({ success: false, message: 'Incorrect PIN.' });
    }

    const shift = await getShiftById(id);
    if (!shift) {
      return res.status(404).json({ success: false, message: 'Shift record not found.' });
    }

    await deleteShiftRowWithAudit(shift, managerName, ukDateTimeString());

    return res.status(200).json({
      success: true,
      message: `Shift for ${shift['Engineer Name']} on ${shift['Shift Date']} permanently deleted.`,
    });
  } catch (err) {
    console.error('Shift delete error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. The record was not deleted.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}

export default requireSession(handler);
