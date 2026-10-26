import test from 'node:test'
import assert from 'node:assert/strict'
import { issueIntent,newChallenge } from '../lib/privacy/attestation.mjs'
import { inspectReciprocalReceipt,redeemReciprocal } from '../lib/privacy/reciprocal.mjs'
import { prepareReciprocal, createCoordinatorJournal } from '../lib/privacy/coordinator.mjs'
const b64=x=>Buffer.from(x).toString('base64url')
test('two independently signed immutable subjects bind exact digest, epochs and challenge; still DENY',async()=>{
 const keys=await Promise.all([0,1].map(()=>crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])))
 const supportConfig={enabled:true,issuer:'https://support.example',audience:'https://portal.example',site:'support',tenant:'isolated',kid:'s1',privateJwk:await crypto.subtle.exportKey('jwk',keys[0].privateKey),publicJwk:await crypto.subtle.exportKey('jwk',keys[0].publicKey)}
 const portalConfig={issuer:'https://portal.example',audience:'https://support.example',site:'portal',kid:'p1',consentVersion:'portal-v7-1',publicJwk:await crypto.subtle.exportKey('jwk',keys[1].publicKey)}
 const challenge=newChallenge(), now=1800000000
 const supportProof=await issueIntent({config:supportConfig,session:{sub:'user_support',sid:'sess_support'},membership:{subject:'user_support',site:'support',tenant:'isolated'},consent:{accepted:true,disclosure:'q02-support-v1',scopes:['derived_summary','preferences'],epoch:3},nonce:challenge,store:{reserve:async()=>true},now})
 const support=JSON.parse(Buffer.from(supportProof.split('.')[1],'base64url'))
 const p={v:1,iss:portalConfig.issuer,aud:portalConfig.audience,support_sub:support.sub,portal_sub:'user_portal',support_site:'support',portal_site:'portal',tenant:'isolated',support_epoch:3,portal_epoch:7,support_consent_version:'q02-support-v1',portal_consent_version:'portal-v7-1',scopes:['derived_summary','preferences'],challenge,support_jti:support.jti,support_digest:b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(supportProof))),jti:newChallenge(),iat:now,nbf:now,exp:now+120,purpose:'account-memory-link-reciprocal'}
 async function sign(payload) {
  const input=b64(JSON.stringify({alg:'ES256',typ:'q02-portal-reciprocal+jwt',kid:'p1'}))+'.'+b64(JSON.stringify(payload))
  return input+'.'+b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys[1].privateKey,new TextEncoder().encode(input)))
 }
 const context={supportProof,supportConfig,portalConfig,challenge,portalSubject:'user_portal',now}
 const receipt=await sign(p)
 const session={sub:'user_support',sid:'sess_support',exp:now+120}
 let calls=0
 const journal=createCoordinatorJournal({rpc:async(name,args)=>{
  calls++; assert.equal(name,'support_q02_coordinate'); assert.equal(args.p_action,'deny')
  assert.equal(args.p_bindings.support_sub,session.sub); assert.equal(args.p_bindings.receipt_jti,p.jti)
  assert.equal(args.p_digest.length,43); assert.ok(!JSON.stringify(args).includes(receipt))
  return {data:{decision:'DENY',derivedUse:false}}
 }})
 assert.equal((await prepareReciprocal({...context,receipt,session},journal)).decision,'DENY')
 assert.equal(calls,1)
 assert.equal((await prepareReciprocal({...context,receipt,session:{...session,sub:'user_other'}},journal)).decision,'DENY')
 assert.equal(calls,1)
 for(const rpc of [async()=>({data:{decision:'COMMIT',derivedUse:true}}),async()=>{throw Error('outage')}]) assert.equal((await prepareReciprocal({...context,receipt,session},createCoordinatorJournal({rpc}))).decision,'DENY')
 assert.equal((await inspectReciprocalReceipt({...context,receipt})).redemption,'DENY')
 for(const change of [{aud:'https://evil.example'},{support_epoch:2},{portal_epoch:0},{support_digest:newChallenge()},{support_jti:newChallenge()},{challenge:newChallenge()},{portal_sub:'user_other'},{tenant:'other'},{exp:now},{jti:support.jti},{jti:challenge},{scopes:['preferences']},{support_consent_version:'old'},{portal_consent_version:'old'}]) await assert.rejects(inspectReciprocalReceipt({...context,receipt:await sign({...p,...change})}))
 await assert.rejects(inspectReciprocalReceipt({...context,receipt,portalConfig:{...portalConfig,publicJwk:undefined}}))
 await assert.rejects(inspectReciprocalReceipt({...context,receipt:receipt.slice(0,-8)+'AAAAAAAA'}))
 await assert.rejects(inspectReciprocalReceipt({...context,receipt,portalConfig:{...portalConfig,publicJwk:supportConfig.publicJwk}}))
 await assert.rejects(inspectReciprocalReceipt({...context,receipt,portalConfig:{...portalConfig,publicJwk:{...supportConfig.publicJwk,x:supportConfig.publicJwk.x+'=',y:supportConfig.publicJwk.y+'='}}}))
 for(let i=0;i<2;i++) await assert.rejects(redeemReciprocal({...context,receipt}))
})
