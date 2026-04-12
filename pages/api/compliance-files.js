/**
 * GET  /api/compliance-files?company=XYZ
 *   Lists all files in the company's compliance folder in Supabase Storage.
 *
 * DELETE /api/compliance-files?company=XYZ&file=filename.pdf
 *   Permanently deletes a single file from Supabase Storage.
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
  const { company, file } = req.query;

  if (!company || !company.trim()) {
    return res.status(400).json({ success: false, message: 'company parameter required' });
  }

  const supabase    = getSupabase();
  const folderPrefix = safeFolder(company.trim());

  // ── GET: list files ───────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(folderPrefix, { limit: 200, sortBy: { column: 'name', order: 'desc' } });

      if (error) throw new Error(error.message);

      const files = (data || [])
        .filter((f) => f.name && !f.name.endsWith('/'))
        .map((f) => ({
          name:     f.name,
          serveUrl: `/api/compliance-serve?company=${encodeURIComponent(company.trim())}&file=${encodeURIComponent(f.name)}`,
          isPdf:    f.name.toLowerCase().endsWith('.pdf'),
        }));

      return res.status(200).json({ success: true, files });
    } catch (err) {
      console.error('Compliance files list error:', err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }

  // ── DELETE: remove a single file ──────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!file || !file.trim()) {
      return res.status(400).json({ success: false, message: 'file parameter required' });
    }

    // Only allow simple filenames — no slashes or path traversal
    if (file.includes('/') || file.includes('\\') || file.includes('..')) {
      return res.status(400).json({ success: false, message: 'Invalid filename.' });
    }

    try {
      const storagePath = `${folderPrefix}/${file.trim()}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .remove([storagePath]);

      if (error) throw new Error(error.message);
      return res.status(200).json({ success: true, message: `${file} deleted.` });
    } catch (err) {
      console.error('Compliance files delete error:', err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}
