/**
 * GET  /api/rota?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Returns weekly_rota entries within the date range.
 *
 * POST /api/rota
 *   Body: { weekStartDate, weekEndDate, engineerNames[], managerName, pin }
 *   Replaces all assignments for the given week. Requires manager PIN.
 */
import { getRotaEntries, setRotaWeek, getManagerPin } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { from, to } = req.query;
    try {
      const entries = await getRotaEntries(from || null, to || null);
      return res.status(200).json({ success: true, entries });
    } catch (err) {
      console.error('[rota GET] Error:', err);
      return res.status(500).json({ success: false, message: 'Failed to load rota.' });
    }
  }

  if (req.method === 'POST') {
    const { weekStartDate, weekEndDate, engineerNames, managerName, pin } = req.body;

    if (!weekStartDate || !weekEndDate || !managerName || pin === undefined) {
      return res.status(400).json({ success: false, message: 'weekStartDate, weekEndDate, managerName and pin are required.' });
    }

    try {
      const expectedPin = await getManagerPin(managerName);
      if (!expectedPin) {
        return res.status(403).json({ success: false, message: `No PIN configured for ${managerName}.` });
      }
      if (String(pin).trim() !== String(expectedPin).trim()) {
        return res.status(401).json({ success: false, message: 'Incorrect PIN.' });
      }

      await setRotaWeek(weekStartDate, weekEndDate, engineerNames || [], managerName);

      const count = (engineerNames || []).length;
      return res.status(200).json({
        success: true,
        message: count === 0
          ? `Rota cleared for week of ${weekStartDate}.`
          : `${count} engineer${count !== 1 ? 's' : ''} assigned for week of ${weekStartDate}.`,
      });
    } catch (err) {
      console.error('[rota POST] Error:', err);
      return res.status(500).json({ success: false, message: 'Server error. Please try again.', detail: err.message });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}
