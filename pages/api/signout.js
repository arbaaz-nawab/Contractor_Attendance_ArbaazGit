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
import { uploadPhoto, buildPhotoKey, isR2Configured } from '../../lib/r2Upload';
import { ukDateString, ukDateTimeString, calcDuration } from '../../lib/ukTime';

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
    let photoUrl     = '';
    let photoSkipped = false;

    if (photoFile && photoFile.size > 0) {
      if (!isR2Configured()) {
        photoSkipped = true;
        console.warn('[signout] R2 not configured — photo not stored.');
      } else {
        try {
          const photoBuffer = fs.readFileSync(photoFile.filepath);
          const photoKey    = buildPhotoKey(today, idNumber, session['Operative Name']);
          photoUrl          = await uploadPhoto(photoBuffer, photoKey, photoFile.mimetype || 'image/jpeg');
        } catch (uploadErr) {
          photoSkipped = true;
          console.error('[signout] Photo upload failed (sign-out continues):', uploadErr.message);
        }
      }
      try {
        if (photoFile.filepath && fs.existsSync(photoFile.filepath)) fs.unlinkSync(photoFile.filepath);
      } catch { /* ignore temp-file cleanup errors */ }
    }

    const signOutTime = ukDateTimeString();

    await updateRow(session._row, {
      'Sign-Out Time':  signOutTime,
      'Work Completed': workCompleted || '',
      'Status':         'Completed',
      'Photo URL':      photoUrl,
    });

    const duration = calcDuration(session['Sign-In Time'], signOutTime);
    const photoMsg = photoSkipped ? ' (Photo could not be saved — storage not configured.)' : '';

    return res.status(200).json({
      success:       true,
      message:       `${session['Operative Name']} signed out successfully.${photoMsg}`,
      photoUploaded: !!photoUrl,
      photoSkipped,
      duration,
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
