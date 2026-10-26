import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { handleAccountPrivacy, readPrivacyJson } from '../lib/privacy/account-api.mjs'
import { createPrivacyStore } from '../lib/privacy/service-store.mjs'
import { handleVisitorPrivacy } from '../lib/privacy/visitor-api.mjs'
import { DISCLOSURE, newChallenge, verifyIntent } from '../lib/privacy/attestation.mjs'
import { hashVisitorToken } from '../lib/chat/widgetAuth.mjs'
const origin = 'https://support.yousafeconsultancy.com'
const subject = 'user_member'
const session = { sub: subject, sid: 'sess_current', exp: Math.floor(Date.now()/1000)+600 }
const membership = { subject, site: 'support', tenant: 'tenant' }
const consent = { accepted: true, disclosure: DISCLOSURE.version, scopes: ['preferences'] }
function request(method = 'GET', body, headers = {}) {
  return new Request(`${origin}/api/privacy/account/review`, { method, headers: { origin, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}
function fixture(overrides = {}) {
  const calls = []
  const deps = { origin, site: 'support', tenant: 'tenant', signing: { enabled: false },
    session: async () => session, membership: async () => membership,
    store: () => ({ review: async () => ({ epoch: 2, state: 'active', scopes: ['preferences'], disclosure: DISCLOSURE.version }),
      transition: async (...args) => { calls.push(args); return 3 }, reserve: async () => { calls.push('reserve'); return true } }), ...overrides }
  return { deps, calls, run: (r, action = 'review') => handleAccountPrivacy(r, action, deps) }
}
for (const [name, override] of [
  ['missing session', { session: async () => null }],
  ['expired session', { session: async () => ({ ...session, exp: 1 }) }],
  ['missing sid', { session: async () => ({ ...session, sid: '' }) }],
  ['unprovisioned membership', { membership: async () => null }],
  ['wrong subject', { membership: async () => ({ ...membership, subject: 'user_other' }) }],
  ['wrong tenant', { membership: async () => ({ ...membership, tenant: 'other' }) }],
  ['wrong site', { membership: async () => ({ ...membership, site: 'other' }) }],
]) test(name, async () => {
  const f = fixture({ ...override, store: () => { assert.fail('must not access store') } })
  const response = await f.run(request())
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: 'Privacy request denied' })
  assert.match(response.headers.get('cache-control'), /no-store/)
})
for (const headers of [{ origin: 'https://evil.example' }, { origin: 'null' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }, { 'content-type': 'text/plain' }, { 'content-length': '2049' }]) {
  test(`POST rejects ${JSON.stringify(headers)} before session`, async () => {
    const f = fixture({ session: () => assert.fail('must reject before auth') })
    assert.equal((await f.run(request('POST', {}, headers), 'withdraw')).status, 403)
  })
}
test('actual streamed byte limit and malformed JSON fail closed', async () => {
  await assert.rejects(readPrivacyJson(new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(2049) })))
  assert.equal((await fixture().run(new Request(origin, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{' }), 'withdraw')).status, 403)
})
test('disabled feature denies grant and issue but permits lawful withdrawal', async () => {
  const f = fixture()
  assert.equal((await f.run(request('POST', consent), 'grant')).status, 403)
  assert.equal((await f.run(request('POST', { ...consent, nonce: newChallenge() }), 'issue')).status, 403)
  assert.equal((await f.run(request('POST', {}), 'withdraw')).status, 200)
  assert.deepEqual(f.calls, [['withdraw', 2, []]])
})
test('review omits identifiers; forget explicitly refuses deletion; redemption denied', async () => {
  const f = fixture()
  const r = await f.run(request())
  const text = await r.text()
  assert.equal(r.status, 200)
  assert.equal(text.includes(subject), false)
  assert.equal((await f.run(request('POST', {}), 'forget')).status, 409)
  assert.equal((await f.run(request(), 'forget')).status, 200)
  assert.equal((await f.run(request('POST', {}), 'redeem')).status, 403)
  assert.deepEqual(f.calls, [])
})
test('explicit sorted granular opt-in and exact body only', async () => {
  const f = fixture({ signing: { enabled: true } })
  for (const body of [{ ...consent, accepted: false }, { ...consent, disclosure: 'old' }, { ...consent, scopes: ['preferences', 'derived_summary'] }, { ...consent, scopes: ['preferences', 'preferences'] }, { ...consent, scopes: [] }, { ...consent, sub: subject }, { ...consent, epoch: 2 }, { ...consent, sessionToken: 'forged' }]) {
    assert.equal((await f.run(request('POST', body), 'grant')).status, 403)
  }
  assert.equal((await f.run(request('POST', consent), 'grant')).status, 200)
  assert.deepEqual(f.calls, [['grant', 2, ['preferences']]])
})
test('real service adapter fixes identity and maps timestamps; RPC failures never succeed', async () => {
  const calls = []
  const db = { rpc: async (name, args) => { calls.push([name, args]); return { data: args.p_action === 'reserve' ? 2 : 3 } } }
  const store = createPrivacyStore(db, { session, membership })
  assert.equal(await store.transition('withdraw', 2, []), 3)
  const p = { sub: subject, site: membership.site, tenant: membership.tenant, epoch: 2, scopes: ['preferences'], jti: newChallenge(), nonce: newChallenge(), iat: 100, exp: 220 }
  assert.equal(await store.reserve(p), true)
  assert.equal(calls[1][1].p_issued_at, '1970-01-01T00:01:40.000Z')
  assert.equal(calls[0][1].p_subject, subject)
  await assert.rejects(store.reserve({ ...p, tenant: 'other' }))
  await assert.rejects(store.transition('consume', 2, []))
  const broken = createPrivacyStore({ rpc: async () => ({ error: { message: 'secret' } }) }, { session, membership })
  await assert.rejects(broken.transition('withdraw', 2, []), /Privacy authorization denied/)
})
test('route signs real ES256 proof only after durable reservation; nonce replay denied', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const signing = { enabled: true, issuer: origin, audience: 'https://portal.example', site: membership.site, tenant: membership.tenant, kid: 'support-test-only', privateJwk: await crypto.subtle.exportKey('jwk', keys.privateKey) }
  const seen = new Set()
  const db = { rpc: async (name, args) => {
    if (name === 'support_privacy_review') return { data: { epoch: 2, state: 'active', scopes: ['preferences'], disclosure: DISCLOSURE.version } }
    if (seen.has(args.p_nonce)) return { error: true }
    seen.add(args.p_nonce)
    return { data: 2 }
  } }
  const f = fixture({ signing, store: ctx => createPrivacyStore(db, ctx) })
  const nonce = newChallenge()
  const result = await f.run(request('POST', { ...consent, nonce }), 'issue')
  assert.equal(result.status, 200)
  const { proof } = await result.json()
  const publicJwk = await crypto.subtle.exportKey('jwk', keys.publicKey)
  const claims = await verifyIntent(proof, { config: { ...signing, privateJwk: undefined, publicJwk }, nonce })
  assert.equal(claims.sub, subject)
  assert.equal(claims.epoch, 2)
  assert.equal((await f.run(request('POST', { ...consent, nonce }), 'issue')).status, 403)
  await assert.rejects(verifyIntent(proof, { config: { ...signing, publicJwk }, nonce: newChallenge() }))
  const parts = proof.split('.'); parts[1] = parts[1].slice(0, -1) + 'A'
  await assert.rejects(verifyIntent(parts.join('.'), { config: { ...signing, publicJwk }, nonce }))
})
test('visitor token cannot become account session; Clerk cookie cannot become visitor token', async () => {
  const r = request('GET', undefined, { 'x-chat-token': 'a'.repeat(43) })
  assert.equal((await fixture({ session: async () => null }).run(r)).status, 403)
  const missing = await handleVisitorPrivacy(request('GET', undefined, { cookie: '__session=fake' }), 'anything', () => assert.fail('no token DB access'))
  assert.equal(missing.status, 404)
})
test('visitor review returns no transcript/raw IDs and uniform missing/wrong token 404', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const token = 'a'.repeat(43)
  const hash = await hashVisitorToken(token)
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { visitor_token_hash: hash, transcript: 'private' } }) }) }) }) }
  for (const value of ['', 'b'.repeat(43)]) {
    const r = await handleVisitorPrivacy(request('GET', undefined, { 'x-chat-token': value }), id, () => db)
    assert.equal(r.status, 404)
    assert.deepEqual(await r.json(), { error: 'Conversation not found' })
  }
  const r = await handleVisitorPrivacy(request('GET', undefined, { 'x-chat-token': token }), id, () => db)
  assert.equal(r.status, 200)
  const body = await r.text()
  assert.equal(body.includes('private'), false)
  assert.equal(body.includes(id), false)
  assert.equal(body.includes(hash), false)
})
test('production route delegates to dedicated enrolled runtime without admin RPC', async () => {
  const runtime = await readFile(new URL('../lib/privacy/runtime.ts', import.meta.url), 'utf8')
  const route = await readFile(new URL('../app/api/privacy/account/[action]/route.ts', import.meta.url), 'utf8')
  assert.match(runtime, /createLinkRuntime/)
  assert.match(runtime, /handleLinkRequest/)
  assert.doesNotMatch(runtime, /getOrCreateProfile|CLERK_SECRET_KEY|SupabaseAdmin|SIGNING_ENROLLED/)
  assert.match(route, /handleRuntimePrivacy\(request, action\)/)
})

test('unsigned account cookie rejected before verifier and never treated as identity', async () => {
  const { verifySessionClaims } = await import('../lib/clerk-session.mjs')
  const payload = btoa(JSON.stringify({ sub: subject, sid: session.sid, exp: session.exp }))
  const token = `${btoa(JSON.stringify({ alg: 'none' }))}.${payload}.forged`
  const verified = await verifySessionClaims(token, { options: { jwtKey: 'offline-placeholder', clockSkewInMs: 0 }, verifyToken: () => assert.fail('unsigned input must not reach verifier') })
  assert.equal(verified, null)
  assert.equal((await fixture({ session: async () => verified }).run(request())).status, 403)
})
test('service reserve rejects durable JTI replay and failed review yields uniform denial', async () => {
  const seen = new Set()
  const store = createPrivacyStore({ rpc: async (_, args) => {
    if (seen.has(args.p_jti)) return { error: true }
    seen.add(args.p_jti); return { data: args.p_expected_epoch }
  } }, { session, membership })
  const p = { sub: subject, site: membership.site, tenant: membership.tenant, epoch: 2, scopes: ['preferences'], jti: newChallenge(), nonce: newChallenge(), iat: 100, exp: 220 }
  await store.reserve(p)
  await assert.rejects(store.reserve({ ...p, nonce: newChallenge() }))
  const f = fixture({ store: () => ({ review: async () => { throw new Error('private database details') } }) })
  const result = await f.run(request())
  assert.equal(result.status, 403)
  assert.deepEqual(await result.json(), { error: 'Privacy request denied' })
})
test('additive review SQL is service-only and returns no subject/site/tenant', async () => {
  const sql = await readFile(new URL('../supabase/migrations/015_q02_support_privacy_review.sql', import.meta.url), 'utf8')
  assert.match(sql, /security definer set search_path = pg_catalog, public/)
  assert.match(sql, /from public, anon, authenticated/)
  assert.match(sql, /to service_role/)
  assert.doesNotMatch(sql, /grant\s+(select|all)|create policy|insert into|update public|delete from/i)
  assert.doesNotMatch(sql, /jsonb_build_object\('subject'/)
})
