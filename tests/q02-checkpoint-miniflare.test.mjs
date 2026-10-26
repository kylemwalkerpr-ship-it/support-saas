import assert from 'node:assert/strict'
import { createHash, randomBytes, webcrypto } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { build } from 'esbuild'
import { verifyCheckpoint } from '../lib/privacy/checkpoint.mjs'

// Match the supported Node major, not a developer-specific executable path.
assert.equal(Number(process.versions.node.split('.')[0]),22,
  'Q02 workerd/Miniflare compatibility tests require Node 22')
const b64 = b => Buffer.from(b).toString('base64url')
const hash = value => createHash('sha256').update(value).digest('base64url')
const nonce = () => b64(randomBytes(32))
const now = Math.floor(Date.now()/1000)
const pair = await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
const jwk = await webcrypto.subtle.exportKey('jwk',pair.privateKey)
const publicJwk = await webcrypto.subtle.exportKey('jwk',pair.publicKey)
const trust = {kid:'test-key',issuer:'test-issuer',audience:'test-audience',revoked:false,notBefore:now-60,notAfter:now+3600,publicJwk}
const tenant = 'checkpoint-test-tenant'
const generation = hash('generation')
const genesis = hash('approved-genesis')
const admin = 'test-only-capability'
const env = {
  CHECKPOINT_SIGNING_JWK: JSON.stringify(jwk),
  CHECKPOINT_TRUST: JSON.stringify(trust),
  CHECKPOINT_ADMIN_CAPABILITY: admin,
  CHECKPOINT_ENROLLMENTS: JSON.stringify([{tenant,generation,genesis,approved:true}]),
}
const persist = await mkdtemp(path.join(tmpdir(),'q02-checkpoint-'))
// Route calls through a Worker fetch handler. Miniflare 5's direct JS DO RPC
// proxy currently fails parsing RPC responses for this class, while workerd's
// Worker-to-DO RPC path remains supported and exercises the same production class.
const workerPath = path.join(persist,'checkpoint-test-worker.mjs')
const sourcePath = path.join(persist,'checkpoint-test-worker-source.mjs')
await (await import('node:fs/promises')).writeFile(sourcePath, `
import { Q02CheckpointJournal } from ${JSON.stringify(path.resolve('lib/privacy/checkpoint-journal.mjs'))}
export { Q02CheckpointJournal }
export default { async fetch(request, env) {
  const { tenant, method, args } = await request.json()
  const id = env.Q02CheckpointJournal.idFromName(tenant)
  const stub = env.Q02CheckpointJournal.get(id)
  try {
    const result = await stub[method](...args)
    return Response.json({ ok: true, result })
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message ?? error) })
  }
} }
`)
// The v4 converter includes only the entry module. Bundle the production import
// while retaining the Workers runtime builtin as an external import. Set the
// module root to the bundle directory: workerd rejects names escaping it via ../.
await build({entryPoints:[sourcePath],outfile:workerPath,bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers']})
const options = () => convertV4MiniflareOptions({scriptPath:workerPath,modules:true,modulesRoot:persist,durableObjects:{Q02CheckpointJournal:{className:'Q02CheckpointJournal',useSQLite:true}},compatibilityDate:'2026-05-12',compatibilityFlags:['nodejs_compat'],bindings:env,resourcePersistencePath:persist})
const mf = await new Miniflare(options())
const worker = await mf.getWorker()
const call = async (targetTenant, method, ...args) => {
  const response = await worker.fetch('http://checkpoint.test/rpc', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({tenant:targetTenant,method,args}) })
  return response.json()
}
const stub = {
  bootstrap: (...args) => call(tenant,'bootstrap',...args),
  read: (...args) => call(tenant,'read',...args),
  append: (...args) => call(tenant,'append',...args),
}
const reject = async fn => {
  const response = await fn()
  assert.deepEqual(response,{ok:false,error:'Checkpoint unavailable'})
}
const result = async (promise, proofNonce) => {
  const response = await promise
  assert.equal(response.ok,true, response.error)
  assert.deepEqual(Object.keys(response.result),['proof'])
  return verifyCheckpoint(response.result.proof,{trust,tenant,nonce:proofNonce,now:Math.floor(Date.now()/1000)})
}
const payload = {bindingDigest:hash('binding')}
const makeEvent = (seq, previousDigest, eventPayload=payload) => {
  const preimage = JSON.stringify([generation,seq,previousDigest,'stage',null,eventPayload])
  return {sequence:seq,generation,previousDigest,digest:hash(preimage),kind:'stage',requestDigest:null,payload:eventPayload,preimage}
}
try {
  await reject(() => stub.read(tenant,nonce())) // Unknown genesis never self-bootstraps.
  await reject(() => stub.bootstrap('wrong',true,tenant,generation,genesis))
  await reject(() => stub.bootstrap(admin,true,tenant,generation,hash('unapproved')))
  await result(stub.bootstrap(admin,true,tenant,generation,genesis),genesis)
  const n=nonce(), initial=await result(stub.read(tenant,n),n)
  assert.equal(initial.highWater,0)
  assert.equal(initial.headDigest,genesis)
  const event=makeEvent(1,genesis)
  const expected={generation,highWater:0,headDigest:genesis}
  await reject(() => stub.append(tenant,'bad-nonce',expected,event))
  await reject(() => stub.append(tenant,nonce(),{...expected,headDigest:hash('rollback')},event))
  await reject(() => stub.append(tenant,nonce(),expected,makeEvent(2,genesis))) // Reorder / sequence gap.
  const tampered={...event,payload:{bindingDigest:hash('tampered')}}
  await reject(() => stub.append(tenant,nonce(),expected,tampered)) // Caller cannot choose a digest independently of preimage.
  const appendNonces=[nonce(),nonce()]
  await Promise.all([result(stub.append(tenant,appendNonces[0],expected,event),appendNonces[0]),result(stub.append(tenant,appendNonces[1],expected,event),appendNonces[1])]) // CAS and identical retry race.
  const afterNonce=nonce(), after=await result(stub.read(tenant,afterNonce),afterNonce)
  assert.equal(after.generation,generation)
  assert.equal(after.highWater,1)
  assert.equal(after.headDigest,event.digest)
  await reject(() => stub.append(tenant,nonce(),expected,{...event,payload:{bindingDigest:hash('different')}}))
  await reject(() => call('another-tenant','read','another-tenant',nonce()))
  const reset=await call(tenant,'reset')
  assert.equal(reset.ok,false) // Unknown RPC must reject, without assuming a business denial message.
  await mf.dispose()
  const restarted=await new Miniflare(options())
  try {
    const restartedWorker=await restarted.getWorker()
    const recoveredNonce=nonce()
    const response=await restartedWorker.fetch('http://checkpoint.test/rpc', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({tenant,method:'read',args:[tenant,recoveredNonce]}) })
    const envelope=await response.json()
    assert.equal(envelope.ok,true,envelope.error)
    const recovered=await verifyCheckpoint(envelope.result.proof,{trust,tenant,nonce:recoveredNonce,now:Math.floor(Date.now()/1000)})
    assert.equal(recovered.highWater,1)
    assert.equal(recovered.headDigest,event.digest)
  } finally { await restarted.dispose() }
  console.log('Q02 checkpoint Miniflare/workerd persistence, isolation, bootstrap, signature, CAS, retry, and denial checks passed')
} finally {
  if (mf) await mf.dispose().catch(()=>{})
  await rm(persist,{recursive:true,force:true})
}
