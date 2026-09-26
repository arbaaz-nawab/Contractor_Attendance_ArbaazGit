/**
 * POST /api/parking-save
 *
 * action: 'create' | 'update' | 'status'
 *
 *   create: { action:'create', requester, projectCode, company, bookingDate,
 *             durationType, vehicleReg, enteredBy }
 *   update: { action:'update', id, requester, projectCode, company,
 *             bookingDate, durationType, vehicleReg, changedBy }
 *   status: { action:'status', id, status, changedBy }
 *
 * Every create/update/status-change is logged to parking_history — no hard
 * delete anywhere. Status is Requested/Booked only (legacy Completed/Cancelled
 * rows are read-only "Archived"). No per-manager PIN
 * on these writes (session-only, per the agreed design).
 */
import {
  createParkingBooking, updateParkingBooking, deleteParkingBooking, getParkingBookingById,
  findParkingConflict, addParkingHistory,
} from '../../lib/db';
import { ukDateTimeString } from '../../lib/ukTime';
import { requireSession } from '../../lib/session';

const DURATION_CODES = ['1H', '2H', '3H', '4H', 'FULL_DAY'];
// Only these two can be set. Legacy 'Completed'/'Cancelled' rows keep their stored
// value (shown read-only as "Archived") but can no longer be assigned or changed.
const STATUSES = ['Requested', 'Booked'];
const ARCHIVED_STATUSES = ['Completed', 'Cancelled'];
const CONFLICT_MESSAGE = 'Another active booking already has this vehicle registration on this date.';
const HISTORY_LOST_MESSAGE = 'This change may have been saved without a history record. Please check this booking and contact support.';

const FIELD_LABELS = {
  requester: 'Requester', projectCode: 'Project Code', company: 'Company',
  bookingDate: 'Booking Date', durationType: 'Duration', vehicleReg: 'Vehicle Reg',
};

function normaliseReg(v) {
  return String(v || '').toUpperCase().replace(/\s+/g, '');
}

/** Format AND calendar validity — rejects "2026-13-40" as well as garbage. */
function isValidBookingDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * Writes a parking_history row after a booking create/update/status write.
 * There's no cross-table transaction available (plain Supabase client calls,
 * two separate inserts/updates) — booking-row-first is required for CREATE
 * anyway, since history needs the booking's DB-generated id, so the same
 * order is kept for update/status for consistency. If the history insert
 * fails, this compensates by reverting the booking write via `revert`
 * (delete for create, restore-old-values for update/status) so the two
 * never silently drift apart. If the revert ALSO fails, that's reported
 * distinctly (`historyFailed: true`) rather than ever claiming success.
 */
async function writeHistoryOrRevert(res, historyEntry, revert, successBody) {
  try {
    await addParkingHistory(historyEntry);
  } catch (historyErr) {
    console.error('Parking history insert failed — reverting booking', historyEntry.bookingId, historyErr.message);
    try {
      await revert();
    } catch (revertErr) {
      console.error('Parking booking revert ALSO failed — booking', historyEntry.bookingId,
        'may now exist without a matching history record', revertErr.message);
      return res.status(500).json({ success: false, message: HISTORY_LOST_MESSAGE, historyFailed: true });
    }
    return res.status(500).json({ success: false, message: 'Could not save this change. Please try again.' });
  }
  return res.status(200).json(successBody);
}

async function handleCreate(req, res) {
  const { requester, projectCode, company, bookingDate, durationType, vehicleReg, enteredBy } = req.body;

  if (!requester?.trim() || !projectCode?.trim() || !company?.trim() || !bookingDate
    || !durationType || !vehicleReg?.trim() || !enteredBy?.trim()) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }
  if (!DURATION_CODES.includes(durationType)) {
    return res.status(400).json({ success: false, message: 'Invalid duration.' });
  }
  if (!isValidBookingDate(bookingDate)) {
    return res.status(400).json({ success: false, message: 'Booking date must be a real date (YYYY-MM-DD).' });
  }

  const reg = normaliseReg(vehicleReg);
  const now = ukDateTimeString();

  const booking = await createParkingBooking({
    requester: requester.trim(),
    projectCode: projectCode.trim(),
    company: company.trim(),
    bookingDate,
    durationType,
    vehicleReg: reg,
    bookedBy: enteredBy.trim(),
    requestedAt: now,
  });

  const conflict = await findParkingConflict(reg, bookingDate, booking.id);

  return writeHistoryOrRevert(
    res,
    { bookingId: booking.id, changedBy: enteredBy.trim(), changedAt: now, changeType: 'CREATED', changes: null },
    () => deleteParkingBooking(booking.id),
    { success: true, booking, warning: conflict ? CONFLICT_MESSAGE : null },
  );
}

async function handleUpdate(req, res) {
  const { id, requester, projectCode, company, bookingDate, durationType, vehicleReg, changedBy } = req.body;

  if (!id || !changedBy?.trim()) {
    return res.status(400).json({ success: false, message: 'id and changedBy are required.' });
  }
  if (!requester?.trim() || !projectCode?.trim() || !company?.trim() || !bookingDate
    || !durationType || !vehicleReg?.trim()) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }
  if (!DURATION_CODES.includes(durationType)) {
    return res.status(400).json({ success: false, message: 'Invalid duration.' });
  }
  if (!isValidBookingDate(bookingDate)) {
    return res.status(400).json({ success: false, message: 'Booking date must be a real date (YYYY-MM-DD).' });
  }

  const existing = await getParkingBookingById(Number(id));
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Booking not found.' });
  }

  const reg = normaliseReg(vehicleReg);
  const next = {
    requester: requester.trim(), projectCode: projectCode.trim(), company: company.trim(),
    bookingDate, durationType, vehicleReg: reg,
  };

  const changes = [];
  for (const key of Object.keys(next)) {
    if (String(existing[key] || '') !== String(next[key] || '')) {
      changes.push({ field: FIELD_LABELS[key] || key, old: existing[key], new: next[key] });
    }
  }

  const conflict = await findParkingConflict(reg, bookingDate, existing.id);

  if (changes.length === 0) {
    return res.status(200).json({ success: true, warning: conflict ? CONFLICT_MESSAGE : null });
  }

  await updateParkingBooking(existing.id, next);

  return writeHistoryOrRevert(
    res,
    { bookingId: existing.id, changedBy: changedBy.trim(), changedAt: ukDateTimeString(), changeType: 'UPDATED', changes },
    () => updateParkingBooking(existing.id, {
      requester: existing.requester, projectCode: existing.projectCode, company: existing.company,
      bookingDate: existing.bookingDate, durationType: existing.durationType, vehicleReg: existing.vehicleReg,
    }),
    { success: true, warning: conflict ? CONFLICT_MESSAGE : null },
  );
}

async function handleStatus(req, res) {
  const { id, status, changedBy } = req.body;

  if (!id || !status || !changedBy?.trim()) {
    return res.status(400).json({ success: false, message: 'id, status and changedBy are required.' });
  }
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }

  const existing = await getParkingBookingById(Number(id));
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Booking not found.' });
  }
  if (ARCHIVED_STATUSES.includes(existing.status)) {
    return res.status(409).json({ success: false, message: 'This is an archived booking; its status can no longer be changed.' });
  }
  if (existing.status === status) {
    return res.status(200).json({ success: true });
  }

  const now = ukDateTimeString();
  // bookedAt tracks "the last time this booking was confirmed Booked":
  // entering Booked always refreshes it; moving back to Requested clears it,
  // since the booking is no longer confirmed.
  const updates = { status };
  if (status === 'Booked') updates.bookedAt = now;
  else if (status === 'Requested') updates.bookedAt = '';

  await updateParkingBooking(existing.id, updates);

  return writeHistoryOrRevert(
    res,
    {
      bookingId: existing.id, changedBy: changedBy.trim(), changedAt: now,
      changeType: 'STATUS_CHANGE',
      changes: [{ field: 'Status', old: existing.status, new: status }],
    },
    () => updateParkingBooking(existing.id, { status: existing.status, bookedAt: existing.bookedAt }),
    { success: true },
  );
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { action } = req.body;

  try {
    if (action === 'create') return await handleCreate(req, res);
    if (action === 'update') return await handleUpdate(req, res);
    if (action === 'status') return await handleStatus(req, res);
    return res.status(400).json({ success: false, message: 'Unknown action.' });
  } catch (err) {
    console.error('Parking save error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}

export default requireSession(handler);
