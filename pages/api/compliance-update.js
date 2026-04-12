/**
 * POST /api/compliance-update   (multipart/form-data)
 *
 * Fields:
 *   companyName    string   required
 *   ramsDate       string   YYYY-MM-DD  optional
 *   inductionDate  string   YYYY-MM-DD  optional
 *   insuranceDate  string   YYYY-MM-DD  optional
 *   managerName    string   optional
 *   document       file(s)  optional — uploaded to Supabase Storage
 *
 * Files are stored in the 'compliance-docs' Supabase Storage bucket
 * under the path: {safeCompanyName}/{timestamp}_{originalFilename}
 */
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { upsertComplianceRow, getComplianceForCompany } from '../../lib/db';
import { ukDateTimeString } from '../../lib/ukTime';

export const config = { api: { bodyParser: false } };

const BUCKET = 'compliance-docs';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
}

/** Add months to a YYYY-MM-DD string, returns YYYY-MM-DD or '' */
function addMonths(dateStr, months) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

/** Sanitise a company name so it is safe as a storage path segment */
function safeFolder(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'Unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const form = new IncomingForm({ maxFileSize: 50 * 1024 * 1024, multiples: true });
  let fields, files;
  try {
    [fields, files] = await form.parse(req);
  } catch {
    return res.status(400).json({ success: false, message: 'Failed to parse form data.' });
  }

  const get = (k) => Array.isArray(fields[k]) ? fields[k][0] : (fields[k] || '');

  const companyName   = get('companyName').trim();
  const ramsDate      = get('ramsDate');
  const inductionDate = get('inductionDate');
  const insuranceDate = get('insuranceDate');
  const managerName   = get('managerName');

  const docFiles = (Array.isArray(files.document) ? files.document : (files.document ? [files.document] : []))
    .filter((f) => f && f.size > 0);

  if (!companyName) {
    return res.status(400).json({ success: false, message: 'Company name is required.' });
  }

  try {
    const supabase = getSupabase();
    const folderPrefix = safeFolder(companyName);
    let savedCount = 0;

    // ── Upload each file to Supabase Storage ─────────────────────────────────
    for (const docFile of docFiles) {
      try {
        const safeName  = (docFile.originalFilename || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${folderPrefix}/${Date.now()}_${safeName}`;
        const buffer    = fs.readFileSync(docFile.filepath);

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, buffer, {
            contentType: docFile.mimetype || 'application/octet-stream',
            upsert: false,
          });

        if (uploadError) console.error('Storage upload error:', uploadError.message);
        else savedCount++;
      } finally {
        if (docFile.filepath && fs.existsSync(docFile.filepath)) {
          try { fs.unlinkSync(docFile.filepath); } catch { /* ignore */ }
        }
      }
    }

    // ── Merge: only update dates that were explicitly provided ────────────────
    const existing      = await getComplianceForCompany(companyName);
    const finalRams      = ramsDate      || existing?.['RAMS Date']      || '';
    const finalInduction = inductionDate || existing?.['Induction Date'] || '';
    const finalInsurance = insuranceDate || existing?.['Insurance Date'] || '';

    await upsertComplianceRow(companyName, {
      'Company Name':     companyName,
      'RAMS Date':        finalRams,
      'Induction Date':   finalInduction,
      'Insurance Date':   finalInsurance,
      'RAMS Expiry':      addMonths(finalRams, 6),
      'Induction Expiry': addMonths(finalInduction, 12),
      'Insurance Expiry': addMonths(finalInsurance, 12),
      'Document Path':    folderPrefix,
      'Updated By':       managerName,
      'Updated At':       ukDateTimeString(),
    });

    const parts = [];
    if (finalRams || finalInduction || finalInsurance) parts.push('Dates saved.');
    if (savedCount > 0) parts.push(`${savedCount} file${savedCount > 1 ? 's' : ''} uploaded.`);

    return res.status(200).json({
      success: true,
      message: `Compliance updated for ${companyName}. ${parts.join(' ')}`.trim(),
      savedCount,
    });
  } catch (err) {
    console.error('Compliance update error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
