import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const sourceRoots = ['app/api', 'lib']
const files = []
function visit(path) {
  for (const name of readdirSync(path)) {
    const full = join(path, name)
    if (statSync(full).isDirectory()) visit(full)
    else if (/\.(mjs|ts|tsx)$/.test(name)) files.push(full)
  }
}
for (const dir of sourceRoots) visit(join(root, dir))
const source = files.map((file) => readFileSync(file, 'utf8')).join('\n')

test('support surface contains no project-membership or reciprocal-consent access path', () => {
  assert.doesNotMatch(source, /project_memberships|project_members|shared_projects|membership_consent|reciprocal_consent/i,
    'support backend unexpectedly handles shared-project membership or consent')
})
// Q02-V040-REVOCATION
