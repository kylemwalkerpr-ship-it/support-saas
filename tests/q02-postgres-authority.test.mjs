import test from 'node:test'
import assert from 'node:assert/strict'
import { createPostgresAuthority } from '../lib/privacy/postgres-authority.mjs'
import { authorityDigest, liveRequestDigest } from '../lib/privacy/live-authority.mjs'
import { verifyCheckpoint } from '../lib/privacy/checkpoint.mjs'

const token = value => 'e30.' + Buffer.from(JSON.stringify(value)).toString('base64url') + '.AA'
const b64 = value => Buffer.from(value).toString('base64url')
async function signedCheckpoint() {
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
  const publicJwk=await crypto.subtle.exportKey('jwk',pair.publicKey), now=Math.floor(Date.now()/1000)
  const trust={kid:'test-kid',issuer:'test-issuer',audience:'test-audience',revoked:false,notBefore:now-60,notAfter:now+60,publicJwk}
  const nonce=b64(crypto.getRandomValues(new Uint8Array(32)))
  const header=b64(JSON.stringify({alg:'ES256',typ:'q02-checkpoint+jwt',kid:trust.kid}))
  const payload=b64(JSON.stringify({v:1,iss:trust.issuer,aud:trust.audience,tenant:'tenant',nonce,generation:'g'.repeat(43),highWater:1,headDigest:'h'.repeat(43),iat:now,exp:now+8}))
  const body=header+'.'+payload, signature=b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(body)))
  return verifyCheckpoint(body+'.'+signature,{trust,tenant:'tenant',nonce,now})
}
async function fixture(options = {}) {
  const input = { supportProof: token({ sub: 'user_support' }), receipt: token({ portal_sub: 'user_portal' }),
    supportCredential: token({ sid: 'sess_support' }), portalCredential: token({ sid: 'sess_portal' }),
    challenge: 'c'.repeat(43), serviceProof: 'service' }
  const requestDigest = await liveRequestDigest(input), calls = []
  const sessions = {}, context = { current: {}, authorities: {} }
  for (const site of ['support', 'portal']) {
    sessions[site] = { issuer: 'https://clerk.shared.example', party: `https://${site}.example`, verify: async () => ({}) }
    context.authorities[site] = { issuer: sessions[site].issuer, party: sessions[site].party }
    context.current[site] = { enrolledSessionDigest: await authorityDigest('sess_' + site) }
  }
  const client = {
    connect: async () => calls.push('connect'), end: async () => calls.push('close'),
    async query(sql, parameters) {
      calls.push(sql)
      if (sql.startsWith('select q02_runtime.lock_authority')) {
        assert.equal(JSON.parse(parameters[0]).mode, options.phase ?? 'consume')
      }
      if (sql.startsWith('select session_user')) return { rows: [{ login: options.login ?? 'q02_coordinator_runtime', role: options.role ?? 'q02_coordinator_runtime' }] }
      if (sql.startsWith('select q02_runtime.lock_authority')) return { rows: [{ authority: context }] }
      if (sql.startsWith('select q02_runtime.assert_current')) return { rows: [{ current: options.current ?? true }] }
      if (sql.startsWith('select q02_runtime.stage')) return { rows: [{ receipt: { staged: true, requestDigest } }] }
      if (sql.startsWith('select q02_runtime.consume')) return { rows: [{ receipt: { committed: true, requestDigest } }] }
      if (sql === 'COMMIT') {
        if (options.commitError) throw Error('ambiguous commit')
        if (options.beforeCommit) await options.beforeCommit()
        return { command: options.commitCommand ?? 'COMMIT' }
      }
      return { rows: [] }
    },
  }
  const adapter = createPostgresAuthority({ input, tenant: 'tenant', sessions, phase: options.phase,
    checkpoint: Object.hasOwn(options, 'checkpoint') ? options.checkpoint : await signedCheckpoint(),
    connectionString: options.connectionString ?? 'postgres://scoped:synthetic@db.example/postgres?sslmode=verify-full', connect: () => client })
  const binding = { requestDigest, expiresAt: 12345 }
  async function consume(tx) {
    assert.equal(await tx.assertCurrent(binding), true)
    await tx.consume(binding)
    return { decision: 'LINKED', requestDigest }
  }
  return { adapter, input, requestDigest, binding, calls, context, consume }
}

test('adapter waits for confirmed COMMIT before returning a successful result', async () => {
  let entered, finish
  const started = new Promise(resolve => { entered = resolve })
  const barrier = new Promise(resolve => { finish = resolve })
  const f = await fixture({ beforeCommit: async () => { entered(); await barrier } })
  let returned = false
  const operation = f.adapter.withLockedAuthority(f.requestDigest, f.consume).then(result => { returned = true; return result })
  await started
  assert.equal(returned, false); finish()
  assert.equal((await operation).decision, 'LINKED')
  assert.equal(f.calls.at(-1), 'close'); assert.ok(!f.calls.includes('ROLLBACK'))
})

for (const options of [{ commitError: true }, { commitCommand: 'ROLLBACK' }]) {
  test('uncertain or aborted COMMIT never returns successful authorization ' + JSON.stringify(options), async () => {
    const f = await fixture(options)
    await assert.rejects(f.adapter.withLockedAuthority(f.requestDigest, f.consume), /Privacy authorization denied/)
    assert.ok(f.calls.includes('ROLLBACK')); assert.equal(f.calls.at(-1), 'close')
  })
}

for (const role of ['postgres', 'service_role', 'authenticated']) {
  test('rejects generic database login before opening a transaction: ' + role, async () => {
    const f = await fixture({ login: role })
    await assert.rejects(f.adapter.withLockedAuthority(f.requestDigest, f.consume))
    assert.ok(!f.calls.includes('BEGIN')); assert.equal(f.calls.at(-1), 'close')
  })
}

test('rejects a changed role, wrong site party or substituted enrolled session', async () => {
  for (const change of [
    f => { f.context.authorities.portal.party = 'https://support.example' },
    f => { f.context.current.portal.enrolledSessionDigest = 'x'.repeat(43) },
  ]) {
    const f = await fixture(); change(f)
    await assert.rejects(f.adapter.withLockedAuthority(f.requestDigest, f.consume))
    assert.ok(f.calls.includes('ROLLBACK'))
  }
  const f = await fixture({ role: 'postgres' })
  await assert.rejects(f.adapter.withLockedAuthority(f.requestDigest, f.consume))
})

test('binding cannot change between the database-clock check and consumption', async () => {
  const f = await fixture()
  await assert.rejects(f.adapter.withLockedAuthority(f.requestDigest, async tx => {
    await tx.assertCurrent(f.binding)
    await tx.consume({ ...f.binding, expiresAt: 999999 })
    return { decision: 'LINKED', requestDigest: f.requestDigest }
  }))
  assert.ok(!f.calls.some(sql => sql.startsWith('select q02_runtime.consume')))
  assert.ok(f.calls.includes('ROLLBACK'))
})

test('failed current authority, missing consumption and duplicate consumption all roll back', async () => {
  const stale = await fixture({ current: false })
  await assert.rejects(stale.adapter.withLockedAuthority(stale.requestDigest, stale.consume))
  const missing = await fixture()
  await assert.rejects(missing.adapter.withLockedAuthority(missing.requestDigest, async () => ({ decision: 'LINKED', requestDigest: missing.requestDigest })))
  const twice = await fixture()
  await assert.rejects(twice.adapter.withLockedAuthority(twice.requestDigest, async tx => {
    await twice.consume(tx); return twice.consume(tx)
  }))
  for (const f of [stale, missing, twice]) assert.ok(f.calls.includes('ROLLBACK'))
})

test('requires the exact request digest and verified database TLS configuration', async () => {
  const f = await fixture()
  await assert.rejects(f.adapter.withLockedAuthority('x'.repeat(43), f.consume))
  assert.deepEqual(f.calls, [])
  const insecure = await fixture({ connectionString: 'postgres://scoped:synthetic@db.example/postgres?sslmode=disable' })
  await assert.rejects(insecure.adapter.withLockedAuthority(insecure.requestDigest, insecure.consume))
  assert.deepEqual(insecure.calls, [])
})

test('requires an externally verified monotonic checkpoint before connecting', async () => {
  for (const checkpoint of [undefined, { verified: false, generation: 'g'.repeat(43), highWater: 1, headDigest: 'h'.repeat(43), evidenceDigest:'e'.repeat(43), verifiedAt:Date.now() },
    { verified: true, generation: 'g'.repeat(43), highWater: -1, headDigest: 'h'.repeat(43), evidenceDigest:'e'.repeat(43), verifiedAt:Date.now() }]) {
    const f = await fixture({ checkpoint: checkpoint ?? null })
    await assert.rejects(f.adapter.withLockedAuthority(f.requestDigest, f.consume))
    assert.deepEqual(f.calls, [])
  }
})


test('explicit stage transaction checks binding and commits STAGED before separate consume transaction', async () => {
  const f = await fixture({ phase: 'stage' })
  const result = await f.adapter.withLockedAuthority(f.requestDigest, async tx => {
    assert.equal(await tx.assertCurrent(f.binding), true)
    assert.equal((await tx.stage(f.binding)).staged, true)
    return { decision: 'STAGED', requestDigest: f.requestDigest }
  })
  assert.equal(result.decision, 'STAGED')
  assert.ok(f.calls.includes('COMMIT'))
  assert.ok(!f.calls.some(sql => /q02_runtime\.(consume|ack)/.test(sql)))
  const next = await fixture()
  assert.equal((await next.adapter.withLockedAuthority(next.requestDigest, next.consume)).decision, 'LINKED')
  assert.ok(next.calls.includes('BEGIN'))
})

test('stage requires checked identical binding and phase-specific completion', async () => {
  for (const change of ['unchecked', 'mutated', 'linked', 'duplicate', 'consume']) {
    const f = await fixture({ phase: 'stage' })
    await assert.rejects(f.adapter.withLockedAuthority(f.requestDigest, async tx => {
      if (change !== 'unchecked') await tx.assertCurrent(f.binding)
      if (change === 'consume') return f.consume(tx)
      await tx.stage(change === 'mutated' ? { ...f.binding, expiresAt: 9 } : f.binding)
      if (change === 'duplicate') await tx.stage(f.binding)
      return { decision: change === 'linked' ? 'LINKED' : 'STAGED', requestDigest: f.requestDigest }
    }))
    assert.ok(f.calls.includes('ROLLBACK'))
    assert.ok(!f.calls.includes('COMMIT'))
  }
})

test('consume transaction cannot stage and invalid phase never connects', async () => {
  const f = await fixture()
  await assert.rejects(f.adapter.withLockedAuthority(f.requestDigest, async tx => {
    await tx.assertCurrent(f.binding); await tx.stage(f.binding)
  }))
  assert.ok(!f.calls.some(sql => sql.startsWith('select q02_runtime.stage')))
  const invalid = await fixture({ phase: 'auto' })
  await assert.rejects(invalid.adapter.withLockedAuthority(invalid.requestDigest, invalid.consume))
  assert.deepEqual(invalid.calls, [])
})

for (const options of [{ commitError: true }, { commitCommand: 'ROLLBACK' }]) {
  test('stage never reports success after ambiguous or aborted COMMIT ' + JSON.stringify(options), async () => {
    const f = await fixture({ ...options, phase: 'stage' })
    await assert.rejects(f.adapter.withLockedAuthority(f.requestDigest, async tx => {
      await tx.assertCurrent(f.binding); await tx.stage(f.binding)
      return { decision: 'STAGED', requestDigest: f.requestDigest }
    }))
    assert.ok(f.calls.includes('ROLLBACK'))
  })
}
