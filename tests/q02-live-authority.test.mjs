import test from 'node:test'
import assert from 'node:assert/strict'
import { issueIntent, newChallenge } from '../lib/privacy/attestation.mjs'
import { authorizeLiveLink, authorityDigest, liveRequestDigest, createOnlineSessionVerifier } from '../lib/privacy/live-authority.mjs'
const b64=x=>Buffer.from(x).toString('base64url')
const payload=x=>JSON.parse(Buffer.from(x.split('.')[1],'base64url'))
async function fixture() {
 const now=Math.floor(Date.now()/1000)
 const keys=await Promise.all([0,1,2].map(()=>crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])))
 const jwks=await Promise.all(keys.map(k=>crypto.subtle.exportKey('jwk',k.publicKey)))
 const sign=async (index,typ,kid,p)=>{
  const bytes=b64(JSON.stringify({alg:'ES256',typ,kid}))+'.'+b64(JSON.stringify(p))
  return bytes+'.'+b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys[index].privateKey,new TextEncoder().encode(bytes)))
 }
 const support={enabled:true,issuer:'https://support.example',audience:'https://portal.example',site:'support',tenant:'tenant',kid:'s1',publicJwk:jwks[0],privateJwk:await crypto.subtle.exportKey('jwk',keys[0].privateKey)}
 const portal={issuer:'https://portal.example',audience:'https://support.example',site:'portal',tenant:'tenant',kid:'p1',consentVersion:'portal-v7-1',publicJwk:jwks[1]}
 const challenge=newChallenge()
 const supportProof=await issueIntent({config:support,session:{sub:'user_support',sid:'sess_support'},membership:{subject:'user_support',site:'support',tenant:'tenant'},consent:{accepted:true,disclosure:'q02-support-v1',scopes:['derived_summary','preferences'],epoch:3},nonce:challenge,store:{reserve:async()=>true},now})
 const sp=payload(supportProof)
 const receipt=await sign(1,'q02-portal-reciprocal+jwt','p1',{v:1,iss:portal.issuer,aud:portal.audience,support_sub:sp.sub,portal_sub:'user_portal',support_site:'support',portal_site:'portal',tenant:'tenant',support_epoch:3,portal_epoch:7,support_consent_version:'q02-support-v1',portal_consent_version:'portal-v7-1',scopes:sp.scopes,challenge,support_jti:sp.jti,support_digest:await authorityDigest(supportProof),jti:newChallenge(),iat:now,nbf:now,exp:now+120,purpose:'account-memory-link-reciprocal'})
 const input={supportProof,receipt,challenge,supportCredential:'opaque-support',portalCredential:'opaque-portal',serviceProof:''}
 const requestDigest=await liveRequestDigest(input)
 const servicePayload={v:1,iss:'https://service.example',aud:'https://coordinator.example',sub:'support-linker',scope:'q02:link',tenant:'tenant',request_digest:requestDigest,jti:newChallenge(),iat:now,nbf:now,exp:now+30}
 input.serviceProof=await sign(2,'q02-service+jwt','svc1',servicePayload)
 const key=(index,kid)=>({kid,publicJwk:jwks[index],notBefore:now-30,notAfter:now+300,revoked:false})
 let locked=false, committed=0
 const consumed=new Set()
 const tx={service:{issuer:servicePayload.iss,audience:servicePayload.aud,principal:servicePayload.sub,tenant:'tenant',active:true,scope:'q02:link',keys:[key(2,'svc1')]},
  reconciliation:{ready:true,generation:newChallenge(),highWater:5,local:5,portal:5},outbox:{pending:0,acknowledged:true},authorities:{},
  assertCurrent:async b=>{assert.equal(locked,true);assert.equal(b.supportEpoch,3);assert.equal(b.portalEpoch,7);assert.equal(b.portalSessionDigest,await authorityDigest('sess_portal'));return true},
  consume:async b=>{
   assert.equal(locked,true)
   const ids=[b.supportJti,b.portalJti,b.serviceJti,b.challenge]
   if(ids.some(x=>consumed.has(x))) throw Error('replay')
   ids.forEach(x=>consumed.add(x))
   return {committed:true,requestDigest:b.requestDigest,eventDigest:newChallenge(),bothAcknowledged:true}
  },
 }
 for(const [site,proof,index] of [['support',support,0],['portal',portal,1]]) tx.authorities[site]={issuer:`https://${site}-clerk.example`,party:proof.issuer,proof,proofKeys:[key(index,proof.kid)],verify:async credential=>{
  assert.equal(locked,true);assert.equal(credential,`opaque-${site}`)
  return {issuer:`https://${site}-clerk.example`,party:proof.issuer,sub:`user_${site}`,sid:`sess_${site}`,exp:now+120,active:true}
 }}
 tx.current={challenge:{value:challenge,subject:'user_portal',sessionDigest:await authorityDigest('sess_portal'),state:'pending',epoch:7,expiresAt:now+120}}
 for(const [site,epoch,version] of [['support',3,'q02-support-v1'],['portal',7,'portal-v7-1']]) tx.current[site]={site,tenant:'tenant',subject:`user_${site}`,issuer:tx.authorities[site].issuer,party:tx.authorities[site].party,membership:'active',enrolledSid:`sess_${site}`,credentialStatus:'active',issuance:true,state:'active',epoch,version,scopes:['derived_summary','preferences']}
 const adapter={protocol:'q02-locked-authority-v8',withLockedAuthority:async(digest,fn)=>{
  assert.equal(digest,requestDigest);locked=true
  const before=new Set(consumed)
  try {const value=await fn(tx);committed++;return value}
  catch(e){consumed.clear();before.forEach(x=>consumed.add(x));throw e}
  finally{locked=false}
 }}
 return {input,adapter,tx,sign,servicePayload,commits:()=>committed,consumed}
}
test('positive synthetic service authority commits with both sessions under lock; exact replay denies',async()=>{
 const f=await fixture(), result=await authorizeLiveLink(f.input,f.adapter)
 assert.equal(result.decision,'LINKED');assert.equal(result.derivedUse,false);assert.equal(f.commits(),1)
 await assert.rejects(authorizeLiveLink(f.input,f.adapter));assert.equal(f.commits(),1)
})
async function sharedIssuerFixture() {
 const f=await fixture()
 for(const site of ['support','portal']) {
  const authority=f.tx.authorities[site], original=authority.verify
  authority.issuer='https://clerk.shared.example'
  authority.verify=async credential=>({...await original(credential),issuer:authority.issuer})
  f.tx.current[site].issuer=authority.issuer
 }
 return f
}
test('shared Clerk issuer permits separately verified site parties and enrolled accounts',async()=>{
 const f=await sharedIssuerFixture()
 const result=await authorizeLiveLink(f.input,f.adapter)
 assert.equal(result.decision,'LINKED');assert.equal(f.commits(),1)
})
test('shared Clerk issuer does not permit a shared party, shared verifier or swapped credential',async()=>{
 for(const change of [
  f=>{f.tx.authorities.portal.party=f.tx.authorities.support.party},
  f=>{f.tx.authorities.portal.verify=f.tx.authorities.support.verify},
  f=>{f.input.portalCredential=f.input.supportCredential},
  f=>{delete f.tx.current.portal.enrolledSid},
 ]) {
  const f=await sharedIssuerFixture();change(f)
  await assert.rejects(authorizeLiveLink(f.input,f.adapter));assert.equal(f.commits(),0)
 }
})
const cases={
 'service revoked':f=>{f.tx.service.active=false},
 'missing service key':f=>{f.tx.service.keys=[]},
 'revoked service kid':f=>{f.tx.service.keys[0].revoked=true},
 'service shares portal key':f=>{f.tx.service.keys.push({...f.tx.authorities.portal.proofKeys[0],kid:'shared'})},
 'expired proof key':f=>{f.tx.authorities.support.proofKeys[0].notAfter=1},
 'missing issuer':f=>{delete f.tx.authorities.portal.issuer},
 'missing proof key':f=>{f.tx.authorities.portal.proofKeys=[]},
 'revoked proof key':f=>{f.tx.authorities.support.proofKeys[0].revoked=true},
 'pending outbox':f=>{f.tx.outbox.pending=1},
 'missing ACK':f=>{f.tx.outbox.acknowledged=false},
 'missing outbox':f=>{delete f.tx.outbox},
 'restore behind high water':f=>{f.tx.reconciliation.portal=4},
 'missing reconciliation':f=>{delete f.tx.reconciliation},
 'stale epoch':f=>{f.tx.current.portal.epoch=6},
 'withdrawn membership':f=>{f.tx.current.support.membership='revoked'},
 'missing credential enrollment':f=>{delete f.tx.current.support.enrolledSid},
 'withdrawn consent':f=>{f.tx.current.portal.state='withdrawn'},
 'wrong enrolled issuer':f=>{f.tx.current.support.issuer='https://evil.example'},
 'wrong session challenge':f=>{f.tx.current.challenge.sessionDigest=newChallenge()},
 'cancelled challenge':f=>{f.tx.current.challenge.state='cancelled'},
 'Clerk offline':f=>{f.tx.authorities.portal.verify=async()=>{throw Error('offline')}},
 'logged out support':f=>{f.tx.authorities.support.verify=async()=>({active:false})},
 'shared verifier':f=>{f.tx.authorities.portal.verify=f.tx.authorities.support.verify},
 'forged service proof':f=>{f.input.serviceProof+='x'},
 'forged receipt':f=>{f.input.receipt+='x'},
 'credential substitution':f=>{f.input.portalCredential='other'},
 'missing adapter':f=>{f.adapter.protocol='generic-service-role'},
 'unacknowledged commit':f=>{f.tx.consume=async b=>({committed:true,requestDigest:b.requestDigest,eventDigest:newChallenge(),bothAcknowledged:false})},
}
for(const [name,change] of Object.entries(cases)) test(`DENY ${name}`,async()=>{
 const f=await fixture();change(f);await assert.rejects(authorizeLiveLink(f.input,f.adapter),/Privacy authorization denied/);assert.equal(f.commits(),0)
})
for(const change of [{scope:'all'},{aud:'https://evil.example'},{tenant:'other'},{exp:0},{request_digest:newChallenge()}]) test(`signed service wrong binding ${Object.keys(change)[0]}`,async()=>{
 const f=await fixture();f.input.serviceProof=await f.sign(2,'q02-service+jwt','svc1',{...f.servicePayload,...change})
 await assert.rejects(authorizeLiveLink(f.input,f.adapter));assert.equal(f.commits(),0)
})
test('online Clerk verifier uses pinned endpoint, SDK key and active exact sid/sub',async()=>{
 const now=Math.floor(Date.now()/1000)
 const claims={iss:'https://clerk.example',azp:'https://support.example',sub:'user_test',sid:'sess_test',exp:now+90,iat:now-1,nbf:now-1}
 const session={id:'sess_test',user_id:'user_test',status:'active',expire_at:now+80}
 const config={issuer:claims.iss,party:claims.azp,jwtKey:'synthetic-only',backendKey:'synthetic-only',verifyToken:async(token,opts)=>{assert.equal(token,'opaque');assert.deepEqual(opts.authorizedParties,[claims.azp]);return claims},fetchImpl:async(url,opts)=>{assert.equal(url,'https://api.clerk.com/v1/sessions/sess_test');assert.equal(opts.redirect,'error');assert.equal(opts.cache,'no-store');return {ok:true,json:async()=>session}}}
 assert.equal((await createOnlineSessionVerifier(config)('opaque')).active,true)
 for(const change of [{status:'revoked'},{user_id:'user_other'},{id:'sess_other'},{expire_at:0}]) {
  await assert.rejects(createOnlineSessionVerifier({...config,fetchImpl:async()=>({ok:true,json:async()=>({...session,...change})})})('opaque'))
 }
 for(const change of [{iss:'https://evil.example'},{azp:'https://portal.example'},{sid:'bad'},{exp:now},{nbf:now+10}]) await assert.rejects(createOnlineSessionVerifier({...config,verifyToken:async()=>({...claims,...change})})('opaque'))
 await assert.rejects(createOnlineSessionVerifier({...config,backendKey:''})('opaque'))
 await assert.rejects(createOnlineSessionVerifier({...config,fetchImpl:async()=>{throw Error('offline')}})('opaque'))
})

test('production routes construct dedicated authority while legacy candidate remains revoked',async()=>{
 const {readFile}=await import('node:fs/promises')
 const runtime=await readFile(new URL('../lib/privacy/runtime.ts',import.meta.url),'utf8')
 const link=await readFile(new URL('../lib/privacy/link-runtime.mjs',import.meta.url),'utf8')
 const sql=await readFile(new URL('../supabase/migrations/018_q02_single_postgres_candidate.sql',import.meta.url),'utf8')
 assert.match(runtime,/createLinkRuntime/)
 assert.match(link,/createOnlineSessionVerifier/)
 assert.match(link,/createSiteAuthority/)
 assert.match(link,/createCheckpointCoordinator/)
 assert.doesNotMatch(runtime+link,/SIGNING_ENROLLED|SupabaseAdmin/)
 assert.match(sql,/revoke all on function public\.support_q02_atomic_candidate\(jsonb\) from public,anon,authenticated,service_role/)
})
