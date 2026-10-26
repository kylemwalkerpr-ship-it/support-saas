// HOST ONLY: disposable TLS/SCRAM PostgreSQL acceptance for 019/020 and the exact
// Portal pair migrations. Never accepts a database URL or connects externally.
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import pg from 'pg'
import { createHash, randomBytes } from 'node:crypto'

import { linkFixture } from '../tests/helpers/q02-link-fixture.mjs'
import { handleLinkRequest } from '../lib/privacy/link-api.mjs'
import { createSiteAuthority } from '../lib/privacy/site-authority.mjs'
import { createCheckpointCoordinator } from '../lib/privacy/checkpoint-coordinator.mjs'
import { payload } from '../lib/privacy/link-wire.mjs'

// Test the actual sibling Q02 Portal branch, never an archived OpenHands worktree.
const portal = process.env.Q02_PORTAL_MIGRATIONS
  ? resolve(process.env.Q02_PORTAL_MIGRATIONS)
  : fileURLToPath(new URL('../../portal/supabase/migrations/', import.meta.url))
const root = mkdtempSync(join(tmpdir(), 'q02-link-routes-pg-'))
const data = join(root, 'data'), socket = join(root, 'socket')
mkdirSync(socket)
const port = '55443'
let started = false, passed = 0
function cmd(name, args) {
  const r = spawnSync(name, args, { encoding: 'utf8', env: { ...process.env, PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c plpgsql.variable_conflict=error' } })
  if (r.error || r.status !== 0) throw Error(`${name} failed: ${r.error?.message || r.stderr || r.stdout}`)
  return r.stdout
}
const psql = ['-X','-q','-h',socket,'-p',port,'-U','q02_runner','-d','postgres','-v','ON_ERROR_STOP=1','-At']
const sql = text => cmd('psql',[...psql,'-c',text])
const migration = path => sql(readFileSync(path,'utf8'))
const check = (label, fn) => { fn(); console.log(`ok ${++passed} - ${label}`) }
try {
  cmd('initdb',['-D',data,'-U','q02_runner','-A','trust','--no-locale'])
  cmd('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(root,'server.key'),'-out',join(root,'server.crt'),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-days','1'])
  chmodSync(join(root,'server.key'),0o600)
  writeFileSync(join(data,'pg_hba.conf'), 'hostssl all q02_support_runtime,q02_portal_runtime,q02_coordinator_runtime 127.0.0.1/32 scram-sha-256\nhostnossl all q02_support_runtime,q02_portal_runtime,q02_coordinator_runtime 127.0.0.1/32 reject\n'+readFileSync(join(data,'pg_hba.conf'),'utf8'))
  cmd('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-o',`-k ${socket} -p ${port} -c listen_addresses='127.0.0.1' -c ssl=on -c ssl_cert_file='${join(root,'server.crt')}' -c ssl_key_file='${join(root,'server.key')}' -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,'-w','start'])
  started = true
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
    create table public.profiles(id uuid primary key,role text,clerk_user_id text default 'fixture_clerk',status text default 'active');
    create table public.conversations(id uuid primary key,participant_a uuid,participant_b uuid,metadata jsonb default '{}',updated_at timestamptz);
    create table public.conversation_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid,sender_id uuid,type text,body text,metadata jsonb,created_at timestamptz default clock_timestamp(),ref_offer_id uuid,ref_inquiry_id uuid);
    create table public.offers(id uuid primary key default gen_random_uuid(),chat_id uuid,sender_id uuid,sender_type text,recipient_id uuid,title text,description text,price integer,currency text,delivery_days integer,revisions integer,expires_at timestamptz,gig_id uuid,status text default 'pending');
    create table public.inquiries(id uuid,client_profile_id uuid,target_attorney_profile_id uuid);
    create table public.gigs(id uuid,provider_id uuid,status text);
    create table public.inquiry_messages(inquiry_id uuid,sender_role text,sender_profile_id uuid,body text);
    create table public.admin_audit_log(admin_id uuid,action_type text,target_table text,target_id uuid,payload_snapshot jsonb,reason text);`)

  for (const f of ['20261013120000_yqaa_offer_idempotency.sql','20261016090000_yqaa_privacy_lifecycle.sql','20261016100000_yqaa_memory_facts.sql','20261016110000_yqaa_portal_reciprocal.sql']) migration(join(portal,f))
  for (const f of ['014_q02_support_privacy_contract.sql','015_q02_support_privacy_review.sql','016_q02_support_membership.sql','017_q02_support_coordinator_denial.sql','018_q02_single_postgres_candidate.sql']) migration(new URL(`../supabase/migrations/${f}`,import.meta.url).pathname)
  migration(new URL('../supabase/migrations/019_q02_runtime_authority.sql',import.meta.url).pathname)
  migration(new URL('../supabase/migrations/020_q02_link_routes.sql',import.meta.url).pathname)
  // Native grant/default-ACL regression must pass before synthetic enrollment.
  migration(new URL('../tests/q02-runtime-grants.native.sql',import.meta.url).pathname)
  const f=await linkFixture(),quote=v=>"'"+String(v).replaceAll("'","''")+"'",json=v=>quote(JSON.stringify(v))+'::jsonb'
  const hash=v=>createHash('sha256').update(v).digest('base64url')
  sql(`insert into q02_runtime.tenants values(${quote(f.tenant)},${quote(f.generation)},0,${quote(f.genesis)},${quote(f.genesis)});
   insert into public.support_privacy_deployments(site,tenant,issuance) values('support',${quote(f.tenant)},true);
   insert into public.q02_portal_deployments values('portal',${quote(f.tenant)},'support',${quote(f.issuer)},${quote(f.parties.portal)},true);`)
  for(const site of ['support','portal']) {
   const a=f.records[site]
   sql(`insert into q02_runtime.sites values(${quote(f.tenant)},${quote(site)},${quote(a.issuer)},${quote(a.party)},${json(a.proof)},${json(a.proofKeys)},true,'SYNTHETIC DBA registration');`)
   if(site==='support') sql(`insert into public.support_privacy_memberships(site,tenant,subject,status,enrollment_reference) values('support',${quote(f.tenant)},'user_support','active','SYNTHETIC exact subject');`)
   else sql(`insert into public.q02_portal_memberships values('portal',${quote(f.tenant)},'user_portal','active','SYNTHETIC exact subject');`)
  }
  sql(`insert into q02_runtime.services values(${quote(f.tenant)},${json(f.service)},null,'SYNTHETIC disjoint service');`)
  // Disposable SCRAM credentials, never logged; exact production adapters use
  // verify-full TLS and a generated test CA, not an injected socket connection.
  const urls={}
  for(const role of ['q02_support_runtime','q02_portal_runtime','q02_coordinator_runtime']) {
   const password=randomBytes(24).toString('base64url')
   sql(`set password_encryption='scram-sha-256';alter role ${role} password ${quote(password)};`)
   const url=new URL(`postgres://${role}:${password}@127.0.0.1:${port}/postgres`)
   url.searchParams.set('sslmode','verify-full');url.searchParams.set('sslrootcert',join(root,'server.crt'));urls[role]=url.href
  }
  const coordinator=createCheckpointCoordinator({binding:f.binding,trust:f.trust,connectionString:urls.q02_coordinator_runtime})
  const runtimes={}
  for(const site of ['support','portal']) runtimes[site]={site,tenant:f.tenant,origin:f.parties[site],peerOrigin:f.parties[site==='support'?'portal':'support'],kid:f.keys[site].kid,privateJwk:f.keys[site].privateJwk,
   serviceKid:f.keys.service.kid,servicePrivateJwk:f.keys.service.privateJwk,coordinator,sessions:f.sessions,verify:f.sessions[site].verify,peerVerify:f.sessions[site==='support'?'portal':'support'].verify,
   credential:req=>req.headers.get('cookie')?.split('__session=')[1],authority:createSiteAuthority({site,tenant:f.tenant,connectionString:urls['q02_'+site+'_runtime'],verify:f.sessions[site].verify})}
  const call=async(site,action,body={},status=200)=>{
   const req=new Request(f.parties[site]+'/api/privacy/test',{method:action==='review'?'GET':'POST',headers:{cookie:'__session='+f.credentials[site],origin:f.parties[site],'sec-fetch-site':'same-origin','content-type':'application/json'},...(action==='review'?{}:{body:JSON.stringify(body)})})
   const res=await handleLinkRequest(req,action,runtimes[site]),data=await res.json()
   assert.equal(res.status,status,site+' '+action+' '+JSON.stringify(data));assert.equal(res.headers.get('cache-control'),'no-store, private');return data
  }
  async function step(label,fn){await fn();console.log(`ok ${++passed} - ${label}`)}
  await step('three actual scoped SCRAM logins use verify-full TLS and retain their literal role',async()=>{
   for(const role of Object.keys(urls)) {
    const c=new pg.Client({connectionString:urls[role]});await c.connect()
    try {const r=await c.query('select session_user::text as login,current_user::text as role,(select ssl from pg_stat_ssl where pid=pg_backend_pid()) as tls');assert.deepEqual(r.rows,[{login:role,role,tls:true}])}finally{await c.end()}
   }
  })
  await step('SQL020 dedicated grants exclude browser, admin RPC and coordinator enrollment/ACK',async()=>{
   for(const role of ['anon','authenticated','service_role','q02_coordinator_runtime']) for(const sig of ['enroll_session(text,text,text,text,text,bigint)','site_command(text,text,text,jsonb)','record_signed_ack(text,text,text,jsonb,jsonb)']) assert.equal(sql(`select has_function_privilege('${role}','q02_runtime.${sig}','execute')`).trim(),'f')
   for(const role of ['anon','authenticated','service_role','q02_support_runtime','q02_coordinator_runtime']) assert.equal(sql(`select has_function_privilege('${role}','q02_runtime.reserve_receipt(text,text,text,jsonb)','execute')`).trim(),'f')
   for(const role of ['q02_support_runtime','q02_portal_runtime']) assert.equal(sql(`select has_function_privilege('${role}','q02_runtime.ack(text,bigint,text,text,text)','execute')`).trim(),'f')
   assert.equal(sql('select count(*) from q02_runtime.credentials').trim(),'0')
  })
  await step('actual dedicated logins enroll only exact live subject/session and report real signer readiness',async()=>{
   for(const site of ['support','portal']) assert.equal((await call(site,'review')).available,true)
   assert.equal(sql('select count(*) from q02_runtime.credentials').trim(),'2')
   const saved=runtimes.support.privateJwk;runtimes.support.privateJwk=f.keys.portal.privateJwk
   assert.equal((await call('support','review')).available,false);runtimes.support.privateJwk=saved
  })
  await step('explicit independent opt-in commits on both sites without generic service_role',async()=>{
   for(const site of ['support','portal']) await call(site,'grant',{accepted:true,disclosure:site==='support'?'q02-support-v1':'portal-v7-1',scopes:['derived_summary','preferences']})
  })
  let challenge,intent,receipt,staged,own,peer
  await step('Portal challenge -> Support DB-reserved signed intent -> Portal signed receipt',async()=>{
   challenge=(await call('portal','challenge',{expectedEpoch:1})).challenge
   intent=await call('support','issue',{accepted:true,disclosure:'q02-support-v1',scopes:['derived_summary','preferences'],nonce:challenge})
   receipt=await call('portal','receipt',{supportProof:intent.proof,challenge})
   assert.equal(payload(receipt.receipt).support_digest,hash(intent.proof))
   assert.equal(sql('select count(*) from public.support_privacy_intents').trim(),'1');assert.equal(sql('select count(*) from q02_runtime.receipts').trim(),'1')
  })
  await step('real checkpoint coordinator + locked authority commit stage; missing ACK consumes nothing',async()=>{
   staged=await call('support','stage',{supportProof:intent.proof,receipt:receipt.receipt,challenge,portalCredential:receipt.portalCredential})
   assert.equal(staged.decision,'STAGED');await call('support','consume',staged.continuation,403)
   assert.equal(sql('select count(*) from q02_runtime.links').trim(),'0')
  })
  await step('independent live site requests sign exact committed event tickets; wrong signature rolls back',async()=>{
   own=(await call('support','event',{requestDigest:staged.requestDigest})).ack
   peer=(await call('portal','event',{requestDigest:staged.requestDigest})).ack
   await call('support','ack',{requestDigest:staged.requestDigest,ownAck:own,peerAck:peer+'A',peerCredential:f.credentials.portal},403)
   assert.equal(sql('select count(*) from q02_runtime.acks').trim(),'0')
  })
  await step('peer verifies signature and live party/session; each dedicated login records only its own ACK',async()=>{
   await call('portal','ack',{requestDigest:staged.requestDigest,ownAck:peer,peerAck:own,peerCredential:f.credentials.support})
   await call('support','consume',staged.continuation,403)
   await call('support','ack',{requestDigest:staged.requestDigest,ownAck:own,peerAck:peer,peerCredential:f.credentials.portal})
   assert.equal(sql('select count(*) from q02_runtime.acks').trim(),'2')
  })
  await step('positive route consumes once; replay denied; derived use still unavailable',async()=>{
   const linked=await call('support','consume',staged.continuation)
   assert.equal(linked.decision,'LINKED');assert.equal(linked.derivedUse,false)
   await call('support','consume',staged.continuation,403)
   assert.equal(sql('select count(*) from q02_runtime.links').trim(),'1');assert.equal(sql('select count(*) from q02_runtime.replays').trim(),'4')
  })
  await step('withdrawal suppresses committed link and revoked enrollment cannot be revived',async()=>{
   await call('portal','withdraw')
   assert.equal(sql('select count(*) from q02_runtime.suppressions').trim(),'1')
   sql("update q02_runtime.credentials set status='revoked' where site='support'")
   await call('support','review',{},403)
  })
  console.log(`1..${passed}`)
} catch(error) {console.error(`Route PostgreSQL verification failed after ${passed} checks: ${error.message}`);process.exitCode=1}
finally {if(started){try{cmd('pg_ctl',['-D',data,'-m','immediate','-w','stop'])}catch{}}rmSync(root,{recursive:true,force:true})}
