/**
 * GET /api/parking-staff
 *   Returns the active Estates staff list, plus suggestion data for the
 *   booking form: requester suggestions (staff + distinct past requesters)
 *   and company suggestions (past parking companies + known contractor/
 *   compliance company names — read-only, no link back to those tables).
 *
 * POST /api/parking-staff
 *   Body: { action: 'add' | 'remove', name }
 *   Add inserts (or reactivates) a staff name; remove soft-deactivates it.
 */
import {
  getParkingStaff, addOrRestoreParkingStaff, removeParkingStaff,
  getDistinctParkingRequesters, getDistinctParkingCompanies, getKnownContractorCompanies,
  dedupeNames,
} from '../../lib/db';
import { requireSession } from '../../lib/session';

async function handleGet(req, res) {
  const [staff, pastRequesters, parkingCompanies, contractorCompanies] = await Promise.all([
    getParkingStaff(),
    getDistinctParkingRequesters(),
    getDistinctParkingCompanies(),
    getKnownContractorCompanies(),
  ]);

  const staffNames = staff.map((s) => s.name);

  return res.status(200).json({
    success: true,
    staff: staffNames,
    requesterSuggestions: dedupeNames([...staffNames, ...pastRequesters]),
    companySuggestions: dedupeNames([...parkingCompanies, ...contractorCompanies]),
  });
}

async function handlePost(req, res) {
  const { action, name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'name is required.' });
  }

  if (action === 'add') {
    await addOrRestoreParkingStaff(name);
  } else if (action === 'remove') {
    await removeParkingStaff(name);
  } else {
    return res.status(400).json({ success: false, message: 'Unknown action.' });
  }

  return res.status(200).json({ success: true });
}

async function handler(req, res) {
  try {
    if (req.method === 'GET')  return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error('Parking staff error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

export default requireSession(handler);
