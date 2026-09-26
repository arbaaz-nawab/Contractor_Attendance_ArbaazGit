/**
 * POST /api/shift-correct
 *
 * Manager correction for a shift the engineer couldn't close themselves
 * (MISSING_SIGNOUT, or a still-OPEN one a manager wants to close directly).
 * Same auth pattern as /api/amend-contractor: manager PIN verified
 * server-side via lib/db.js getManagerPin.
 *
 * Body: {
 *   rowId:        number  shift_log id
 *   managerName:  string
 *   pin:          string
 *   signOutTime:  string  "YYYY-MM-DDTHH:mm" (datetime-local) or
 *                         "YYYY-MM-DD HH:mm:ss"
 *   note:         string  required — why/what was corrected
 * }
 */
import { getShiftById, updateShiftRow, getManagerPin } from '../../lib/db';
import { ukDateTimeString } from '../../lib/ukTime';
import { requireSession } from '../../lib/session';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { rowId, managerName, pin, signOutTime, note } = req.body;

  if (!rowId || !managerName || pin === undefined || !signOutTime || !note || !note.trim()) {
    return res.status(400).json({
      success: false,
      message: 'rowId, managerName, pin, signOutTime and note are all required.',
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

    const shift = await getShiftById(Number(rowId));
    if (!shift) {
      return res.status(404).json({ success: false, message: 'Shift record not found.' });
    }
    if (shift['Status'] === 'COMPLETE') {
      return res.status(409).json({ success: false, message: 'This shift is already complete.' });
    }

    // Normalise a datetime-local value ("YYYY-MM-DDTHH:mm") to the app's
    // stored format ("YYYY-MM-DD HH:mm:ss").
    let normalised = String(signOutTime).trim().replace('T', ' ');
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalised)) normalised += ':00';

    const signOutDate = new Date(normalised);
    const signInDate   = new Date(shift['Sign-In Time']);

    if (isNaN(signOutDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Sign-out time is not valid.' });
    }
    if (normalised.slice(0, 10) !== shift['Shift Date']) {
      return res.status(400).json({
        success: false,
        message: 'Sign-out time must be on the same date as the shift.',
      });
    }
    if (signOutDate <= signInDate) {
      return res.status(400).json({
        success: false,
        message: 'Sign-out time must be after the sign-in time.',
      });
    }

    const hours = (signOutDate - signInDate) / 3600000;

    await updateShiftRow(shift._row, {
      'Sign-Out Time':   normalised,
      'Hours':           hours.toFixed(2),
      'Status':          'COMPLETE',
      'Corrected By':    managerName,
      'Corrected At':    ukDateTimeString(),
      'Correction Note': note.trim(),
    });

    return res.status(200).json({
      success: true,
      message: `Shift for ${shift['Engineer Name']} corrected by ${managerName}.`,
    });
  } catch (err) {
    console.error('Shift correct error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}

export default requireSession(handler);
