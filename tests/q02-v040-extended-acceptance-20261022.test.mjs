// Q02-V040-REVOCATION
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { canAccessSupportSurface, supportAccessDenial } from '../lib/support-access-policy.mjs'

const root = new URL('..', import.meta.url).pathname

test('support revocation takes effect across role and lifecycle states', () => {
  assert.equal(canAccessSupportSurface({ role: 'support', status: 'active' }), true)
  for (const status of ['pending', 'suspended', null, undefined]) {
    const profile = { role: 'support', status }
    assert.equal(canAccessSupportSurface(profile), false, `support/${status} must be denied`)
    assert.equal(supportAccessDenial(profile)?.code, 'forbidden')
    assert.equal(supportAccessDenial(profile)?.status, 403)
  }
  assert.equal(supportAccessDenial(null)?.code, 'unauthorized')
})

test('admins retain access while non-staff and malformed profiles are denied', () => {
  assert.equal(canAccessSupportSurface({ role: 'admin', status: 'active' }), true)
  assert.equal(canAccessSupportSurface({ role: 'admin', status: 'suspended' }), true)
  for (const role of ['client', 'consultant', 'unknown', null, undefined]) {
    assert.equal(canAccessSupportSurface({ role, status: 'active' }), false)
  }
})

test('every support action guard uses the shared revocation policy', () => {
  const actionFiles = [
    'support-inbox.ts', 'support-notifications.ts', 'support-verifications.ts',
    'support-disputes.ts', 'support-orders.ts', 'support-escrow.ts',
    'support-wallet.ts', 'support-moderation.ts', 'support-metrics.ts',
    'support-users.ts', 'support-macros.ts', 'support-communications.ts',
    'support-audit-viewer.ts',
  ]
  for (const name of actionFiles) {
    const source = readFileSync(join(root, 'lib/actions', name), 'utf8')
    assert.match(source, /supportAccessDenial\(profile\)/, `${name} must deny revoked staff`)
  }
  const chat = readFileSync(join(root, 'lib/actions/chat.ts'), 'utf8')
  assert.match(chat, /canAccessSupportSurface\(profile\)/)
})

test('no support action retains a role-only support guard', () => {
  const files = []
  function visit(path) {
    for (const name of readdirSync(path)) {
      const full = join(path, name)
      if (statSync(full).isDirectory()) visit(full)
      else if (name.endsWith('.ts')) files.push(full)
    }
  }
  visit(join(root, 'lib/actions'))
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /profile\.role !== 'support' && profile\.role !== 'admin'/, `${file} has role-only authorization`)
  }
})
