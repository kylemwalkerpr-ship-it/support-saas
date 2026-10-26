import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { currentSigner, signWire, verifyWire, boundedLinkJson } from '../lib/privacy/link-wire.mjs'
import { createSiteAuthority } from '../lib/privacy/site-authority.mjs'
import { handleLinkRequest } from '../lib/privacy/link-api.mjs'
const pair=async()=>{const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {privateJwk:await crypto.subtle.exportKey('jwk',key.privateKey),publicJwk:await crypto.subtle.exportKey('jwk',key.publicKey)}}
async function fixture(){
 const key=await pair(), now=Math.floor(Date.now()/1000)
 const manifest={proofKeys:[{kid:'site1',publicJwk:key.publicJwk,revoked:false,notBefore:now-30,notAfter:now+300}]}
 const descriptor={v:1,tenant:'tenant',site:'support',subject:'user_support',sessionDigest:'s'.repeat(43),requestDigest:'r'.repeat(43),sequence:1,eventDigest:'e'.repeat(43),generation:'g'.repeat(43),headDigest:'e'.repeat(43),supportEpoch:1,portalEpoch:1,nonce:'n'.repeat(43),exp:now+30}
 return {key,manifest,descriptor,token:await signWire('q02-event-ack+jwt','site1',descriptor,key.privateJwk)}
}
test('real signing capability must match registered current DB signer',async()=>{
 const f=await fixture();await currentSigner(f.manifest,f.key.privateJwk,'site1')
 await assert.rejects(currentSigner(f.manifest,(await pair()).privateJwk,'site1'))
 for(const entry of [{revoked:true},{notBefore:Math.floor(Date.now()/1000)+1},{notAfter:Math.floor(Date.now()/1000)+20}]) await assert.rejects(currentSigner({proofKeys:[{...f.manifest.proofKeys[0],...entry}]},f.key.privateJwk,'site1'))
 await assert.rejects(currentSigner({proofKeys:[]},f.key.privateJwk,'site1'))
})
test('ACK signature verifies only exact committed descriptor and current pinned key',async()=>{
 const f=await fixture();assert.deepEqual(await verifyWire(f.token,'q02-event-ack+jwt',f.manifest,f.descriptor),f.descriptor)
 for(const field of Object.keys(f.descriptor)) {
  const changed={...f.descriptor,[field]:typeof f.descriptor[field]==='number'?f.descriptor[field]+1:f.descriptor[field]+'x'}
  await assert.rejects(verifyWire(f.token,'q02-event-ack+jwt',f.manifest,changed),field)
 }
 await assert.rejects(verifyWire(f.token,'q02-event-ack+jwt',{proofKeys:[{...f.manifest.proofKeys[0],revoked:true}]},f.descriptor))
 await assert.rejects(verifyWire(f.token+'A','q02-event-ack+jwt',f.manifest,f.descriptor))
})
test('stream byte bound enforced without trusting Content-Length',async()=>{
 const req=new Request('https://support.example',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'x'.repeat(65536)})})
 await assert.rejects(boundedLinkJson(req))
 const invalid=new Request('https://support.example',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})
 await assert.rejects(boundedLinkJson(invalid))
})
test('fixed origin, fetch metadata, unknown keys and anonymous request cannot reach authority',async()=>{
 let calls=0
 const runtime={origin:'https://support.example',credential:()=>null,authority:{withSession:()=>{calls++;throw Error()}}}
 for(const [origin,site,body] of [['https://evil.example','same-origin',{}],['https://support.example','cross-site',{}],['https://support.example','same-origin',{subject:'user_fake'}],['https://support.example','same-origin',{}]]){
  const req=new Request('https://attacker-host.example',{method:'POST',headers:{origin,'sec-fetch-site':site,'content-type':'application/json'},body:JSON.stringify(body)})
  assert.equal((await handleLinkRequest(req,'withdraw',runtime)).status,403)
 }
 assert.equal(calls,0)
})
test('dedicated DB login identity is checked and mismatched login never enrolls',async()=>{
 let commands=[],ended=false
 const client={connect:async()=>{},query:async sql=>{commands.push(sql);return {rows:[{login:'service_role',role:'service_role'}]}},end:async()=>{ended=true}}
 const authority=createSiteAuthority({site:'support',tenant:'tenant',connectionString:'postgres://q02_support_runtime@db.test/db?sslmode=verify-full',verify:async()=>({sub:'user_s',sid:'sess_s',issuer:'https://issuer.example',party:'https://support.example',exp:Math.floor(Date.now()/1000)+100,active:true}),connect:()=>client})
 await assert.rejects(authority.withSession('opaque',()=>assert.fail()))
 assert.equal(commands.length,1);assert.equal(ended,true)
 assert.throws(()=>createSiteAuthority({site:'support',tenant:'tenant',connectionString:'postgres://db.test/db?sslmode=require',verify:()=>{}}))
})
test('site adapter rolls back failed live verification after enrollment under fence',async()=>{
 let count=0;const commands=[]
 const client={connect:async()=>{},query:async sql=>{commands.push(sql);return sql.includes('session_user')?{rows:[{login:'q02_support_runtime',role:'q02_support_runtime'}]}:sql.includes('enroll_session')?{rows:[{enrolled:true}]}:{rows:[],command:'COMMIT'}},end:async()=>{}}
 const authority=createSiteAuthority({site:'support',tenant:'tenant',connectionString:'postgres://db.test/db?sslmode=verify-full',verify:async()=>{if(count++)throw Error('revoked');return {sub:'user_s',sid:'sess_s',issuer:'https://issuer.example',party:'https://support.example',exp:Math.floor(Date.now()/1000)+100,active:true}},connect:()=>client})
 await assert.rejects(authority.withSession('opaque',()=>assert.fail()))
 assert.equal(commands.at(-1),'ROLLBACK');assert.equal(commands.includes('COMMIT'),false)
})
test('pinned Portal/Support runtime contract matches, with strict cross-repo comparison when available',async()=>{
  const pins=JSON.parse(await readFile(new URL('./fixtures/q02-portal-source-pins.json',import.meta.url),'utf8'))
  assert.equal(pins.schema,'yqaa.q02.cross-repo-source-pins.v1')
  const explicitRoot=process.env.YQAA_PORTAL_ROOT
  const candidate=explicitRoot?pathToFileURL(resolve(explicitRoot)+'/'):new URL('../../portal/',import.meta.url)
  const hasPortal=existsSync(fileURLToPath(candidate))
  if(explicitRoot) assert.ok(hasPortal,'YQAA_PORTAL_ROOT must name an existing Portal checkout')
  for(const [name,expectedHash] of Object.entries(pins.runtime_files)) {
    const support=await readFile(new URL('../lib/privacy/'+name+'.mjs',import.meta.url))
    assert.equal(createHash('sha256').update(support).digest('hex'),expectedHash,name+' pinned Portal sha')
    if(hasPortal) assert.deepEqual(support,await readFile(new URL('lib/q02/runtime/'+name+'.mjs',candidate)),name+' live Portal sibling')
  }
  const supportRuntime=await readFile(new URL('../lib/privacy/runtime.ts',import.meta.url),'utf8')
  assert.doesNotMatch(supportRuntime,/SupabaseAdmin|service_role|SIGNING_PRIVATE_KEY/)
  if(hasPortal) {
    const portalRoute=await readFile(new URL('app/api/privacy/reciprocal/route.ts',candidate))
    assert.equal(createHash('sha256').update(portalRoute).digest('hex'),pins.reciprocal_route_sha256)
    assert.doesNotMatch(portalRoute.toString('utf8'),/SupabaseAdmin|service_role|SIGNING_PRIVATE_KEY/)
  }
})

test('positive request handlers: both opt-ins -> intent -> receipt -> stage -> two signed ACKs -> consume',async()=>{
 const {linkFixture}=await import('./helpers/q02-link-fixture.mjs')
 const {authorityDigest}=await import('../lib/privacy/live-authority.mjs')
 const {newChallenge}=await import('../lib/privacy/attestation.mjs')
 const f=await linkFixture(),consents={},tickets={},acks=new Set(),intents=new Set(),generation=newChallenge(),eventDigest=newChallenge()
 let challenge,stageBinding,linked=false
 const context=site=>({...f.records[site],site,tenant:f.tenant,subject:'user_'+site,peer:f.records[site==='support'?'portal':'support'],service:f.service,consent:consents[site]??{epoch:0,active:false,version:site==='support'?'q02-support-v1':'portal-v7-1',scopes:[]}})
 const runtimes={}
 const coordinator={withLockedAuthority:async({input,phase,callback})=>{
  if(linked) throw Error('replay')
  const current={}
  for(const site of ['support','portal']){
   const s=await f.sessions[site].verify(input[site+'Credential']),c=context(site).consent,a=f.records[site]
   current[site]={site,tenant:f.tenant,subject:s.sub,issuer:a.issuer,party:a.party,membership:'active',enrolledSid:s.sid,credentialStatus:'active',issuance:true,state:c.active?'active':'withdrawn',epoch:c.epoch,version:c.version,scopes:c.scopes}
  }
  current.challenge={value:challenge,subject:'user_portal',sessionDigest:await authorityDigest('sess_portal'),state:'pending',epoch:consents.portal.epoch,expiresAt:Math.floor(Date.now()/1000)+100}
  const tx={service:f.service,authorities:Object.fromEntries(['support','portal'].map(s=>[s,{...f.records[s],verify:f.sessions[s].verify}])),current,reconciliation:{ready:true,generation,highWater:1,local:1,portal:1},outbox:{pending:2-acks.size,acknowledged:acks.size===2},
   assertCurrent:async b=>intents.has(b.supportJti) && (phase==='stage'||JSON.stringify(b)===JSON.stringify(stageBinding)),
   stage:async b=>{stageBinding=b;return {staged:true,requestDigest:b.requestDigest,eventDigest,sequence:1}},
   consume:async b=>{assert.equal(acks.size,2);linked=true;return {committed:true,requestDigest:b.requestDigest,eventDigest,bothAcknowledged:true}},
  }
  return callback(tx)
 }}
 for(const site of ['support','portal']) {
  const authority={withSession:async(credential,callback)=>{
   const session=await f.sessions[site].verify(credential)
   const tx={session,credential,
    command:async p=>{
     if(p.action==='review')return context(site)
     if(p.action==='grant'){consents[site]={epoch:1,active:true,version:p.version,scopes:p.scopes};return {epoch:1}}
     if(p.action==='reserve'){intents.add(p.jti);return {epoch:1}}
     if(p.action==='challenge')return {epoch:1}
     throw Error('unexpected command')
    },
    reserveReceipt:async()=>true,
    receipt:async c=>{assert.equal(c,challenge);return {...context(site),challengeExpiresAt:Math.floor(Date.now()/1000)+100}},
    event:async rd=>{
     assert.equal(rd,stageBinding.requestDigest)
     tickets[site]??={v:1,tenant:f.tenant,site,subject:session.sub,sessionDigest:await authorityDigest(session.sid),requestDigest:rd,sequence:1,eventDigest,generation,headDigest:eventDigest,supportEpoch:1,portalEpoch:1,nonce:newChallenge(),exp:stageBinding.expiresAt}
     return {...context(site),descriptor:tickets[site],peerDescriptor:tickets[site==='support'?'portal':'support']??null}
    },
    ack:async(own,peer)=>{assert.deepEqual(own,tickets[site]);assert.deepEqual(peer,tickets[site==='support'?'portal':'support']);acks.add(site);return {acknowledged:true,site,eventDigest}},
   }
   return callback(tx)
  }}
  runtimes[site]={site,tenant:f.tenant,origin:f.parties[site],peerOrigin:f.parties[site==='support'?'portal':'support'],kid:f.keys[site].kid,privateJwk:f.keys[site].privateJwk,servicePrivateJwk:f.keys.service.privateJwk,serviceKid:f.keys.service.kid,authority,coordinator,sessions:f.sessions,verify:f.sessions[site].verify,peerVerify:f.sessions[site==='support'?'portal':'support'].verify,credential:()=>f.credentials[site]}
 }
 const call=async(site,action,body={},status=200)=>{
  const req=new Request(f.parties[site]+'/api/test',{method:action==='review'?'GET':'POST',headers:{origin:f.parties[site],'content-type':'application/json'},...(action==='review'?{}:{body:JSON.stringify(body)})})
  const res=await handleLinkRequest(req,action,runtimes[site]),data=await res.json();assert.equal(res.status,status,site+' '+action+' '+JSON.stringify(data));return data
 }
 for(const site of ['support','portal']){
  assert.equal((await call(site,'review')).available,true)
  await call(site,'grant',{accepted:true,disclosure:site==='support'?'q02-support-v1':'portal-v7-1',scopes:['derived_summary','preferences']})
 }
 challenge=(await call('portal','challenge',{expectedEpoch:1})).challenge
 const intent=await call('support','issue',{accepted:true,disclosure:'q02-support-v1',scopes:['derived_summary','preferences'],nonce:challenge})
 const receipt=await call('portal','receipt',{supportProof:intent.proof,challenge})
 const staged=await call('support','stage',{supportProof:intent.proof,receipt:receipt.receipt,challenge,portalCredential:receipt.portalCredential})
 assert.equal(staged.decision,'STAGED');await call('support','consume',staged.continuation,403)
 const own=(await call('support','event',{requestDigest:staged.requestDigest})).ack,peer=(await call('portal','event',{requestDigest:staged.requestDigest})).ack
 await call('support','ack',{requestDigest:staged.requestDigest,ownAck:own,peerAck:peer+'A',peerCredential:f.credentials.portal},403)
 assert.equal(acks.size,0)
 await call('portal','ack',{requestDigest:staged.requestDigest,ownAck:peer,peerAck:own,peerCredential:f.credentials.support})
 await call('support','consume',staged.continuation,403)
 await call('support','ack',{requestDigest:staged.requestDigest,ownAck:own,peerAck:peer,peerCredential:f.credentials.portal})
 const result=await call('support','consume',staged.continuation)
 assert.equal(result.decision,'LINKED');assert.equal(result.derivedUse,false)
 await call('support','consume',staged.continuation,403)
})
test('live session millisecond expiry is normalized before enrollment and expired backend sessions deny',async()=>{
 const {createOnlineSessionVerifier}=await import('../lib/privacy/live-authority.mjs')
 const now=Math.floor(Date.now()/1000),claims={iss:'https://clerk.example',azp:'https://support.example',sub:'user_support',sid:'sess_support',iat:now,nbf:now,exp:now+60}
 for(const milliseconds of [true,false]) {
  const verifier=expiry=>createOnlineSessionVerifier({issuer:claims.iss,party:claims.azp,jwtKey:'synthetic',backendKey:'synthetic',verifyToken:async()=>claims,fetchImpl:async()=>Response.json({id:claims.sid,user_id:claims.sub,status:'active',expire_at:expiry*(milliseconds?1000:1)})})
  assert.equal((await verifier(now+30)('opaque')).exp,now+30)
  await assert.rejects(verifier(now-1)('opaque'))
 }
})
test('duplicate request properties and ambiguous JSON encodings reject before effects',async()=>{
 for(const body of ['{"accepted":false,"accepted":true}',' {"accepted":true}','{"value":1e0}']) {
  await assert.rejects(boundedLinkJson(new Request('https://support.example',{method:'POST',headers:{'content-type':'application/json'},body})))
 }
})
test('unsafe commit result rolls enrollment and callback effects back rather than returning success',async()=>{
 const commands=[],session={sub:'user_s',sid:'sess_s',issuer:'https://issuer.example',party:'https://support.example',exp:Math.floor(Date.now()/1000)+100,active:true}
 const client={connect:async()=>{},query:async sql=>{commands.push(sql);return sql.includes('session_user')?{rows:[{login:'q02_support_runtime',role:'q02_support_runtime'}]}:sql.includes('enroll_session')?{rows:[{enrolled:true}]}:{rows:[],command:'ROLLBACK'}},end:async()=>{}}
 const authority=createSiteAuthority({site:'support',tenant:'tenant',connectionString:'postgres://db.test/db?sslmode=verify-full',verify:async()=>session,connect:()=>client})
 await assert.rejects(authority.withSession('opaque',async()=>({success:true})))
 assert.equal(commands.at(-1),'ROLLBACK');assert.equal(commands.at(-2),'COMMIT')
})
