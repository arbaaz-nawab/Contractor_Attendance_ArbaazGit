/**
 * POST /api/signout
 *
 * Body: multipart/form-data
 *   - idNumber  (string)  required
 *   - photo     (file)    optional — uploaded to Cloudflare R2 if provided
 *
 * Returns: { success, message }
 */
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { findActiveSession, updateRow } from '../../lib/db';
import { uploadPhoto, buildPhotoKey } from '../../lib/r2Upload';
import { ukDateString, ukDateTimeString } from '../../lib/ukTime';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const form = new IncomingForm({ maxFileSize: 10 * 1024 * 1024 });

  let fields, files;
  try {
    [fields, files] = await form.parse(req);
  } catch {
    return res.status(400).json({ success: false, message: 'Failed to parse form data.' });
  }

  const idNumber      = Array.isArray(fields.idNumber)      ? fields.idNumber[0]      : fields.idNumber;
  const workCompleted = Array.isArray(fields.workCompleted) ? fields.workCompleted[0] : fields.workCompleted;
  const photoFile     = Array.isArray(files.photo)          ? files.photo[0]          : files.photo;

  if (!idNumber) {
    return res.status(400).json({ success: false, message: 'ID number is required.' });
  }

  const today = ukDateString();

  try {
    const session = await findActiveSession(String(idNumber).trim(), today);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: `No active sign-in found for ID ${idNumber} today.`,
      });
    }

    // ── Optional photo upload to R2 ───────────────────────────────────────────
    let photoUrl = '';

    if (photoFile && photoFile.size > 0) {
      try {
        const photoBuffer = fs.readFileSync(photoFile.filepath);
        const photoKey = buildPhotoKey(today, idNumber, session['Operative Name']);
        photoUrl = await uploadPhoto(photoBuffer, photoKey, photoFile.mimetype || 'image/jpeg');
      } finally {
        if (fs.existsSync(photoFile.filepath)) fs.unlinkSync(photoFile.filepath);
      }
    }

    await updateRow(session._row, {
      'Sign-Out Time':  ukDateTimeString(),
      'Work Completed': workCompleted || '',
      'Status':         'Completed',
      'Photo URL':      photoUrl,
    });

    return res.status(200).json({
      success: true,
      message: `${session['Operative Name']} signed out successfully.`,
      photoUploaded: !!photoUrl,
    });
  } catch (err) {
    console.error('Sign-out error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again or contact site admin.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
