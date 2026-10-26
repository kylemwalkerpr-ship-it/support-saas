// Local harness utility. Both holder and contender waits are observed in PG.
import assert from 'node:assert/strict'
export async function observedRace(sql, asyncSql, first, second, {abortHolder=false,crashHolder=false,expire=false}={}) {
  const prefix='q02_s5_'+Math.random().toString(16).slice(2)
  const deadline=Date.now()+12000
  async function until(query) {
    while(sql(query).trim()!=='t') {
      if(Date.now()>deadline) throw Error('observed lock deadline exceeded')
      await new Promise(r=>setTimeout(r,15))
    }
  }
  const gate=asyncSql(`set application_name='${prefix}_gate'; select pg_advisory_lock(180216,2); select pg_sleep(25);`)
  await until(`select exists(select 1 from pg_locks l join pg_stat_activity a on l.pid=a.pid where a.application_name='${prefix}_gate' and l.locktype='advisory' and l.granted)`)
  const holder=asyncSql(`set application_name='${prefix}_holder'; begin; ${first} select pg_advisory_xact_lock(180216,2); ${abortHolder?'rollback':'commit'};`)
  await until(`select exists(select 1 from pg_stat_activity where application_name='${prefix}_holder' and wait_event='advisory')`)
  const contender=asyncSql(`set application_name='${prefix}_contender'; begin; ${second} commit;`)
  await until(`select exists(select 1 from pg_stat_activity a where application_name='${prefix}_contender' and wait_event_type='Lock' and (select pid from pg_stat_activity where application_name='${prefix}_holder')=any(pg_blocking_pids(a.pid)))`)
  if(expire) await until(`select clock_timestamp()>expires_at from public.q02_portal_challenges where digest=repeat('C',43)`)
  if(crashHolder) sql(`select pg_terminate_backend(pid) from pg_stat_activity where application_name='${prefix}_holder'`)
  sql(`select pg_terminate_backend(pid) from pg_stat_activity where application_name='${prefix}_gate'`)
  await gate
  const results=await Promise.all([holder,contender])
  if(crashHolder) assert.notEqual(results[0].code,0)
  else assert.equal(results[0].code,0,results[0].stderr)
  return results
}
