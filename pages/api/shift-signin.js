/**
 * POST /api/shift-signin
 *
 * Body: { engineerName: string, deviceId?: string }
 *
 * Starts a fixed 8h daily shift. Blocked if the engineer already has an OPEN
 * shift, has already completed or been flagged for a shift today, or has an
 * ACTIVE overtime session — shift and overtime never overlap.
 *
 * Before checking, any OPEN shift left over from an earlier day is flagged
 * MISSING_SIGNOUT here regardless of what time it was signed in at — this is
 * unconditional (unlike the same-day 17:00 cutoff in shift-status/
 * shift-signout) because a shift dated before today has, by definition,
 * already run past any reasonable end time. Doing this before the insert
 * matters: shift_log has a partial unique index allowing only one OPEN row
 * per engineer, so a stale row from yesterday would otherwise block today's
 * legitimate sign-in.
 */
import { appendShiftRow, findActiveShift, findShiftForDate, findActiveOvertimeSession, markShiftMissing } from '../../lib/db';
import { ukDateString, ukDateTimeString } from '../../lib/ukTime';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { engineerName, deviceId } = req.body;

  if (!engineerName || !engineerName.trim()) {
    return res.status(400).json({ success: false, message: 'Please select your name.' });
  }

  const name  = engineerName.trim();
  const today = ukDateString();

  try {
    const activeOvertime = await findActiveOvertimeSession(name);
    if (activeOvertime) {
      return res.status(409).json({
        success: false,
        message: `You have an overtime session in progress. Please end it before starting your shift.`,
      });
    }

    let openShift = await findActiveShift(name);
    if (openShift && openShift['Shift Date'] < today) {
      await markShiftMissing(openShift._row);
      openShift = null;
    }
    if (openShift) {
      return res.status(409).json({
        success: false,
        message: `You're already signed in for a shift.`,
      });
    }

    const todayShift = await findShiftForDate(name, today);
    if (todayShift) {
      if (todayShift['Status'] === 'MISSING_SIGNOUT') {
        return res.status(409).json({
          success: false,
          message: `Today's shift is waiting for a manager to confirm your hours.`,
        });
      }
      return res.status(409).json({
        success: false,
        message: `You've already completed your shift today.`,
      });
    }

    await appendShiftRow({
      'Engineer Name': name,
      'Shift Date':    today,
      'Sign-In Time':  ukDateTimeString(),
      'Sign-Out Time': '',
      'Hours':         '',
      'Status':        'OPEN',
      'Device Id':     deviceId || '',
    });

    return res.status(200).json({
      success: true,
      message: `${name}, your shift has started.`,
    });
  } catch (err) {
    // A concurrent sign-in from another phone can win the race between the
    // findActiveShift check above and this insert — the DB's partial unique
    // index (one OPEN row per engineer) rejects the second one. Report it the
    // same way as the normal "already signed in" case rather than a 500.
    if (err.message && err.message.toLowerCase().includes('duplicate key')) {
      return res.status(409).json({
        success: false,
        message: `You're already signed in for a shift.`,
      });
    }
    console.error('Shift sign-in error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again or contact site admin.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
