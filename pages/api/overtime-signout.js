/**
 * POST /api/overtime-signout
 *
 * Body: multipart/form-data
 *   - engineerName      (string) required
 *   - workDescription   (string) required
 *   - photo             (file)   optional
 *
 * Ends an active overtime session and marks it as PENDING manager approval.
 */
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { findActiveOvertimeSession, updateOvertimeRow } from '../../lib/db';
import { uploadPhoto, buildPhotoKey, isR2Configured } from '../../lib/r2Upload';
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

  const engineerName    = Array.isArray(fields.engineerName)    ? fields.engineerName[0]    : fields.engineerName;
  const workDescription = Array.isArray(fields.workDescription) ? fields.workDescription[0] : fields.workDescription;
  const photoFile       = Array.isArray(files.photo)            ? files.photo[0]            : files.photo;

  if (!engineerName) {
    return res.status(400).json({ success: false, message: 'Engineer name is required.' });
  }
  if (!workDescription || !workDescription.trim()) {
    return res.status(400).json({ success: false, message: 'Work description is required.' });
  }

  try {
    const session = await findActiveOvertimeSession(engineerName.trim());

    if (!session) {
      return res.status(404).json({
        success: false,
        message: `No active overtime session found for ${engineerName}.`,
      });
    }

    // ── Optional photo upload to R2 ───────────────────────────────────────────
    let imageUrl     = '';
    let photoSkipped = false;

    if (photoFile && photoFile.size > 0) {
      if (!isR2Configured()) {
        photoSkipped = true;
        console.warn('[overtime-signout] R2 not configured — photo not stored.');
      } else {
        try {
          const buffer = fs.readFileSync(photoFile.filepath);
          const key    = buildPhotoKey(ukDateString(), engineerName.trim(), 'overtime');
          imageUrl     = await uploadPhoto(buffer, key, photoFile.mimetype || 'image/jpeg');
        } catch (uploadErr) {
          photoSkipped = true;
          console.error('[overtime-signout] Photo upload failed (overtime sign-out continues):', uploadErr.message);
        }
      }
      try {
        if (photoFile.filepath && fs.existsSync(photoFile.filepath)) fs.unlinkSync(photoFile.filepath);
      } catch { /* ignore temp-file cleanup errors */ }
    }

    await updateOvertimeRow(session._row, {
      'End Timestamp':    ukDateTimeString(),
      'Work Description': workDescription.trim(),
      'Image Path':       imageUrl,
      'Status':           'COMPLETED',
      'Approval Status':  'PENDING',
    });

    const photoMsg = photoSkipped ? ' (Photo could not be saved — storage not configured.)' : '';

    return res.status(200).json({
      success:       true,
      message:       `${engineerName} overtime ended. Pending manager approval.${photoMsg}`,
      photoUploaded: !!imageUrl,
      photoSkipped,
    });
  } catch (err) {
    console.error('Overtime sign-out error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again or contact site admin.',
      detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
}
