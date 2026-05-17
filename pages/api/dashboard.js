/**
 * GET /api/dashboard?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&company=XYZ
 *
 * Returns: { active: [...], completed: [...] }
 */
import { getAllRows } from '../../lib/db';
import { ukDateString, calcDuration } from '../../lib/ukTime';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const today = ukDateString();
  const dateFrom = req.query.dateFrom || today;
  const dateTo   = req.query.dateTo   || today;
  const company  = req.query.company  || '';

  try {
    const allRows = await getAllRows();

    const rows = allRows.filter((r) => {
      const d = r['Date'];
      if (!d) return false;
      if (d < dateFrom || d > dateTo) return false;
      if (company && !r['Company Name'].toLowerCase().includes(company.toLowerCase())) return false;
      return true;
    });

    const active = rows
      .filter((r) => r['Status'] === 'Active')
      .map((r) => ({
        _row:           r._row,
        id:             r['ID Number'],
        operativeName:  r['Operative Name'],
        companyName:    r['Company Name'],
        signInTime:     r['Sign-In Time'],
        status:         'Active',
        contactNumber:  r['Contact Number'],
        buildings:      r['Buildings'],
        pointOfContact: r['Point of Contact'],
      }));

    const completed = rows
      .filter((r) => r['Status'] === 'Completed')
      .map((r) => ({
        _row:              r._row,
        id:                r['ID Number'],
        operativeName:     r['Operative Name'],
        companyName:       r['Company Name'],
        signInTime:        r['Sign-In Time'],
        signOutTime:       r['Sign-Out Time'],
        duration:          calcDuration(r['Sign-In Time'], r['Sign-Out Time']),
        photoUrl:          r['Photo URL'],
        status:            'Completed',
        notes:             r['Work Completed'],
        pointOfContact:    r['Point of Contact'],
        contactNumber:     r['Contact Number'],
        buildings:         r['Buildings'],
        // H&S answers
        permitRequired:    r['Permit Required'],
        permitTypes:       r['Permit Types'],
        fireSafetyAffected: r['Fire Safety Affected'],
        asbestosChecked:   r['Asbestos Checked'],
        ramsApproved:      r['RAMS Approved'],
        inductionComplete: r['Induction Complete'],
        insuranceValid:    r['Insurance Valid'],
        // Amend tracking
        amendedBy:         r['Amended By'],
        amendedAt:         r['Amended At'],
      }));

    return res.status(200).json({
      success: true,
      dateFrom,
      dateTo,
      active,
      completed,
      totals: {
        onSite:     active.length,
        signedOut:  completed.length,
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load dashboard data.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
