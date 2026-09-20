/**
 * POST /api/amend-contractor
 *
 * Allows a manager to amend a contractor log entry after it has been saved.
 * Requires manager PIN verification. Records who amended and when.
 *
 * Body: {
 *   rowId:         number   Supabase row id
 *   managerName:   string
 *   pin:           string
 *   workCompleted: string   (optional)
 *   signOutTime:   string   (optional, ISO datetime string)
 *   contactNumber: string   (optional)
 *   buildings:     string   (optional)
 *   pointOfContact: string  (optional)
 * }
 */
import { updateRow, deleteContractorRow, getContractorRowById, getManagerPin } from '../../lib/db';
import { ukDateTimeString } from '../../lib/ukTime';
import { requireSession } from '../../lib/session';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const {
    rowId,
    managerName,
    pin,
    action,
    workCompleted,
    signOutTime,
    contactNumber,
    buildings,
    pointOfContact,
  } = req.body;

  if (!rowId || !managerName || pin === undefined) {
    return res.status(400).json({ success: false, message: 'rowId, managerName, and pin are required.' });
  }

  // getContractorRowById() passes this straight into a Supabase .eq('id', …)
  // filter against a bigint column — unlike the old getAllRows()+find()
  // lookup this replaced (where a NaN from a non-numeric rowId just never
  // matched, falling through to 404), NaN here reaches Postgres as the
  // literal string "NaN" and throws, so it must be rejected before that.
  const numericRowId = Number(rowId);
  if (!Number.isFinite(numericRowId)) {
    return res.status(400).json({ success: false, message: 'rowId must be a number.' });
  }

  try {
    // ── Verify manager PIN ────────────────────────────────────────────────────
    const expectedPin = await getManagerPin(managerName);
    if (!expectedPin) {
      return res.status(403).json({
        success: false,
        message: `No PIN configured for ${managerName}.`,
      });
    }
    if (String(pin).trim() !== String(expectedPin).trim()) {
      return res.status(401).json({ success: false, message: 'Incorrect PIN.' });
    }

    // ── Verify record exists ──────────────────────────────────────────────────
    const record = await getContractorRowById(numericRowId);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }

    // ── Delete action ─────────────────────────────────────────────────────────
    if (action === 'delete') {
      await deleteContractorRow(numericRowId);
      return res.status(200).json({
        success: true,
        message: `Record for ${record['Operative Name']} deleted by ${managerName}.`,
      });
    }

    // ── Force sign-out (close active session, set sign-out time + status) ─────
    if (action === 'forceSignOut') {
      const outTime = signOutTime || ukDateTimeString();
      // The modal's default sign-out time is a fixed "today 18:00", which is
      // before the sign-in time for anyone who signed in later than that —
      // guard against silently writing a negative-duration row (same check
      // shift-correct.js already applies to its own manager correction).
      if (record['Sign-In Time'] && new Date(outTime) <= new Date(record['Sign-In Time'])) {
        return res.status(400).json({
          success: false,
          message: 'Sign-out time must be after the sign-in time.',
        });
      }
      await updateRow(numericRowId, {
        'Sign-Out Time':  outTime,
        'Status':         'Completed',
        'Work Completed': workCompleted || 'Session closed by manager override',
        'Amended By':     managerName,
        'Amended At':     ukDateTimeString(),
      });
      return res.status(200).json({
        success: true,
        message: `${record['Operative Name']} force-signed out by ${managerName}.`,
      });
    }

    // ── Build update payload — only include fields that were supplied ─────────
    const updates = {
      'Amended By': managerName,
      'Amended At': ukDateTimeString(),
    };
    if (workCompleted  !== undefined) updates['Work Completed']   = workCompleted;
    if (signOutTime    !== undefined) updates['Sign-Out Time']    = signOutTime;
    if (contactNumber  !== undefined) updates['Contact Number']   = contactNumber;
    if (buildings      !== undefined) updates['Buildings']        = buildings;
    if (pointOfContact !== undefined) updates['Point of Contact'] = pointOfContact;

    await updateRow(numericRowId, updates);

    return res.status(200).json({
      success: true,
      message: `Record amended by ${managerName}.`,
    });
  } catch (err) {
    console.error('Amend contractor error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}

export default requireSession(handler);
