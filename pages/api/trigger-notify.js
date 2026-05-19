/**
 * POST /api/trigger-notify
 *
 * Manual trigger for the overdue-contractor alert email.
 * Called from the manager dashboard — no auth token needed since the
 * dashboard itself is PIN-gated.
 */
import { getAllRows, getManagerEmails } from '../../lib/db';
import { sendOverdueAlerts } from '../../lib/email';
import { ukDateString } from '../../lib/ukTime';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const today     = ukDateString();
    const allRows   = await getAllRows();
    const activeToday = allRows.filter((r) => r['Status'] === 'Active' && r['Date'] === today);

    if (activeToday.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active contractors on site today.',
        sent: 0,
        overdueCount: 0,
      });
    }

    const contractors = activeToday.map((r) => ({
      operativeName:  r['Operative Name'],
      companyName:    r['Company Name'],
      buildings:      r['Buildings'],
      pointOfContact: r['Point of Contact'],
      signInTime:     r['Sign-In Time'],
    }));

    const recipients = await getManagerEmails();
    const dateStr    = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Europe/London',
    });

    const result = await sendOverdueAlerts(recipients, contractors, dateStr);

    return res.status(200).json({
      success:      true,
      overdueCount: contractors.length,
      ...result,
    });
  } catch (err) {
    console.error('[trigger-notify] Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send notifications.' });
  }
}
