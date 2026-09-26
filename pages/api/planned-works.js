/**
 * GET /api/planned-works?weekStart=YYYY-MM-DD (a Monday)
 *
 * Bundles everything the Planned Works tab needs for one week view into a
 * single call, to keep the route count small: this week's rows, the
 * previous week's still-pending rows (for the "Review last week" panel),
 * a per-manager row-added tracker, this week's on-call lines, and the
 * previous week's on-call lines (used client-side as editable pre-fill
 * suggestions when this week's on-call hasn't been entered yet).
 *
 * Never logs on-call phone numbers — this route only reads and returns
 * them; nothing here is written to the console.
 */
import {
  getPlannedWorksForWeek, getPlannedWorksOncall,
  getDistinctPlannedWorksCompanies, getKnownContractorCompanies, dedupeNames,
} from '../../lib/db';
import { requireSession } from '../../lib/session';
import { isoWeekInfo, weekRangeDates, addDaysStr } from '../../lib/plannedWorksWeek';
import { PLANNED_WORKS_MANAGERS } from '../../lib/config';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // ?suggestions=1 — Company Name autosuggest list only (fetched once when the
  // tab opens, not on every week change): past Planned Works companies plus
  // known contractor/compliance companies, same sources as the Parking form.
  if (req.query.suggestions === '1') {
    try {
      const [pwCompanies, contractorCompanies] = await Promise.all([
        getDistinctPlannedWorksCompanies(),
        getKnownContractorCompanies(),
      ]);
      return res.status(200).json({
        success: true,
        companySuggestions: dedupeNames([...pwCompanies, ...contractorCompanies]),
      });
    } catch (err) {
      console.error('Planned works suggestions error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }

  const { weekStart } = req.query;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ success: false, message: 'weekStart (YYYY-MM-DD, a Monday) is required.' });
  }

  try {
    const [satBefore, sunBefore, , , , , fri] = weekRangeDates(weekStart);
    const { isoYear, isoWeek } = isoWeekInfo(weekStart);
    const prevWeekStart = addDaysStr(weekStart, -7);

    const [rows, previousWeekRows, oncall, previousOncall] = await Promise.all([
      getPlannedWorksForWeek(weekStart),
      getPlannedWorksForWeek(prevWeekStart),
      getPlannedWorksOncall(weekStart),
      getPlannedWorksOncall(prevWeekStart),
    ]);

    const tracker = {};
    for (const name of PLANNED_WORKS_MANAGERS) tracker[name] = 0;
    for (const r of rows) {
      if (tracker[r.addedBy] !== undefined) tracker[r.addedBy] += 1;
    }

    const previousWeekPending = previousWeekRows.filter((r) => !r.reviewStatus);

    return res.status(200).json({
      success: true,
      weekStart,
      isoYear,
      isoWeek,
      weekendStart: satBefore,
      weekendEnd: sunBefore,
      weekEnd: fri,
      rows,
      previousWeekStart: prevWeekStart,
      previousWeekPending,
      tracker,
      oncall,
      previousOncall,
    });
  } catch (err) {
    console.error('Planned works list error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

export default requireSession(handler);
