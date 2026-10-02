// Verified Clerk session for server components, server actions and route
// handlers. Pure and dependency-injected so it can be unit tested with a real
// RS256 key pair (tests/clerk-session.test.mjs).
//
// Why this exists: lib/auth.ts used to base64-decode the `__session` cookie and
// trust its `sub` without checking the signature. Middleware does not protect
// every path that can reach server code (e.g. Next server actions POSTed to the
// public `/`), and even on protected paths the cookie read here is not
// necessarily the token middleware verified. A forged unsigned cookie could
// therefore impersonate any Clerk user. Every caller now gets claims only from
// a token whose signature, expiry/nbf/iat and authorized party were verified.
//
// CPU (Cloudflare Free plan, 1102): one RS256 WebCrypto verify per request
// (callers memoize per request). Networkless when CLERK_JWT_KEY (the instance's
// PEM *public* key) is configured; otherwise the instance JWKS is fetched with
// CLERK_SECRET_KEY and cached in-isolate by @clerk/backend (the same cache
// clerkMiddleware already uses).

/** Only Clerk's session cookie. `__clerk_db_jwt` is a dev-browser token, never a session. */
export const SESSION_COOKIE = '__session'

/** Session token from a cookie getter (`name => value | undefined`). Rejects obviously malformed values. */
export function readSessionToken(getCookie) {
  const raw = getCookie(SESSION_COOKIE)
  if (typeof raw !== 'string') return null
  const token = raw.trim()
  if (token.length < 20 || token.length > 8192) return null
  if (token.split('.').length !== 3) return null
  return token
}

/** Comma-separated origins -> array (empty -> undefined so Clerk skips the azp check). */
export function parseAuthorizedParties(value) {
  const list = String(value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  return list.length > 0 ? list : undefined
}

/** Verify options from the Worker env. Returns null when nothing can verify (fail closed). */
export function verifyOptionsFromEnv(env) {
  const jwtKey = typeof env.CLERK_JWT_KEY === 'string' && env.CLERK_JWT_KEY.trim() ? env.CLERK_JWT_KEY.trim() : undefined
  const secretKey =
    typeof env.CLERK_SECRET_KEY === 'string' && env.CLERK_SECRET_KEY.trim() ? env.CLERK_SECRET_KEY.trim() : undefined
  if (!jwtKey && !secretKey) return null
  return {
    ...(jwtKey ? { jwtKey } : { secretKey }),
    authorizedParties: parseAuthorizedParties(env.CLERK_AUTHORIZED_PARTIES),
    clockSkewInMs: 5_000,
  }
}

/** Unverified JOSE header (alg/kid) — used ONLY to reject early, never to trust claims. */
export function peekTokenHeader(token) {
  try {
    const part = token.split('.')[0]
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)
    const header = JSON.parse(atob(b64))
    return header && typeof header === 'object' ? header : null
  } catch {
    return null
  }
}

/**
 * Per-isolate guard for the JWKS (secretKey) mode. @clerk/backend refetches the
 * JWKS (with retries) for every token whose `kid` is not cached, so a flood of
 * forged tokens with random kids would cost one Clerk API subrequest each.
 * Kids seen on a successfully verified token are trusted; once one is known,
 * an unknown kid may trigger at most one verification attempt per window
 * (covers real key rotation).
 */
export const UNKNOWN_KID_WINDOW_MS = 5 * 60_000
export function createKidGuard() {
  return { known: new Set(), lastUnknownAttemptAt: -Infinity }
}
const defaultKidGuard = createKidGuard()

/**
 * Verified session claims, or null. `verifyToken` is Clerk's verifier
 * (@clerk/nextjs/server re-exports @clerk/backend's). Any error, unsigned/
 * `alg:none` token, bad signature, expired token, foreign azp or missing
 * `sub`/`sid` yields null — never a decoded-but-unverified payload.
 */
export async function verifySessionClaims(token, { verifyToken, options, kidGuard = defaultKidGuard, now = Date.now }) {
  if (!token || !options) return null
  const header = peekTokenHeader(token)
  // Clerk session tokens are RS256 with a kid; anything else is forged — reject
  // before any crypto or network work.
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) return null
  const jwksMode = !options.jwtKey
  // Throttle only once a genuine kid is known, so a forged token arriving first
  // in a fresh isolate can never lock real users out.
  if (jwksMode && kidGuard.known.size > 0 && !kidGuard.known.has(header.kid)) {
    const t = now()
    if (t - kidGuard.lastUnknownAttemptAt < UNKNOWN_KID_WINDOW_MS) return null
    kidGuard.lastUnknownAttemptAt = t
  }
  let result
  try {
    result = await verifyToken(token, options)
  } catch {
    return null
  }
  if (!result || typeof result !== 'object') return null
  if ('errors' in result && result.errors) return null
  const payload = 'data' in result ? result.data : result
  if (!payload || typeof payload !== 'object') return null
  if (typeof payload.sub !== 'string' || !payload.sub.startsWith('user_')) return null
  if (typeof payload.sid !== 'string' || !payload.sid) return null
  if (jwksMode) kidGuard.known.add(header.kid)
  return payload
}

/** Email claim from verified claims (custom session-token claims), lower-cased. */
export function emailFromClaims(claims) {
  const email =
    claims?.email ?? claims?.primary_email ?? claims?.email_address ?? claims?.['https://clerk.com/email']
  return typeof email === 'string' && email.includes('@') ? email.toLowerCase() : null
}
