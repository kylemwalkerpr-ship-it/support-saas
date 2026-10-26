import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,readFileSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
// Explicit opt-in creates its own socket-only cluster; accepts NO database URL.
test('native SQL 014/015/016 permissions, CAS, membership and withdrawal', { skip:process.env.Q02_NATIVE_SQL !== '1' },()=>{
 const root=mkdtempSync(join(tmpdir(),'q02-s3-pg-'))
 const run=(cmd,args,input)=>{ const r=spawnSync(cmd,args,{input,encoding:'utf8'}); assert.equal(r.status,0,`${cmd}: ${r.stderr}\n${r.stdout}`); return r.stdout }
 let started=false
 try {
  run('initdb',['-D',join(root,'data'),'-A','trust','--no-locale','-c','shared_memory_type=mmap','-c','dynamic_shared_memory_type=posix'])
  run('pg_ctl',['-D',join(root,'data'),'-l',join(root,'log'),'-o',`-k ${root} -h '' -p 55439`,'-w','start']);started=true
  const sql="create role anon; create role authenticated; create role service_role;\n"+
   ['supabase/migrations/014_q02_support_privacy_contract.sql','supabase/migrations/015_q02_support_privacy_review.sql','supabase/migrations/016_q02_support_membership.sql','tests/q02-support-membership.native.sql'].map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')).join('\n')
  run('psql',['-h',root,'-p','55439','-d','postgres','-v','ON_ERROR_STOP=1'],sql)
 } finally {
  if(started) run('pg_ctl',['-D',join(root,'data'),'-m','immediate','-w','stop'])
  rmSync(root,{recursive:true,force:true})
 }
})
