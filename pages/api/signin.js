/**
 * POST /api/signin
 *
 * Body: {
 *   companyName, operativeName, idNumber,
 *   buildings, pointOfContact, contactNumber,
 *   ramsSubmitted, declarationConfirmed,
 *   // New H&S fields (optional-safe for old records):
 *   contractorType, permitRequired, permitTypes,
 *   fireSafetyAffected, asbestosChecked,
 *   ramsApproved, inductionComplete, insuranceValid,
 *   lastRAMSReviewDate, lastInductionDate, lastComplianceDate
 * }
 */
import { appendRow, findActiveSession } from '../../lib/db';
import { ukDateString, ukDateTimeString } from '../../lib/ukTime';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const {
    companyName,
    operativeName,
    idNumber,
    buildings,
    pointOfContact,
    contactNumber,
    ramsSubmitted,
    declarationConfirmed,
    // New H&S fields
    contractorType,
    permitRequired,
    permitTypes,
    fireSafetyAffected,
    asbestosChecked,
    ramsApproved,
    inductionComplete,
    insuranceValid,
    lastRAMSReviewDate,
    lastInductionDate,
    lastComplianceDate,
  } = req.body;

  if (!companyName || !operativeName || !idNumber) {
    return res.status(400).json({
      success: false,
      message: 'Company name, operative name, and ID number are required.',
    });
  }

  if (!/^\d{3}$/.test(String(idNumber).trim())) {
    return res.status(400).json({ success: false, message: 'ID number must be exactly three digits.' });
  }

  const today = ukDateString();

  try {
    const existing = await findActiveSession(String(idNumber).trim(), today);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `ID ${idNumber} is already signed in today. Please sign out first.`,
      });
    }

    await appendRow({
      'Date':                  today,
      'Company Name':          companyName.trim(),
      'Operative Name':        operativeName.trim(),
      'ID Number':             String(idNumber).trim(),
      'Buildings':             buildings || '',
      'Point of Contact':      pointOfContact || '',
      'Contact Number':        contactNumber || '',
      'RAMS Submitted':        ramsSubmitted || '',
      'Declaration Confirmed': declarationConfirmed || 'Yes',
      'Sign-In Time':          ukDateTimeString(),
      'Sign-Out Time':         '',
      'Work Completed':        '',
      'Status':                'Active',
      'Photo URL':             '',
      // New H&S columns
      'Contractor Type':       contractorType || '',
      'Permit Required':       permitRequired || '',
      'Permit Types':          permitTypes || '',
      'Fire Safety Affected':  fireSafetyAffected || '',
      'Asbestos Checked':      asbestosChecked || '',
      'RAMS Approved':         ramsApproved || '',
      'Induction Complete':    inductionComplete || '',
      'Insurance Valid':       insuranceValid || '',
      'Last RAMS Review Date': lastRAMSReviewDate || '',
      'Last Induction Date':   lastInductionDate || '',
      'Last Compliance Date':  lastComplianceDate || '',
    });

    return res.status(200).json({
      success: true,
      message: `${operativeName} signed in successfully.`,
    });
  } catch (err) {
    console.error('Sign-in error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again or contact site admin.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
