/**
 * Cloudflare R2 photo upload helper.
 *
 * R2 is S3-compatible, so we use the AWS SDK pointed at the R2 endpoint.
 * Free tier: 10 GB storage, 1 million Class-A ops/month — no egress fees.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto', // R2 always uses "auto"
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.CF_R2_BUCKET;

/**
 * Upload a photo buffer to R2.
 * Returns a signed URL valid for 7 days (managers can view the photo via Excel link).
 *
 * @param {Buffer} buffer
 * @param {string} key     - e.g. "2025-06-01_42_JohnSmith.jpg"
 * @param {string} mimeType
 * @returns {Promise<string>} signed URL
 */
export async function uploadPhoto(buffer, key, mimeType = 'image/jpeg') {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  // 7-day signed URL — stored in Excel so managers can view the photo
  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 60 * 60 * 24 * 7 }
  );

  return url;
}

/**
 * Build the R2 object key from date, id, operative name.
 */
export function buildPhotoKey(date, idNumber, operativeName) {
  const safeName = operativeName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  return `${date}_${idNumber}_${safeName}.jpg`;
}
