/**
 * POST /api/overtime-approve
 *
 * Body: {
 *   rowNumber:   number   Excel row number of the overtime record
 *   action:      string   "APPROVED" | "REJECTED"
 *   managerName: string   Identifying manager name
 *   pin:         string   Manager's PIN (verified server-side)
 * }
 *
 * Only PENDING records can be approved/rejected.
 * Approved/Rejected records become read-only (re-submission blocked).
 */
import { updateOvertimeRow, getAllOvertimeRows, getManagerPin } from '../../lib/db';
import { ukDateTimeString } from '../../lib/ukTime';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { rowNumber, action, managerName, pin, adjustedDuration } = req.body;

  if (!rowNumber || !action || !managerName || pin === undefined) {
    return res.status(400).json({ success: false, message: 'rowNumber, action, managerName, and pin are required.' });
  }

  if (!['APPROVED', 'REJECTED'].includes(action)) {
    return res.status(400).json({ success: false, message: 'action must be APPROVED or REJECTED.' });
  }

  try {
    // ── Verify manager PIN ────────────────────────────────────────────────────
    const expectedPin = await getManagerPin(managerName);

    if (!expectedPin) {
      return res.status(403).json({
        success: false,
        message: `No PIN configured for ${managerName}. Contact your system administrator.`,
      });
    }

    if (String(pin).trim() !== String(expectedPin).trim()) {
      return res.status(401).json({ success: false, message: 'Incorrect PIN. Action blocked.' });
    }

    // ── Verify record exists and is still PENDING ─────────────────────────────
    const rows   = await getAllOvertimeRows();
    const record = rows.find((r) => r._row === Number(rowNumber));

    if (!record) {
      return res.status(404).json({ success: false, message: 'Overtime record not found.' });
    }

    if (record['Approval Status'] !== 'PENDING') {
      return res.status(409).json({
        success: false,
        message: `Record is already ${record['Approval Status']}. Only PENDING records can be actioned.`,
      });
    }

    // ── Apply approval ────────────────────────────────────────────────────────
    const updates = {
      'Approval Status':    action,
      'Approved By':        managerName,
      'Approval Timestamp': ukDateTimeString(),
    };
    if (action === 'APPROVED' && adjustedDuration) {
      updates['Adjusted Duration'] = adjustedDuration;
    }
    await updateOvertimeRow(Number(rowNumber), updates);

    return res.status(200).json({
      success: true,
      message: `Overtime record ${action.toLowerCase()} by ${managerName}.`,
    });
  } catch (err) {
    console.error('Overtime approve error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again or contact site admin.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
