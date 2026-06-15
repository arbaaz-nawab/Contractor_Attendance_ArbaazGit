import { confirmRotaWeek, getManagerPin } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { weekStartDate, managerName, pin } = req.body;
  if (!weekStartDate || !managerName || pin === undefined) {
    return res.status(400).json({ success: false, message: 'weekStartDate, managerName and pin are required.' });
  }

  try {
    const expectedPin = await getManagerPin(managerName);
    if (!expectedPin) {
      return res.status(403).json({ success: false, message: `No PIN configured for ${managerName}.` });
    }
    if (String(pin).trim() !== String(expectedPin).trim()) {
      return res.status(401).json({ success: false, message: 'Incorrect PIN.' });
    }

    await confirmRotaWeek(weekStartDate, managerName);
    return res.status(200).json({
      success: true,
      message: `On-call duty confirmed by ${managerName} for week of ${weekStartDate}.`,
    });
  } catch (err) {
    console.error('[rota-confirm POST] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.', detail: err.message });
  }
}
