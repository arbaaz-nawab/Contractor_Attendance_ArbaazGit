/**
 * GET /api/contractor-lookup?company=XYZ&operative=John+Smith
 *
 * Returns:
 *   - contractorType (FIRST_TIME / RETURNING) based on company history
 *   - RAMS and insurance expiry -- company-level
 *   - Induction expiry -- operative-level (if operative param supplied)
 *
 * All matching is case-insensitive and whitespace-trimmed.
 */
import { findCompanyHistory, getComplianceForCompany, getOperativeInduction } from '../../lib/db';

const SIX_MONTHS_MS    = 6  * 30 * 24 * 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 12 * 30 * 24 * 60 * 60 * 1000;

function isExpiredByDate(dateStr) {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  return isNaN(d) ? true : d < new Date();
}

function isExpiredByWindow(dateStr, windowMs) {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  return isNaN(d) ? true : (Date.now() - d.getTime()) > windowMs;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const company   = (req.query.company   || '').trim();
  const operative = (req.query.operative || '').trim();

  if (!company) {
    return res.status(400).json({ error: 'company parameter required' });
  }

  try {
    const [compliance, history] = await Promise.all([
      getComplianceForCompany(company),
      findCompanyHistory(company),
    ]);

    // Operative-level induction
    let operativeInductionExpired  = null;
    let operativeLastInductionDate = null;
    let operativeInductionExpiry   = null;

    if (operative) {
      const opRecord = await getOperativeInduction(operative);
      if (opRecord) {
        operativeLastInductionDate = opRecord.induction_date   || null;
        operativeInductionExpiry   = opRecord.induction_expiry || null;
        operativeInductionExpired  = opRecord.induction_expiry
          ? isExpiredByDate(opRecord.induction_expiry)
          : isExpiredByWindow(opRecord.induction_date, TWELVE_MONTHS_MS);
      } else {
        operativeInductionExpired = true;
      }
    }

    if (!history && !compliance) {
      return res.status(200).json({
        contractorType:             'FIRST_TIME',
        ramsExpired:                true,
        complianceExpired:          true,
        inductionExpired:           true,
        operativeInductionExpired:  operative ? true : null,
        operativeLastInductionDate: null,
        operativeInductionExpiry:   null,
      });
    }

    // Company-level RAMS + insurance
    let ramsExpired, complianceExpired;
    let lastRAMSReviewDate, lastComplianceDate;
    let ramsExpiry, insuranceExpiry;

    if (compliance && (compliance['RAMS Expiry'] || compliance['Insurance Expiry'])) {
      ramsExpired       = isExpiredByDate(compliance['RAMS Expiry']);
      complianceExpired = isExpiredByDate(compliance['Insurance Expiry']);
      lastRAMSReviewDate = compliance['RAMS Date']      || history?.lastRAMSReviewDate || null;
      lastComplianceDate = compliance['Insurance Date'] || history?.lastComplianceDate || null;
      ramsExpiry        = compliance['RAMS Expiry']      || null;
      insuranceExpiry   = compliance['Insurance Expiry'] || null;
    } else {
      ramsExpired       = isExpiredByWindow(history?.lastRAMSReviewDate, SIX_MONTHS_MS);
      complianceExpired = isExpiredByWindow(history?.lastComplianceDate, TWELVE_MONTHS_MS);
      lastRAMSReviewDate = history?.lastRAMSReviewDate || null;
      lastComplianceDate = history?.lastComplianceDate || null;
      ramsExpiry = insuranceExpiry = null;
    }

    // Legacy company-level induction (kept for backward compat)
    let inductionExpired, lastInductionDate, inductionExpiry;
    if (compliance && compliance['Induction Expiry']) {
      inductionExpired  = isExpiredByDate(compliance['Induction Expiry']);
      lastInductionDate = compliance['Induction Date'] || history?.lastInductionDate || null;
      inductionExpiry   = compliance['Induction Expiry'];
    } else {
      inductionExpired  = isExpiredByWindow(history?.lastInductionDate, TWELVE_MONTHS_MS);
      lastInductionDate = history?.lastInductionDate || null;
      inductionExpiry   = null;
    }

    return res.status(200).json({
      contractorType:    history ? 'RETURNING' : 'FIRST_TIME',
      rowCount:          history?.rowCount ?? 0,
      lastRAMSReviewDate,
      lastComplianceDate,
      ramsExpiry,
      insuranceExpiry,
      ramsExpired,
      complianceExpired,
      hasManagerCompliance: !!(compliance && (compliance['RAMS Expiry'] || compliance['Insurance Expiry'])),
      lastInductionDate,
      inductionExpiry,
      inductionExpired,
      operativeInductionExpired,
      operativeLastInductionDate,
      operativeInductionExpiry,
    });
  } catch (err) {
    console.error('Contractor lookup error:', err);
    return res.status(500).json({ error: 'Server error', contractorType: 'FIRST_TIME' });
  }
}
