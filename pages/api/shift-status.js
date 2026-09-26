/**
 * GET /api/shift-status?engineerName=X
 *
 * Tells the phone UI what to show: no shift yet today (NONE), an open shift
 * they can sign out of (OPEN), one already completed today (COMPLETE_TODAY),
 * or one flagged for manager correction (MISSING_SIGNOUT).
 *
 * Lazy fallback: if this engineer's own OPEN shift should already have been
 * flagged (past today's 17:00 UK cutoff, or left open from an earlier day)
 * but the scheduled cron sweep (/api/flag-missing-shifts) hasn't run yet,
 * this flags it now before responding, per the "cron might miss it" case.
 */
import { findActiveShift, findShiftForDate, markShiftMissing } from '../../lib/db';
import { ukDateString } from '../../lib/ukTime';

function ukHour() {
  return Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(new Date())
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { engineerName } = req.query;
  if (!engineerName || !engineerName.trim()) {
    return res.status(400).json({ success: false, message: 'engineerName parameter required' });
  }

  const name  = engineerName.trim();
  const today = ukDateString();

  try {
    let openShift = await findActiveShift(name);

    if (openShift) {
      // Only flag a same-day shift if it started before 17:00 — a shift that
      // itself began at/after 17:00 hasn't missed the cutoff just because
      // "now" also happens to be past it.
      const signInTimeOfDay = (openShift['Sign-In Time'] || '').slice(11, 16); // "HH:MM"
      const pastCutoff = openShift['Shift Date'] < today
        || (openShift['Shift Date'] === today && ukHour() >= 17 && signInTimeOfDay !== '' && signInTimeOfDay < '17:00');
      if (pastCutoff) {
        await markShiftMissing(openShift._row);
        openShift = null;
      }
    }

    if (openShift) {
      return res.status(200).json({
        success: true,
        state:   'OPEN',
        shift:   { signInTime: openShift['Sign-In Time'], shiftDate: openShift['Shift Date'] },
      });
    }

    const todayShift = await findShiftForDate(name, today);

    if (todayShift && todayShift['Status'] === 'MISSING_SIGNOUT') {
      return res.status(200).json({ success: true, state: 'MISSING_SIGNOUT', shift: null });
    }

    if (todayShift && todayShift['Status'] === 'COMPLETE') {
      return res.status(200).json({
        success: true,
        state:   'COMPLETE_TODAY',
        shift:   { signInTime: todayShift['Sign-In Time'], signOutTime: todayShift['Sign-Out Time'] },
      });
    }

    return res.status(200).json({ success: true, state: 'NONE', shift: null });
  } catch (err) {
    console.error('Shift status error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}
