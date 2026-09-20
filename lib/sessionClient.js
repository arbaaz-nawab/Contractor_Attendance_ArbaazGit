/**
 * Client-side counterpart to lib/session.js. Kept in a separate file so the
 * browser bundle never needs node:crypto — this one just wraps fetch().
 *
 * On a 401, broadcasts a window event instead of taking a callback prop, so
 * any dashboard-only component (the main dashboard page, or a tab component
 * like AttendanceTab) can react the same way — "show the PIN gate again" —
 * without prop-drilling a lock function through every modal and tab.
 */
export async function dashFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('dashboard-session-expired'));
  }
  return res;
}
