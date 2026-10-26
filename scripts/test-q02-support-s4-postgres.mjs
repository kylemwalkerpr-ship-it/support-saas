// No URL/env database selection: a fresh disposable local socket cluster only.
import { mkdtempSync,readFileSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync,spawn } from 'node:child_process'
import assert from 'node:assert/strict'
const root=mkdtempSync(join(tmpdir(),'q02-s4-pg-'))
let started=false
const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${cmd}: ${r.stderr}\n${r.stdout}`);return r.stdout}
const args=['-X','-h',root,'-p','55439','-d','postgres','-v','ON_ERROR_STOP=1','-At']
const sql=s=>run('psql',args,s)
const workers=new Set()
function start(s){const p=spawn('psql',args,{env:{...process.env,PGAPPNAME:'s4-race'},stdio:['pipe','pipe','pipe']});workers.add(p);let out='',err='';p.stdout.on('data',s=>out+=s);p.stderr.on('data',s=>err+=s);const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',code=>{workers.delete(p);code===0?resolve(out):reject(Error(err))})});p.stdin.end(s);return {done,p}}
async function race(first,second){
 // Holder takes a real row lock, then waits on an advisory gate held by us.
 // Observe the database wait before releasing; no timing-based race assertion.
 const gate=start('begin; select pg_advisory_lock(424242); select pg_sleep(20); commit;')
 gate.done.catch(()=>{})
 const deadline=Date.now()+10000
 while(sql("select count(*) from pg_locks where locktype='advisory' and granted;").trim()!=='1'){if(Date.now()>deadline)throw Error('gate timeout');await new Promise(r=>setTimeout(r,20))}
 const a=start(`begin; ${first}; select pg_advisory_xact_lock(424242); commit;`)
 a.done.catch(()=>{})
 while(sql("select count(*) from pg_stat_activity where application_name='s4-race' and wait_event='advisory';").trim()!=='1'){if(Date.now()>deadline)throw Error('holder timeout');await new Promise(r=>setTimeout(r,20))}
 const b=start(`begin; ${second}; commit;`)
 b.done.catch(()=>{})
 while(Number(sql("select count(*) from pg_stat_activity where application_name='s4-race' and wait_event_type='Lock';").trim())<2){if(Date.now()>deadline)throw Error('contender did not block');await new Promise(r=>setTimeout(r,20))}
 sql("select pg_terminate_backend(pid) from pg_stat_activity where application_name='s4-race' and query like '%pg_sleep(20)%';")
 await Promise.all([a.done,b.done])
}
try {
 run('initdb',['-D',join(root,'data'),'-A','trust','--no-locale','-c','shared_memory_type=mmap','-c','dynamic_shared_memory_type=posix'])
 run('pg_ctl',['-D',join(root,'data'),'-l',join(root,'log'),'-o',`-k ${root} -h '' -p 55439`,'-w','start']);started=true
 sql('create role anon; create role authenticated; create role service_role;')
 for(const file of ['supabase/migrations/014_q02_support_privacy_contract.sql','supabase/migrations/015_q02_support_privacy_review.sql','supabase/migrations/016_q02_support_membership.sql','supabase/migrations/017_q02_support_coordinator_denial.sql','tests/q02-support-membership.native.sql','tests/q02-support-coordinator.native.sql']) sql(readFileSync(new URL('../'+file,import.meta.url),'utf8'))
 const coordinate="select public.support_q02_coordinate('prepare',repeat('e',43),public.s4_bindings())"
 const withdraw="select public.support_privacy_transition('withdraw','s4','isolated','user_s4',2)"
 await race(coordinate,withdraw)
 assert.equal(sql("select epoch from public.support_privacy_consents where site='s4'").trim(),'3')
 await race("select public.support_privacy_transition('withdraw','s4','isolated','user_s4',3)",coordinate)
 await race(coordinate,coordinate)
 await race(coordinate,"update public.support_privacy_memberships set status='suspended' where site='s4'")
 await race("update public.support_privacy_memberships set status='revoked' where site='s4'",coordinate)
 sql("update public.support_q02_revocation_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where event_id=1")
 await race('select public.support_q02_retry(1)','select public.support_q02_retry(1)')
 assert.equal(sql('select count(*) from public.support_q02_coordinator_denials').trim(),'1')
 assert.equal(sql('select count(*) from public.support_q02_revocation_outbox').trim(),'3')
 assert.equal(sql('select count(*) from public.support_q02_revocation_acks').trim(),'0')
 console.log('PASS: 014–017 permission/denial/withdrawal assertions and six observed-lock concurrency races')
} finally {
 for(const p of workers)p.kill('SIGKILL')
 if(started)run('pg_ctl',['-D',join(root,'data'),'-m','immediate','-w','stop'])
 rmSync(root,{recursive:true,force:true})
}
