import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createSign, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { verifyToken } from '@clerk/backend'
import {
  createKidGuard,
  UNKNOWN_KID_WINDOW_MS,
  emailFromClaims,
  parseAuthorizedParties,
  readSessionToken,
  verifyOptionsFromEnv,
  verifySessionClaims,
} from '../lib/clerk-session.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(join(repoRoot, p), 'utf8')

const AZP = 'https://support.yousafeconsultancy.com'
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString()

const b64u = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
const now = () => Math.floor(Date.now() / 1000)
const claims = (over = {}) => ({
  azp: AZP,
  exp: now() + 60,
  iat: now() - 5,
  nbf: now() - 10,
  iss: 'https://clerk.portal.yousafeconsultancy.com',
  sid: 'sess_test123',
  sub: 'user_victim123',
  ...over,
})
function signRs256(payload, key = privateKey) {
  const head = b64u({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' })
  const body = b64u(payload)
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url')
  return `${head}.${body}.${sig}`
}
const unsigned = (payload) => `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u(payload)}.`
const unsignedWithJunkSig = (payload) => `${b64u({ alg: 'RS256', typ: 'JWT' })}.${b64u(payload)}.${b64u('forged')}`

const options = verifyOptionsFromEnv({ CLERK_JWT_KEY: PEM, CLERK_AUTHORIZED_PARTIES: AZP })
const verify = (token) => verifySessionClaims(token, { verifyToken, options })

test('a correctly signed Clerk session token is accepted', async () => {
  const c = await verify(signRs256(claims({ email: 'Agent@Example.com' })))
  assert.equal(c?.sub, 'user_victim123')
  assert.equal(emailFromClaims(c), 'agent@example.com')
})

test('forged tokens are rejected: alg none, junk signature, wrong key, tampered payload', async () => {
  assert.equal(await verify(unsigned(claims())), null)
  assert.equal(await verify(unsignedWithJunkSig(claims())), null)
  assert.equal(await verify(signRs256(claims(), other.privateKey)), null)
  const good = signRs256(claims({ sub: 'user_attacker' }))
  const [h, , s] = good.split('.')
  assert.equal(await verify(`${h}.${b64u(claims({ sub: 'user_admin' }))}.${s}`), null)
})

test('HS256 algorithm-confusion token keyed with the public PEM is rejected', async () => {
  const head = b64u({ alg: 'HS256', typ: 'JWT' })
  const body = b64u(claims())
  const sig = createHmac('sha256', PEM).update(`${head}.${body}`).digest('base64url')
  assert.equal(await verify(`${head}.${body}.${sig}`), null)
})

test('expired, not-yet-valid, foreign-azp and non-session tokens are rejected', async () => {
  assert.equal(await verify(signRs256(claims({ exp: now() - 120 }))), null)
  assert.equal(await verify(signRs256(claims({ nbf: now() + 600 }))), null)
  assert.equal(await verify(signRs256(claims({ azp: 'https://evil.example' }))), null)
  assert.equal(await verify(signRs256(claims({ sid: undefined }))), null)
  assert.equal(await verify(signRs256(claims({ sub: 'org_123' }))), null)
})

test('fails closed without verification material; a throwing verifier yields null', async () => {
  assert.equal(verifyOptionsFromEnv({}), null)
  assert.equal(await verifySessionClaims(signRs256(claims()), { verifyToken, options: null }), null)
  const boom = async () => {
    throw new Error('network')
  }
  assert.equal(await verifySessionClaims(signRs256(claims()), { verifyToken: boom, options }), null)
})

test('env options: networkless jwtKey preferred, else secretKey (cached JWKS); azp parsed', () => {
  assert.deepEqual(Object.keys(verifyOptionsFromEnv({ CLERK_JWT_KEY: PEM, CLERK_SECRET_KEY: 'sk' })).sort(), [
    'authorizedParties',
    'clockSkewInMs',
    'jwtKey',
  ])
  const sk = verifyOptionsFromEnv({ CLERK_SECRET_KEY: 'sk_live_x', CLERK_AUTHORIZED_PARTIES: `${AZP}, ` })
  assert.equal(sk.secretKey, 'sk_live_x')
  assert.equal(sk.jwtKey, undefined)
  assert.deepEqual(sk.authorizedParties, [AZP])
  assert.equal(parseAuthorizedParties(''), undefined)
})

test('only the __session cookie is read; malformed values are ignored', () => {
  const jar = (m) => (n) => m[n]
  const t = signRs256(claims())
  assert.equal(readSessionToken(jar({ __session: t })), t)
  assert.equal(readSessionToken(jar({ __clerk_db_jwt: t })), null)
  assert.equal(readSessionToken(jar({ __session: 'abc' })), null)
  assert.equal(readSessionToken(jar({})), null)
})

test('lib/auth.ts never trusts a decoded-but-unverified token', () => {
  const src = read('lib/auth.ts')
  assert.match(src, /import \{ verifyToken \} from '@clerk\/nextjs\/server'/)
  assert.match(src, /verifySessionClaims\(token,/)
  assert.doesNotMatch(src, /atob\(|Buffer\.from|JSON\.parse/)
  assert.doesNotMatch(src, /__clerk_db_jwt/)
})

test('JWKS mode: unknown kids cannot force a Clerk JWKS fetch per request', async () => {
  const guard = createKidGuard()
  let calls = 0
  const counting = async (token, opts) => {
    calls += 1
    return verifyToken(token, { ...opts, jwtKey: PEM, secretKey: undefined })
  }
  const jwksOptions = verifyOptionsFromEnv({ CLERK_SECRET_KEY: 'sk_live_test', CLERK_AUTHORIZED_PARTIES: AZP })
  let t = 1_000_000
  const run = (token) => verifySessionClaims(token, { verifyToken: counting, options: jwksOptions, kidGuard: guard, now: () => t })
  // Non-RS256 / kid-less headers never reach Clerk.
  assert.equal(await run(unsigned(claims())), null)
  assert.equal(await run(unsignedWithJunkSig(claims())), null)
  assert.equal(calls, 0)
  // Fresh isolate (no genuine kid learned yet): a forged token must not lock real users out.
  assert.equal(await run(signRs256(claims(), other.privateKey)), null)
  assert.equal(calls, 1)
  assert.equal((await run(signRs256(claims())))?.sub, 'user_victim123')
  assert.equal(calls, 2)
  // Genuine kid learned: unknown kids get one attempt per window, then are rejected without a call.
  const forged = () => {
    const head = b64u({ alg: 'RS256', typ: 'JWT', kid: `ins_rand${Math.random()}` })
    const body = b64u(claims({ sub: 'user_admin' }))
    return `${head}.${body}.${createSign('RSA-SHA256').update(`${head}.${body}`).sign(other.privateKey).toString('base64url')}`
  }
  assert.equal(await run(forged()), null)
  assert.equal(calls, 3)
  for (let i = 0; i < 20; i += 1) assert.equal(await run(forged()), null)
  assert.equal(calls, 3)
  // Real users are never throttled.
  assert.ok(await run(signRs256(claims())))
  assert.equal(calls, 4)
  t += UNKNOWN_KID_WINDOW_MS
  assert.equal(await run(forged()), null)
  assert.equal(calls, 5)
})
