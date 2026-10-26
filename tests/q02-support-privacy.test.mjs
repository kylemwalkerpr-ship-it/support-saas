import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DISCLOSURE, issueIntent, verifyIntent, newChallenge } from '../lib/privacy/attestation.mjs'
import { reviewVisitorPrivacy, forgetVisitorPrivacy } from '../lib/privacy/visitor-controls.mjs'
import { hashVisitorToken } from '../lib/chat/widgetAuth.mjs'

// Synthetic adapter: tests contract ordering/CAS, NOT PostgreSQL or live RLS.
function ledger() {
  let epoch = 1, active = true
  const intents = new Map()
  return {
    async reserve(p) { if (!active || p.epoch !== epoch || intents.has(p.jti)) return false; intents.set(p.jti, p); return true },
    consume(p) { if (!active || p.epoch !== epoch || !intents.has(p.jti)) return false; intents.delete(p.jti); return true },
    withdraw(expected) { if (epoch !== expected) return false; active = false; epoch++; return true },
  }
}
async function fixture() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify'])
  const config = { enabled: true, issuer: 'https://support.example.test', audience: 'https://portal.example.test', site: 'support', tenant: 'tenant-a', kid: 'test-only', privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey) }
  const input = { config, session: { sub: 'user_alice', sid: 'session-test' }, membership: { subject: 'user_alice', site: 'support', tenant: 'tenant-a' }, consent: { accepted: true, disclosure: DISCLOSURE.version, scopes: ['preferences'], epoch: 1 }, nonce: newChallenge(), store: ledger(), now: 1000 }
  return { input, options: { config, nonce: input.nonce, now: 1000 } }
}
const denied = (fn) => assert.rejects(fn, /Privacy authorization denied/)
test('ES256 real WebCrypto round trip, bounded expiry, no email or chat identity', async () => {
  const { input, options } = await fixture()
  const token = await issueIntent(input)
  const p = await verifyIntent(token, options)
  assert.equal(p.sub, 'user_alice'); assert.equal(p.exp-p.iat, 120)
  assert.equal(p.email, undefined); assert.equal(p.conversationId, undefined)
  assert.equal(input.store.consume(p), true); assert.equal(input.store.consume(p), false)
})
for (const [name, mutate] of [
  ['disabled by default', i => { delete i.config.enabled }],
  ['missing runtime key', i => { delete i.config.privateJwk }],
  ['logout', i => { i.session = null }],
  ['visitor token is not a session', i => { i.session = { visitorToken: newChallenge() } }],
  ['provider cannot assert another subject', i => { i.membership.subject = 'user_provider' }],
  ['missing membership', i => { i.membership = null }],
  ['tenant mismatch', i => { i.membership.tenant = 'tenant-b' }],
  ['consent denied', i => { i.consent.accepted = false }],
  ['no explicit scopes', i => { i.consent.scopes = [] }],
  ['transcript scope denied', i => { i.consent.scopes = ['transcript'] }],
  ['stale disclosure', i => { i.consent.disclosure = 'old' }],
  ['missing nonce', i => { i.nonce = undefined }],
  ['stale consent epoch', i => { i.consent.epoch = 0 }],
]) test(name, async () => { const { input } = await fixture(); mutate(input); await denied(() => issueIntent(input)) })
for (const [name, mutate] of [
  ['expired', o => { o.now = 1120 }], ['not yet valid', o => { o.now = 999 }],
  ['invalid audience', o => { o.config.audience = 'https://other.example.test' }],
  ['invalid issuer', o => { o.config.issuer = 'https://other.example.test' }],
  ['invalid tenant', o => { o.config.tenant = 'tenant-b' }],
  ['invalid site', o => { o.config.site = 'other' }],
  ['invalid kid', o => { o.config.kid = 'unknown' }],
  ['stolen token with foreign portal challenge', o => { o.nonce = newChallenge() }],
  ['public verifier rejects private key', o => { o.config.publicJwk = o.config.privateJwk }],
]) test(name, async () => { const { input, options } = await fixture(); const token = await issueIntent(input); mutate(options); await denied(() => verifyIntent(token, options)) })
test('forged claims, missing/invalid jti, unknown fields and unsigned token denied', async () => {
  const { input, options } = await fixture(); const token = await issueIntent(input)
  const [h,b,s] = token.split('.'); const p = JSON.parse(Buffer.from(b,'base64url'))
  for (const patch of [{ sub: 'user_eve' }, { jti: '' }, { jti: null }, { exp: 9999 }, { email: 'a@b.test' }]) {
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...p, ...patch })).toString('base64url')}.${s}`
    await denied(() => verifyIntent(forged, options))
  }
  for (const malformed of ['', null, `${h}.${b}.`, `${h}.${b}.${s}=`, 'e30.e30.e30']) await denied(() => verifyIntent(malformed, options))
})
test('wrong signing key denied', async () => {
  const { input, options } = await fixture(); const token = await issueIntent(input)
  options.config.publicJwk = (await fixture()).options.config.publicJwk
  await denied(() => verifyIntent(token, options))
})
test('withdrawal CAS has one winner; signed late response cannot redeem', async () => {
  const { input, options } = await fixture(); const token = await issueIntent(input)
  const results = await Promise.all([Promise.resolve().then(() => input.store.withdraw(1)), Promise.resolve().then(() => input.store.withdraw(1))])
  assert.deepEqual(results, [true,false])
  const p = await verifyIntent(token, options) // signature deliberately remains valid
  assert.equal(input.store.consume(p), false)
  await denied(() => issueIntent(input))
})
test('withdrawal during signing reservation denies late effects', async () => {
  const { input, options } = await fixture(); const backing = input.store
  input.store = { async reserve(p) { const ok = await backing.reserve(p); backing.withdraw(1); return ok } }
  const p = await verifyIntent(await issueIntent(input), options)
  assert.equal(backing.consume(p), false)
})
test('visitor review is chat-scoped; no identity inferred; forget fails closed', async () => {
  const token = newChallenge(), hash = await hashVisitorToken(token)
  const own = '12565d9f-1c13-4322-a540-c62e3e0ae153'
  const db = { from() { let requested; const q = { select() { return q }, eq(_, value) { requested = value; return q }, async maybeSingle() { return { data: requested === own ? { id: own, visitor_token_hash: hash } : null } } }; return q } }
  const input = { db, conversationId: own, token }
  assert.equal((await reviewVisitorPrivacy(input)).body.accountLinked, false)
  assert.equal((await forgetVisitorPrivacy(input)).status, 409)
  for (const change of [{ token: null }, { token: newChallenge() }, { conversationId: '4f08b7ad-400d-408b-b893-05fbf4bc14ad' }]) {
    assert.equal((await reviewVisitorPrivacy({ ...input, ...change })).status, 404)
    assert.equal((await forgetVisitorPrivacy({ ...input, ...change })).status, 404)
  }
})
test('candidate SQL has row locking, CAS, unique replay guard and restricted service RPC', () => {
  const sql = readFileSync(new URL('../supabase/migrations/014_q02_support_privacy_contract.sql', import.meta.url),'utf8')
  for (const required of ['for update','c.epoch <> p_expected_epoch','jti text primary key','consumed_at is null','expires_at > clock_timestamp()', 'enable row level security', 'from public, anon, authenticated, service_role', 'to service_role']) assert.ok(sql.includes(required), required)
  assert.doesNotMatch(sql, /delete from|create policy|chat_messages|chat_conversations/i)
})

// Re-sign malformed payloads using an ephemeral test key: proves validators,
// rather than only the signature check, reject otherwise valid signatures.
test('validly signed but invalid claim schema is denied', async () => {
  const { input, options } = await fixture()
  const [h,b] = (await issueIntent(input)).split('.')
  const original = JSON.parse(Buffer.from(b, 'base64url'))
  const key = await crypto.subtle.importKey('jwk', input.config.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  for (const patch of [{ jti: undefined }, { jti: 'bad' }, { nonce: '' }, { exp: 1121 }, { nbf: 1001 }, { iat: 999 }, { epoch: -1 }, { v: 2 }, { scopes: ['preferences','preferences'] }, { purpose: 'login' }, { consent_version: 'old' }, { email: 'untrusted@example.test' }]) {
    const body = Buffer.from(JSON.stringify({ ...original, ...patch })).toString('base64url')
    const data = `${h}.${body}`
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(data))
    await denied(() => verifyIntent(`${data}.${Buffer.from(sig).toString('base64url')}`, options))
  }
})
test('missing durable adapter and failed durable reservation never issue a proof', async () => {
  const { input } = await fixture()
  input.store = undefined
  await denied(() => issueIntent(input))
  input.store = { async reserve() { return false } }
  await denied(() => issueIntent(input))
})
