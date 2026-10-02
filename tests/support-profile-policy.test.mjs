import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  canRelinkByEmail,
  identityBackfillPatch,
  isStaffRole,
  selfEditablePatch,
  webhookIdentityPatch,
} from '../lib/support-profile-policy.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(join(repoRoot, p), 'utf8')

// Regression: 2026-10-01 a student (role=client, 7 orders) opened the support
// site and getOrCreateProfile() rewrote the shared row to support/pending.
const student = {
  id: '35c89030-b9bd-4a51-877f-739e97fe2d04',
  clerk_user_id: 'user_student',
  email: 'student@example.com',
  full_name: 'Mr. james kanyi',
  avatar_url: 'https://img.clerk.com/x',
  role: 'client',
  status: 'active',
}

test('existing student row: support-site sync never touches role or status', () => {
  const patch = identityBackfillPatch(student, { email: 'student@example.com', fullName: 'james kanyi', avatarUrl: 'https://img.clerk.com/y' })
  assert.deepEqual(patch, {})
  assert.equal('role' in patch, false)
  assert.equal('status' in patch, false)
})

test('every portal role is preserved by the identity backfill', () => {
  for (const role of ['client', 'student', 'consultant', 'attorney', 'admin', 'support']) {
    const patch = identityBackfillPatch({ ...student, role, full_name: null, avatar_url: null }, { email: 'a@b.co', fullName: 'A B', avatarUrl: 'u' })
    assert.deepEqual(Object.keys(patch).sort(), ['avatar_url', 'full_name'])
  }
})

test('identity backfill fills blanks and replaces recovery emails only', () => {
  assert.deepEqual(
    identityBackfillPatch({ email: 'user_x@support.yousafe.local', full_name: null, avatar_url: null }, { email: 'real@x.com', fullName: 'Real Name', avatarUrl: 'u' }),
    { email: 'real@x.com', full_name: 'Real Name', avatar_url: 'u' },
  )
  assert.deepEqual(identityBackfillPatch({ email: 'keep@x.com', full_name: 'Keep', avatar_url: 'k' }, { email: 'new@x.com', fullName: 'New', avatarUrl: 'n' }), {})
})

test('only staff rows may be relinked by email', () => {
  assert.equal(canRelinkByEmail({ ...student, clerk_user_id: 'user_old' }, 'user_new'), false)
  assert.equal(canRelinkByEmail({ clerk_user_id: 'user_old', role: 'attorney' }, 'user_new'), false)
  assert.equal(canRelinkByEmail({ clerk_user_id: 'user_old', role: 'support' }, 'user_new'), true)
  assert.equal(canRelinkByEmail({ clerk_user_id: 'user_old', role: 'admin' }, 'user_new'), true)
  assert.equal(canRelinkByEmail({ clerk_user_id: 'user_new', role: 'support' }, 'user_new'), false)
})

test('self edits: non-staff get nothing, staff never get role/status', () => {
  assert.equal(selfEditablePatch({ role: 'client' }, { full_name: 'X', role: 'support' }), null)
  assert.deepEqual(selfEditablePatch({ role: 'support' }, { full_name: 'X', role: 'admin', status: 'active', bio: 'b' }), { full_name: 'X', bio: 'b' })
  assert.equal(isStaffRole('client'), false)
  assert.equal(isStaffRole('support'), true)
})

test('webhook never inserts and never writes role/status', () => {
  assert.equal(webhookIdentityPatch(null, { email: 'a@b.co', fullName: 'A', avatarUrl: 'u' }), null)
  assert.equal(webhookIdentityPatch(student, { email: 'x@y.co', fullName: 'Z', avatarUrl: 'u' }), null)
})

test('source guard: profile resolver and webhook contain no role/status writes', () => {
  const profiles = read('lib/actions/profiles.ts')
  const resolver = profiles.slice(profiles.indexOf('export async function getOrCreateProfile'), profiles.indexOf('export async function completeSupportProfile'))
  assert.ok(resolver.length > 200, 'getOrCreateProfile found')
  assert.doesNotMatch(resolver, /role:\s*'support'|status:\s*'pending'|updates\.role|updates\.status|\.upsert\(|\.insert\(/)
  assert.doesNotMatch(profiles, /assertSupportProfile|export async function setProfileRole/)
  const complete = profiles.slice(profiles.indexOf('export async function completeSupportProfile'), profiles.indexOf('export async function setSupportStatus'))
  assert.doesNotMatch(complete, /role:\s*'support'|status:\s*'pending'/)

  const webhook = read('app/api/webhooks/clerk/route.ts')
  assert.doesNotMatch(webhook, /role\s*[:=]\s*'support'|\.insert\(|\.upsert\(|\.delete\(\)/)
})

test('non-staff are sent to a static no-access page, not back to /sign-in (no loop)', () => {
  const page = read('app/(dashboard)/dashboard/page.tsx')
  assert.match(page, /redirect\('\/no-access'\)/)
  assert.doesNotMatch(read('app/no-access/page.tsx'), /redirect\(/)
})
