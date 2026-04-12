/**
 * GET /api/contractor-lookup?company=XYZ
 *
 * Returns contractor type (FIRST_TIME / RETURNING) and compliance expiry status.
 *
 * Priority for expiry dates:
 *   1. ContractorCompliance sheet (manager-entered expiry dates)
 *   2. ContractorLog history (auto-calculated from sign-in answers)
 */
import { findCompanyHistory, getComplianceForCompany } from '../../lib/db';

const SIX_MONTHS_MS    = 6  * 30 * 24 * 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 12 * 30 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { company } = req.query;
  if (!company || !company.trim()) {
    return res.status(400).json({ error: 'company parameter required' });
  }

  try {
    const now = new Date();

    // ── 1. Check manager-set compliance sheet ─────────────────────────────────
    const compliance = await getComplianceForCompany(company.trim());

    // ── 2. Check sign-in history ──────────────────────────────────────────────
    const history = await findCompanyHistory(company.trim());

    if (!history && !compliance) {
      return res.status(200).json({ contractorType: 'FIRST_TIME' });
    }

    // Helper: is a stored expiry date past today?
    function isExpiredByDate(dateStr) {
      if (!dateStr) return true;
      const d = new Date(dateStr);
      return isNaN(d) ? true : d < now;
    }

    // Helper: is a last-confirmed date outside the window?
    function isExpiredByWindow(dateStr, windowMs) {
      if (!dateStr) return true;
      const d = new Date(dateStr);
      return isNaN(d) ? true : (now - d) > windowMs;
    }

    let ramsExpired, inductionExpired, complianceExpired;
    let lastRAMSReviewDate, lastInductionDate, lastComplianceDate;
    let ramsExpiry, inductionExpiry, insuranceExpiry;

    if (compliance && (compliance['RAMS Expiry'] || compliance['Induction Expiry'] || compliance['Insurance Expiry'])) {
      // Manager-set dates take full priority
      ramsExpired       = isExpiredByDate(compliance['RAMS Expiry']);
      inductionExpired  = isExpiredByDate(compliance['Induction Expiry']);
      complianceExpired = isExpiredByDate(compliance['Insurance Expiry']);
      lastRAMSReviewDate  = compliance['RAMS Date']      || history?.lastRAMSReviewDate || null;
      lastInductionDate   = compliance['Induction Date'] || history?.lastInductionDate  || null;
      lastComplianceDate  = compliance['Insurance Date'] || history?.lastComplianceDate || null;
      ramsExpiry       = compliance['RAMS Expiry']      || null;
      inductionExpiry  = compliance['Induction Expiry'] || null;
      insuranceExpiry  = compliance['Insurance Expiry'] || null;
    } else {
      // Fall back to ContractorLog history
      ramsExpired       = isExpiredByWindow(history?.lastRAMSReviewDate, SIX_MONTHS_MS);
      inductionExpired  = isExpiredByWindow(history?.lastInductionDate,  TWELVE_MONTHS_MS);
      complianceExpired = isExpiredByWindow(history?.lastComplianceDate, TWELVE_MONTHS_MS);
      lastRAMSReviewDate  = history?.lastRAMSReviewDate || null;
      lastInductionDate   = history?.lastInductionDate  || null;
      lastComplianceDate  = history?.lastComplianceDate || null;
      ramsExpiry = inductionExpiry = insuranceExpiry = null;
    }

    return res.status(200).json({
      contractorType:     history ? 'RETURNING' : 'FIRST_TIME',
      rowCount:           history?.rowCount ?? 0,
      lastRAMSReviewDate,
      lastInductionDate,
      lastComplianceDate,
      ramsExpiry,
      inductionExpiry,
      insuranceExpiry,
      ramsExpired,
      inductionExpired,
      complianceExpired,
      hasManagerCompliance: !!(compliance && (compliance['RAMS Expiry'] || compliance['Induction Expiry'] || compliance['Insurance Expiry'])),
    });
  } catch (err) {
    console.error('Contractor lookup error:', err);
    return res.status(500).json({ error: 'Server error', contractorType: 'FIRST_TIME' });
  }
}
