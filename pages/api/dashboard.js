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
        id:            r['ID Number'],
        operativeName: r['Operative Name'],
        companyName:   r['Company Name'],
        signInTime:    r['Sign-In Time'],
        status:        'Active',
        notes:         r['Work Completed'],
      }));

    const completed = rows
      .filter((r) => r['Status'] === 'Completed')
      .map((r) => ({
        id:            r['ID Number'],
        operativeName: r['Operative Name'],
        companyName:   r['Company Name'],
        signInTime:    r['Sign-In Time'],
        signOutTime:   r['Sign-Out Time'],
        duration:      calcDuration(r['Sign-In Time'], r['Sign-Out Time']),
        photoUrl:      r['Photo URL'],
        status:        'Completed',
        notes:         r['Work Completed'],
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
