/**
 * GET /api/compliance-list
 *
 * Returns all company compliance records from the ContractorCompliance sheet,
 * with computed expiry status for each company.
 */
import { getAllComplianceRows } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const rows  = await getAllComplianceRows();
    const today = new Date();

    function isExpiredDate(dateStr) {
      if (!dateStr) return null; // null means "not set" (different from expired)
      const d = new Date(dateStr);
      return isNaN(d) ? null : d < today;
    }

    const records = rows.map((r) => {
      const ramsExp       = isExpiredDate(r['RAMS Expiry']);
      const inductionExp  = isExpiredDate(r['Induction Expiry']);
      const insuranceExp  = isExpiredDate(r['Insurance Expiry']);

      // Overall status: Active only if all three are set and not expired
      const allSet     = r['RAMS Expiry'] && r['Induction Expiry'] && r['Insurance Expiry'];
      const anyExpired = ramsExp === true || inductionExp === true || insuranceExp === true;
      const status     = !allSet ? 'Incomplete' : anyExpired ? 'Expired' : 'Active';

      return {
        _row:             r._row,
        companyName:      r['Company Name'],
        ramsDate:         r['RAMS Date'],
        inductionDate:    r['Induction Date'],
        insuranceDate:    r['Insurance Date'],
        ramsExpiry:       r['RAMS Expiry'],
        inductionExpiry:  r['Induction Expiry'],
        insuranceExpiry:  r['Insurance Expiry'],
        documentPath:     r['Document Path'],
        updatedBy:        r['Updated By'],
        updatedAt:        r['Updated At'],
        ramsExpired:      ramsExp,
        inductionExpired: inductionExp,
        insuranceExpired: insuranceExp,
        complianceStatus: status,
      };
    });

    return res.status(200).json({ success: true, records });
  } catch (err) {
    console.error('Compliance list error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}
