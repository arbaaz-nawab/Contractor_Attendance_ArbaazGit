/**
 * GET /api/active-check?id=123
 *
 * Returns: { active: true/false, session?: { operativeName, companyName, signInTime } }
 */
import { findActiveSession } from '../../lib/db';
import { ukDateString } from '../../lib/ukTime';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, message: 'ID parameter required.' });
  }

  const today = ukDateString();

  try {
    const session = await findActiveSession(String(id).trim(), today);

    if (!session) {
      return res.status(200).json({ active: false });
    }

    return res.status(200).json({
      active: true,
      session: {
        operativeName: session['Operative Name'],
        companyName: session['Company Name'],
        signInTime: session['Sign-In Time'],
      },
    });
  } catch (err) {
    console.error('Active check error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
