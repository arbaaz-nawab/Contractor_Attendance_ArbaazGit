/**
 * POST /api/logout
 *
 * Clears the dashboard session cookie. Called by the dashboard's Lock
 * button and on page unload (fire-and-forget) — see pages/dashboard.js.
 * No auth required to call this: clearing a cookie that may or may not
 * exist is harmless and idempotent.
 */
import { clearSessionCookie } from '../../lib/session';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ success: true });
}
