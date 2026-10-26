import test from 'node:test'
import assert from 'node:assert/strict'
import { issueIntent,newChallenge } from '../lib/privacy/attestation.mjs'
import { inspectReciprocalReceipt,redeemReciprocal } from '../lib/privacy/reciprocal.mjs'
import { inspectSingleDbCandidate } from '../lib/privacy/single-db-candidate.mjs'
const b64=x=>Buffer.from(x).toString('base64url')
test('independent session authorities and original ES256 bytes are evidence only',async()=>{
 const keys=await Promise.all([0,1].map(()=>crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])))
 const supportConfig={enabled:true,issuer:'https://support.example',audience:'https://portal.example',site:'support',tenant:'tenant',kid:'s1',privateJwk:await crypto.subtle.exportKey('jwk',keys[0].privateKey),publicJwk:await crypto.subtle.exportKey('jwk',keys[0].publicKey)}
 const portalConfig={issuer:'https://portal.example',audience:'https://support.example',site:'portal',tenant:'tenant',kid:'p1',consentVersion:'portal-v7-1',publicJwk:await crypto.subtle.exportKey('jwk',keys[1].publicKey)}
 const challenge=newChallenge(), now=Math.floor(Date.now()/1000)
 const supportProof=await issueIntent({config:supportConfig,session:{sub:'user_support',sid:'sess_support'},membership:{subject:'user_support',site:'support',tenant:'tenant'},consent:{accepted:true,disclosure:'q02-support-v1',scopes:['derived_summary','preferences'],epoch:3},nonce:challenge,store:{reserve:async()=>true},now})
 const support=JSON.parse(Buffer.from(supportProof.split('.')[1],'base64url'))
 const p={v:1,iss:portalConfig.issuer,aud:portalConfig.audience,support_sub:support.sub,portal_sub:'user_portal',support_site:'support',portal_site:'portal',tenant:'tenant',support_epoch:3,portal_epoch:7,support_consent_version:'q02-support-v1',portal_consent_version:'portal-v7-1',scopes:['derived_summary','preferences'],challenge,support_jti:support.jti,support_digest:b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(supportProof))),jti:newChallenge(),iat:now,nbf:now,exp:now+120,purpose:'account-memory-link-reciprocal'}
 async function sign(payload) {
  const input=b64(JSON.stringify({alg:'ES256',typ:'q02-portal-reciprocal+jwt',kid:'p1'}))+'.'+b64(JSON.stringify(payload))
  return input+'.'+b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys[1].privateKey,new TextEncoder().encode(input)))
 }
 const context={supportProof,supportConfig,portalConfig,challenge,portalSubject:'user_portal',now}
 const receipt=await sign(p)
 const session={sub:'user_support',sid:'sess_support',exp:now+120}
 const makeAuthorities=()=>({
  support:{issuer:'https://support-clerk.example',party:'https://support.example',proof:supportConfig,
   verify:async credential=>{assert.equal(credential,'support-opaque');return {...session,issuer:'https://support-clerk.example',party:'https://support.example',active:true}}},
  portal:{issuer:'https://portal-clerk.example',party:'https://portal.example',proof:portalConfig,
   verify:async credential=>{assert.equal(credential,'portal-opaque');return {sub:'user_portal',sid:'sess_portal',exp:now+120,issuer:'https://portal-clerk.example',party:'https://portal.example',active:true}}},
 })
 const baseAuthorities=makeAuthorities
 const withKeys=()=>{
   const a=baseAuthorities()
   for(const site of ['support','portal']) a[site].proofKeys=[{kid:a[site].proof.kid,publicJwk:a[site].proof.publicJwk,notBefore:now-10,notAfter:now+300,revoked:false}]
   return a
 }
 const input={supportProof,receipt,challenge,supportCredential:'support-opaque',portalCredential:'portal-opaque'}
 const result=await inspectSingleDbCandidate(input,withKeys())
 assert.equal(result.decision,'DENY'); assert.equal(result.derivedUse,false)
 // Reusing verified evidence never upgrades it into a link/replay capability.
 const replay=await inspectSingleDbCandidate(input,withKeys())
 assert.equal(replay.decision,'DENY'); assert.equal(replay.derivedUse,false)
 assert.equal(result.supportDigest,p.support_digest)
 assert.equal(result.receiptDigest,b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(receipt))))
 for(const site of ['support','portal']) for(const change of [{sub:'user_other'},{active:false},{exp:now},{issuer:'https://evil.example'},{party:'https://evil.example'},{sid:null}]) {
   const authorities=withKeys(), original=authorities[site].verify
   authorities[site].verify=async credential=>({...await original(credential),...change})
   await assert.rejects(inspectSingleDbCandidate(input,authorities))
 }
 await assert.rejects(inspectSingleDbCandidate({...input,portalCredential:{sub:'user_portal'}},withKeys()))
 await assert.rejects(inspectSingleDbCandidate({...input,supportProof:supportProof+'x'},withKeys()))
 const revoked=withKeys();revoked.portal.proofKeys[0].revoked=true
 await assert.rejects(inspectSingleDbCandidate(input,revoked))
 const overlap=withKeys();overlap.portal.proofKeys.push({...overlap.support.proofKeys[0],kid:'old-support-key'})
 await assert.rejects(inspectSingleDbCandidate(input,overlap))
 const same=withKeys();same.portal=same.support
 await assert.rejects(inspectSingleDbCandidate(input,same))
 const rotated=withKeys();rotated.portal.proof={...portalConfig,kid:'revoked-or-unknown'}
 await assert.rejects(inspectSingleDbCandidate(input,rotated))
 assert.equal((await inspectReciprocalReceipt({...context,receipt})).redemption,'DENY')
 for(const change of [{iss:'https://evil.example'},{purpose:'grant'},{support_site:'portal'},{portal_site:'support'},{unexpected:true},{aud:'https://evil.example'},{support_epoch:2},{portal_epoch:0},{support_digest:newChallenge()},{support_jti:newChallenge()},{challenge:newChallenge()},{portal_sub:'user_other'},{tenant:'other'},{exp:now},{jti:support.jti},{jti:challenge},{scopes:['preferences']},{support_consent_version:'old'},{portal_consent_version:'old'}]) await assert.rejects(inspectReciprocalReceipt({...context,receipt:await sign({...p,...change})}))
 await assert.rejects(inspectReciprocalReceipt({...context,receipt,portalConfig:{...portalConfig,publicJwk:undefined}}))
 await assert.rejects(inspectReciprocalReceipt({...context,receipt:receipt.slice(0,-8)+'AAAAAAAA'}))
 await assert.rejects(inspectReciprocalReceipt({...context,receipt,portalConfig:{...portalConfig,publicJwk:supportConfig.publicJwk}}))
 await assert.rejects(inspectReciprocalReceipt({...context,receipt,portalConfig:{...portalConfig,publicJwk:{...supportConfig.publicJwk,x:supportConfig.publicJwk.x+'=',y:supportConfig.publicJwk.y+'='}}}))
 for(let i=0;i<2;i++) await assert.rejects(redeemReciprocal({...context,receipt}))
})
