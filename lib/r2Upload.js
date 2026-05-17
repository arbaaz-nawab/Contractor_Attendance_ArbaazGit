/**
 * Cloudflare R2 photo upload helper.
 * R2 is S3-compatible, so we use the AWS SDK pointed at the R2 endpoint.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Returns true only when all four R2 env vars are non-empty strings. */
export function isR2Configured() {
  return !!(
    process.env.CF_ACCOUNT_ID?.trim() &&
    process.env.CF_R2_ACCESS_KEY_ID?.trim() &&
    process.env.CF_R2_SECRET_ACCESS_KEY?.trim() &&
    process.env.CF_R2_BUCKET?.trim()
  );
}

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.CF_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Upload a photo buffer to R2.
 * Throws if R2 is not configured or upload fails.
 * Callers should catch and handle gracefully.
 */
export async function uploadPhoto(buffer, key, mimeType = 'image/jpeg') {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured (CF_ACCOUNT_ID / CF_R2_ACCESS_KEY_ID / CF_R2_SECRET_ACCESS_KEY / CF_R2_BUCKET missing).');
  }

  const r2     = getR2Client();
  const BUCKET = process.env.CF_R2_BUCKET;

  await r2.send(
    new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        buffer,
      ContentType: mimeType,
    })
  );

  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 60 * 60 * 24 * 7 } // 7-day signed URL
  );

  return url;
}

/** Build the R2 object key from date, id, operative name. */
export function buildPhotoKey(date, idOrName, suffix = '') {
  const safe = String(idOrName).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  const sfx  = suffix ? `_${String(suffix).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}` : '';
  return `${date}_${safe}${sfx}.jpg`;
}
