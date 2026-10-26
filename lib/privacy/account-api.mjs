// Legacy compatibility handler. The production route uses link-api.mjs.
// This conservative handler does not grant linking or derived access.
import { DISCLOSURE, issueIntent } from './attestation.mjs'

const denied = () => { throw new Error('Privacy authorization denied') }
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...fields].sort().join()
const validScopes = s => Array.isArray(s) && s.length > 0 && s.length <= 2 && s.every(x => DISCLOSURE.scopes.includes(x)) && [...new Set(s)].sort().join() === s.join()
export const PRIVACY_HEADERS = Object.freeze({ 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie, Origin' })
export function privacyResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: PRIVACY_HEADERS })
}

// Static deployment origin, never Host/X-Forwarded-Host/request URL authority.
export function validPostOrigin(request, origin) {
  try {
    return new URL(origin).origin === origin && new URL(origin).protocol === 'https:' &&
      request.headers.get('origin') === origin &&
      [null, 'same-origin'].includes(request.headers.get('sec-fetch-site'))
  } catch { return false }
}

// Count actual streamed bytes, including when Content-Length is absent/forged.
export async function readPrivacyJson(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) denied()
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 2048)) denied()
  if (!request.body) denied()
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2048) { await reader.cancel(); denied() }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

/** Trusted dependencies only; NEVER expose these as request-selectable configuration.
 * Membership must be a fresh authoritative DB lookup by verified sub/sid and
 * fixed deployment site/tenant. Deployment scope and managed enrollment are independently required.
 * Withdrawal bypasses the issuance switch, but never bypasses authentication.
 */
export async function handleAccountPrivacy(request, action, deps) {
  try {
    const get = request.method === 'GET' && ['review', 'forget'].includes(action)
    const post = request.method === 'POST' && ['grant', 'issue', 'withdraw', 'forget', 'redeem'].includes(action)
    if (!get && !post) return privacyResponse({ error: 'Privacy request denied' }, 405)
    let body
    if (post) {
      if (!validPostOrigin(request, deps.origin)) denied()
      body = await readPrivacyJson(request)
    }
    const session = await deps.session()
    const now = Math.floor(Date.now() / 1000)
    if (!session || !/^user_[A-Za-z0-9_-]{1,123}$/.test(session.sub) || typeof session.sid !== 'string' || !session.sid || !Number.isSafeInteger(session.exp) || session.exp <= now) denied()
    const membership = await deps.membership(session)
    if (!membership || membership.subject !== session.sub || membership.site !== deps.site || membership.tenant !== deps.tenant) denied()
    if (membership.status !== undefined && (membership.version !== 1 || membership.withdrawal !== true ||
      (!['review', 'withdraw', 'forget'].includes(action) && (membership.status !== 'active' || membership.issuance !== true)))) denied()
    // No portal proof verifier/current-epoch authority: no consume or linking.
    if (action === 'redeem') denied()
    if (action === 'forget') {
      if (post && !exact(body, [])) denied()
      return privacyResponse({ forgetAvailable: false, deleted: false, retention: 'Transcripts and commercial/legal audit records are retained under separate policies. Durable suppression and retention policy are not provisioned; no records deleted.' }, post ? 409 : 200)
    }
    if (action === 'grant' || action === 'issue') {
      if (deps.signing?.enabled !== true) denied()
      const fields = action === 'grant' ? ['accepted', 'disclosure', 'scopes'] : ['accepted', 'disclosure', 'scopes', 'nonce']
      if (!exact(body, fields) || body.accepted !== true || body.disclosure !== DISCLOSURE.version || !validScopes(body.scopes)) denied()
    } else if (post && !exact(body, [])) denied()
    const store = deps.store({ session, membership })
    if (typeof store?.transition !== 'function' || typeof store?.review !== 'function') denied()
    const current = await store.review()
    if (!current || !Number.isSafeInteger(current.epoch) || current.epoch < 0 || !['active', 'withdrawn'].includes(current.state) || (current.state === 'active' ? !validScopes(current.scopes) : !Array.isArray(current.scopes) || current.scopes.length !== 0) || current.disclosure !== DISCLOSURE.version) denied()
    if (action === 'review') return privacyResponse({ state: current.state, scopes: current.scopes, disclosure: DISCLOSURE, issuanceAvailable: deps.signing?.enabled === true && (membership.status === undefined || membership.status === 'active' && membership.issuance === true), linkingAvailable: false, forgetAvailable: false })
    if (action === 'withdraw') {
      await store.transition('withdraw', current.epoch, [])
      return privacyResponse({ state: 'withdrawn', linkingAvailable: false, recordsDeleted: false })
    }
    if (action === 'grant') {
      await store.transition('grant', current.epoch, body.scopes)
      return privacyResponse({ state: 'active', scopes: body.scopes, linkingAvailable: false })
    }
    if (current.state !== 'active' || current.scopes.join() !== body.scopes.join()) denied()
    const proof = await issueIntent({ config: deps.signing, session, membership, consent: { ...body, epoch: current.epoch }, nonce: body.nonce, store })
    return privacyResponse({ proof, expiresIn: 120, linkingAvailable: false })
  } catch { return privacyResponse({ error: 'Privacy request denied' }, 403) }
}
