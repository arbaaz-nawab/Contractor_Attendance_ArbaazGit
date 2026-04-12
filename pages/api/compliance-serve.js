/**
 * GET /api/compliance-serve?company=XYZ&file=filename.pdf
 *
 * Generates a short-lived signed URL from Supabase Storage and redirects
 * the browser to it. PDFs and images open inline in the preview panel.
 */
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'compliance-docs';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
}

function safeFolder(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'Unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { company, file } = req.query;

  if (!company || !file) {
    return res.status(400).json({ message: 'company and file parameters required' });
  }

  // Prevent path traversal
  if (file.includes('/') || file.includes('\\') || file.includes('..')) {
    return res.status(400).json({ message: 'Invalid filename.' });
  }

  try {
    const supabase    = getSupabase();
    const storagePath = `${safeFolder(company.trim())}/${file.trim()}`;

    // Signed URL valid for 1 hour
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);

    if (error || !data?.signedUrl) {
      return res.status(404).json({ message: 'File not found or access denied.' });
    }

    // Redirect to the signed URL — browser opens inline for PDFs/images
    return res.redirect(302, data.signedUrl);
  } catch (err) {
    console.error('Compliance serve error:', err);
    return res.status(500).end();
  }
}
