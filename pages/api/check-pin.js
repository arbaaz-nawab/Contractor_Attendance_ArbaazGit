/**
 * POST /api/check-pin
 *
 * Body: { pin: string }
 * Returns: { ok: true } or { ok: false }
 *
 * The real PIN lives only in the environment variable DASHBOARD_PIN.
 * It never ships to the browser.
 *
 * On a correct PIN, also issues the signed session cookie (lib/session.js)
 * that every dashboard-only API route now requires — the PIN gate alone
 * only ever controlled what the browser *showed*, not what the API would
 * answer to any caller who knew the URL.
 */
import { buildSessionCookie } from '../../lib/session';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const { pin } = req.body;
  const correctPin = (process.env.DASHBOARD_PIN || '').trim();

  if (!correctPin) {
    return res.status(503).json({ ok: false, message: 'DASHBOARD_PIN environment variable is not configured.' });
  }

  if (!pin || String(pin).trim() !== correctPin) {
    return res.status(401).json({ ok: false });
  }

  const cookie = buildSessionCookie();
  if (!cookie) {
    console.error('[check-pin] Cannot issue a session — SESSION_SECRET is not configured.');
    return res.status(503).json({ ok: false, message: 'Server session is not configured.' });
  }

  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ ok: true });
}
