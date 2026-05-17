/**
 * POST /api/amend-overtime
 *
 * Amend or delete an engineer overtime record. Requires manager PIN.
 *
 * Body: {
 *   rowId:             number   required
 *   managerName:       string   required
 *   pin:               string   required
 *   action?:           'delete' — omit to amend
 *   workDescription?:  string
 *   startTimestamp?:   string   (YYYY-MM-DD HH:mm:ss)
 *   endTimestamp?:     string   (YYYY-MM-DD HH:mm:ss)
 *   adjustedDuration?: string   (e.g. "2h 30m")
 *   notes?:            string
 * }
 */
import { updateOvertimeRow, deleteOvertimeRow, getAllOvertimeRows, getManagerPin } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const {
    rowId,
    managerName,
    pin,
    action,
    workDescription,
    startTimestamp,
    endTimestamp,
    adjustedDuration,
    notes,
  } = req.body;

  if (!rowId || !managerName || pin === undefined) {
    return res.status(400).json({
      success: false,
      message: 'rowId, managerName, and pin are required.',
    });
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
    const rows   = await getAllOvertimeRows();
    const record = rows.find((r) => r._row === Number(rowId));
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }

    // ── Delete action ─────────────────────────────────────────────────────────
    if (action === 'delete') {
      await deleteOvertimeRow(Number(rowId));
      return res.status(200).json({
        success: true,
        message: `Overtime record for ${record['Engineer Name']} deleted by ${managerName}.`,
      });
    }

    // ── Build update payload — only supplied fields ───────────────────────────
    const updates = {};
    if (workDescription  !== undefined) updates['Work Description']  = workDescription;
    if (startTimestamp   !== undefined) updates['Start Timestamp']   = startTimestamp;
    if (endTimestamp     !== undefined) updates['End Timestamp']     = endTimestamp;
    if (adjustedDuration !== undefined) updates['Adjusted Duration'] = adjustedDuration;
    if (notes            !== undefined) updates['Notes']             = notes;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    await updateOvertimeRow(Number(rowId), updates);

    return res.status(200).json({
      success: true,
      message: `Overtime record for ${record['Engineer Name']} amended by ${managerName}.`,
    });
  } catch (err) {
    console.error('Amend overtime error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
