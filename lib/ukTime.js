/**
 * UK timezone helpers (auto handles GMT / BST)
 */
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const UK_TZ = 'Europe/London';

/** Returns current UK date string: "2025-06-01" */
export function ukDateString(date = new Date()) {
  return formatInTimeZone(date, UK_TZ, 'yyyy-MM-dd');
}

/** Returns current UK datetime string: "2025-06-01 09:30:00" */
export function ukDateTimeString(date = new Date()) {
  return formatInTimeZone(date, UK_TZ, 'yyyy-MM-dd HH:mm:ss');
}

/** Returns UK time only: "09:30" */
export function ukTimeString(date = new Date()) {
  return formatInTimeZone(date, UK_TZ, 'HH:mm');
}

/** Parses a datetime string and returns UK date string */
export function toUkDate(datetimeStr) {
  const d = new Date(datetimeStr);
  return ukDateString(d);
}

/** Calculate duration between two datetime strings, returns "Xh Ym" */
export function calcDuration(signInStr, signOutStr) {
  if (!signInStr || !signOutStr) return '-';
  const inTime = new Date(signInStr);
  const outTime = new Date(signOutStr);
  const diffMs = outTime - inTime;
  if (diffMs <= 0) return '-';
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}
