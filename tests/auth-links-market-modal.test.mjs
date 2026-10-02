import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Portal /sign-in and /sign-up only 302 to the Market modal now; the support
// site must link there directly and never to portal /dashboard/admin/*.
test('non-invited sign-up goes straight to the Market sign-up modal', () => {
  const src = readFileSync('app/sign-up/[[...rest]]/page.tsx', 'utf8')
  assert.match(src, /const PORTAL_SIGN_UP_URL = 'https:\/\/market\.yousafeconsultancy\.com\/\?ys_sign_up=1&intent=client'/)
})

test('no runtime code links to portal auth documents or portal admin pages', () => {
  const offenders = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(tsx?|jsx?|mjs)$/.test(name)) {
        const s = readFileSync(p, 'utf8')
        if (/portal\.yousafeconsultancy\.com\/(sign-(in|up)|dashboard\/admin)/.test(s)) offenders.push(p)
      }
    }
  }
  for (const dir of ['app', 'components', 'lib']) walk(dir)
  assert.deepEqual(offenders, [])
})
