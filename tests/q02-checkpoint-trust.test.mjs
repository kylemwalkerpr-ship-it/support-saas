import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyCheckpoint } from '../lib/privacy/checkpoint.mjs'

const b64 = value => Buffer.from(value).toString('base64url')

async function fixture(overrides = {}) {
  const pair = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
  const publicJwk = await crypto.subtle.exportKey('jwk',pair.publicKey)
  const now = Math.floor(Date.now()/1000), nonce = b64(crypto.getRandomValues(new Uint8Array(32)))
  const trust = {kid:'kid',issuer:'issuer',audience:'audience',revoked:false,notBefore:now-1,notAfter:now+100,publicJwk}
  const payload = {v:1,iss:trust.issuer,aud:trust.audience,tenant:'tenant',nonce,generation:'g'.repeat(43),highWater:3,headDigest:'h'.repeat(43),iat:now,exp:now+8,...overrides}
  const input = b64(JSON.stringify({alg:'ES256',typ:'q02-checkpoint+jwt',kid:'kid'}))+'.'+b64(JSON.stringify(payload))
  const token = input+'.'+b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(input)))
  return {trust,nonce,token,now}
}

test('verified checkpoint records bounded millisecond freshness and binds nonce against replay', async () => {
  const f = await fixture(), cp = await verifyCheckpoint(f.token,{trust:f.trust,tenant:'tenant',nonce:f.nonce,now:f.now})
  assert.equal(cp.verifiedAt,f.now*1000)
  assert.equal(cp.nonceDigest, createHash('sha256').update(f.nonce).digest('base64url'))
  assert.equal(Object.hasOwn(cp,'verified'),false)
})

for (const change of [{tenant:'other'},{iat:Math.floor(Date.now()/1000)+20},{exp:Math.floor(Date.now()/1000)-1}]) {
  test(`checkpoint rejects altered ${Object.keys(change)[0]}`,async()=>{
    const f=await fixture(change)
    await assert.rejects(verifyCheckpoint(f.token,{trust:f.trust,tenant:'tenant',nonce:f.nonce,now:f.now}),/Privacy authorization denied/)
  })
}

test('checkpoint rejects a modified signature, wrong tenant, and wrong nonce',async()=>{
  const f=await fixture()
  const [header,payload,encodedSignature]=f.token.split('.')
  const signature=Buffer.from(encodedSignature,'base64url')
  signature[0]^=1
  const modifiedToken=[header,payload,b64(signature)].join('.')
  assert.notEqual(modifiedToken,f.token)
  await assert.rejects(verifyCheckpoint(modifiedToken,{trust:f.trust,tenant:'tenant',nonce:f.nonce,now:f.now}))
  await assert.rejects(verifyCheckpoint(f.token,{trust:f.trust,tenant:'other',nonce:f.nonce,now:f.now}))
  await assert.rejects(verifyCheckpoint(f.token,{trust:f.trust,tenant:'tenant',nonce:'x'.repeat(43),now:f.now}))
})
