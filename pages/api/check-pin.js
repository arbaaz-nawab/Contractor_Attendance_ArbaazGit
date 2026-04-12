/**
 * POST /api/check-pin
 *
 * Body: { pin: string }
 * Returns: { ok: true } or { ok: false }
 *
 * The real PIN lives only in the environment variable DASHBOARD_PIN.
 * It never ships to the browser.
 */
export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const { pin } = req.body;
  const correctPin = process.env.DASHBOARD_PIN;

  if (!correctPin) {
    // If no PIN is set, dashboard is open (useful during initial setup)
    return res.status(200).json({ ok: true });
  }

  if (!pin || String(pin) !== String(correctPin)) {
    return res.status(401).json({ ok: false });
  }

  return res.status(200).json({ ok: true });
}
