/**
 * POST /api/overtime-approve
 *
 * Team-based single-approval workflow:
 *   • Each engineer has one line manager (lib/config.js -> TEAMS).
 *   • Only that line manager may approve/reject their overtime.
 *   • OVERRIDE_APPROVER (Sarfraz Arfan) may approve/reject any engineer.
 *   • One approval is enough: PENDING -> FULLY APPROVED.
 *
 * Legacy PARTIALLY APPROVED records (from the old dual-approval scheme) can
 * still be approved through to FULLY APPROVED by the responsible manager.
 *
 * Also allows editing PARTIALLY APPROVED or FULLY APPROVED records (manager PIN required).
 *
 * Body: {
 *   rowNumber:        number
 *   action:           "APPROVED" | "REJECTED" | "EDIT"
 *   managerName:      string
 *   pin:              string
 *   adjustedDuration: string  (optional, for APPROVED / EDIT)
 * }
 */
import { updateOvertimeRow, getAllOvertimeRows, getManagerPin } from '../../lib/db';
import { ukDateTimeString } from '../../lib/ukTime';
import { canApprove, getLineManager, OVERRIDE_APPROVER } from '../../lib/config';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { rowNumber, action, managerName, pin, adjustedDuration } = req.body;

  if (!rowNumber || !action || !managerName || pin === undefined) {
    return res.status(400).json({ success: false, message: 'rowNumber, action, managerName, and pin are required.' });
  }

  if (!['APPROVED', 'REJECTED', 'EDIT'].includes(action)) {
    return res.status(400).json({ success: false, message: 'action must be APPROVED, REJECTED, or EDIT.' });
  }

  try {
    // Verify PIN
    const expectedPin = await getManagerPin(managerName);
    if (!expectedPin) {
      return res.status(403).json({
        success: false,
        message: `No PIN configured for ${managerName}.`,
      });
    }
    if (String(pin).trim() !== String(expectedPin).trim()) {
      return res.status(401).json({ success: false, message: 'Incorrect PIN. Action blocked.' });
    }

    // Fetch record
    const rows   = await getAllOvertimeRows();
    const record = rows.find((r) => r._row === Number(rowNumber));
    if (!record) {
      return res.status(404).json({ success: false, message: 'Overtime record not found.' });
    }

    const currentStatus = record['Approval Status'];

    // ── EDIT action: allowed on PARTIALLY APPROVED or FULLY APPROVED ────────
    if (action === 'EDIT') {
      if (!['PARTIALLY APPROVED', 'FULLY APPROVED'].includes(currentStatus)) {
        return res.status(409).json({
          success: false,
          message: 'Only PARTIALLY APPROVED or FULLY APPROVED records can be edited.',
        });
      }
      const updates = {};
      if (adjustedDuration) updates['Adjusted Duration'] = adjustedDuration;
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No fields to update.' });
      }
      await updateOvertimeRow(Number(rowNumber), updates);
      return res.status(200).json({
        success: true,
        message: `Overtime record edited by ${managerName}.`,
      });
    }

    // ── Team permission check (applies to APPROVED and REJECTED) ────────────
    const engineerName = record['Engineer Name'];
    if (!canApprove(managerName, engineerName)) {
      const lineManager = getLineManager(engineerName);
      return res.status(403).json({
        success: false,
        message: lineManager
          ? `${engineerName} is on ${lineManager}'s team. Only ${lineManager} or ${OVERRIDE_APPROVER} can action this record.`
          : `${engineerName} is not assigned to a team. Only ${OVERRIDE_APPROVER} can action this record.`,
      });
    }

    const isOverride = managerName === OVERRIDE_APPROVER;
    const now        = ukDateTimeString();
    const signature  = isOverride ? `${managerName} (Override)` : managerName;

    // ── REJECTED: allowed from PENDING or PARTIALLY APPROVED ────────────────
    if (action === 'REJECTED') {
      if (!['PENDING', 'PARTIALLY APPROVED'].includes(currentStatus)) {
        return res.status(409).json({
          success: false,
          message: `Cannot reject a ${currentStatus} record.`,
        });
      }
      await updateOvertimeRow(Number(rowNumber), {
        'Approval Status':    'REJECTED',
        'Approved By':        signature,
        'Approval Timestamp': now,
      });
      return res.status(200).json({
        success: true,
        message: `Overtime record rejected by ${managerName}.`,
      });
    }

    // ── APPROVED: single approval by the responsible line manager ───────────
    if (!['PENDING', 'PARTIALLY APPROVED'].includes(currentStatus)) {
      return res.status(409).json({
        success: false,
        message: `Record is already ${currentStatus}.`,
      });
    }

    const updates = {
      'Approval Status':    'FULLY APPROVED',
      'Approved By':        signature,
      'Approval Timestamp': now,
    };
    if (adjustedDuration) updates['Adjusted Duration'] = adjustedDuration;

    await updateOvertimeRow(Number(rowNumber), updates);

    return res.status(200).json({
      success: true,
      message: `Overtime approved by ${signature}.`,
      newStatus: 'FULLY APPROVED',
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
