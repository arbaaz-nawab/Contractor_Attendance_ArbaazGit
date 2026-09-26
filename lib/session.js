/**
 * Server-side session for the manager dashboard.
 *
 * Deliberately not a session store / JWT library: the only claim a session
 * needs to make is "the dashboard PIN was checked, recently enough" — so the
 * token is just an issued-at timestamp plus an HMAC-SHA256 signature over it
 * (node:crypto, no new dependency). Verifying is "recompute the signature,
 * compare it, check the age" — nothing to look up, store, or expire
 * server-side, and nothing sensitive in the payload worth encrypting.
 */
import crypto from 'crypto';

const COOKIE_NAME  = 'gc_dash_session';
const MAX_AGE_MS   = 24 * 60 * 60 * 1000; // hard ceiling regardless of cookie lifetime

function getSecret() {
  return process.env.SESSION_SECRET || null;
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isProdLikeEnv() {
  // Vercel runs `next build` (NODE_ENV=production) for both Preview and
  // Production deployments — both are served over HTTPS, so Secure is
  // correct for either. Only local `next dev` (NODE_ENV=development, plain
  // http://localhost) needs Secure omitted, or the cookie would be silently
  // dropped by the browser and login would appear to just not work.
  return process.env.NODE_ENV === 'production';
}

/**
 * Build the Set-Cookie header value for a fresh session, issued on a
 * correct dashboard PIN. Returns null (and logs) if SESSION_SECRET is not
 * configured — callers must fail closed, never issue an unsigned session.
 */
export function buildSessionCookie() {
  const secret = getSecret();
  if (!secret) {
    console.error('[session] SESSION_SECRET is not set — refusing to issue a dashboard session.');
    return null;
  }
  const payload = String(Date.now());
  const token = `${payload}.${sign(payload, secret)}`;

  const parts = [`${COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (isProdLikeEnv()) parts.push('Secure');
  // No Max-Age / Expires on purpose — a session cookie, gone when the
  // browser closes, per the agreed design.
  return parts.join('; ');
}

/** Set-Cookie header value that clears the session (logout / lock). */
export function clearSessionCookie() {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (isProdLikeEnv()) parts.push('Secure');
  return parts.join('; ');
}

/** True if the request carries a valid, unexpired session cookie. */
export function hasValidSession(req) {
  const secret = getSecret();
  if (!secret) {
    console.error('[session] SESSION_SECRET is not set — rejecting all dashboard sessions.');
    return false;
  }

  // Next.js (pages API routes, Node runtime) parses cookies for us.
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return false;

  const dot = token.lastIndexOf('.');
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sig     = token.slice(dot + 1);

  if (!timingSafeEqualStr(sig, sign(payload, secret))) return false;

  const issuedAt = Number(payload);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > MAX_AGE_MS) return false;

  return true;
}

/** Wrap an API route handler so it 401s with JSON before running if there's
 *  no valid session. Use for every dashboard-only route. */
export function requireSession(handler) {
  return function guarded(req, res) {
    if (!hasValidSession(req)) {
      return res.status(401).json({ success: false, message: 'Session expired or not signed in.' });
    }
    return handler(req, res);
  };
}
