// Synthetic keys and identities only. Never connects to Clerk or production.
import assert from 'node:assert/strict'
import { newChallenge } from '../../lib/privacy/attestation.mjs'
import { createOnlineSessionVerifier, authorityDigest } from '../../lib/privacy/live-authority.mjs'
import { signWire } from '../../lib/privacy/link-wire.mjs'
export async function linkFixture() {
 const now=Math.floor(Date.now()/1000),tenant='route_fixture',issuer='https://shared.synthetic.clerk.example'
 const parties={support:'https://support.yousafeconsultancy.com',portal:'https://portal.yousafeconsultancy.com'}
 const keys={}
 for(const name of ['support','portal','service','checkpoint']) {
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
  keys[name]={kid:name+'1',publicJwk:await crypto.subtle.exportKey('jwk',pair.publicKey),privateJwk:await crypto.subtle.exportKey('jwk',pair.privateKey)}
 }
 const entry=name=>({kid:keys[name].kid,publicJwk:keys[name].publicJwk,revoked:false,notBefore:now-30,notAfter:now+3600})
 const service={issuer:'https://service.synthetic.example',audience:'https://coordinator.synthetic.example',principal:'link-service',tenant,scope:'q02:link',active:true,keys:[entry('service')]}
 const records={}
 for(const site of ['support','portal']) records[site]={issuer,party:parties[site],proof:{enabled:true,issuer:parties[site],audience:parties[site==='support'?'portal':'support'],site,tenant,kid:keys[site].kid,publicJwk:keys[site].publicJwk,...(site==='portal'?{consentVersion:'portal-v7-1'}:{})},proofKeys:[entry(site)]}
 const rsa=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify'])
 const credentials={},sessions={},active={support:true,portal:true}, b64=x=>Buffer.from(x).toString('base64url')
 const verifyToken=async token=>{const [a,b,s]=token.split('.');assert.equal(JSON.parse(Buffer.from(a,'base64url')).alg,'RS256');assert(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',rsa.publicKey,Buffer.from(s,'base64url'),new TextEncoder().encode(a+'.'+b)));return JSON.parse(Buffer.from(b,'base64url'))}
 for(const site of ['support','portal']) {
  const claims={iss:issuer,azp:parties[site],sub:'user_'+site,sid:'sess_'+site,iat:now,nbf:now,exp:now+600}
  const bytes=b64(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+b64(JSON.stringify(claims))
  credentials[site]=bytes+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',rsa.privateKey,new TextEncoder().encode(bytes)))
  sessions[site]={issuer,party:parties[site],verify:createOnlineSessionVerifier({issuer,party:parties[site],jwtKey:'synthetic',backendKey:'synthetic',verifyToken,fetchImpl:async(url,options)=>{
   assert.equal(url,'https://api.clerk.com/v1/sessions/sess_'+site);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store')
   return Response.json({id:claims.sid,user_id:claims.sub,status:active[site]?'active':'revoked',expire_at:now+600})
  }})}
 }
 const generation=newChallenge(),genesis=newChallenge()
 let head={generation,highWater:0,headDigest:genesis}
 const trust={...entry('checkpoint'),issuer:'https://checkpoint.synthetic.example',audience:'https://coordinator.synthetic.example'}
 const proof=async(tenant,nonce)=>({proof:await signWire('q02-checkpoint+jwt',trust.kid,{v:1,iss:trust.issuer,aud:trust.audience,tenant,nonce,...head,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+10},keys.checkpoint.privateJwk)})
 // Signed synthetic checkpoint fixture; actual workerd DO restart/CAS/signature
 // acceptance is deliberately separate in q02-checkpoint-miniflare.test.mjs.
 const binding={getByName:t=>({read:(tenant,nonce)=>{assert.equal(t,tenant);return proof(tenant,nonce)},append:async(tenant,nonce,expected,event)=>{
  assert.deepEqual(expected,head);assert.equal(event.generation,head.generation);assert.equal(event.sequence,head.highWater+1);assert.equal(event.previousDigest,head.headDigest);assert.equal(await authorityDigest(event.preimage),event.digest)
  head={generation,highWater:event.sequence,headDigest:event.digest};return proof(tenant,nonce)
 }})}
 return {tenant,issuer,parties,keys,records,service,credentials,sessions,active,generation,genesis,trust,binding}
}
