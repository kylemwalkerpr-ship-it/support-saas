import test from 'node:test'
import assert from 'node:assert/strict'
import { deploymentScope, lookupMembership } from '../lib/privacy/membership.mjs'
import { createPrivacyStore } from '../lib/privacy/service-store.mjs'
import { handleAccountPrivacy } from '../lib/privacy/account-api.mjs'
import { redeemReciprocal, inspectReciprocalReceipt } from '../lib/privacy/reciprocal.mjs'
const scope = { site:'support',tenant:'isolated' }
const session = { sub:'user_test',sid:'sess_verified',exp:Math.floor(Date.now()/1000)+300 }
const member = { ...scope,subject:session.sub,version:1,status:'active',issuance:true,withdrawal:true }
const origin = 'https://support.yousafeconsultancy.com'
function fixture(initial = member) {
  let current = initial, epoch = 0
  const db = { rpc:async (name,args) => {
    assert.equal(args.p_subject,session.sub); assert.equal(args.p_tenant,scope.tenant)
    if (name === 'support_privacy_membership') return { data:current }
    if (!current || args.p_action && args.p_action !== 'withdraw' && (current.status !== 'active' || !current.issuance)) return { error:true }
    if (name === 'support_privacy_review') return { data:{ epoch,state:'withdrawn',scopes:[],disclosure:'q02-support-v1' } }
    if (args.p_expected_epoch !== epoch) return { error:true }
    return { data:++epoch }
  } }
  const deps = { ...scope,origin,signing:{ enabled:false },session:async()=>session,
    membership:s=>lookupMembership(db,scope,s),store:ctx=>createPrivacyStore(db,ctx) }
  const run = (action,body) => handleAccountPrivacy(new Request(origin,{ method:body ? 'POST':'GET', headers:{ origin,'content-type':'application/json' },...(body ? { body:JSON.stringify(body) }: {}) }),action,deps)
  return { db,deps,run,set:m=>{ current=m } }
}
test('scope requires explicit version and both server-owned IDs',()=>{
  assert.equal(deploymentScope({}),null)
  assert.equal(deploymentScope({ Q02_SUPPORT_SCOPE_VERSION:'1',Q02_SUPPORT_SITE:'support' }),null)
  assert.deepEqual(deploymentScope({ Q02_SUPPORT_SCOPE_VERSION:'1',Q02_SUPPORT_SITE:'support',Q02_SUPPORT_TENANT:'isolated' }),scope)
})
for (const bad of [null,[member,member],{...member,version:2},{...member,tenant:'other'},{...member,subject:'user_other'},{...member,status:'unknown'},{...member,withdrawal:false}]) test(`membership denies ${JSON.stringify(bad)}`,async()=>{
  assert.equal((await fixture(bad).run('review')).status,403)
})
for (const status of ['active','suspended','revoked']) test(`${status}: actual adapters permit withdrawal while issuance disabled`,async()=>{
  const f=fixture({...member,status,issuance:false})
  assert.equal((await f.run('withdraw',{})).status,200)
  assert.equal((await f.run('grant',{accepted:true,disclosure:'q02-support-v1',scopes:['preferences']})).status,403)
})
test('fresh membership each operation and database guards mid-request revocation / CAS',async()=>{
  const f=fixture()
  const m=await f.deps.membership(session)
  const store=f.deps.store({session,membership:m})
  f.set({...member,status:'revoked'})
  await assert.rejects(store.transition('grant',0,['preferences']))
  await store.transition('withdraw',0,[])
  await assert.rejects(store.transition('withdraw',0,[]))
  f.set(null)
  assert.equal((await f.run('withdraw',{})).status,403)
})
test('missing withdrawal adapter cannot issue or grant',async()=>{
  const f=fixture(); f.deps.signing.enabled=true
  f.deps.store=()=>({review:async()=>({epoch:1,state:'active',scopes:['preferences'],disclosure:'q02-support-v1'}),reserve:async()=>true})
  assert.equal((await f.run('grant',{accepted:true,disclosure:'q02-support-v1',scopes:['preferences']})).status,403)
})
test('all redemption attempts denied including forged and reused receipts',async()=>{
  for(const receipt of ['forged','forged']) {
    await assert.rejects(inspectReciprocalReceipt({receipt,supportConfig:{},portalConfig:{}}))
    await assert.rejects(redeemReciprocal({receipt}))
  }
})
