// Disposable native PostgreSQL acceptance for migration 019 and the exact
// Portal pair migrations. Never accepts a database URL or connects externally.
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import pg from 'pg'
import { createHash, generateKeyPairSync } from 'node:crypto'

const portal = '/Users/phantomdarne/.openhands-platform/yqaa-canonical/worktrees/yqaa-yqaa-q02-portal-pair-integration-20261017-r1/supabase/migrations'
const root = mkdtempSync(join(tmpdir(), 'q02-runtime-pg-'))
const data = join(root, 'data'), socket = join(root, 'socket')
mkdirSync(socket)
const port = '55441'
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
  cmd('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-o',`-k ${socket} -p ${port} -c listen_addresses='' -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,'-w','start'])
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
  check('actual Portal pair, Support 014-018 and migration 019 load with strict PL/pgSQL ambiguity checks',()=>assert.equal(sql('show plpgsql.variable_conflict').trim(),'error'))
  check('default PUBLIC execute and browser/runtime direct table grants are absent',()=>{
    for (const role of ['anon','authenticated','service_role','q02_coordinator_runtime','q02_support_runtime','q02_portal_runtime']) {
      assert.equal(sql(`select has_table_privilege('${role}','q02_runtime.events','select,insert,update,delete')`).trim(),'f',role)
    }
    for (const role of ['anon','authenticated','service_role','q02_support_runtime','q02_portal_runtime'])
      assert.equal(sql(`select has_function_privilege('${role}','q02_runtime.consume(jsonb)','execute')`).trim(),'f',role)
    for (const role of ['anon','authenticated','service_role','q02_coordinator_runtime'])
      assert.equal(sql(`select has_function_privilege('${role}','q02_runtime.ack(text,bigint,text,text,text)','execute')`).trim(),'f',role)
    assert.equal(sql(`select has_function_privilege('q02_coordinator_runtime','q02_runtime.set_checkpoint(jsonb)','execute')`).trim(),'t')
    for (const role of ['anon','authenticated','service_role','q02_support_runtime','q02_portal_runtime'])
      assert.equal(sql(`select has_function_privilege('${role}','q02_runtime.set_checkpoint(jsonb)','execute')`).trim(),'f',role)
  })
  check('runtime principals are dedicated, non-inheriting, non-superuser, and never BYPASSRLS',()=>{
    assert.equal(sql(`select count(*) from pg_roles where rolname in ('q02_coordinator_runtime','q02_support_runtime','q02_portal_runtime') and rolcanlogin and not rolsuper and not rolinherit and not rolbypassrls`).trim(),'3')
  })
  check('unauthorized calls deny and no tenant, enrollment, checkpoint, receipt or grant is synthesized',()=>{
    assert.throws(()=>sql(`select q02_runtime.lock_authority('{}'::jsonb)`),/Privacy authorization denied|permission denied/)
    assert.equal(sql(`select count(*) from q02_runtime.tenants`).trim(),'0')
    assert.equal(sql(`select count(*) from q02_runtime.checkpoints`).trim(),'0')
  })

  // SYNTHETIC DISPOSABLE FIXTURE ONLY. These DBA inserts represent independently
  // provisioned enrollment/checkpoint data, not verification of an external service.
  const quote = value => "'" + String(value).replaceAll("'", "''") + "'"
  const json = value => quote(JSON.stringify(value)) + '::jsonb'
  const hash = value => createHash('sha256').update(value).digest('base64url')
  const runAs = (role, text) => cmd('psql', [...psql.map((v,i) => psql[i-1] === '-U' ? role : v), '-c', text])
  const coordinator = text => runAs('q02_coordinator_runtime', text)
  const key = () => ({ revoked:false, notBefore:Math.floor(Date.now()/1000)-60,
    notAfter:Math.floor(Date.now()/1000)+3600,
    publicJwk:generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'}) })
  const parties = {support:'https://support.yousafeconsultancy.com',portal:'https://portal.yousafeconsultancy.com'}
  sql(`insert into q02_runtime.tenants values('synthetic',${quote(hash('generation'))},0,${quote(hash('genesis'))},${quote(hash('genesis'))});
    insert into public.support_privacy_deployments(site,tenant,issuance) values('support','synthetic',true);
    insert into public.q02_portal_deployments values('portal','synthetic','support','https://synthetic.clerk.example',${quote(parties.portal)},true);`)
  for (const site of ['support','portal']) sql(`insert into q02_runtime.sites values('synthetic',${quote(site)},'https://synthetic.clerk.example',${quote(parties[site])},${json({synthetic:true,site,tenant:'synthetic'})},${json([key()])},true,'SYNTHETIC disposable enrollment');`)
  sql(`insert into q02_runtime.services values('synthetic',${json({synthetic:true,keys:[key()]})},null,'SYNTHETIC disposable service');`)
  function checkpoint() {
    // Synthetic proof fixture exercises the production narrow setter, never a
    // direct checkpoint table write by the coordinator login.
    const state=JSON.parse(sql(`select json_build_object('generation',generation,'highWater',sequence,'headDigest',head) from q02_runtime.tenants where tenant='synthetic'`).trim())
    const proof={tenant:'synthetic',...state,evidenceDigest:hash('synthetic checkpoint '+Date.now()+Math.random()),
      nonceDigest:hash('synthetic nonce '+Date.now()+Math.random()),verifiedAt:Date.now(),enrollmentReference:'SYNTHETIC external proof fixture'}
    coordinator(`select q02_runtime.set_checkpoint(${json(proof)});`)
    return JSON.parse(sql(`select json_build_object('generation',generation,'highWater',high_water,'headDigest',head_digest,'evidenceDigest',evidence_digest) from q02_runtime.checkpoints where tenant='synthetic'`).trim())
  }
  let serial = 0
  function fixture() {
    const id = ++serial, support = 'user_support'+id, portal = 'user_portal'+id
    const challenge = hash('challenge'+id), supportSid = hash('support session'+id), portalSid = hash('portal session'+id)
    const b = {requestDigest:hash('request'+id),supportDigest:hash('proof'+id),receiptDigest:hash('receipt'+id),
      supportSubject:support,portalSubject:portal,supportEpoch:1,portalEpoch:1,
      supportJti:hash('support jti'+id),portalJti:hash('portal jti'+id),serviceJti:hash('service jti'+id),challenge,
      supportSessionDigest:supportSid,portalSessionDigest:portalSid,expiresAt:Math.floor(Date.now()/1000)+100}
    sql(`insert into public.support_privacy_memberships(site,tenant,subject,status,enrollment_reference) values('support','synthetic',${quote(support)},'active','SYNTHETIC');
      insert into public.q02_portal_memberships values('portal','synthetic',${quote(portal)},'active','SYNTHETIC');
      insert into public.support_privacy_consents(site,tenant,subject,epoch,state,scopes) values('support','synthetic',${quote(support)},1,'active',array['derived_summary','preferences']);
      insert into public.q02_portal_consents(site,tenant,subject,epoch,active,scopes) values('portal','synthetic',${quote(portal)},1,true,array['derived_summary','preferences']);
      insert into public.support_privacy_intents values(${quote(b.supportJti)},'support','synthetic',${quote(support)},1,array['derived_summary','preferences'],${quote(challenge)},clock_timestamp(),clock_timestamp()+interval '110 seconds',null);
      insert into public.q02_portal_challenges values(${quote(hash(challenge))},'portal','synthetic',${quote(portal)},${quote(portalSid)},1,'support','portal-v7-1',array['derived_summary','preferences'],'account-memory-link-reciprocal',clock_timestamp()+interval '110 seconds','pending');`)
    for (const site of ['support','portal']) sql(`insert into q02_runtime.credentials values('synthetic',${quote(site)},${quote(b[site+'Subject'])},${quote(b[site+'SessionDigest'])},'https://synthetic.clerk.example',${quote(parties[site])},'active',clock_timestamp()+interval '10 minutes','SYNTHETIC');`)
    const cp = checkpoint()
    b.generation = cp.generation; b.highWater = cp.highWater+1
    const request = (mode, cp) => ({tenant:'synthetic',mode,requestDigest:b.requestDigest,supportSubject:support,portalSubject:portal,
      supportSessionDigest:supportSid,portalSessionDigest:portalSid,challengeDigest:hash(challenge),checkpoint:cp})
    const lock = (mode, cp) => `select q02_runtime.lock_authority(${json(request(mode,cp))});`
    const stage = (end='COMMIT') => coordinator(`BEGIN; ${lock('stage',checkpoint())} select q02_runtime.stage(${json(b)}); ${end};`)
    const event = () => JSON.parse(sql(`select json_build_object('sequence',e.sequence,'digest',e.digest) from q02_runtime.events e join q02_runtime.stages s using(tenant,sequence) where s.request_digest=${quote(b.requestDigest)}`).trim())
    const ack = (site, subject=b[site+'Subject'], sid=b[site+'SessionDigest'], role='q02_'+site+'_runtime') => {
      const e=event(); return runAs(role,`select q02_runtime.ack('synthetic',${e.sequence},${quote(e.digest)},${quote(subject)},${quote(sid)});`)
    }
    const consumeSQL = (cp=checkpoint()) => `${lock('consume',cp)} select q02_runtime.consume(${json(b)});`
    const consume = cp => coordinator(`BEGIN; ${consumeSQL(cp)} COMMIT;`)
    const linked = () => Number(sql(`select count(*) from q02_runtime.links where request_digest=${quote(b.requestDigest)}`).trim())
    return {b,lock,stage,event,ack,consumeSQL,consume,linked}
  }
  function checkpointSetterDenials() {
    const proof={tenant:'synthetic',...JSON.parse(sql(`select json_build_object('generation',generation,'highWater',sequence,'headDigest',head) from q02_runtime.tenants where tenant='synthetic'`).trim()),
      evidenceDigest:hash('setter evidence'),nonceDigest:hash('setter nonce'),verifiedAt:Date.now(),enrollmentReference:'SYNTHETIC external proof'}
    const save=p=>coordinator(`select q02_runtime.set_checkpoint(${json(p)});`)
    assert.throws(()=>save({...proof,tenant:'wrong'}),/Privacy authorization denied|no rows/)
    assert.throws(()=>save({...proof,generation:hash('wrong')}),/Checkpoint mismatch/)
    assert.throws(()=>save({...proof,highWater:proof.highWater+1}),/Checkpoint mismatch/)
    assert.throws(()=>save({...proof,headDigest:hash('ahead')}),/Checkpoint mismatch/)
    assert.throws(()=>save({...proof,verifiedAt:Date.now()+1000}),/Privacy authorization denied/)
    assert.throws(()=>save({...proof,verifiedAt:Date.now()-11000}),/Privacy authorization denied/)
    save(proof)
    assert.throws(()=>save(proof),/duplicate key|Privacy authorization denied/)
    assert.throws(()=>coordinator(`update q02_runtime.checkpoints set high_water=high_water+1 where tenant='synthetic';`),/permission denied/)
  }
  function staleCheckpointDenial() {
    const f=fixture(), stale={tenant:'synthetic',...JSON.parse(sql(`select json_build_object('generation',generation,'highWater',sequence,'headDigest',head) from q02_runtime.tenants where tenant='synthetic'`).trim()),
      evidenceDigest:hash('race evidence'),nonceDigest:hash('race nonce'),verifiedAt:Date.now(),enrollmentReference:'SYNTHETIC external proof'}
    f.stage()
    assert.throws(()=>coordinator(`select q02_runtime.set_checkpoint(${json(stale)});`),/Checkpoint mismatch/)
    // The failed stale proof leaves the committed stage head ahead of the
    // checkpoint. Re-anchor the disposable fixture before the next scenario.
    checkpoint()
  }
  check('native distinct site sessions stage, commit, ACK and consume with fresh synthetic checkpoint',()=>{
    const f=fixture()
    checkpointSetterDenials()
    assert.match(runAs('q02_support_runtime',`select q02_runtime.site_context('synthetic',${quote(f.b.supportSubject)},${quote(f.b.supportSessionDigest)});`),/user_support/)
    assert.match(runAs('q02_portal_runtime',`select q02_runtime.receipt_context('synthetic',${quote(f.b.portalSubject)},${quote(f.b.portalSessionDigest)},${quote(hash(f.b.challenge))});`),/challengeExpiresAt/)
    assert.throws(()=>sql(`select q02_runtime.lock_authority(${json({tenant:'synthetic',mode:'stage'})})`),/Privacy authorization denied/)
    f.stage()
    assert.equal(f.linked(),0)
    assert.match(f.ack('support'),/support/); assert.match(f.ack('portal'),/portal/)
    assert.match(f.consume(),/"committed": true/); assert.equal(f.linked(),1)
    assert.equal(Number(sql(`select count(*) from q02_runtime.replays where request_digest=${quote(f.b.requestDigest)}`).trim()),4)
    assert.throws(()=>f.consume(),/Privacy authorization denied/)
  })
  check('missing ACK, wrong-session ACK, peer identity and wrong principal deny in actual login sessions',()=>{
    const f=fixture(); f.stage()
    assert.throws(()=>f.consume(),/Privacy authorization denied/)
    assert.throws(()=>f.ack('support',f.b.supportSubject,hash('wrong session')),/Privacy authorization denied/)
    assert.throws(()=>f.ack('support',f.b.portalSubject,f.b.portalSessionDigest),/Privacy authorization denied/)
    assert.throws(()=>f.ack('support',undefined,undefined,'q02_coordinator_runtime'),/permission denied/)
    f.ack('support'); assert.throws(()=>f.consume(),/Privacy authorization denied/)
    assert.equal(f.linked(),0)
    f.ack('portal'); assert.match(f.consume(),/"committed": true/)
  })
  check('stage and consumption rollback leave no partial effects',()=>{
    const f=fixture(); f.stage('ROLLBACK')
    assert.equal(sql(`select count(*) from q02_runtime.stages where request_digest=${quote(f.b.requestDigest)}`).trim(),'0')
    f.stage(); f.ack('support'); f.ack('portal')
    coordinator(`BEGIN; ${f.consumeSQL()} ROLLBACK;`)
    assert.equal(f.linked(),0)
    assert.equal(sql(`select count(*) from q02_runtime.replays where request_digest=${quote(f.b.requestDigest)}`).trim(),'0')
    f.consume(); assert.equal(f.linked(),1)
  })
  check('staged head cannot consume against the old external checkpoint',()=>{
    staleCheckpointDenial(); const f=fixture(), old=checkpoint(); f.stage(); f.ack('support'); f.ack('portal')
    assert.throws(()=>f.consume(old),/Checkpoint mismatch/); assert.equal(f.linked(),0)
    f.consume()
  })
  check('withdrawal after stage suppresses committed stage and denies consume',()=>{
    const f=fixture(); f.stage(); f.ack('support'); f.ack('portal')
    sql(`update public.support_privacy_consents set state='withdrawn',scopes='{}',epoch=epoch+1 where subject=${quote(f.b.supportSubject)};`)
    assert.throws(()=>f.consume(),/Privacy authorization denied/); assert.equal(f.linked(),0)
    assert.equal(sql(`select count(*) from q02_runtime.suppressions where request_digest=${quote(f.b.requestDigest)}`).trim(),'1')
  })
  // Async clients provide independent backend sessions and an observed lock wait;
  // no timers or mocked "revocation happened" flags establish ordering.
  async function concurrentRevocation(site) {
    const f=fixture(); f.stage(); f.ack('support'); f.ack('portal'); const cp=checkpoint()
    const open = async user => { const c=new pg.Client({host:socket,port:Number(port),user,database:'postgres'}); await c.connect(); return c }
    const revoker=await open('q02_runner'), consumer=await open('q02_coordinator_runtime'), observer=await open('q02_runner')
    try {
      await revoker.query('BEGIN')
      await revoker.query(`update q02_runtime.credentials set status='revoked' where subject=$1`,[f.b[site+'Subject']])
      const pid=Number((await consumer.query('select pg_backend_pid() as pid')).rows[0].pid)
      await consumer.query("BEGIN; set local statement_timeout='8s'")
      const pending=consumer.query(f.consumeSQL(cp)).then(()=>null,error=>error)
      let waiting=false
      for(let i=0;i<200;i++) {
        const r=await observer.query(`select wait_event from pg_stat_activity where pid=$1`,[pid])
        if(r.rows[0]?.wait_event==='advisory') {waiting=true;break}
        await new Promise(resolve=>setTimeout(resolve,10))
      }
      assert.equal(waiting,true,'consumer must wait on revocation fence')
      await revoker.query('COMMIT')
      assert.match((await pending)?.message ?? '',/Checkpoint mismatch|Privacy authorization denied/)
      await consumer.query('ROLLBACK'); assert.equal(f.linked(),0)
      assert.throws(()=>f.consume(),/Privacy authorization denied/) // even after publishing the new checkpoint
    } finally {
      await revoker.query('ROLLBACK'); await consumer.query('ROLLBACK')
      await Promise.all([revoker.end(),consumer.end(),observer.end()])
    }
  }
  for (const site of ['support','portal']) {
    await concurrentRevocation(site); console.log(`ok ${++passed} - concurrent ${site} revocation commits before waiting consumer and denies link`)
  }
  console.log(`1..${passed}`)
} catch (error) {
  console.error(`PostgreSQL verification failed after ${passed} checks: ${error.message}`)
  process.exitCode = 1
} finally {
  if (started) { try { cmd('pg_ctl',['-D',data,'-m','immediate','-w','stop']) } catch {} }
  rmSync(root,{recursive:true,force:true})
}
