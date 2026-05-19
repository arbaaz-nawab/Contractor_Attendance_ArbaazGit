/**
 * POST /api/compliance-delete
 *
 * Deletes a contractor_compliance record. Requires manager PIN.
 *
 * Body: { companyName, managerName, pin }
 */
import { deleteComplianceRow, getAllComplianceRows, getManagerPin } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { companyName, managerName, pin } = req.body;

  if (!companyName || !managerName || pin === undefined) {
    return res.status(400).json({ success: false, message: 'companyName, managerName, and pin are required.' });
  }

  try {
    const expectedPin = await getManagerPin(managerName);
    if (!expectedPin) {
      return res.status(403).json({ success: false, message: `No PIN configured for ${managerName}.` });
    }
    if (String(pin).trim() !== String(expectedPin).trim()) {
      return res.status(401).json({ success: false, message: 'Incorrect PIN.' });
    }

    const rows   = await getAllComplianceRows();
    const record = rows.find((r) => r['Company Name'].trim().toLowerCase() === companyName.trim().toLowerCase());
    if (!record) {
      return res.status(404).json({ success: false, message: 'Compliance record not found.' });
    }

    await deleteComplianceRow(record._row);

    return res.status(200).json({
      success: true,
      message: `Compliance record for ${companyName} deleted by ${managerName}.`,
    });
  } catch (err) {
    console.error('Compliance delete error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
}
