/**
 * GET /api/overtime-list
 *
 * Query params (all optional):
 *   month          YYYY-MM   filter by start month
 *   engineer       string    filter by engineer name (partial match)
 *   status         string    filter by Status (ACTIVE / COMPLETED)
 *   approvalStatus string    filter by Approval Status (PENDING / APPROVED / REJECTED)
 *
 * Returns: { success, records: [...] }
 */
import { getAllOvertimeRows } from '../../lib/db';
import { calcDuration } from '../../lib/ukTime';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { month, engineer, status, approvalStatus } = req.query;

  try {
    let rows = await getAllOvertimeRows();

    if (month) {
      rows = rows.filter((r) => {
        const ts = r['Start Timestamp'];
        return ts && String(ts).startsWith(month);
      });
    }

    if (engineer) {
      rows = rows.filter((r) =>
        r['Engineer Name'].toLowerCase().includes(engineer.toLowerCase())
      );
    }

    if (status) {
      rows = rows.filter((r) => r['Status'] === status);
    }

    if (approvalStatus) {
      rows = rows.filter((r) => r['Approval Status'] === approvalStatus);
    }

    const records = rows.map((r) => ({
      _row:              r._row,
      engineerName:      r['Engineer Name'],
      startTimestamp:    r['Start Timestamp'],
      endTimestamp:      r['End Timestamp'],
      workDescription:   r['Work Description'],
      imagePath:         r['Image Path'],
      status:            r['Status'],
      approvalStatus:    r['Approval Status'],
      approvedBy:        r['Approved By'],
      approvalTimestamp: r['Approval Timestamp'],
      notes:             r['Notes'],
      duration:          calcDuration(r['Start Timestamp'], r['End Timestamp']),
      adjustedDuration:  r['Adjusted Duration'] || '',
    }));

    return res.status(200).json({ success: true, records });
  } catch (err) {
    console.error('Overtime list error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}
