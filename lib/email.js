/**
 * Email utility — sends overdue contractor alerts via Resend.
 *
 * Required env vars:
 *   RESEND_API_KEY   — from resend.com dashboard
 *   RESEND_FROM      — verified sender address, e.g. alerts@yourdomain.com
 *                      (defaults to onboarding@resend.dev for local testing)
 */
import { Resend } from 'resend';

function isEmailConfigured() {
  return !!(process.env.RESEND_API_KEY);
}

function formatTime(dtStr) {
  if (!dtStr) return '-';
  const d = new Date(dtStr);
  if (isNaN(d)) return dtStr;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

function buildHtml(overdueContractors, dateStr) {
  const rows = overdueContractors.map((c) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${c.operativeName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${c.companyName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${c.buildings || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${c.pointOfContact || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${formatTime(c.signInTime)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;color:#111;margin:0;padding:0;background:#f9fafb">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:8px;
              border:1px solid #e5e7eb;overflow:hidden">
    <div style="background:#b91c1c;padding:20px 24px">
      <h1 style="margin:0;color:#fff;font-size:1.2rem">
        ⚠ Overdue Contractors Still On Site
      </h1>
      <p style="margin:4px 0 0;color:#fecaca;font-size:0.875rem">${dateStr}</p>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 16px;color:#374151">
        The following contractors have not signed out and it is past 18:00.
        Please check on them or use the dashboard to force-close their session.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:0.875rem">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Name</th>
            <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Company</th>
            <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Building(s)</th>
            <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Contact</th>
            <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600">Signed In</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:20px 0 0;font-size:0.8rem;color:#9ca3af">
        Log in to the manager dashboard to force sign-out any of these contractors.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send overdue-contractor alert emails to all managers with configured email addresses.
 *
 * @param {Array} recipients  — [{ name, email }]
 * @param {Array} contractors — overdue active contractor objects from dashboard API
 * @param {string} dateStr    — human-readable date string for subject line
 * @returns {{ sent: number, skipped: string, errors: string[] }}
 */
export async function sendOverdueAlerts(recipients, contractors, dateStr) {
  if (!isEmailConfigured()) {
    return { sent: 0, skipped: 'RESEND_API_KEY not set', errors: [] };
  }
  if (!recipients.length) {
    return { sent: 0, skipped: 'No manager emails configured', errors: [] };
  }
  if (!contractors.length) {
    return { sent: 0, skipped: 'No overdue contractors', errors: [] };
  }

  const resend  = new Resend(process.env.RESEND_API_KEY);
  const from    = process.env.RESEND_FROM || 'onboarding@resend.dev';
  const subject = `⚠ ${contractors.length} contractor${contractors.length !== 1 ? 's' : ''} still on site — ${dateStr}`;
  const html    = buildHtml(contractors, dateStr);

  const errors = [];
  let sent = 0;

  for (const { name, email } of recipients) {
    try {
      await resend.emails.send({ from, to: email, subject, html });
      sent++;
      console.log(`[email] Sent overdue alert to ${name} <${email}>`);
    } catch (err) {
      errors.push(`${email}: ${err.message}`);
      console.error(`[email] Failed to send to ${name} <${email}>:`, err.message);
    }
  }

  return { sent, skipped: null, errors };
}
