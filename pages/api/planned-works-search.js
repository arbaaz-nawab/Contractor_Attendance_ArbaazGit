/**
 * GET /api/planned-works-search?q=text
 *
 * One search box across all weeks — matches company, description, building,
 * person in charge, comments, or the free-text parking field. Each result
 * carries its own week (isoYear/isoWeek/weekStart) so the UI can jump to it.
 */
import { searchPlannedWorks } from '../../lib/db';
import { requireSession } from '../../lib/session';
import { isoWeekInfo } from '../../lib/plannedWorksWeek';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(200).json({ success: true, results: [] });
  }

  try {
    const rows = await searchPlannedWorks(q.trim());
    const results = rows.map((r) => ({ ...r, ...isoWeekInfo(r.weekStart) }));
    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('Planned works search error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

export default requireSession(handler);
