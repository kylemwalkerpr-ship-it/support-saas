// Server adapter contract only. Never imported by a browser or exposed as an
// unsigned JSON authorization endpoint. No network/key discovery or activation flag.
import { inspectReciprocalReceipt } from './reciprocal.mjs'
const denied = () => Object.freeze({ decision: 'DENY', derivedUse: false, reason: 'ATOMIC_AUTHORITY_UNPROVEN' })
export const coordinatorDisposition = denied
/** Caller supplies trusted, fixed server configuration and session context.
 * Valid signatures are evidence; even a malicious adapter returning COMMIT
 * cannot enable linking. Journal failure/ambiguous completion also denies.
 */
export async function prepareReciprocal(context, journal) {
  try {
    await inspectReciprocalReceipt(context)
    const digest = async s => Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('base64url')
    const p = JSON.parse(Buffer.from(context.receipt.split('.')[1],'base64url').toString('utf8'))
    if (context.session?.sub !== p.support_sub || !/^sess_[A-Za-z0-9_-]{1,123}$/.test(context.session?.sid) ||
        !Number.isSafeInteger(context.session.exp) || context.session.exp <= (context.now ?? Math.floor(Date.now()/1000))) return denied()
    // Only digests reach the denial journal, never compact proofs or session IDs.
    if (journal?.recordDenial) await journal.recordDenial({
      requestDigest: await digest(context.supportProof + '.' + context.receipt),
      bindings: Object.freeze({support_site:p.support_site,portal_site:p.portal_site,tenant:p.tenant,support_sub:p.support_sub,portal_sub:p.portal_sub,support_epoch:String(p.support_epoch),portal_epoch:String(p.portal_epoch),support_jti:p.support_jti,receipt_jti:p.jti,challenge_digest:await digest(p.challenge),support_digest:p.support_digest}),
      reason: 'ATOMIC_AUTHORITY_UNPROVEN',
    })
  } catch { /* Invalid evidence, missing authority or unavailable durable store. */ }
  return denied()
}
export async function commitReciprocal() { return denied() }
export async function authorizeDerivedUse() { return denied() }

const fields = ['v','iss','aud','purpose','kind','side','support_membership','portal_membership','support_version','portal_version','scopes','jti','request','support_sub','portal_sub','support_site','portal_site','tenant','support_epoch','portal_epoch','old_epoch','new_epoch','state','iat','nbf','exp']
const canonicalId = s => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s) && Buffer.from(s,'base64url').toString('base64url') === s
const exact = (p, keys) => p && typeof p === 'object' && !Array.isArray(p) && Object.keys(p).sort().join() === [...keys].sort().join()
const origin = s => { try { return new URL(s).origin === s && s.startsWith('https://') } catch { return false } }
/** Offline authenticated service-envelope evidence; NEVER freshness authority.
 * Expected is selected by a server request/retained pair, never by message body.
 * Dedicated service public keys must differ from both proof keys. Transport,
 * request replay CAS, durable application and remote authority remain unprovisioned.
 */
export async function inspectServiceMessage(token, trust, expected, now = Math.floor(Date.now()/1000)) {
  const fail = () => { throw Error('Privacy authorization denied') }
  try {
    if (!trust || !origin(trust.issuer) || !origin(trust.audience) || trust.issuer === trust.audience ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(trust.kid) || !Array.isArray(trust.proofKeys) || trust.proofKeys.length !== 2 ||
        !trust.publicJwk || 'd' in trust.publicJwk || trust.publicJwk.kty !== 'EC' || trust.publicJwk.crv !== 'P-256' ||
        trust.proofKeys.some(k => !k || (k.x === trust.publicJwk.x && k.y === trust.publicJwk.y)) ||
        typeof token !== 'string' || token.length > 8192) fail()
    const parts = token.split('.')
    if (parts.length !== 3) fail()
    const decode = s => {
      if (!/^[A-Za-z0-9_-]+$/.test(s) || Buffer.from(s,'base64url').toString('base64url') !== s) fail()
      return Buffer.from(s,'base64url')
    }
    const parse = s => {
      const text = new TextDecoder('utf-8',{fatal:true}).decode(decode(s)), p = JSON.parse(text)
      if (JSON.stringify(p) !== text) fail()
      return p
    }
    const h = parse(parts[0]), p = parse(parts[1])
    if (!exact(h,['alg','typ','kid']) || h.alg !== 'ES256' || h.typ !== 'q02-service-state+jwt' || h.kid !== trust.kid || !exact(p,fields)) fail()
    const key = await crypto.subtle.importKey('jwk',trust.publicJwk,{name:'ECDSA',namedCurve:'P-256'},true,['verify'])
    const raw = Buffer.from(await crypto.subtle.exportKey('raw',key)).toString('hex')
    for (const jwk of trust.proofKeys) {
      if ('d' in jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256') fail()
      const proofKey = await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},true,['verify'])
      if (raw === Buffer.from(await crypto.subtle.exportKey('raw',proofKey)).toString('hex')) fail()
    }
    if (decode(parts[2]).length !== 64 || !await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode(parts[2]),new TextEncoder().encode(parts.slice(0,2).join('.')))) fail()
    if (p.v !== 1 || p.iss !== trust.issuer || p.aud !== trust.audience || p.purpose !== 'account-memory-link-reciprocal' ||
        !['current','revoke','ack'].includes(p.kind) || !['support','portal'].includes(p.side) || p.side !== trust.authoritySide ||
        !['active','suspended','revoked'].includes(p.support_membership) || !['active','suspended','revoked'].includes(p.portal_membership) ||
        p.support_version !== 'q02-support-v1' || p.portal_version !== 'portal-v7-1' || JSON.stringify(p.scopes) !== JSON.stringify(['derived_summary','preferences']) || !canonicalId(p.jti) || !canonicalId(p.request) ||
        !/^user_[A-Za-z0-9_-]{1,123}$/.test(p.support_sub) || !/^user_[A-Za-z0-9_-]{1,123}$/.test(p.portal_sub) ||
        !['support_site','portal_site','tenant'].every(k => /^[A-Za-z0-9_-]{1,128}$/.test(p[k])) || p.support_site === p.portal_site ||
        ![now,p.iat,p.nbf,p.exp,p.support_epoch,p.portal_epoch,p.old_epoch,p.new_epoch].every(Number.isSafeInteger) ||
        p.support_epoch < 1 || p.portal_epoch < 1 || p.old_epoch < 0 || p.new_epoch < p.old_epoch || p.new_epoch !== p[p.side+'_epoch'] ||
        p.iat !== p.nbf || p.iat > now || p.exp <= now || p.exp <= p.iat || p.exp-p.iat > 30 ||
        (p.kind === 'current' ? p.state !== 'active' || p.support_membership !== 'active' || p.portal_membership !== 'active' || p.new_epoch !== p.old_epoch : p.state !== 'withdrawn' || p.new_epoch <= p.old_epoch)) fail()
    // Every pair/epoch/state/request binding is independently expected.
    for (const k of fields.filter(k => !['v','iss','aud','purpose','jti','iat','nbf','exp'].includes(k))) if (JSON.stringify(p[k]) !== JSON.stringify(expected?.[k])) fail()
    return Object.freeze({ signatureVerified:true, decision:'DENY', deliveryConfirmed:false })
  } catch { fail() }
}

/** Existing server-created service client only. No URL/key/body-selected client. */
export function createCoordinatorJournal(serviceClient) {
  return Object.freeze({
    async recordDenial({requestDigest, bindings}) {
      const result = await serviceClient.rpc('support_q02_coordinate', {
        p_action:'deny', p_digest:requestDigest, p_bindings:bindings,
      })
      if (result?.error || result?.data?.decision !== 'DENY' || result.data.derivedUse !== false) throw Error('Privacy authorization denied')
    },
  })
}
