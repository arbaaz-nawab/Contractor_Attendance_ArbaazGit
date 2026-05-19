/**
 * GET /api/notify-overdue
 *
 * Called automatically by Vercel Cron at 17:00 UTC (= 18:00 BST / 6 PM UK summer time).
 * Can also be triggered manually from the dashboard.
 *
 * Authorization: Bearer <CRON_SECRET>   (Vercel passes this automatically for cron jobs)
 * OR: Dashboard passes X-Dashboard-Auth: <CRON_SECRET> for manual triggers.
 *
 * Required env vars:
 *   CRON_SECRET      — protects this endpoint from public calls
 *   RESEND_API_KEY   — Resend API key
 *   RESEND_FROM      — verified sender address
 */
import { getAllRows } from '../../lib/db';
import { getManagerEmails } from '../../lib/db';
import { sendOverdueAlerts } from '../../lib/email';
import { ukDateString } from '../../lib/ukTime';

function ukHour() {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric', hour12: false, timeZone: 'Europe/London',
    }).format(new Date())
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // ── Auth: Vercel cron passes Bearer token; dashboard passes custom header ────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers['authorization'] || '';
    const dashHeader = req.headers['x-dashboard-auth'] || '';
    const token = authHeader.replace('Bearer ', '').trim() || dashHeader.trim();
    if (token !== cronSecret) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
  }

  try {
    const today = ukDateString();

    // Find all active sessions from today
    const allRows = await getAllRows();
    const activeToday = allRows.filter(
      (r) => r['Status'] === 'Active' && r['Date'] === today
    );

    if (activeToday.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active contractors on site today.',
        sent: 0,
      });
    }

    // Shape into the format email utility expects
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
      success:     true,
      overdueCount: contractors.length,
      ...result,
    });
  } catch (err) {
    console.error('[notify-overdue] Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to send notifications.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
