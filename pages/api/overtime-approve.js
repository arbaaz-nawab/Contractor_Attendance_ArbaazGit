/**
 * POST /api/overtime-approve
 *
 * Dual-approval workflow: both Dean Marsh AND Laurel Anderson must approve.
 *   PENDING           -> first approver  -> PARTIALLY APPROVED
 *   PARTIALLY APPROVED -> second approver -> FULLY APPROVED
 *   Any manager can REJECT immediately.
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

const DEAN   = 'Dean Marsh';
const LAUREL = 'Laurel Anderson';

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
        'Approved By':        managerName,
        'Approval Timestamp': ukDateTimeString(),
      });
      return res.status(200).json({
        success: true,
        message: `Overtime record rejected by ${managerName}.`,
      });
    }

    // ── APPROVED: dual-approval logic ────────────────────────────────────────
    if (!['PENDING', 'PARTIALLY APPROVED'].includes(currentStatus)) {
      return res.status(409).json({
        success: false,
        message: `Record is already ${currentStatus}.`,
      });
    }

    // Prevent same manager approving twice
    const isDean   = managerName === DEAN;
    const isLaurel = managerName === LAUREL;

    if (isDean   && record['Approved By Dean'])   {
      return res.status(409).json({ success: false, message: 'You have already approved this record.' });
    }
    if (isLaurel && record['Approved By Laurel']) {
      return res.status(409).json({ success: false, message: 'You have already approved this record.' });
    }

    const now = ukDateTimeString();

    const updates = {};

    if (isDean) {
      updates['Approved By Dean']          = managerName;
      updates['Dean Approval Timestamp']   = now;
    } else if (isLaurel) {
      updates['Approved By Laurel']        = managerName;
      updates['Laurel Approval Timestamp'] = now;
    } else {
      return res.status(403).json({ success: false, message: `${managerName} is not an authorised approver.` });
    }

    if (adjustedDuration) updates['Adjusted Duration'] = adjustedDuration;

    // Determine new status
    const deanApproved   = isDean   ? true : !!record['Approved By Dean'];
    const laurelApproved = isLaurel ? true : !!record['Approved By Laurel'];

    if (deanApproved && laurelApproved) {
      updates['Approval Status']    = 'FULLY APPROVED';
      updates['Approved By']        = `${DEAN} & ${LAUREL}`;
      updates['Approval Timestamp'] = now;
    } else {
      updates['Approval Status'] = 'PARTIALLY APPROVED';
    }

    await updateOvertimeRow(Number(rowNumber), updates);

    const newStatus = updates['Approval Status'];
    return res.status(200).json({
      success: true,
      message: `Overtime ${newStatus === 'FULLY APPROVED' ? 'fully approved' : `partially approved by ${managerName} — awaiting second approval`}.`,
      newStatus,
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
