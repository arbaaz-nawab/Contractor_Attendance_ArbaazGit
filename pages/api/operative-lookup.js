/**
 * GET /api/operative-lookup?name=John+Smith
 *
 * Looks up induction status for a specific operative (person-level, not company-level).
 * Also returns name suggestions when ?partial=XY is supplied instead of ?name.
 *
 * Response (single operative):
 *   { found, inductionExpired, lastInductionDate, inductionExpiry }
 *
 * Response (suggestions):
 *   { names: ['John Smith', ...] }
 */
import { getOperativeInduction, getOperativeNameSuggestions } from '../../lib/db';

const TWELVE_MONTHS_MS = 12 * 30 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, partial } = req.query;

  // ── Name suggestion mode ──────────────────────────────────────────────────
  if (partial !== undefined) {
    if (!partial || partial.trim().length < 2) {
      return res.status(200).json({ names: [] });
    }
    try {
      const names = await getOperativeNameSuggestions(partial.trim());
      return res.status(200).json({ names });
    } catch {
      return res.status(200).json({ names: [] });
    }
  }

  // ── Induction lookup mode ─────────────────────────────────────────────────
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name parameter required' });
  }

  try {
    const now    = new Date();
    const record = await getOperativeInduction(name.trim());

    if (!record) {
      return res.status(200).json({ found: false });
    }

    function isExpiredByDate(dateStr) {
      if (!dateStr) return true;
      const d = new Date(dateStr);
      return isNaN(d) ? true : d < now;
    }

    function isExpiredByWindow(dateStr) {
      if (!dateStr) return true;
      const d = new Date(dateStr);
      return isNaN(d) ? true : (now - d) > TWELVE_MONTHS_MS;
    }

    // Manager-set expiry date takes priority; fall back to window calculation
    const inductionExpired = record.induction_expiry
      ? isExpiredByDate(record.induction_expiry)
      : isExpiredByWindow(record.induction_date);

    return res.status(200).json({
      found:              true,
      inductionExpired,
      lastInductionDate:  record.induction_date   || null,
      inductionExpiry:    record.induction_expiry  || null,
    });
  } catch (err) {
    console.error('Operative lookup error:', err);
    return res.status(500).json({ error: 'Server error', found: false });
  }
}
