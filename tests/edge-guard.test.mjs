// Sanitization Brief Phases 5-6: rate limiting + public error redaction.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GENERIC_ERROR, matchRateRule, rateLimitRequest, redactErrorResponse, looksInternal } from '../lib/edgeGuard.mjs'

test('sensitive mutating endpoints map to bindings', () => {
  assert.equal(matchRateRule('POST', '/api/chat/widget')?.binding, 'RL_WIDGET')
  assert.equal(matchRateRule('POST', '/api/translate')?.binding, 'RL_TRANSLATE')
  assert.equal(matchRateRule('POST', '/api/support/orders/x/refund')?.binding, 'RL_STAFF')
  assert.equal(matchRateRule('GET', '/api/chat/widget/abc'), null)
  assert.equal(matchRateRule('POST', '/api/webhooks/clerk'), null)
})

test('429 when the binding denies; fail open otherwise', async () => {
  const r = () => new Request('https://support.yousafeconsultancy.com/api/chat/widget', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.7' } })
  const keys = []
  const denied = await rateLimitRequest(r(), { RL_WIDGET: { limit: async ({ key }) => (keys.push(key), { success: false }) } })
  assert.equal(denied.status, 429)
  assert.equal(denied.headers.get('retry-after'), '60')
  assert.deepEqual(keys, ['widget:198.51.100.7'])
  assert.equal(await rateLimitRequest(r(), {}), null)
  assert.equal(await rateLimitRequest(r(), { RL_WIDGET: { limit: async () => { throw new Error('x') } } }), null)
})

test('internal Postgres detail and codes are redacted from /api errors', async () => {
  const res = await redactErrorResponse(
    new Request('https://support.yousafeconsultancy.com/api/support/orders'),
    new Response(JSON.stringify({ error: 'column orders.foo does not exist', code: '42703' }), { status: 500, headers: { 'content-type': 'application/json' } }),
  )
  assert.deepEqual(await res.json(), { error: GENERIC_ERROR })
  assert.equal(looksInternal('Message is required'), false)
})

test('wiring: wrangler main is the guarded entry with bindings; CSP + poweredByHeader', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
  assert.match(toml, /^main = "edge-worker\.mjs"$/m)
  for (const n of ['RL_WIDGET', 'RL_TRANSLATE', 'RL_STAFF']) assert.ok(toml.includes(`name = "${n}"`))
  const cfg = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')
  assert.ok(cfg.includes("object-src 'none'"))
  assert.ok(cfg.includes('poweredByHeader: false'))
  for (const f of ['../app/api/chat/widget/route.ts', '../app/api/chat/widget/[id]/route.ts']) {
    assert.ok(!readFileSync(new URL(f, import.meta.url), 'utf8').includes("'Access-Control-Allow-Origin': '*'"))
  }
})
