import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectServiceMessage, prepareReciprocal, commitReciprocal, authorizeDerivedUse } from '../lib/privacy/coordinator.mjs'
import { newChallenge } from '../lib/privacy/attestation.mjs'
const b64 = s => Buffer.from(s).toString('base64url')
const keys = await Promise.all([0,1,2].map(()=>crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])))
const pubs = await Promise.all(keys.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))
const trust = {issuer:'https://portal.example',audience:'https://support.example',kid:'service-1',authoritySide:'portal',publicJwk:pubs[2],proofKeys:pubs.slice(0,2)}
const now=1800000000
const payload = {v:1,iss:trust.issuer,aud:trust.audience,purpose:'account-memory-link-reciprocal',kind:'current',side:'portal',support_membership:'active',portal_membership:'active',support_version:'q02-support-v1',portal_version:'portal-v7-1',scopes:['derived_summary','preferences'],jti:newChallenge(),request:newChallenge(),support_sub:'user_support',portal_sub:'user_portal',support_site:'support',portal_site:'portal',tenant:'isolated',support_epoch:3,portal_epoch:7,old_epoch:7,new_epoch:7,state:'active',iat:now,nbf:now,exp:now+30}
const expected = Object.fromEntries(['kind','side','support_membership','portal_membership','support_version','portal_version','scopes','request','support_sub','portal_sub','support_site','portal_site','tenant','support_epoch','portal_epoch','old_epoch','new_epoch','state'].map(k=>[k,payload[k]]))
async function sign(p=payload,k=keys[2],h={alg:'ES256',typ:'q02-service-state+jwt',kid:'service-1'}) {
 const input=b64(JSON.stringify(h))+'.'+b64(JSON.stringify(p))
 return input+'.'+b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},k.privateKey,new TextEncoder().encode(input)))
}
test('signed current state is evidence only; repeated messages never grant',async()=>{
 const token=await sign()
 for(let i=0;i<2;i++) assert.deepEqual(await inspectServiceMessage(token,trust,expected,now),{signatureVerified:true,decision:'DENY',deliveryConfirmed:false})
})
for(const [label,change] of Object.entries({forgedTenant:{tenant:'other'},wrongAudience:{aud:'https://evil.example'},wrongIssuer:{iss:'https://evil.example'},expired:{exp:now},future:{iat:now+1,nbf:now+1},longTTL:{exp:now+31},staleSupport:{support_epoch:2},stalePortal:{portal_epoch:6},wrongSubject:{portal_sub:'user_other'},wrongSite:{support_site:'portal'},wrongRequest:{request:newChallenge()},extra:{extra:true},rollback:{new_epoch:6},fractional:{support_epoch:1.5},wrongPurpose:{purpose:'other'},suspended:{portal_membership:'suspended'},revoked:{support_membership:'revoked'},wrongVersion:{portal_version:'old'},wrongScopes:{scopes:['preferences']}})) {
 test(`service envelope denies ${label}`,async()=>assert.rejects(inspectServiceMessage(await sign({...payload,...change}),trust,expected,now)))
}
test('forged signature, wrong kid, unsigned headers and shared proof keys deny',async()=>{
 await assert.rejects(inspectServiceMessage(await sign(payload,keys[0]),trust,expected,now))
 for(const h of [{alg:'ES256',typ:'q02-service-state+jwt',kid:'other'},{alg:'none',typ:'q02-service-state+jwt',kid:'service-1'},{alg:'ES256',typ:'q02-service-state+jwt',kid:'service-1',jwk:pubs[2]}]) await assert.rejects(inspectServiceMessage(await sign(payload,keys[2],h),trust,expected,now))
 await assert.rejects(inspectServiceMessage(await sign(),{...trust,proofKeys:[pubs[0],pubs[2]]},expected,now))
 await assert.rejects(inspectServiceMessage(await sign(),{...trust,proofKeys:[pubs[0],{...pubs[2],x:pubs[2].x+'=',y:pubs[2].y+'='}]},expected,now))
})
test('revocation/ack binds monotonically increasing epochs and retained pair',async()=>{
 for(const kind of ['revoke','ack']) {
  const p={...payload,kind,state:'withdrawn',new_epoch:8,portal_epoch:8}
  const e={...expected,kind,state:'withdrawn',new_epoch:8,portal_epoch:8}
  assert.equal((await inspectServiceMessage(await sign(p),trust,e,now)).decision,'DENY')
  await assert.rejects(inspectServiceMessage(await sign({...p,new_epoch:7}),trust,e,now))
  await assert.rejects(inspectServiceMessage(await sign({...p,state:'active'}),trust,e,now))
 }
})
test('missing authenticated evidence, malicious adapters, commit and all derived use deny',async()=>{
 let touched=false
 const result=await prepareReciprocal({}, {recordDenial:()=>{touched=true;return 'COMMIT'}})
 assert.equal(result.decision,'DENY'); assert.equal(touched,false)
 for(const fn of [commitReciprocal,authorizeDerivedUse]) for(const action of ['prepare','commit','withdraw','cancel']) assert.equal((await fn({action,verified:true,ack:true})).decision,'DENY')
 const results=await Promise.all(Array.from({length:32},(_,i)=>i%2?commitReciprocal():authorizeDerivedUse()))
 assert.ok(results.every(x=>x.decision==='DENY' && !x.derivedUse))
})
