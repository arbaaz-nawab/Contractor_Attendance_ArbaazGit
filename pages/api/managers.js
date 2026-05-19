/**
 * GET /api/managers
 * Returns the list of manager names from the Supabase managers table.
 */
import { getManagers } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  try {
    const managers = await getManagers();
    const names = managers.map((m) => m['Manager Name']).filter(Boolean);
    return res.status(200).json({ success: true, names });
  } catch (err) {
    console.error('[managers] Error:', err);
    return res.status(500).json({ success: false, names: [] });
  }
}
