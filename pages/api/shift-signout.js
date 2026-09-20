/**
 * POST /api/shift-signout
 *
 * Body: {
 *   engineerName: string,
 *   earlyReason?: string,   required only if the shift is under 8h
 *   earlyNote?:   string,   optional free text
 * }
 *
 * Ends the engineer's OPEN shift. Hours = sign-out minus sign-in (UK time).
 * If it's already past today's 17:00 UK cutoff (or the shift is from an
 * earlier day), the shift is flagged MISSING_SIGNOUT here instead of being
 * completed — this is the same safety net as the lazy fallback in
 * /api/shift-status, in case the scheduled cron sweep hasn't run yet.
 */
import { findActiveShift, updateShiftRow } from '../../lib/db';
import { ukDateString, ukDateTimeString } from '../../lib/ukTime';

const FULL_SHIFT_HOURS = 8;

function ukHour() {
  return Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(new Date())
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { engineerName, earlyReason, earlyNote } = req.body;

  if (!engineerName || !engineerName.trim()) {
    return res.status(400).json({ success: false, message: 'Please select your name.' });
  }

  const name = engineerName.trim();

  try {
    const shift = await findActiveShift(name);
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: `No open shift found for ${name}.`,
      });
    }

    const today = ukDateString();
    // Only treat a same-day shift as past-cutoff if it started before 17:00 —
    // a shift that itself began at/after 17:00 hasn't missed the window yet.
    const signInTimeOfDay = (shift['Sign-In Time'] || '').slice(11, 16); // "HH:MM"
    const pastCutoff = shift['Shift Date'] < today
      || (shift['Shift Date'] === today && ukHour() >= 17 && signInTimeOfDay !== '' && signInTimeOfDay < '17:00');
    if (pastCutoff) {
      await updateShiftRow(shift._row, { 'Status': 'MISSING_SIGNOUT', 'Hours': '' });
      return res.status(409).json({
        success: false,
        message: `It's past today's sign-out window — a manager will confirm your hours.`,
      });
    }

    const signOutTime  = ukDateTimeString();
    const signInDate   = new Date(shift['Sign-In Time']);
    const signOutDate  = new Date(signOutTime);
    const elapsedHours = (signOutDate - signInDate) / 3600000;
    const isEarly       = elapsedHours < FULL_SHIFT_HOURS;

    if (isEarly && (!earlyReason || !earlyReason.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please choose a reason for signing out early.',
      });
    }

    await updateShiftRow(shift._row, {
      'Sign-Out Time': signOutTime,
      'Hours':         elapsedHours > 0 ? elapsedHours.toFixed(2) : '0',
      'Status':        'COMPLETE',
      'Early Reason':  isEarly ? earlyReason.trim() : '',
      'Early Note':    isEarly ? (earlyNote || '').trim() : '',
    });

    return res.status(200).json({
      success: true,
      message: `${name}, you're signed out. Thanks for today.`,
    });
  } catch (err) {
    console.error('Shift sign-out error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again or contact site admin.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
