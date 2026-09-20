/**
 * POST /api/planned-works-save
 *
 * action: 'create-row' | 'update-row' | 'delete-row' | 'review-row' | 'save-oncall'
 *
 *   create-row: { action, weekStart, companyName, description, buildingName?,
 *                 startDate, endDate?, location?, personInCharge?,
 *                 ramsSignedOff?, eventsTeamNotified?, parkingRequired?,
 *                 comments?, addedBy }
 *   update-row: { action, id, companyName, description, buildingName?,
 *                 startDate?, endDate?, location?, personInCharge?,
 *                 ramsSignedOff?, eventsTeamNotified?, parkingRequired?,
 *                 comments?, editedBy }
 *   delete-row: { action, id, editedBy }               — soft delete only
 *   review-row: { action, id, reviewAction: 'complete'|'carry-over', performedBy }
 *   save-oncall: { action, weekStart, estateDutyManager:[line], calloutEngineers:[line], updatedBy }
 *     line = { dateFrom, dateTo, name, phone }
 *
 * No per-manager PIN on any of these — session-only, per the agreed design
 * (any of the PLANNED_WORKS_MANAGERS may add/edit/review any row).
 *
 * Phone numbers only ever appear in the save-oncall body — every catch
 * block below logs err.message only, never req.body, so a phone number can
 * never end up in the server console.
 */
import {
  createPlannedWorksRow, updatePlannedWorksRow, getPlannedWorksRowById,
  findCarriedPlannedWorksCopy, savePlannedWorksOncall,
} from '../../lib/db';
import { ukDateTimeString } from '../../lib/ukTime';
import { requireSession } from '../../lib/session';
import { isDateInWeek, addDaysStr } from '../../lib/plannedWorksWeek';

function isValidDateStr(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

const FIELD_KEYS = [
  'companyName', 'description', 'buildingName', 'startDate', 'endDate', 'location',
  'personInCharge', 'ramsSignedOff', 'eventsTeamNotified', 'parkingRequired', 'comments',
];

function pickFields(body) {
  const out = {};
  for (const k of FIELD_KEYS) out[k] = typeof body[k] === 'string' ? body[k].trim() : (body[k] || '');
  return out;
}

async function handleCreateRow(req, res) {
  const { weekStart, addedBy } = req.body;
  const f = pickFields(req.body);

  if (!weekStart || !f.companyName || !f.description || !f.startDate || !addedBy?.trim()) {
    return res.status(400).json({ success: false, message: 'Company, description, start date and entered-by are required.' });
  }
  if (!isValidDateStr(f.startDate)) {
    return res.status(400).json({ success: false, message: 'Start date must be a real date.' });
  }
  if (!isDateInWeek(weekStart, f.startDate)) {
    return res.status(400).json({ success: false, message: 'Start date is outside this week — switch to the correct week first.' });
  }
  if (f.endDate) {
    if (!isValidDateStr(f.endDate)) {
      return res.status(400).json({ success: false, message: 'End date must be a real date.' });
    }
    if (f.endDate < f.startDate) {
      return res.status(400).json({ success: false, message: 'End date cannot be before the start date.' });
    }
    if (!isDateInWeek(weekStart, f.endDate)) {
      return res.status(400).json({ success: false, message: 'End date is outside this week.' });
    }
  }

  const row = await createPlannedWorksRow({
    weekStart, ...f, addedBy: addedBy.trim(), createdAt: ukDateTimeString(),
  });

  return res.status(200).json({ success: true, row });
}

async function handleUpdateRow(req, res) {
  const { id, editedBy } = req.body;
  const f = pickFields(req.body);

  if (!id || !editedBy?.trim()) {
    return res.status(400).json({ success: false, message: 'id and edited-by are required.' });
  }
  if (!f.companyName || !f.description) {
    return res.status(400).json({ success: false, message: 'Company and description are required.' });
  }

  const existing = await getPlannedWorksRowById(Number(id));
  if (!existing || existing.deletedAt) {
    return res.status(404).json({ success: false, message: 'Row not found.' });
  }

  // Start date stays optional on update — a carried-over row has none yet —
  // but if given, it must be real and within this row's own week.
  if (f.startDate) {
    if (!isValidDateStr(f.startDate)) {
      return res.status(400).json({ success: false, message: 'Start date must be a real date.' });
    }
    if (!isDateInWeek(existing.weekStart, f.startDate)) {
      return res.status(400).json({ success: false, message: "Start date is outside this row's week." });
    }
  }
  if (f.endDate) {
    if (!isValidDateStr(f.endDate)) {
      return res.status(400).json({ success: false, message: 'End date must be a real date.' });
    }
    if (f.startDate && f.endDate < f.startDate) {
      return res.status(400).json({ success: false, message: 'End date cannot be before the start date.' });
    }
    if (!isDateInWeek(existing.weekStart, f.endDate)) {
      return res.status(400).json({ success: false, message: "End date is outside this row's week." });
    }
  }

  await updatePlannedWorksRow(existing.id, {
    ...f, lastEditedBy: editedBy.trim(), lastEditedAt: ukDateTimeString(),
  });

  return res.status(200).json({ success: true });
}

async function handleDeleteRow(req, res) {
  const { id, editedBy } = req.body;
  if (!id || !editedBy?.trim()) {
    return res.status(400).json({ success: false, message: 'id and edited-by are required.' });
  }
  const existing = await getPlannedWorksRowById(Number(id));
  if (!existing || existing.deletedAt) {
    return res.status(404).json({ success: false, message: 'Row not found.' });
  }
  const now = ukDateTimeString();
  await updatePlannedWorksRow(existing.id, { deletedAt: now, lastEditedBy: editedBy.trim(), lastEditedAt: now });
  return res.status(200).json({ success: true });
}

async function handleReviewRow(req, res) {
  const { id, reviewAction, performedBy } = req.body;

  if (!id || !reviewAction || !performedBy?.trim()) {
    return res.status(400).json({ success: false, message: 'id, reviewAction and performedBy are required.' });
  }
  if (!['complete', 'carry-over'].includes(reviewAction)) {
    return res.status(400).json({ success: false, message: 'Unknown review action.' });
  }

  const existing = await getPlannedWorksRowById(Number(id));
  if (!existing || existing.deletedAt) {
    return res.status(404).json({ success: false, message: 'Row not found.' });
  }

  const now = ukDateTimeString();

  if (reviewAction === 'complete') {
    await updatePlannedWorksRow(existing.id, { reviewStatus: 'Completed', lastEditedBy: performedBy.trim(), lastEditedAt: now });
    return res.status(200).json({ success: true });
  }

  // Carry over — idempotent: only ever creates one copy per source row.
  const targetWeek = addDaysStr(existing.weekStart, 7);
  const alreadyCarried = await findCarriedPlannedWorksCopy(existing.id, targetWeek);
  if (!alreadyCarried) {
    await createPlannedWorksRow({
      weekStart: targetWeek,
      companyName: existing.companyName,
      description: existing.description,
      buildingName: existing.buildingName,
      startDate: '',
      endDate: '',
      location: existing.location,
      personInCharge: existing.personInCharge,
      ramsSignedOff: existing.ramsSignedOff,
      eventsTeamNotified: existing.eventsTeamNotified,
      parkingRequired: existing.parkingRequired,
      comments: existing.comments,
      addedBy: performedBy.trim(),
      createdAt: now,
      carriedFromId: existing.id,
    });
  }
  await updatePlannedWorksRow(existing.id, { reviewStatus: 'Carried Over', lastEditedBy: performedBy.trim(), lastEditedAt: now });

  return res.status(200).json({ success: true });
}

async function handleSaveOncall(req, res) {
  const { weekStart, estateDutyManager, calloutEngineers, updatedBy } = req.body;

  if (!weekStart || !updatedBy?.trim()) {
    return res.status(400).json({ success: false, message: 'weekStart and updatedBy are required.' });
  }

  const lines = [
    ...(Array.isArray(estateDutyManager) ? estateDutyManager : []).map((l, i) => ({ ...l, group: 'Estate Duty Manager', order: i })),
    ...(Array.isArray(calloutEngineers) ? calloutEngineers : []).map((l, i) => ({ ...l, group: 'Call-out engineers', order: i })),
  ].filter((l) => (l.name || '').trim() || (l.phone || '').trim() || l.dateFrom || l.dateTo);

  for (const l of lines) {
    if (l.dateFrom && !isValidDateStr(l.dateFrom)) {
      return res.status(400).json({ success: false, message: 'On-call dates must be real dates.' });
    }
    if (l.dateTo && !isValidDateStr(l.dateTo)) {
      return res.status(400).json({ success: false, message: 'On-call dates must be real dates.' });
    }
  }

  await savePlannedWorksOncall(weekStart, lines, updatedBy.trim(), ukDateTimeString());

  return res.status(200).json({ success: true });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { action } = req.body;

  try {
    if (action === 'create-row')  return await handleCreateRow(req, res);
    if (action === 'update-row')  return await handleUpdateRow(req, res);
    if (action === 'delete-row')  return await handleDeleteRow(req, res);
    if (action === 'review-row')  return await handleReviewRow(req, res);
    if (action === 'save-oncall') return await handleSaveOncall(req, res);
    return res.status(400).json({ success: false, message: 'Unknown action.' });
  } catch (err) {
    console.error('Planned works save error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
}

export default requireSession(handler);
