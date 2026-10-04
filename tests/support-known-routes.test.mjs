// Phase 6 custom 404: middleware's KNOWN_TOP_SEGMENTS must list every app/
// top-level route (incl. route groups), so no real page is treated as unknown.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const mw = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8')
const listed = new Set([...mw.match(/KNOWN_TOP_SEGMENTS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
const appDir = new URL('../app/', import.meta.url)

function segments() {
  const out = []
  for (const e of readdirSync(appDir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('@')) continue
    if (e.name.startsWith('(')) {
      for (const c of readdirSync(new URL(e.name + '/', appDir), { withFileTypes: true })) if (c.isDirectory()) out.push(c.name)
    } else out.push(e.name)
  }
  return out
}

test('every app/ top-level route is a known segment', () => {
  const segs = segments()
  assert.ok(segs.length > 5)
  for (const s of segs) {
    assert.ok(!s.startsWith('['), 'root dynamic segment breaks unknown-path detection')
    assert.ok(listed.has(s), `missing ${s} in KNOWN_TOP_SEGMENTS`)
  }
})

test('unknown-path pass-through happens before auth()', () => {
  assert.ok(mw.indexOf('isUnknownPath(pathname)') > 0)
  assert.ok(mw.indexOf('isUnknownPath(pathname)') < mw.indexOf('await auth()'))
})
