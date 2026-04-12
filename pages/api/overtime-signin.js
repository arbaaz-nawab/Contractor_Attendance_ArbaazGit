/**
 * POST /api/overtime-signin
 *
 * Body: { engineerName: string, notes?: string }
 *
 * Starts an overtime session. Blocks if engineer already has an ACTIVE session.
 */
import { appendOvertimeRow, findActiveOvertimeSession } from '../../lib/db';
import { ukDateTimeString } from '../../lib/ukTime';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { engineerName, notes } = req.body;

  if (!engineerName || !engineerName.trim()) {
    return res.status(400).json({ success: false, message: 'Engineer name is required.' });
  }

  try {
    // Block if engineer already has an active overtime session
    const existing = await findActiveOvertimeSession(engineerName.trim());
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `${engineerName} already has an active overtime session. Please sign out first.`,
      });
    }

    await appendOvertimeRow({
      'Engineer Name':     engineerName.trim(),
      'Start Timestamp':   ukDateTimeString(),
      'End Timestamp':     '',
      'Work Description':  '',
      'Image Path':        '',
      'Status':            'ACTIVE',
      'Approval Status':   '',
      'Approved By':       '',
      'Approval Timestamp': '',
      'Notes':             notes?.trim() || '',
    });

    return res.status(200).json({
      success: true,
      message: `${engineerName} overtime session started.`,
    });
  } catch (err) {
    console.error('Overtime sign-in error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again or contact site admin.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
