/**
 * GET /api/flag-missing-shifts
 *
 * Scheduled by Vercel Cron (see vercel.json) at both 16:00 and 17:00 UTC —
 * with the overdue-contractor email retired (see MEMORY.md), this is the
 * only cron left, so there's room for two firings instead of the one-fixed-
 * schedule compromise used previously. One of the two always lands exactly
 * at 17:00 UK time regardless of GMT/BST (16:00 UTC in summer, 17:00 UTC in
 * winter); the `ukHour() < 17` guard below makes the other firing a no-op.
 *
 * Flags any shift still OPEN dated today or earlier as MISSING_SIGNOUT with
 * no hours credited (an earlier date covers a previous day's sweep having
 * been missed, e.g. a deploy outage). Idempotent — re-running finds nothing
 * left to flag once a shift's status has changed from OPEN.
 *
 * Authorization: Bearer <CRON_SECRET>.
 */
import { getOpenShiftsUpTo, markShiftsMissing } from '../../lib/db';
import { ukDateString } from '../../lib/ukTime';

function ukHour() {
  return Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(new Date())
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[flag-missing-shifts] CRON_SECRET not set');
    return res.status(503).json({ success: false, message: 'CRON_SECRET is not configured.' });
  }
  const authHeader = req.headers['authorization'] || '';
  const dashHeader = req.headers['x-dashboard-auth'] || '';
  const token = authHeader.replace('Bearer ', '').trim() || dashHeader.trim();
  if (token !== cronSecret) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // Act only once UK time reaches 17:00 — the single 17:00 UTC schedule lands
  // exactly on time in winter (GMT) and an hour late in summer (18:00 BST);
  // this guard is a no-op in the (currently impossible) case of an earlier
  // manual/retry call, and keeps the whole handler idempotent either way.
  if (ukHour() < 17) {
    return res.status(200).json({ success: true, message: 'Not yet 17:00 UK time.', flagged: 0 });
  }

  try {
    const today = ukDateString();
    const stale = await getOpenShiftsUpTo(today);

    // A shift dated today that started at/after 17:00 UK hasn't missed the
    // cutoff yet — only flag it once IT has been open across a 17:00 boundary.
    const toFlag = stale.filter((s) => {
      if (s['Shift Date'] < today) return true;
      const signInTimeOfDay = (s['Sign-In Time'] || '').slice(11, 16); // "HH:MM"
      return signInTimeOfDay !== '' && signInTimeOfDay < '17:00';
    });

    if (toFlag.length === 0) {
      return res.status(200).json({ success: true, message: 'No open shifts to flag.', flagged: 0 });
    }

    await markShiftsMissing(toFlag.map((s) => s._row));

    return res.status(200).json({ success: true, flagged: toFlag.length });
  } catch (err) {
    console.error('[flag-missing-shifts] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to flag missing shifts.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
